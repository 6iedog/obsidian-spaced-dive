/**
 * 把 skill 包 (skills/spaced-dive/) 同步到本机的 skills 目录。
 *
 * 目的: 在插件项目里改完 CLI, 一条 `npm run skill` 就让 AI 用上新的,
 * 不用手动往 ~/.workbuddy/skills/ 里拷。
 *
 * 目标目录: SPACED_DIVE_SKILLS_DIR ?? ~/.workbuddy/skills
 *
 * 只增改不删除 —— 目标目录里的 vault.txt 是用户自己写的库根提示, 不能被抹掉。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const SRC = path.join(root, "skills", "spaced-dive");
const SKILLS_DIR =
	process.env.SPACED_DIVE_SKILLS_DIR ??
	path.join(os.homedir(), ".workbuddy", "skills");
const DEST = path.join(SKILLS_DIR, "spaced-dive");

if (!existsSync(path.join(SRC, "SKILL.md"))) {
	console.error(`找不到 skill 包: ${SRC}`);
	process.exit(1);
}

mkdirSync(DEST, { recursive: true });

for (const name of readdirSync(SRC)) {
	copyFileSync(path.join(SRC, name), path.join(DEST, name));
	console.log(`已同步 ${name}`);
}

// 提醒一下目标目录里多出来的东西(不删, 只报)
const extra = existsSync(DEST)
	? readdirSync(DEST).filter((n) => !existsSync(path.join(SRC, n)))
	: [];
if (extra.length > 0) {
	console.log(`\n保留未动(不是包里的): ${extra.join(", ")}`);
}

console.log(`\nskill 就绪: ${DEST}`);
console.log("AI 下次读这个 skill 时就是最新版。");
