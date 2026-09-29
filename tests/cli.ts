/**
 * CLI 的纯逻辑测试。
 *
 * 测的是"往笔记里写 sr-* 会不会弄坏别的东西" —— 这是整条链路上
 * 唯一会**改动老大笔记**的动作, 必须钉死。
 *
 * 不 spawn 子进程: 沙箱里 spawn 会 EBUSY, 而且真跑 CLI 就得有个真库。
 * 端到端的几条命令在开发时手工跑过, 这里保证的是底层读写正确。
 */
import {
	parseFrontmatter,
	writeFrontmatter,
} from "../src/cli/frontmatter-text";
import {
	buildFilter,
	frontmatterPatch,
	stateFromFrontmatter,
	type NoteFacts,
} from "../src/rules";
import { DEFAULT_SETTINGS } from "../src/settings";

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

function note(path: string, extra: Partial<NoteFacts> = {}): NoteFacts {
	return {
		path,
		basename: path.split("/").pop()!.replace(/\.md$/, ""),
		size: 2000,
		mtime: Date.parse("2024-01-01"),
		frontmatter: null,
		tags: [],
		...extra,
	};
}

// ---------- 解析 ----------

const fm1 = parseFrontmatter(
	"---\ntype: 知识点\ntags: [a/b, c]\nsr-times: 3\nsr-skip: true\n---\n\n正文\n",
);
check("解析出基本键值", fm1.data["type"] === "知识点");
check("解析出行内数组", Array.isArray(fm1.data["tags"]) && (fm1.data["tags"] as string[]).length === 2);
check("布尔值解析", fm1.data["sr-skip"] === true);
check("数字解析", fm1.data["sr-times"] === 3);

const fm2 = parseFrontmatter(
	"---\ntags:\n  - 内容类型/概念\n  - 掌握状态/参考\nsr-due: 2026-09-30\n---\n正文\n",
);
check(
	"解析出块状数组",
	Array.isArray(fm2.data["tags"]) && (fm2.data["tags"] as string[])[0] === "内容类型/概念",
);
check("日期保持字符串", fm2.data["sr-due"] === "2026-09-30", String(fm2.data["sr-due"]));

check("没有 frontmatter 时不误判", parseFrontmatter("# 光杆正文\n").has === false);
check(
	"--- 出现的正文不算 frontmatter",
	parseFrontmatter("\n\n---\n\n正文\n").has === false,
);

// ---------- 写回: 不能弄坏原有内容 ----------

const original = [
	"---",
	"type: 知识点",
	"tags: [内容类型/概念, 掌握状态/已掌握]",
	"custom: 别动我",
	"---",
	"",
	"# 标题",
	"",
	"正文内容",
	"",
].join("\n");

const written = writeFrontmatter(original, {
	"sr-due": "2026-10-01",
	"sr-times": 1,
});
check("原有 type 保留", written.includes("type: 知识点"));
check("原有 tags 保留", written.includes("tags: [内容类型/概念, 掌握状态/已掌握]"));
check("原有 custom 保留", written.includes("custom: 别动我"));
check("正文保留", written.includes("# 标题") && written.includes("正文内容"));
check("写入 sr-due", written.includes("sr-due: 2026-10-01"));
check("写入 sr-times", written.includes("sr-times: 1"));
check(
	"sr 字段排在原有字段之后",
	written.indexOf("sr-due") > written.indexOf("custom"),
);

// ---------- 写回: 覆盖而不是追加 ----------

const twice = writeFrontmatter(written, { "sr-due": "2026-11-01" });
check(
	"改同一个键是覆盖",
	(twice.match(/^sr-due:/gm) ?? []).length === 1,
	`出现 ${(twice.match(/^sr-due:/gm) ?? []).length} 次`,
);
check("覆盖后是新值", twice.includes("sr-due: 2026-11-01") && !twice.includes("2026-10-01"));

// ---------- 写回: 删除键 ----------

const removed = writeFrontmatter(written, { "sr-due": null });
check("null 表示删掉这个键", !removed.includes("sr-due"));

// ---------- 写回: 自建 frontmatter ----------

const bare = "# 光杆\n\n没头没尾的一篇。\n";
const created = writeFrontmatter(bare, { "sr-added": "2026-09-28" });
check("自建了 frontmatter 块", created.startsWith("---\n"));
check("自建块里有字段", created.includes("sr-added: 2026-09-28"));
check(
	"自建块与正文之间留了空行",
	created.includes("---\n\n# 光杆"),
	JSON.stringify(created.slice(0, 60)),
);
check("自建后正文还在", created.includes("# 光杆") && created.includes("没头没尾的一篇。"));
check(
	"自建块能被自己解析回来",
	parseFrontmatter(created).data["sr-added"] === "2026-09-28",
);

// ---------- 写回: 行尾 ----------

const crlf = "---\r\ntype: x\r\n---\r\n正文\r\n";
const crlfOut = writeFrontmatter(crlf, { "sr-times": 2 });
check("CRLF 文件保持 CRLF", crlfOut.includes("\r\n") && !/[^\r]\n/.test(crlfOut));
const lfOut = writeFrontmatter("---\ntype: x\n---\n正文\n", { "sr-times": 2 });
check("LF 文件保持 LF", !lfOut.includes("\r"));

// ---------- 状态往返 ----------

const fm = parseFrontmatter(
	"---\nsr-added: 2026-01-01\nsr-due: 2026-01-08\nsr-step: 2\nsr-times: 3\nsr-last: 2026-01-01\nsr-quality: 4\n---\n正文\n",
).data;
const state = stateFromFrontmatter(fm, "sr-");
check("读出完整状态", state !== null && state.times === 3 && state.step === 2);
check("从未复习的返回 null", stateFromFrontmatter({ type: "x" }, "sr-") === null);

const patch = frontmatterPatch(
	{ added: "2026-01-01", due: "2026-01-08", step: 2, times: 3, last: "2026-01-01", quality: 4 },
	"sr-",
);
const roundTrip = stateFromFrontmatter(patch as Record<string, unknown>, "sr-");
check("写出去的补丁能原样读回来", roundTrip !== null && roundTrip.due === "2026-01-08");
check(
	"skip=false 转成删除(null) 而不是写 false",
	frontmatterPatch({ skip: false }, "sr-")["sr-skip"] === null,
);
check(
	"skip=true 写成 true",
	frontmatterPatch({ skip: true }, "sr-")["sr-skip"] === true,
);

// ---------- 过滤规则(与插件共用同一份) ----------

const filter = buildFilter(DEFAULT_SETTINGS);
check(
	"Journal 目录被排除",
	filter(note("Journal/2026/日记.md"))?.includes("Journal") === true,
);
check("导航页被排除", filter(note("A/directory.md")) !== null);
check("索引页被排除", filter(note("A/README.md")) !== null);
check(
	"带封存标签的被排除",
	filter(note("A/x.md", { frontmatter: { tags: ["sr-skip"] } })) !== null,
);
check(
	"type: folder_index 被排除",
	filter(note("A/x.md", { frontmatter: { type: "folder_index" } })) !== null,
);
check("普通知识页通过", filter(note("CS Foundation/算法/二分.md")) === null);
check(
	"根目录散文件: skipRootFiles=false 时通过",
	filter(note("散文件.md")) === null,
);
check(
	"根目录散文件: skipRootFiles=true 时被排除",
	buildFilter({ ...DEFAULT_SETTINGS, skipRootFiles: true })(note("散文件.md")) !== null,
);
check(
	"排除原因是人话",
	typeof filter(note("Meta/x.md")) === "string" &&
		filter(note("Meta/x.md"))!.length > 0,
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
