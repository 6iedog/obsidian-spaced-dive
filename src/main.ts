import {
	Notice,
	Plugin,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { DEFAULT_SETTINGS, type SpacedDiveSettings } from "./settings";
import { ReviewStore, type PersistedData } from "./store";
import { NoteScanner, type DescribeResult } from "./scanner";
import { Scheduler } from "./scheduler";
import { ReviewView } from "./ui/review-view";
import { SpacedDiveSettingTab } from "./ui/setting-tab";
import { DUE_CACHE_MS, HISTORY_CAP, REVIEW_VIEW_TYPE } from "./constants";
import { todayISO } from "./utils";
import { setLocale, t } from "./i18n";
import { resolveLocale } from "./i18n/locale";
import type { Candidate } from "./types";

export default class SpacedDivePlugin extends Plugin {
	settings!: SpacedDiveSettings;

	private data!: PersistedData;
	private store!: ReviewStore;
	private scanner!: NoteScanner;
	private scheduler!: Scheduler;

	private statusBarEl: HTMLElement | null = null;
	private ribbonEl: HTMLElement | null = null;
	private saveTimer: number | null = null;
	private dueCache: { n: number; at: number } | null = null;

	async onload(): Promise<void> {
		await this.hydrate();
		setLocale(resolveLocale(this.settings.uiLanguage));

		this.store = new ReviewStore(this.app, () => this.settings, this.data);
		this.scanner = new NoteScanner(
			this.app,
			() => this.settings,
			this.store,
		);
		this.scheduler = new Scheduler(() => this.settings);

		this.registerView(
			REVIEW_VIEW_TYPE,
			(leaf) => new ReviewView(leaf, this),
		);

		// 命令名在注册时就定型了, 改语言得重载插件才生效 ——
		// Obsidian 没有 language-change 事件, 这是社区通行妥协。
		this.addCommand({
			id: "pick-note",
			name: t("command.pick"),
			callback: () => void this.pickAndShow(),
		});

		this.addCommand({
			id: "open-review-panel",
			name: t("command.openPanel"),
			callback: () => void this.openReviewPanel(),
		});

		this.addCommand({
			id: "show-stats",
			name: t("command.stats"),
			callback: () => this.showStats(),
		});

		this.addCommand({
			id: "reset-current-note",
			name: t("command.resetCurrent"),
			callback: () => void this.resetCurrentNote(),
		});

		this.addSettingTab(new SpacedDiveSettingTab(this.app, this));

		// 集中式存储唯一的硬伤: 笔记改名后 key 会失联, 得手动跟一次
		this.registerEvent(
			this.app.vault.on(
				"rename",
				(file: TAbstractFile, oldPath: string) => {
					this.store.renameNote(oldPath, file.path);
					void this.saveData(this.data);
				},
			),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.store.removeNote(file.path);
			}),
		);

		// 面板跟着当前笔记走 —— 这是"反查"的基础设施。
		// 两个事件都得听:
		//   active-leaf-change = 切换标签 / 面板
		//   file-open          = 在同一个标签里跳到另一篇(点链接、搜索跳转)
		// 只听前者的话, 最常见的那种切换方式反而没反应。
		const refreshPanels = () => {
			for (const leaf of this.app.workspace.getLeavesOfType(
				REVIEW_VIEW_TYPE,
			)) {
				if (leaf.view instanceof ReviewView) {
					void leaf.view.refreshContext();
				}
			}
		};
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", refreshPanels),
		);
		this.registerEvent(this.app.workspace.on("file-open", refreshPanels));

		// 右键菜单: 直接抹掉单篇的复习记录
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				menu.addItem((item) =>
					item
						.setTitle(t("menu.clearRecord"))
						.setIcon("rotate-ccw")
						.onClick(() => void this.resetNote(file)),
				);
			}),
		);

		this.refreshRibbon();
		this.setupStatusBar();
	}

	onunload(): void {
		// 挂起的防抖保存要在插件卸载前落盘, 否则最后一次设置改动会丢
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.saveData(this.data);
		}
	}

	private async hydrate(): Promise<void> {
		const raw = (await this.loadData()) as Partial<PersistedData> | null;
		const meta = raw?.meta;
		this.data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, raw?.settings ?? {}),
			meta: {
				version: meta?.version ?? 1,
				history: meta?.history ?? [],
				dailyCount: meta?.dailyCount ?? {},
			},
			notes: raw?.notes ?? {},
		};
		this.settings = this.data.settings;
	}

	/** 防抖落盘。设置面板的滑块会连续触发, 每次都写盘太浪费。 */
	async saveSettings(): Promise<void> {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveData(this.data);
		}, 400);
	}

	private recentDomains(): string[] {
		const window_ = this.settings.recentWindow;
		if (window_ <= 0) return [];
		return this.data.meta.history
			.slice(-window_)
			.map((h) => h.domain)
			.filter((d) => d.length > 0);
	}

	/**
	 * 只抽一张, **不碰 workspace**: 不开面板、不 reveal、不找 leaf。
	 * 抽不到返回 null, 原因已经用 Notice 说过了。
	 *
	 * 拆出来是因为面板自己抽卡时(首次打开那一次)不能走 openReviewPanel ——
	 * 那时视图刚构造、还没登记进 workspace, getLeavesOfType() 查不到自己,
	 * 会掉进兜底分支去别的 leaf 上开一个视图, 结果"抽了但没显示"。
	 */
	async drawOne(): Promise<Candidate | null> {
		const today = todayISO();
		const limit = this.settings.dailyLimit;

		if (limit > 0 && (this.data.meta.dailyCount[today] ?? 0) >= limit) {
			new Notice(t("notice.dailyLimit", { n: limit }));
			return null;
		}

		const candidates = this.scanner.scan();
		if (candidates.length === 0) {
			new Notice(t("notice.emptyPool"));
			return null;
		}

		const result = this.scheduler.pick(candidates, this.recentDomains());
		if (!result) {
			new Notice(t("notice.nothingToPick"));
			return null;
		}

		return result.candidate;
	}

	/** 抽一张并把结果放进侧边栏面板 */
	async pickAndShow(): Promise<void> {
		const candidate = await this.drawOne();
		if (!candidate) return;

		// 抽卡不自动跳转笔记。面板先把「抽到了什么」交代清楚,
		// 看不看由用户点按钮决定 —— 自动跳转会打断判断, 还可能顶掉正在看的标签页。
		await this.openReviewPanel();

		const leaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];
		if (leaf && leaf.view instanceof ReviewView) {
			leaf.view.setDrawn(candidate);
		}
	}

	/** 打开侧边栏面板。已存在则直接显示, 不重复创建。 */
	async openReviewPanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf =
			this.app.workspace.getRightLeaf(false) ??
			this.app.workspace.getLeaf("split", "vertical");
		// active: false —— 不抢走焦点, 用户要能直接读刚打开的笔记
		await leaf.setViewState({ type: REVIEW_VIEW_TYPE, active: false });
		await this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * 在主区打开笔记。
	 *
	 * 关键约束: **绝不动固定的标签页**。固定的语义就是"别替换我",
	 * 早先版本直接抓第一个 markdown 叶子往里塞, 会把用户钉住的笔记顶掉。
	 */
	async openInMainArea(file: TFile): Promise<void> {
		if (this.settings.openIn === "tab") {
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}
		if (this.settings.openIn === "split") {
			await this.app.workspace
				.getLeaf("split", "vertical")
				.openFile(file);
			return;
		}

		// current: 优先用当前正在看的那个标签, 但固定页要绕开
		const active = this.app.workspace.getMostRecentLeaf();
		const activeUsable =
			active !== null &&
			active.getViewState()?.type === "markdown" &&
			!this.isPinned(active);

		const fallback = this.app.workspace
			.getLeavesOfType("markdown")
			.find((leaf) => !this.isPinned(leaf));

		const target = activeUsable
			? active
			: (fallback ?? this.app.workspace.getLeaf(true));
		await target.openFile(file);
	}

	/** 标签页是否被固定。老版本没有这个字段, 取不到就当没固定, 行为退化但不出错。 */
	private isPinned(leaf: WorkspaceLeaf): boolean {
		const state = leaf.getViewState() as { pinned?: boolean };
		return state?.pinned === true;
	}

	/** 单篇反查: 在范围内则返回状态, 否则返回被排除的原因。面板据此决定跟不跟随。 */
	describeNote(file: TFile): DescribeResult {
		return this.scanner.describe(file);
	}

	/**
	 * 待复习数量, 侧边栏底栏和状态栏共用。
	 * 切换标签会频繁触发面板刷新, 每次都扫一遍全库太浪费, 所以给个短缓存。
	 */
	countDue(): number {
		const now = Date.now();
		if (this.dueCache && now - this.dueCache.at < DUE_CACHE_MS) {
			return this.dueCache.n;
		}
		const n = this.scanner.countDue();
		this.dueCache = { n, at: now };
		return n;
	}

	/** 登记一次评分, 返回给面板显示的结果文案 */
	async grade(candidate: Candidate, quality: number): Promise<string> {
		const today = todayISO();
		const patch = this.scheduler.nextState(
			candidate.state,
			quality,
			today,
			candidate.bornISO,
		);
		const idx = Math.min(
			patch.step ?? 0,
			this.settings.intervals.length - 1,
		);
		const days = this.settings.intervals[idx];

		if (quality === 0) {
			if (!this.settings.dryRun) {
				await this.store.write(candidate.file, candidate.path, patch);
			}
			return this.settings.dryRun
				? t("notice.archivedDry", { name: candidate.file.basename })
				: t("notice.archived", { name: candidate.file.basename });
		}

		if (this.settings.dryRun) {
			return t("notice.gradedDry", {
				name: candidate.file.basename,
				q: quality,
				days,
			});
		}

		await this.store.write(candidate.file, candidate.path, patch);

		this.data.meta.history.push({
			date: today,
			path: candidate.path,
			domain: candidate.domain,
		});
		if (this.data.meta.history.length > HISTORY_CAP) {
			this.data.meta.history = this.data.meta.history.slice(-HISTORY_CAP);
		}
		this.data.meta.dailyCount[today] =
			(this.data.meta.dailyCount[today] ?? 0) + 1;

		await this.saveData(this.data);
		this.dueCache = null;
		this.refreshStatusBar();

		// 普通打分不返回提示文案 —— 面板打完分会自动抽下一篇, 再挂一句
		// "已登记 N 天后再见"只是噪音。上面两个分支是例外: 演练模式不提示的话
		// 用户分不清有没有写进去, 封存则是"这篇从此退出池子", 都值得说一声。
		return "";
	}

	private showStats(): void {
		const candidates = this.scanner.scan();
		const total = candidates.length;
		const seen = candidates.filter((c) => c.state !== null).length;
		const due = this.scheduler.dueList(candidates).length;
		const pct = total === 0 ? "0.0" : ((seen / total) * 100).toFixed(1);
		new Notice(
			t("notice.stats", { total, seen, pct, due }),
		);
	}

	private async resetNote(file: TFile): Promise<void> {
		await this.store.clear(file, file.path);
		this.dueCache = null;
		new Notice(t("notice.cleared"));
		this.refreshStatusBar();
	}

	private async resetCurrentNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice(t("notice.noActiveNote"));
			return;
		}
		await this.resetNote(file);
	}

	async clearAllRecords(): Promise<void> {
		if (this.settings.storage === "json") {
			this.data.notes = {};
			await this.saveData(this.data);
			this.refreshStatusBar();
			return;
		}
		const targets = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.store.read(f, f.path) !== null);
		for (const file of targets) {
			await this.store.clear(file, file.path);
		}
		this.refreshStatusBar();
	}

	/** 左侧栏的骰子按钮, 点一下就抽卡 —— 官方随机笔记也是这个位置 */
	refreshRibbon(): void {
		if (this.settings.showRibbonIcon) {
			if (!this.ribbonEl) {
				this.ribbonEl = this.addRibbonIcon(
					"dice",
					t("ribbon.tooltip"),
					() => void this.pickAndShow(),
				);
			}
		} else if (this.ribbonEl) {
			this.ribbonEl.remove();
			this.ribbonEl = null;
		}
	}

	private setupStatusBar(): void {
		this.refreshStatusBar();
	}

	refreshStatusBar(): void {
		if (!this.settings.showStatusBar) {
			this.statusBarEl?.remove();
			this.statusBarEl = null;
			return;
		}
		if (!this.statusBarEl) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addClass("spaced-dive-status");
			this.statusBarEl.setAttribute("aria-label", t("status.aria"));
			this.registerDomEvent(this.statusBarEl, "click", () =>
				void this.pickAndShow(),
			);
		}
		const due = this.scanner.countDue();
		this.statusBarEl.setText(
			due > 0 ? t("status.due", { n: due }) : t("status.none"),
		);
	}
}
