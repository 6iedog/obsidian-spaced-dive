import { DEFAULT_INTERVALS } from "./constants";

/** 参与复习的笔记怎么圈定 */
export type ScopeMode = "all" | "folders" | "tag";
/** 调度数据落在哪里 */
export type StorageMode = "frontmatter" | "json";
/** 抽到的笔记在哪儿打开 */
export type OpenInMode = "current" | "tab" | "split";
/** 界面语言: 跟随 Obsidian, 或强制某一种 */
export type UiLanguage = "auto" | "en" | "zh";

export interface SpacedDiveSettings {
	// ---- 抽卡范围 ----
	scopeMode: ScopeMode;
	/** scopeMode = folders 时的白名单 */
	includeFolders: string[];
	/** 任何模式下都生效的黑名单 */
	excludeFolders: string[];
	/** scopeMode = tag 时凭此标签入选 */
	reviewTag: string;
	/** 带此标签的笔记永不入选 */
	skipTag: string;
	/** 文件名命中此正则则跳过(导航页 / 索引页) */
	skipNamePattern: string;
	/** 库根目录的散文件多半是导航页, 默认不参与抽卡 */
	skipRootFiles: boolean;

	// ---- 内容筛选 ----
	/** 正文少于此字数视为残页, 降权 */
	minChars: number;
	/** 残页是"降权"还是"直接排除" */
	dropThinNotes: boolean;

	// ---- 调度 ----
	/** 艾宾浩斯简化阶梯, 单位天 */
	intervals: number[];
	/** 评分为"忘了"时后退的阶梯数 */
	stepsBackOnFail: number;
	/** 初始阶梯下标 */
	initialStep: number;

	// ---- 抽取 ----
	/** 有多大概率去没复习过的荒地探险 */
	exploreRate: number;
	/** 分区平衡: 回看最近几次 */
	recentWindow: number;
	/** 分区平衡: 近期抽过的分区衰减系数 */
	recentDecay: number;
	/** 每日抽卡上限, 0 = 不限 */
	dailyLimit: number;

	// ---- 存储 ----
	storage: StorageMode;
	/** frontmatter 字段前缀, 防止和别的插件撞车 */
	fieldPrefix: string;

	// ---- 界面 ----
	showStatusBar: boolean;
	/** 左侧栏放一个骰子按钮 */
	showRibbonIcon: boolean;
	/** 点「打开这篇笔记」时用哪种方式打开 */
	openIn: OpenInMode;
	/** 面板是否自动跟随当前激活的笔记 */
	followActiveNote: boolean;
	/** 演练模式: 走完整流程, 但一个字节都不写 */
	dryRun: boolean;
	/** 界面语言。auto = 跟随 Obsidian 的 getLanguage() */
	uiLanguage: UiLanguage;
}

export const DEFAULT_SETTINGS: SpacedDiveSettings = {
	scopeMode: "all",
	includeFolders: [],
	excludeFolders: ["Journal", "Inbox", "Meta"],
	reviewTag: "review",
	skipTag: "sr-skip",
	skipNamePattern:
		"(directory|目录|TOC|toc|index|Index|README|readme|导航|索引)",
	skipRootFiles: false,

	minChars: 220,
	dropThinNotes: false,

	intervals: [...DEFAULT_INTERVALS],
	stepsBackOnFail: 2,
	initialStep: 0,

	exploreRate: 0.3,
	recentWindow: 5,
	recentDecay: 0.35,
	dailyLimit: 0,

	storage: "frontmatter",
	fieldPrefix: "sr-",

	showStatusBar: true,
	showRibbonIcon: true,
	openIn: "current",
	followActiveNote: true,
	dryRun: false,
	uiLanguage: "auto",
};
