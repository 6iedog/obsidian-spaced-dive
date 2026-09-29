/**
 * 日期一律用 UTC 的"天序号"整数处理, 避免跨时区/夏令时把 ±1 天的误差带进调度。
 */

const MS_PER_DAY = 86400000;

/** 今天(本地时区)的 YYYY-MM-DD */
export function todayISO(now = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD -> 天序号。格式非法或日期不存在(如 2026-02-30)返回 null。 */
export function toDayNumber(iso: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	const t = Date.UTC(y, mo - 1, d);
	const back = new Date(t);
	if (
		back.getUTCFullYear() !== y ||
		back.getUTCMonth() !== mo - 1 ||
		back.getUTCDate() !== d
	) {
		return null;
	}
	return Math.floor(t / MS_PER_DAY);
}

/** b - a, 单位天。任一端非法返回 null。 */
export function daysBetween(aISO: string, bISO: string): number | null {
	const a = toDayNumber(aISO);
	const b = toDayNumber(bISO);
	if (a === null || b === null) return null;
	return b - a;
}

/** 在 YYYY-MM-DD 上加 n 天(n 可为负) */
export function addDays(iso: string, n: number): string | null {
	const d = toDayNumber(iso);
	if (d === null) return null;
	const back = new Date((d + n) * MS_PER_DAY);
	const y = back.getUTCFullYear();
	const m = String(back.getUTCMonth() + 1).padStart(2, "0");
	const day = String(back.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** 时间戳(毫秒) -> YYYY-MM-DD */
export function dateFromMillis(ms: number): string {
	const d = new Date(ms);
	return todayISO(d);
}

/** 把用户输入的多行文本切成干净的路径数组 */
export function parsePathList(raw: string): string[] {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * 由文件字节数估算"正文字数"。
 * 中文 UTF-8 约 3 字节/字, 英文约 1 字节/字, 混合库取折中系数。
 * 这么干是为了不读全文 —— 2595 篇笔记逐篇 cachedRead 的开销没必要花在一次抽取上。
 */
export function estimateChars(bytes: number): number {
	return Math.round(bytes / 2.4);
}
