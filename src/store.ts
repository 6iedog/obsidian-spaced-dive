import { App, TFile } from "obsidian";
import type { ReviewState } from "./types";
import type { SpacedDiveSettings } from "./settings";
import {
	EASE_DEFAULT,
	STATE_FIELDS,
	frontmatterPatch,
	stateFromFrontmatter,
} from "./rules";

/** data.json 的完整形态 */
export interface PersistedData {
	settings: SpacedDiveSettings;
	meta: {
		version: number;
		history: { date: string; path: string; domain: string }[];
		dailyCount: Record<string, number>;
	};
	/** 仅 storage = json 时使用, key 为笔记相对路径 */
	notes: Record<string, ReviewState>;
}

export const EMPTY_STATE: ReviewState = {
	added: null,
	due: null,
	step: 0,
	times: 0,
	last: null,
	quality: null,
	ease: EASE_DEFAULT,
	skip: false,
};

/**
 * 复习状态的读写门面。
 *
 * 两种后端, 同一套接口:
 *  - frontmatter: 真源在笔记里, 读走 metadataCache(内存, 零 IO), 写走 processFrontMatter
 *  - json:        真源在 data.json, 一次读写一个文件
 *
 * 插件自身只跟这个门面打交道, 存储切换对上层是透明的。
 */
export class ReviewStore {
	constructor(
		private app: App,
		private getSettings: () => SpacedDiveSettings,
		private data: PersistedData,
	) {}

	private key(base: string): string {
		return this.getSettings().fieldPrefix + base;
	}

	/** 读一篇笔记的状态。从未复习过返回 null。 */
	read(file: TFile, path: string): ReviewState | null {
		if (this.getSettings().storage === "json") {
			const rec = this.data.notes[path];
			return rec ?? null;
		}
		return this.readFromFrontmatter(file);
	}

	private readFromFrontmatter(file: TFile): ReviewState | null {
		const cache = this.app.metadataCache.getFileCache(file);
		return stateFromFrontmatter(
			cache?.frontmatter,
			this.getSettings().fieldPrefix,
		);
	}

	/** 落盘一篇笔记的状态 */
	async write(
		file: TFile,
		path: string,
		patch: Partial<ReviewState>,
	): Promise<void> {
		if (this.getSettings().storage === "json") {
			this.writeToJson(path, patch);
			return;
		}
		await this.writeToFrontmatter(file, patch);
	}

	private writeToJson(path: string, patch: Partial<ReviewState>): void {
		const prev = this.data.notes[path] ?? { ...EMPTY_STATE };
		this.data.notes[path] = { ...prev, ...patch };
	}

	private async writeToFrontmatter(
		file: TFile,
		patch: Partial<ReviewState>,
	): Promise<void> {
		const fields = frontmatterPatch(patch, this.getSettings().fieldPrefix);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const front = fm as Record<string, unknown>;
			for (const [key, value] of Object.entries(fields)) {
				// null 的语义是"删掉这个键", 别写成一个 null
				if (value === null) delete front[key];
				else front[key] = value;
			}
		});
	}

	/** 抹掉一篇笔记的全部复习痕迹 */
	async clear(file: TFile, path: string): Promise<void> {
		if (this.getSettings().storage === "json") {
			delete this.data.notes[path];
			return;
		}
		const key = (base: string) => this.key(base);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const front = fm as Record<string, unknown>;
			for (const base of STATE_FIELDS) delete front[key(base)];
		});
	}

	/**
	 * 笔记被改名或移动时, json 后端的 key 会失联 —— 这是集中式存储唯一的硬伤。
	 * frontmatter 后端天生跟随, 什么都不用做。
	 */
	renameNote(oldPath: string, newPath: string): void {
		const rec = this.data.notes[oldPath];
		if (!rec) return;
		delete this.data.notes[oldPath];
		this.data.notes[newPath] = rec;
	}

	/** 笔记被删除时清掉残留记录 */
	removeNote(path: string): void {
		delete this.data.notes[path];
	}
}
