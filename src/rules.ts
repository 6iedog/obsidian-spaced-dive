import type { CandidateCore, ReviewState } from "./types";
import type { SpacedDiveSettings } from "./settings";
import { dateFromMillis, estimateChars, toDayNumber, todayISO } from "./utils";
import { t } from "./i18n";

/** sr-* 的八个字段, 顺序即写入顺序 */
export const STATE_FIELDS = [
	"added",
	"due",
	"step",
	"times",
	"last",
	"quality",
	"ease",
	"skip",
] as const;

export const EASE_DEFAULT = 2500;

/** YAML 解析出来的值可能是 string / Date / number, 统一成 YYYY-MM-DD 或 null */
function asISODate(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return toDayNumber(trimmed) === null ? null : trimmed;
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return dateFromMillis(value.getTime());
	}
	return null;
}

function asInt(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === "string") {
		const n = Number(value);
		if (Number.isFinite(n)) return Math.trunc(n);
	}
	return fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

/**
 * 从 frontmatter 读出复习状态。
 *
 * 插件(走 metadataCache 解析出的对象)和 CLI(走自己解析的文本)都用这一份,
 * 免得两边对同一个字段的理解出现分歧。
 */
export function stateFromFrontmatter(
	fm: Record<string, unknown> | null | undefined,
	prefix: string,
): ReviewState | null {
	if (!fm) return null;
	const key = (base: string) => prefix + base;

	const due = asISODate(fm[key("due")]);
	const added = asISODate(fm[key("added")]);
	const last = asISODate(fm[key("last")]);
	const times = asInt(fm[key("times")], 0);
	const rawQuality = fm[key("quality")];

	// 一个 sr-* 字段都没有 -> 这篇从没进过复习体系
	if (
		due === null &&
		added === null &&
		last === null &&
		times === 0 &&
		rawQuality === undefined
	) {
		return null;
	}

	return {
		added,
		due,
		step: Math.max(0, asInt(fm[key("step")], 0)),
		times,
		last,
		quality: rawQuality === undefined ? null : asInt(rawQuality, 0),
		ease: asInt(fm[key("ease")], EASE_DEFAULT),
		skip: asBool(fm[key("skip")], false),
	};
}

/**
 * 把状态补丁翻译成 frontmatter 的键值对。
 * `skip` 为 false 时给 null, 语义是"删掉这个键"而不是写 false ——
 * 免得每篇没封存的笔记都挂一个 sr-skip: false。
 */
export function frontmatterPatch(
	patch: Partial<ReviewState>,
	prefix: string,
): Record<string, string | number | boolean | null> {
	const out: Record<string, string | number | boolean | null> = {};
	const put = (base: string, value: string | number | boolean | null) => {
		out[prefix + base] = value;
	};
	if (patch.added !== undefined) put("added", patch.added);
	if (patch.due !== undefined) put("due", patch.due);
	if (patch.step !== undefined) put("step", patch.step);
	if (patch.times !== undefined) put("times", patch.times);
	if (patch.last !== undefined) put("last", patch.last);
	if (patch.quality !== undefined) put("quality", patch.quality);
	if (patch.ease !== undefined) put("ease", patch.ease);
	if (patch.skip !== undefined) put("skip", patch.skip ? true : null);
	return out;
}

/**
 * 一篇笔记的**原始素材**。
 *
 * 这是插件和命令行之间唯一的接口:
 *  - 插件从 metadataCache 里取(内存, 零 IO)
 *  - CLI 从文件系统里取(读文件头)
 * 两边都把它喂给同一套规则, 判定结果必然一致。
 */
export interface NoteFacts {
	/** 相对库根的路径, 分隔符统一为 / */
	path: string;
	basename: string;
	/** 文件字节数, 用来估算正文字数 */
	size: number;
	mtime: number;
	frontmatter: Record<string, unknown> | null;
	/** 已归一化的标签(小写、不带 #) */
	tags: string[];
}

/** 编译过的正则缓存, 避免每次扫描都重新 compile */
const regexCache = new Map<string, RegExp | null>();

export function compile(pattern: string): RegExp | null {
	if (regexCache.has(pattern)) return regexCache.get(pattern) ?? null;
	let re: RegExp | null = null;
	try {
		re = new RegExp(pattern, "i");
	} catch {
		re = null;
	}
	regexCache.set(pattern, re);
	return re;
}

/** 从 frontmatter 里收标签。tags 可能是数组也可能是单个字符串。 */
export function tagsFromFrontmatter(
	fm: Record<string, unknown> | null | undefined,
): string[] {
	const out: string[] = [];
	const raw = fm?.["tags"];
	const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
	for (const item of list) {
		if (typeof item !== "string") continue;
		const norm = item.replace(/^#/, "").trim().toLowerCase();
		if (norm) out.push(norm);
	}
	return out;
}

function normPath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * 造一个判定函数: 返回 null 表示可以入选, 否则返回**被排除的原因**。
 *
 * 抽出来是为了让插件扫描、插件单篇反查、命令行 CLI 共用同一套规则 ——
 * 否则三处逻辑迟早走偏, 出现"插件能抽到但 CLI 说不在范围"这种鬼事。
 *
 * 返回原因而不只是真假, 是为了能说清楚"为什么这篇不参与",
 * 否则只看到一片空白, 根本不知道发生了什么。
 */
export function buildFilter(
	settings: SpacedDiveSettings,
): (note: NoteFacts) => string | null {
	const exclude = new Set(settings.excludeFolders.map(normPath));
	const include = new Set(settings.includeFolders.map(normPath));
	const nameRe = compile(settings.skipNamePattern);
	const reviewTag = settings.reviewTag.replace(/^#/, "").toLowerCase();
	const skipTag = settings.skipTag.replace(/^#/, "").toLowerCase();

	return (note: NoteFacts): string | null => {
		const segments = note.path.split("/");

		// 根目录的孤立笔记多半是导航页
		if (settings.skipRootFiles && segments.length < 2) {
			return t("exclude.rootFile");
		}

		const hit = segments.find((seg) => exclude.has(seg));
		if (hit !== undefined) return t("exclude.inFolder", { name: hit });

		if (settings.scopeMode === "folders") {
			if (!segments.some((seg) => include.has(seg))) {
				return t("exclude.notInScope");
			}
		}

		if (nameRe && nameRe.test(note.basename)) {
			return t("exclude.namePattern");
		}

		const fm = note.frontmatter;

		// type: folder_brief / folder_index 这类索引导读页不是知识页
		const noteType = fm?.["type"];
		if (
			typeof noteType === "string" &&
			/^folder_(brief|index)$/i.test(noteType.trim())
		) {
			return t("exclude.isIndex");
		}

		// 只有真要用标签时才去收: 默认配置(scopeMode=all 且没有封存标签之外的规则)
		// 走不到这一步的开销能省则省。
		let tags: Set<string> | null = null;
		if (skipTag || settings.scopeMode === "tag") {
			tags = new Set(note.tags);
			// 防御: frontmatter 里的 tags 是权威来源。调用方如果只填了
			// frontmatter 没填归一化后的 tags, 这里补上, 免得漏判。
			for (const extra of tagsFromFrontmatter(note.frontmatter)) {
				tags.add(extra);
			}
		}

		if (skipTag && tags?.has(skipTag)) return t("exclude.skipTag");
		if (settings.scopeMode === "tag" && !tags?.has(reviewTag)) {
			return t("exclude.noReviewTag", { tag: reviewTag });
		}

		return null;
	};
}

/**
 * 把一篇笔记换算成调度要用的候选对象。
 *
 * 冻结诞生日优先, 没有就退回 mtime —— 这是 frontmatter 方案的关键补丁:
 * 一旦笔记进过复习体系, 它的"年龄"就跟文件改动时间彻底解耦,
 * 不再被复习写入污染(否则每复习一次, age 就被重置成 0)。
 */
export function buildCandidate(
	note: NoteFacts,
	state: ReviewState | null,
	today: string,
): CandidateCore {
	const todayNum = toDayNumber(today) ?? 0;
	const bornISO = state?.added ?? todayISO(new Date(note.mtime));
	const bornNum = toDayNumber(bornISO) ?? todayNum;

	let overdueDays: number | null = null;
	if (state?.due) {
		const dueNum = toDayNumber(state.due);
		if (dueNum !== null) overdueDays = todayNum - dueNum;
	}

	const segments = note.path.split("/");
	return {
		path: note.path,
		basename: note.basename,
		domain: segments.length > 1 ? segments[0] : "",
		sizeChars: estimateChars(note.size),
		bornISO,
		bornDays: Math.max(0, todayNum - bornNum),
		state,
		overdueDays,
	};
}
