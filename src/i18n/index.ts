import { en, type Dict } from "./en";
import { zh } from "./zh";

/**
 * Obsidian 没有内置 i18n 框架 —— 官方只给 getLanguage(), 翻译全靠自己搭。
 * 这里就是那套自建字典:
 *   en.ts  唯一真源, 所有语言的类型都从它推
 *   zh.ts  声明成 Dict, 漏翻一个 key 编译器就报错
 *   index.ts  t() / setLocale(), 英文兜底
 *
 * 刻意不 import obsidian: 这个文件要能在 node 里直接跑冒烟测试。
 * 语言探测(要调 getLanguage)放在 locale.ts。
 */

const TABLES: Record<string, Dict> = {
	en,
	zh,
	"zh-cn": zh,
	"zh-hans": zh,
};

/** 把嵌套字典摊成 "settings.ui.language.name" 这样的点号路径联合类型 */
type Leaves<T> = T extends string
	? ""
	: {
			[K in keyof T & string]: T[K] extends string
				? K
				: `${K}.${Leaves<T[K]>}`;
		}[keyof T & string];

export type Key = Leaves<Dict>;

export type Vars = Record<string, string | number>;

let table: Dict = en;

/** 语言码 -> 字典。先精确匹配, 再退回主语言(zh-hant -> zh), 最后英文。 */
export function setLocale(lang: string): void {
	const lower = lang.toLowerCase();
	table = TABLES[lower] ?? TABLES[lower.split("-")[0]] ?? en;
}

export function currentLocale(): Dict {
	return table;
}

function lookup(key: string, dict: unknown): string | null {
	let node: unknown = dict;
	for (const part of key.split(".")) {
		if (typeof node !== "object" || node === null) return null;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === "string" ? node : null;
}

/**
 * 取一条文案。
 * 兜底顺序: 当前语言 -> 英文 -> key 本身。最后一档保证界面永不空白,
 * 翻漏了最多是露出 "settings.ui.language.name" 这种路径, 也好排查。
 */
export function t(key: Key, vars?: Vars): string {
	const raw = lookup(key, table) ?? lookup(key, en) ?? key;
	if (!vars) return raw;
	return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in vars ? String(vars[name]) : whole,
	);
}

/**
 * 评分档位的文案。
 * 档位是数字键, 推不出点号路径类型, 所以从字典里单独取, 不走 t()。
 */
export function gradeLabel(quality: number): string {
	return table.grade[quality] ?? en.grade[quality] ?? String(quality);
}
