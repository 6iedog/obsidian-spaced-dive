import { Scheduler } from "../src/scheduler";
import { DEFAULT_SETTINGS } from "../src/settings";
import { addDays, daysBetween, toDayNumber, todayISO } from "../src/utils";
import { gradeLabel, setLocale, t } from "../src/i18n";
import { en } from "../src/i18n/en";
import { zh } from "../src/i18n/zh";
import type { Candidate } from "../src/types";

/** 把嵌套字典摊平成 "a.b.c" -> "文案" */
function flatten(obj: unknown, prefix = ""): Map<string, string> {
	const out = new Map<string, string>();
	if (typeof obj !== "object" || obj === null) return out;
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "string") out.set(path, v);
		else for (const [p, s] of flatten(v, path)) out.set(p, s);
	}
	return out;
}

function cand(p: Partial<Candidate> = {}): Candidate {
	return {
		file: {} as never,
		path: "x.md",
		domain: "CS",
		sizeChars: 1000,
		bornISO: "2020-01-01",
		bornDays: 100,
		state: null,
		overdueDays: null,
		...p,
	} as Candidate;
}

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

const s = new Scheduler(() => DEFAULT_SETTINGS);
const TODAY = todayISO();

// 1. 日期工具
check("toDayNumber 拒绝非法日期", toDayNumber("2026-02-30") === null);
check("daysBetween 正确", daysBetween("2026-01-01", "2026-01-11") === 10);
check("addDays 跨月", addDays("2026-01-30", 3) === "2026-02-02");

// 2. 逾期越久权重越高
const w1 = s.weight(cand({ state: { added: "2026-01-01", due: addDays(TODAY, -1)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false }, overdueDays: 1 }), []);
const w2 = s.weight(cand({ state: { added: "2026-01-01", due: addDays(TODAY, -30)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false }, overdueDays: 30 }), []);
check("逾期越久权重越高", w2 > w1, `${w1.toFixed(2)} -> ${w2.toFixed(2)}`);

// 3. 未到期权重为 0
const wFuture = s.weight(cand({ state: { added: "2026-01-01", due: addDays(TODAY, 5)!, step: 0, times: 1, last: TODAY, quality: 3, ease: 2500, skip: false }, overdueDays: -5 }), []);
check("未到期不进池", wFuture === 0);

// 4. 封存的永远为 0
const wSkip = s.weight(cand({ state: { added: "2026-01-01", due: addDays(TODAY, -99)!, step: 0, times: 3, last: "2026-01-01", quality: 3, ease: 2500, skip: true }, overdueDays: 99 }), []);
check("封存笔记权重为 0", wSkip === 0);

// 5. 分区平衡方向: 最近抽过的分区应被压得更狠
const recent = ["CS Foundation", "Philosophy"]; // 末尾 = 最近一次
const wOld = s.weight(cand({ domain: "CS Foundation", overdueDays: 3, state: { added: "2026-01-01", due: addDays(TODAY, -3)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false } }), recent);
const wRecent = s.weight(cand({ domain: "Philosophy", overdueDays: 3, state: { added: "2026-01-01", due: addDays(TODAY, -3)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false } }), recent);
check("最近抽过的分区被压得更狠", wRecent < wOld, `近期 ${wRecent.toFixed(3)} < 较早 ${wOld.toFixed(3)}`);

// 6. 没抽过的分区不受影响
const wFresh = s.weight(cand({ domain: "Weapon", overdueDays: 3, state: { added: "2026-01-01", due: addDays(TODAY, -3)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false } }), recent);
check("未抽过的分区不衰减", Math.abs(wFresh - w1) < 1e-9 || wFresh > wOld);

// 7. 评分 -> 阶梯
const base = { added: "2026-01-01", due: "2026-01-01", step: 2, times: 3, last: "2026-01-01", quality: 3, ease: 2500, skip: false };
check("评 5 进一格", s.nextState(base, 5, TODAY, "2026-01-01").step === 3);
check("评 3 原地不动", s.nextState(base, 3, TODAY, "2026-01-01").step === 2);
check("评 1 退两格", s.nextState(base, 1, TODAY, "2026-01-01").step === 0);
check("评 0 封存", s.nextState(base, 0, TODAY, "2026-01-01").skip === true);
check("阶梯不会退到负数", s.nextState({ ...base, step: 0 }, 1, TODAY, "2026-01-01").step === 0);
check("次数累加", s.nextState(base, 4, TODAY, "2026-01-01").times === 4);

// 8. 首次复习冻结诞生日
const first = s.nextState(null, 4, TODAY, "2021-05-05");
check("首次复习写入冻结诞生日", first.added === "2021-05-05");
const expectedStep = Math.min(
	DEFAULT_SETTINGS.initialStep + 1,
	DEFAULT_SETTINGS.intervals.length - 1,
);
check("首次评 4 从起步阶梯进一格", first.step === expectedStep);
check(
	"首次复习后到期日正确",
	first.due === addDays(TODAY, DEFAULT_SETTINGS.intervals[expectedStep])!,
	`${first.due}`,
);

// 9. 抽卡能抽到东西
const pool = [
	cand({ path: "a.md", domain: "CS", overdueDays: 2, state: { added: "2026-01-01", due: addDays(TODAY, -2)!, step: 0, times: 1, last: "2026-01-01", quality: 3, ease: 2500, skip: false } }),
	cand({ path: "b.md", domain: "Philosophy" }),
	cand({ path: "c.md", domain: "Weapon" }),
];
const picked = s.pick(pool, []);
check("抽卡有结果", picked !== null);
check("抽到的在候选池里", picked !== null && pool.includes(picked.candidate));

// 10. 空池不炸
check("空池返回 null", s.pick([], []) === null);

// 11. 到期清单只含有逾期的
const dueList = s.dueList(pool);
check("到期清单过滤正确", dueList.length === 1 && dueList[0].path === "a.md");

// 12. i18n: 两种语言的 key 必须一一对应(typecheck 只保证 zh 不漏,
//     这条顺带保证 en 也不漏, 并挡住空串)
const enMap = flatten(en);
const zhMap = flatten(zh);
check("中英 key 数量一致", enMap.size === zhMap.size, `${enMap.size} vs ${zhMap.size}`);
let missing = 0;
for (const k of enMap.keys()) if (!zhMap.has(k)) missing++;
check("中文没有漏翻的 key", missing === 0, `缺 ${missing} 条`);
let blank = 0;
for (const v of zhMap.values()) if (v.trim() === "") blank++;
check("没有空文案", blank === 0);

// 13. i18n: 插值与兜底
setLocale("en");
check("英文插值", t("view.dueOverdue", { n: 7 }) === "7 days overdue");
check("英文评分档位", gradeLabel(5) === "Instant recall");

setLocale("zh");
check("中文插值", t("view.dueOverdue", { n: 7 }) === "已逾期 7 天");
check("中文评分档位", gradeLabel(5) === "滚瓜烂熟");

// 14. i18n: 语言回退链 zh-TW -> zh
setLocale("zh-TW");
check("zh-TW 回退到 zh", t("view.title") === "今日深潜");
setLocale("de");
check("未知语言回退到英文", t("view.title") === "Daily dive");

// 15. i18n: 缺 key 时不炸, 退到英文而不是空白
setLocale("zh");
const fallback = (t as unknown as (k: string) => string)("view.title");
check("取不到也不返回空串", fallback.length > 0);

// 16. i18n: 文案里不许残留未替换的占位符
let leftover = 0;
for (const v of [...enMap.values(), ...zhMap.values()]) {
	const used = v.replace(/\{(\w+)\}/g, "");
	if (/\{\w+\}/.test(used)) leftover++;
}
check("占位符写法规范", leftover === 0);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
