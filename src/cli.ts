#!/usr/bin/env node
/**
 * Spaced Dive 命令行 —— 让外部 AI 助手也能给老大抽卡。
 *
 * 这个是 skill 包(spaced-dive/SKILL.md)的执行后端, 不是 Obsidian 的一部分:
 * 它不依赖 Obsidian 进程, 也不依赖 Electron, 一个 50KB 的单文件直跑。
 *
 * 定位等同于 Meta/Spaced Review/picker.py, 但有两个关键区别:
 *  1. 状态读写的是**笔记 frontmatter 里的 sr-* 字段**(和插件同一份真源),
 *     不再另立 state.json。所以 AI 抽的卡和插件抽的卡是同一套进度。
 *  2. 抽卡规则和插件共用 src/rules.ts + src/scheduler.ts, 不会各算各的。
 *
 * 用法:
 *   spaced-dive pick [--content]     抽一篇, 输出 JSON
 *   spaced-dive done <rel> <q>       登记复习结果, q=0..5
 *   spaced-dive stats                库存与覆盖率
 *   spaced-dive due [n]              到期清单
 *   spaced-dive peek [n]             预览权重最高的 n 篇(不写状态)
 *   spaced-dive check <rel>          反查一篇是否参与复习, 以及原因
 *
 * 通用参数: --vault <库根>  --lang zh|en  --force
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_SETTINGS, type SpacedDiveSettings } from "./settings";
import { Scheduler } from "./scheduler";
import { setLocale } from "./i18n";
import {
	buildCandidate,
	buildFilter,
	frontmatterPatch,
	stateFromFrontmatter,
	tagsFromFrontmatter,
	type NoteFacts,
} from "./rules";
import { todayISO } from "./utils";
import type { CandidateCore } from "./types";
import { parseFrontmatter, writeFrontmatter } from "./cli/frontmatter-text";

/** frontmatter 通常在头几百字节内; 留 16KB 足够装下再长的 tags 列表 */
const HEAD_BYTES = 16384;

// ---------------------------------------------------------------- 参数

interface Args {
	cmd: string;
	positional: string[];
	vault: string | null;
	lang: string;
	force: boolean;
	content: boolean;
}

function parseArgs(argv: string[]): Args {
	const out: Args = {
		cmd: "help",
		positional: [],
		vault: null,
		lang: "zh",
		force: false,
		content: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--vault") out.vault = argv[++i] ?? null;
		else if (a === "--lang") out.lang = argv[++i] ?? "zh";
		else if (a === "--force") out.force = true;
		else if (a === "--content" || a === "-c") out.content = true;
		else if (a.startsWith("--")) continue;
		else if (out.cmd === "help") out.cmd = a;
		else out.positional.push(a);
	}
	return out;
}

function emit(value: unknown): void {
	process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function fail(message: string, code = 1): never {
	emit({ error: message });
	process.exit(code);
}

// ---------------------------------------------------------------- 库与设置

/**
 * 构建后 __dirname 就是 skill 包的根目录, 所以:
 *  - vault.txt 放这儿, 用户想固定库根就写一行路径进去;
 *  - 这也是"下载即用"能做到的原因 —— 脚本不假设自己住在哪。
 */
const SELF_DIR = __dirname;
const VAULT_HINT_FILE = path.join(SELF_DIR, "vault.txt");

/** 库根的判据只有一个: 底下有 .obsidian 目录 */
function isVault(dir: string): boolean {
	try {
		return fs.statSync(path.join(dir, ".obsidian")).isDirectory();
	} catch {
		return false;
	}
}

/**
 * 兼容"把脚本拷进插件目录"的老用法。
 * 位置是 <库>/.obsidian/plugins/spaced-dive/, 往上三层正好是库根。
 */
function vaultFromSelf(): string | null {
	const parts = SELF_DIR.replace(/\\/g, "/").split("/");
	if (parts.slice(-3).join("/") !== ".obsidian/plugins/spaced-dive") return null;
	const vault = parts.slice(0, -3).join("/");
	return vault === "" ? null : vault;
}

/**
 * 读 Obsidian 自己的全局配置, 拿到这台机器上的库列表。
 *
 * 这是"零配置"的关键: 用户下载 skill 包后不需要告诉脚本他的库在哪,
 * Obsidian 装过一次就已经把答案写在这儿了。多个库时优先取正开着的那个,
 * 都没开就取最近打开过的。
 */
function vaultFromObsidianConfig(): string | null {
	const home = os.homedir();
	const files = [
		// Windows
		process.env["APPDATA"] &&
			path.join(process.env["APPDATA"], "obsidian", "obsidian.json"),
		// Linux
		process.env["XDG_CONFIG_HOME"] &&
			path.join(process.env["XDG_CONFIG_HOME"], "obsidian", "obsidian.json"),
		path.join(home, ".config", "obsidian", "obsidian.json"),
		// macOS
		path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
	].filter((f): f is string => typeof f === "string" && f !== "");

	interface Entry {
		path: string;
		ts?: number;
		open?: boolean;
	}

	for (const file of files) {
		let raw: { vaults?: Record<string, Partial<Entry>> };
		try {
			raw = JSON.parse(fs.readFileSync(file, "utf8")) as typeof raw;
		} catch {
			continue; // 没装 Obsidian / 还没开过, 都走这条
		}

		const vaults: Entry[] = Object.values(raw.vaults ?? {}).filter(
			(v): v is Entry => typeof v.path === "string" && isVault(v.path),
		);
		if (vaults.length === 0) continue;

		const open = vaults.find((v) => v.open === true);
		if (open) return open.path;

		vaults.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
		return vaults[0].path;
	}
	return null;
}

/** 从当前目录往上找 .obsidian —— 调用方已经站在库里时这条最准 */
function vaultFromCwd(): string | null {
	let dir = path.resolve(process.cwd());
	for (;;) {
		if (isVault(dir)) return dir;
		const up = path.dirname(dir);
		if (up === dir) return null;
		dir = up;
	}
}

/** 库根是怎么找着的, 只用于排错时说明情况 */
let VAULT_SOURCE = "";

/**
 * 找库根, 从"最明确"排到"最兜底":
 *
 *   --vault → 环境变量 → vault.txt → 当前目录向上 → Obsidian 全局配置 → 脚本位置
 *
 * 全落空才报错, 且把每条试过的路都念一遍 —— 免得用户对着
 * "找不到知识库" 六个字猜自己哪儿写错了。
 */
function resolveVault(explicit: string | null): string {
	if (explicit) {
		VAULT_SOURCE = "--vault";
		return path.resolve(explicit);
	}

	const fromEnv = process.env["SPACED_DIVE_VAULT"];
	if (fromEnv) {
		VAULT_SOURCE = "SPACED_DIVE_VAULT";
		return path.resolve(fromEnv);
	}

	try {
		const hinted = fs.readFileSync(VAULT_HINT_FILE, "utf8").trim();
		if (hinted !== "" && isVault(hinted)) {
			VAULT_SOURCE = "vault.txt";
			return path.resolve(hinted);
		}
	} catch {
		// 没这个文件是常态
	}

	const fromCwd = vaultFromCwd();
	if (fromCwd) {
		VAULT_SOURCE = "当前目录向上";
		return fromCwd;
	}

	const fromObsidian = vaultFromObsidianConfig();
	if (fromObsidian) {
		VAULT_SOURCE = "Obsidian 配置";
		return fromObsidian;
	}

	const fromSelf = vaultFromSelf();
	if (fromSelf && isVault(fromSelf)) {
		VAULT_SOURCE = "脚本位置";
		return fromSelf;
	}

	fail(
		[
			"找不到知识库。以下都试过了, 都没命中:",
			"  1. --vault <库根>",
			"  2. 环境变量 SPACED_DIVE_VAULT",
			`  3. ${VAULT_HINT_FILE} (里面写一行库根路径即可)`,
			"  4. 从当前目录逐级向上找 .obsidian",
			"  5. Obsidian 全局配置 obsidian.json",
			"  6. 脚本自身位置",
			"指一条过去就能用。",
		].join("\n"),
	);
}

/**
 * 读插件自己存的设置 —— CLI 和插件必须用同一套规则,
 * 否则会出现"插件里排除的目录, CLI 照样抽"这种事。
 */
function loadSettings(vault: string): SpacedDiveSettings {
	const file = path.join(
		vault,
		".obsidian",
		"plugins",
		"spaced-dive",
		"data.json",
	);
	try {
		const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
			settings?: Partial<SpacedDiveSettings>;
		};
		return { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

// ---------------------------------------------------------------- 扫描

function walkMarkdown(root: string): string[] {
	const out: string[] = [];
	const stack: string[] = [""];

	while (stack.length > 0) {
		const rel = stack.pop() as string;
		const abs = rel === "" ? root : path.join(root, rel);
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(abs, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			// 跳过一切隐藏项: Obsidian 自己也不索引它们
			if (entry.name.startsWith(".")) continue;
			if (entry.isSymbolicLink()) continue;
			const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) stack.push(childRel);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				out.push(childRel);
			}
		}
	}
	return out;
}

function readHead(abs: string): string {
	const fd = fs.openSync(abs, "r");
	try {
		const buf = Buffer.alloc(HEAD_BYTES);
		const read = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
		return buf.subarray(0, read).toString("utf8");
	} finally {
		fs.closeSync(fd);
	}
}

function factsOf(vault: string, rel: string): NoteFacts | null {
	const abs = path.join(vault, rel);
	let stat: fs.Stats;
	try {
		stat = fs.statSync(abs);
	} catch {
		return null;
	}
	const fm = parseFrontmatter(readHead(abs)).data;
	return {
		path: rel,
		basename: path.basename(rel).replace(/\.md$/i, ""),
		size: stat.size,
		mtime: stat.mtimeMs,
		frontmatter: fm,
		tags: tagsFromFrontmatter(fm),
	};
}

interface ScanResult {
	candidates: CandidateCore[];
	/** 最近复习过的分区, 供分区平衡用 */
	recent: string[];
}

/**
 * 全库扫描。
 *
 * 性能: 只读每个文件的**头部 16KB**(拿 frontmatter), 不读正文;
 * 正文字数由文件字节数估算。picker.py 是全读, 这里快一个量级。
 *
 * 一个已知偏差: 写在正文里的 #标签 读不到(只在头 16KB 内找)。
 * 默认配置(scopeMode=all)用不上正文标签, 需要时请用插件。
 */
function scan(vault: string, settings: SpacedDiveSettings): ScanResult {
	const excluded = buildFilter(settings);
	const today = todayISO();
	const candidates: CandidateCore[] = [];
	const touched: { last: string; domain: string }[] = [];

	for (const rel of walkMarkdown(vault)) {
		const facts = factsOf(vault, rel);
		if (!facts) continue;
		if (excluded(facts)) continue;

		const state = stateFromFrontmatter(
			facts.frontmatter,
			settings.fieldPrefix,
		);
		const candidate = buildCandidate(facts, state, today);
		if (
			settings.dropThinNotes &&
			candidate.sizeChars < settings.minChars
		) {
			continue;
		}
		candidates.push(candidate);
		if (state?.last) {
			touched.push({ last: state.last, domain: candidate.domain });
		}
	}

	// 分区平衡的"最近几次"直接从 sr-last 推出来 ——
	// 真源在笔记里, 犯不着再维护一份 history 文件(还容易和插件写冲突)。
	touched.sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0));
	const recent = touched
		.slice(-Math.max(0, settings.recentWindow))
		.map((t) => t.domain)
		.filter((d) => d !== "");

	return { candidates, recent };
}

function toRel(vault: string, input: string): string {
	const abs = path.isAbsolute(input)
		? path.resolve(input)
		: path.resolve(vault, input);
	const rel = path.relative(vault, abs).replace(/\\/g, "/");
	if (rel.startsWith("..")) {
		fail(`路径不在知识库里: ${input}`);
	}
	return rel;
}

// ---------------------------------------------------------------- 命令

function cmdPick(args: Args, vault: string, settings: SpacedDiveSettings): void {
	const { candidates, recent } = scan(vault, settings);
	if (candidates.length === 0) {
		fail("候选池是空的。去插件的设置里放开抽卡范围。");
	}

	const scheduler = new Scheduler(() => settings);
	const result = scheduler.pick(candidates, recent);
	if (!result) fail("没有可抽的笔记。");

	const c = result.candidate;
	const info: Record<string, unknown> = {
		path: path.join(vault, c.path),
		rel: c.path,
		basename: c.basename,
		domain: c.domain,
		chars: c.sizeChars,
		age_days: c.bornDays,
		mode: result.mode,
		is_new: c.state === null,
		times_reviewed: c.state?.times ?? 0,
		last_reviewed: c.state?.last ?? null,
		due: c.state?.due ?? null,
		overdue_days: c.overdueDays,
		pool_size: result.poolSize,
		pool_total: candidates.length,
	};

	if (args.content) {
		try {
			info["content"] = fs.readFileSync(path.join(vault, c.path), "utf8");
		} catch {
			info["content"] = null;
		}
	}

	emit(info);
}

function cmdDone(args: Args, vault: string, settings: SpacedDiveSettings): void {
	const [rawPath, rawQuality] = args.positional;
	if (!rawPath || rawQuality === undefined) {
		fail("用法: spaced-dive done <相对路径> <评分 0-5>");
	}
	const quality = Number(rawQuality);
	if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
		fail(`评分必须是 0..5 的整数, 收到: ${rawQuality}`);
	}

	const rel = toRel(vault, rawPath);
	const abs = path.join(vault, rel);

	let text: string;
	try {
		text = fs.readFileSync(abs, "utf8");
	} catch {
		fail(`读不到这篇笔记: ${rel}`);
	}

	const facts = factsOf(vault, rel);
	if (!facts) fail(`读不到这篇笔记: ${rel}`);

	const state = stateFromFrontmatter(facts.frontmatter, settings.fieldPrefix);
	const candidate = buildCandidate(facts, state, todayISO());
	const scheduler = new Scheduler(() => settings);
	const patch = scheduler.nextState(
		state,
		quality,
		todayISO(),
		candidate.bornISO,
	);

	if (settings.dryRun && !args.force) {
		emit({
			ok: false,
			dry_run: true,
			rel,
			message: "插件开着演练模式, 没有写入。加 --force 可强制落盘。",
			would_be: patch,
		});
		return;
	}

	const next = writeFrontmatter(
		text,
		frontmatterPatch(patch, settings.fieldPrefix),
	);
	fs.writeFileSync(abs, next, "utf8");

	emit({
		ok: true,
		rel,
		quality,
		step: patch.step ?? null,
		times: patch.times ?? null,
		next_due: patch.due ?? null,
		skipped: patch.skip === true,
	});
}

function cmdStats(vault: string, settings: SpacedDiveSettings): void {
	const { candidates } = scan(vault, settings);
	const total = candidates.length;
	const reviewed = candidates.filter((c) => c.state !== null).length;
	const due = candidates.filter(
		(c) => c.state && !c.state.skip && (c.overdueDays ?? -1) >= 0,
	).length;

	const domains: Record<string, number> = {};
	for (const c of candidates) {
		const key = c.domain || "(库根)";
		domains[key] = (domains[key] ?? 0) + 1;
	}
	const sorted = Object.fromEntries(
		Object.entries(domains).sort((a, b) => b[1] - a[1]),
	);

	emit({
		vault,
		vault_source: VAULT_SOURCE, // 抽错了谱系时, 一眼看出是哪条路找来的
		total_notes: total,
		reviewed_ever: reviewed,
		coverage: total === 0 ? "0.0%" : `${((reviewed / total) * 100).toFixed(1)}%`,
		due_today: due,
		domains: sorted,
	});
}

function cmdDue(args: Args, vault: string, settings: SpacedDiveSettings): void {
	const limit = Number(args.positional[0] ?? 20);
	const { candidates } = scan(vault, settings);
	const scheduler = new Scheduler(() => settings);
	const list = scheduler.dueList(candidates).slice(0, limit);

	emit({
		count: list.length,
		items: list.map((c) => ({
			rel: c.path,
			domain: c.domain,
			overdue_days: c.overdueDays,
			times_reviewed: c.state?.times ?? 0,
			due: c.state?.due ?? null,
		})),
	});
}

function cmdPeek(args: Args, vault: string, settings: SpacedDiveSettings): void {
	const limit = Number(args.positional[0] ?? 15);
	const { candidates, recent } = scan(vault, settings);
	const scheduler = new Scheduler(() => settings);

	const ranked = candidates
		.map((c) => ({ c, w: scheduler.weight(c, recent) }))
		.filter((row) => row.w > 0)
		.sort((a, b) => b.w - a.w)
		.slice(0, limit);

	emit({
		count: ranked.length,
		items: ranked.map(({ c, w }) => ({
			rel: c.path,
			domain: c.domain,
			weight: Number(w.toFixed(3)),
			is_new: c.state === null,
			overdue_days: c.overdueDays,
			age_days: c.bornDays,
		})),
	});
}

function cmdCheck(args: Args, vault: string, settings: SpacedDiveSettings): void {
	const raw = args.positional[0];
	if (!raw) fail("用法: spaced-dive check <相对路径>");

	const rel = toRel(vault, raw);
	const facts = factsOf(vault, rel);
	if (!facts) fail(`读不到这篇笔记: ${rel}`);

	const why = buildFilter(settings)(facts);
	if (why !== null) {
		emit({ ok: false, rel, reason: why });
		return;
	}

	const state = stateFromFrontmatter(facts.frontmatter, settings.fieldPrefix);
	const candidate = buildCandidate(facts, state, todayISO());
	emit({
		ok: true,
		rel,
		domain: candidate.domain,
		chars: candidate.sizeChars,
		is_new: state === null,
		skipped: state?.skip ?? false,
		times_reviewed: state?.times ?? 0,
		last_reviewed: state?.last ?? null,
		due: state?.due ?? null,
		overdue_days: candidate.overdueDays,
		age_days: candidate.bornDays,
	});
}

const HELP = `Spaced Dive CLI —— 按遗忘曲线抽一篇笔记来复习

  pick [--content]        抽一篇, 输出 JSON(--content 连正文一起给)
  done <rel> <q>          登记复习结果, q = 0..5 (0 = 封存, 不再抽)
  stats                   库存与覆盖率(含库根与它是怎么找着的)
  due [n]                 到期清单(默认 20)
  peek [n]                预览权重最高的 n 篇(不写状态)
  check <rel>             反查一篇是否参与复习, 以及原因

通用参数
  --vault <库根>          不传就自己找: 当前目录向上 → Obsidian 配置 → ...
  --lang zh|en            提示文案语言(默认 zh)
  --force                 演练模式下也强制写入

库根怎么找的
  1. --vault <库根>
  2. 环境变量 SPACED_DIVE_VAULT
  3. 与本脚本同目录的 vault.txt (写一行路径进去即可固定)
  4. 从当前目录逐级向上找 .obsidian
  5. Obsidian 全局配置 obsidian.json (多个库时取正开着的那个)
  6. 脚本自身位置

评分含义
  5 滚瓜烂熟   4 记得清楚   3 基本记得
  2 模糊只对一半   1 完全想不起来   0 封存不再抽
`;

// ---------------------------------------------------------------- 入口

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	if (args.cmd === "help" || args.cmd === "--help" || args.cmd === "-h") {
		process.stdout.write(HELP);
		return;
	}

	setLocale(args.lang === "auto" ? "" : args.lang);
	const vault = resolveVault(args.vault);
	const settings = loadSettings(vault);

	switch (args.cmd) {
		case "pick":
			cmdPick(args, vault, settings);
			break;
		case "done":
			cmdDone(args, vault, settings);
			break;
		case "stats":
			cmdStats(vault, settings);
			break;
		case "due":
			cmdDue(args, vault, settings);
			break;
		case "peek":
			cmdPeek(args, vault, settings);
			break;
		case "check":
			cmdCheck(args, vault, settings);
			break;
		default:
			process.stdout.write(HELP);
			process.exit(1);
	}
}

main();
