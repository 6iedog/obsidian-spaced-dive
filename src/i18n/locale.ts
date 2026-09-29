import { getLanguage } from "obsidian";
import type { UiLanguage } from "../settings";

/**
 * 决定用哪种语言。
 *
 * getLanguage() 是官方唯一的语言入口(@since 1.8.7), 也是唯一可信值 ——
 * navigator.language 和 localStorage 都会被 eslint-plugin-obsidianmd 的
 * prefer-get-language 规则判违规, 移动端和桌面端的语言设置根本不同源。
 */
export function resolveLocale(pref: UiLanguage): string {
	if (pref === "en") return "en";
	if (pref === "zh") return "zh";
	// 老版本没有这个导出时退化成英文, 行为不变但不崩
	return typeof getLanguage === "function" ? getLanguage() : "en";
}
