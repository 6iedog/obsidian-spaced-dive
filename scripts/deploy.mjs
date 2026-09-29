/**
 * 把**插件三件套**拷进知识库, 方便本地测试。
 *
 * 只拷插件自己的东西。CLI 不在这儿 —— 它属于独立的 skill 包
 * (skills/spaced-dive/), 由 `npm run skill` 同步到 AI 的 skills 目录。
 * 插件保持"纯 Obsidian 插件", 发布面就是标准三件套 + manifest/versions。
 *
 * 库根从 SPACED_DIVE_VAULT 读, 没设就用下面的本机默认值。
 * 库找不到时只警告不报错 —— build 里挂着这一步, 不该在别人机器上把构建带崩。
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";

const VAULT =
	process.env.SPACED_DIVE_VAULT ?? "C:/Users/Lenovo/Nutstore/1/Knowledge";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

const vaultDir = path.resolve(VAULT);
if (!existsSync(path.join(vaultDir, ".obsidian"))) {
	console.warn(`跳过部署: ${vaultDir} 底下没有 .obsidian —— 不像库根。`);
	console.warn(`想指定就: SPACED_DIVE_VAULT="<库根>" npm run deploy`);
	process.exit(0);
}

const DEST = path.join(vaultDir, ".obsidian", "plugins", "spaced-dive");
const root = path.resolve(import.meta.dirname, "..");
mkdirSync(DEST, { recursive: true });

let failed = 0;
for (const rel of ARTIFACTS) {
	const from = path.join(root, rel);
	if (!existsSync(from)) {
		console.error(`缺失 ${rel} —— 先跑一次 npm run build`);
		failed++;
		continue;
	}
	copyFileSync(from, path.join(DEST, rel));
	console.log(`已部署 ${rel}`);
}

if (failed > 0) process.exit(1);
console.log(`\n插件就绪: ${DEST}`);
console.log("在 Obsidian 里重载插件即可生效。");
