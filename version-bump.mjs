import { readFileSync, writeFileSync } from "fs";

// `npm version <patch|minor|major>` bumps package.json first, then runs this
// script — so npm_package_version is already the new version.
const targetVersion = process.env.npm_package_version;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
// 两空格缩进, 和这两个文件的现有格式保持一致
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// versions.json maps each release to the minimum app version it needs, so
// Obsidian can serve older releases to older installs.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`manifest.json 与 versions.json 已更新到 ${targetVersion}`);
