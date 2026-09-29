import { App, TFile } from "obsidian";
import type { Candidate, ReviewState } from "./types";
import type { SpacedDiveSettings } from "./settings";
import { todayISO } from "./utils";
import { t } from "./i18n";
import {
	buildCandidate,
	buildFilter,
	tagsFromFrontmatter,
	type NoteFacts,
} from "./rules";
import type { ReviewStore } from "./store";

/** 单篇反查的结果: 要么能入选并带上状态, 要么给出被排除的原因 */
export type DescribeResult =
	| { ok: true; candidate: Candidate }
	| { ok: false; reason: string };

/**
 * 扫出候选池。
 *
 * 性能约定: 全程只碰 metadataCache 和 file.stat, 不读正文。
 * 2000+ 篇笔记也能在几十毫秒内出结果, 而且不产生任何磁盘读放大。
 *
 * 判定规则和命令行 CLI 是**同一份**(src/rules.ts), 这里只负责
 * 把 Obsidian 的 TFile / metadataCache 翻译成中立的 NoteFacts。
 */
export class NoteScanner {
	constructor(
		private app: App,
		private getSettings: () => SpacedDiveSettings,
		private store: ReviewStore,
	) {}

	/** TFile -> 中立素材。规则层只认这个, 不认 Obsidian。 */
	private factsOf(file: TFile): NoteFacts {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? null);

		// 标签有两个来源: frontmatter 的 tags, 以及正文里的 #tag
		const tags = tagsFromFrontmatter(fm);
		for (const entry of cache?.tags ?? []) {
			const norm = entry.tag.replace(/^#/, "").trim().toLowerCase();
			if (norm) tags.push(norm);
		}

		return {
			path: file.path,
			basename: file.basename,
			size: file.stat.size,
			mtime: file.stat.mtime,
			frontmatter: fm,
			tags,
		};
	}

	private candidateOf(file: TFile): Candidate {
		const facts = this.factsOf(file);
		const state = this.store.read(file, file.path);
		return { ...buildCandidate(facts, state, todayISO()), file };
	}

	scan(): Candidate[] {
		const settings = this.getSettings();
		const excluded = buildFilter(settings);
		const out: Candidate[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const facts = this.factsOf(file);
			if (excluded(facts)) continue;

			const candidate: Candidate = {
				...buildCandidate(
					facts,
					this.store.read(file, file.path),
					todayISO(),
				),
				file,
			};
			if (
				settings.dropThinNotes &&
				candidate.sizeChars < settings.minChars
			) {
				continue;
			}
			out.push(candidate);
		}

		return out;
	}

	/**
	 * 单篇反查: 当前激活的笔记在不在复习范围里, 在的话状态是什么。
	 * 不在范围时把**原因**一起带回去, 面板要拿它给用户交代。
	 */
	describe(file: TFile): DescribeResult {
		const why = buildFilter(this.getSettings())(this.factsOf(file));
		if (why !== null) return { ok: false, reason: why };
		return { ok: true, candidate: this.candidateOf(file) };
	}

	/** 只统计到期/逾期数量, 供状态栏显示 */
	countDue(): number {
		return this.scan().filter(
			(c) => c.state && !c.state.skip && (c.overdueDays ?? -1) >= 0,
		).length;
	}
}

/** 供 UI 直接复用的小工具: 拿到一篇笔记的当前状态 */
export function describeState(state: ReviewState | null): string {
	if (!state) return t("state.never");
	if (state.skip) return t("state.archived");
	return t("state.reviewed", {
		n: state.times ?? 0,
		date: state.last ?? "",
	});
}
