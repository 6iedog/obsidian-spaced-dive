/**
 * 极简 frontmatter 文本读写 —— 给命令行用的。
 *
 * 插件走 Obsidian 的 metadataCache / processFrontMatter, 那是官方通道;
 * CLI 跑在 node 里没有 Obsidian, 只能自己动手。
 *
 * 刻意做得**保守**: 只认第一层的 `key: value`, 多行块能读但不改,
 * 写回时除目标键以外的行**原样照抄**。宁可少改, 不能改坏老大的笔记。
 */

export interface FmBlock {
	has: boolean;
	/** 结束 `---` 的行号; 没有块时为 -1 */
	endLine: number;
	data: Record<string, unknown>;
}

function stripQuote(s: string): string {
	if (s.length >= 2) {
		const head = s[0];
		if ((head === '"' || head === "'") && s[s.length - 1] === head) {
			return s.slice(1, -1);
		}
	}
	return s;
}

function parseScalar(raw: string): unknown {
	const v = raw.trim();
	if (v === "") return "";
	if (v === "true") return true;
	if (v === "false") return false;
	if (v === "null" || v === "~") return null;
	// 只认纯数字, 别把 2026-09-30 这样的日期吃成数字
	if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
	if (v.startsWith("[") && v.endsWith("]")) {
		return v
			.slice(1, -1)
			.split(",")
			.map((x) => stripQuote(x.trim()))
			.filter((x) => x !== "");
	}
	return stripQuote(v);
}

export function parseFrontmatter(text: string): FmBlock {
	const lines = text.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") {
		return { has: false, endLine: -1, data: {} };
	}

	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			end = i;
			break;
		}
	}
	if (end < 0) return { has: false, endLine: -1, data: {} };

	const data: Record<string, unknown> = {};
	let i = 1;
	while (i < end) {
		const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
		if (!m) {
			i++;
			continue;
		}
		const key = m[1];
		const rest = m[2];

		if (rest.trim() === "") {
			// 可能是块状数组: 往下收 `- item`
			const items: string[] = [];
			let j = i + 1;
			while (j < end) {
				const sub = /^\s+-\s*(.*)$/.exec(lines[j]);
				if (!sub) break;
				items.push(stripQuote(sub[1].trim()));
				j++;
			}
			if (items.length > 0) {
				data[key] = items;
				i = j;
				continue;
			}
			data[key] = "";
			i++;
			continue;
		}

		data[key] = parseScalar(rest);
		i++;
	}

	return { has: true, endLine: end, data };
}

function formatScalar(value: string | number | boolean): string {
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return String(value);
	const s = value.trim();
	if (s === "") return '""';
	// 含 YAML 特殊字符才加引号, 日期/数字保持裸值(Obsidian 里更好读)
	if (/[:#[\]{},"'|>&*!?%@`]/.test(s)) return JSON.stringify(s);
	return s;
}

/**
 * 就地更新 frontmatter。值是 `null` 表示**删掉这个键**。
 * 没有 frontmatter 块就在文件开头新建一个。
 */
export function writeFrontmatter(
	text: string,
	patch: Record<string, string | number | boolean | null>,
): string {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const lines = text.split(/\r?\n/);
	const block = parseFrontmatter(text);
	const keys = Object.keys(patch);

	if (!block.has) {
		const out = ["---"];
		for (const key of keys) {
			const value = patch[key];
			if (value !== null) out.push(`${key}: ${formatScalar(value)}`);
		}
		out.push("---");
		// frontmatter 块和正文之间的空行不能省, 少了 markdown 解析会别扭
		const gap = /^\r?\n/.test(text) ? "" : eol;
		return out.join(eol) + eol + gap + text;
	}

	const out: string[] = ["---"];
	const applied = new Set<string>();

	for (let i = 1; i < block.endLine; i++) {
		const m = /^([A-Za-z0-9_-]+)\s*:/.exec(lines[i]);
		const key = m?.[1];

		if (key !== undefined && key in patch) {
			if (applied.has(key)) continue; // 老文件里的重复键, 只留一个
			applied.add(key);
			const value = patch[key];
			if (value === null) continue; // 删除: 直接跳过这一行
			out.push(`${key}: ${formatScalar(value)}`);
			continue;
		}

		out.push(lines[i]); // 其余行原样照抄
	}

	for (const key of keys) {
		const value = patch[key];
		if (applied.has(key) || value === null) continue;
		out.push(`${key}: ${formatScalar(value)}`);
	}

	out.push("---");
	out.push(...lines.slice(block.endLine + 1));
	return out.join(eol);
}
