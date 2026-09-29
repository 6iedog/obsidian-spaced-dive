import type { TFile } from "obsidian";

/**
 * 一篇笔记的复习状态。
 * 落在笔记自己的 frontmatter 里, 字段名统一带 `sr-` 前缀 ——
 * 这是社区同类插件(obsidian-spaced-repetition)踩过坑后的约定:
 * 早期用裸字段 due / interval 会和别的插件撞车, 加前缀是血泪换来的。
 */
export interface ReviewState {
	/** 纳入复习池的日期。冻结自笔记当时的 mtime, 之后不再随文件改动漂移。 */
	added: string | null;
	/** 下次到期日 YYYY-MM-DD */
	due: string | null;
	/** 间隔阶梯下标, 指向 settings.intervals */
	step: number;
	/** 累计复习次数 */
	times: number;
	/** 上次复习日期 */
	last: string | null;
	/** 上次评分 0..5 */
	quality: number | null;
	/** 难度系数(千分制), 为将来切换到 SM-2 预留 */
	ease: number;
	/** true = 永不再抽 */
	skip: boolean;
}

/**
 * 候选对象的**核心信息** —— 不掺任何 Obsidian 类型。
 *
 * 拆出来是为了让插件和命令行共用同一套调度算法:
 * CLI 跑在 node 里, 拿不到 TFile, 但它只需要这几个字段就能算权重。
 * 两边共用一份规则, 才不会出现"插件觉得该复习、CLI 觉得不用"这种鬼事。
 */
export interface CandidateCore {
	/** 相对库根的路径, 分隔符统一为 / */
	path: string;
	/** 文件名(不含扩展名), 面板和 CLI 都要显示 */
	basename: string;
	/** 顶层目录, 用作"分区" */
	domain: string;
	/** 估算正文字数(由文件字节数换算, 不读全文, 省一次 IO) */
	sizeChars: number;
	/** 冻结诞生日 YYYY-MM-DD。首次复习时据此写入 sr-added, 之后不再变。 */
	bornISO: string;
	/** 从冻结诞生日算起的天数 */
	bornDays: number;
	/** 已有复习记录则为 ReviewState, 从未复习过为 null */
	state: ReviewState | null;
	/** 逾期天数。未到期为负数, 从未复习过为 null */
	overdueDays: number | null;
}

/** 插件内部的候选对象: 核心信息 + 一个能直接打开的 TFile */
export interface Candidate extends CandidateCore {
	file: TFile;
}

/** 抽取结果的模式标记 */
export type PickMode = "review" | "explore";

/** 一次抽卡的结果。泛型: 传什么类型进去, 就吐什么类型出来。 */
export interface PickResult<T extends CandidateCore = Candidate> {
	candidate: T;
	mode: PickMode;
	/** 本次抽卡候选池的规模, 用于界面提示 */
	poolSize: number;
}

/** 全局历史里的一条(只存分区平衡需要的最小信息) */
export interface HistoryEntry {
	date: string;
	path: string;
	domain: string;
}

/** 存在 data.json 里的非笔记数据 */
export interface PluginMeta {
	version: number;
	history: HistoryEntry[];
	/** 每日复习计数, key 为 YYYY-MM-DD */
	dailyCount: Record<string, number>;
}
