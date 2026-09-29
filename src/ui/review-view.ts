import { ItemView, WorkspaceLeaf } from "obsidian";
import { REVIEW_VIEW_TYPE } from "../constants";
import { gradeLabel, t } from "../i18n";
import type { Candidate, ReviewState } from "../types";
import type SpacedDivePlugin from "../main";

/** 六个档位同权, 排成 3 列 × 2 行: 5 4 3 / 2 1 0 */
const GRADE_ORDER = [5, 4, 3, 2, 1, 0];

/**
 * follow: 跟着当前激活的笔记走, 切换笔记就换目标 —— 这是"反查"
 * draw:   插件挑的那一篇, **钉住不动**, 直到打分完成或点返回
 *
 * 为什么要分: 面板如果无脑跟随焦点, 抽到的那篇会在你一动鼠标时就被冲掉。
 */
type PanelMode = "follow" | "draw";

/**
 * 侧边栏的复习面板。
 *
 * 两条复习路径共用一个面板:
 *  - 被动: 点骰子, 插件给你一篇
 *  - 主动: 你正在看某篇, 面板反查它的状态, 直接登记
 */
export class ReviewView extends ItemView {
	private mode: PanelMode = "follow";
	private target: Candidate | null = null;
	private result = "";
	private emptyReason = "";
	private emptyHint = "";
	/** 上次评估的是哪篇笔记。undefined = 还没评估过(此时任何一篇都算"换了")。 */
	private lastEvaluatedPath: string | null | undefined = undefined;
	/**
	 * 当前激活的笔记为什么不参与复习(null = 参与)。
	 * **抽到卡之后也要一直挂着** —— 否则用户会以为面板上这篇就是眼前这篇。
	 */
	private outOfScopeReason: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: SpacedDivePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return REVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("view.title");
	}

	getIcon(): string {
		return "dice";
	}

	async onOpen(): Promise<void> {
		// 只有"视图首次打开"这一次给自动抽卡的机会。
		// 之后的切换笔记 / 打分统统不抽 —— 见 alignToActive 的说明。
		await this.alignToActive({ autoDraw: true });
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** 抽卡结果落进来。钉住, 不随焦点漂移。 */
	setDrawn(candidate: Candidate): void {
		this.mode = "draw";
		this.target = candidate;
		this.result = "";
		this.emptyReason = "";
		this.emptyHint = "";
		this.render();
	}

	/**
	 * 自己抽一张并画在自己身上。
	 *
	 * 不用 pickAndShow(): 那条路会去 workspace 里找"自己这个 leaf",
	 * 而视图刚打开时还没登记进去, 找不着, 就会在别处另开一个视图。
	 */
	private async drawHere(): Promise<void> {
		const candidate = await this.plugin.drawOne();
		if (candidate) this.setDrawn(candidate);
	}

	/**
	 * 重新对齐当前激活的笔记。
	 *
	 * 判定顺序(老大定的): 有笔记 → 在复习范围 → 没封存 → 跟随。
	 *
	 * 判为不跟随时(没开笔记 / 不在范围 / 已封存), 面板就没东西可显示了,
	 * 这时顺手抽一张填进来 —— 否则用户只看到一片空态, 还得自己点「抽一篇」。
	 *
	 * **同一篇笔记不重复抽**。焦点在笔记和侧边栏之间来回移动时 active file
	 * 压根没变, 却会触发 active-leaf-change; 不锁住的话, 点一下侧边栏
	 * 刚抽到的卡片就被换掉了。所以记下上次评估的是哪篇, 没换篇就不重抽。
	 */
	private async alignToActive(opts: {
		autoDraw: boolean;
	}): Promise<void> {
		if (!this.plugin.settings.followActiveNote) {
			this.target = null;
			this.outOfScopeReason = null;
			return;
		}

		const file = this.app.workspace.getActiveFile();

		// 放在 draw 早退之前: 抽到的那篇被打开时也要记一笔,
		// 这样再切回原来那篇才算"换了笔记", 会重新抽。
		const path = file?.path ?? null;
		const sameNote = path === this.lastEvaluatedPath;
		this.lastEvaluatedPath = path;

		// 抽卡结果"条件钉住": 只要你还在看抽到的那篇, 就不动;
		// 你一旦跑去别的笔记, 说明这次抽卡放弃了, 让位给跟随。
		// (早先写成无条件 return, 结果抽过一次卡之后面板就再也不跟随了)
		if (this.mode === "draw") {
			// 笔记没换就什么都别动 —— 保住刚抽到的卡片。
			// (不锁这一条的话, 同一次抽卡结果会被后续的同路径事件冲掉)
			if (sameNote) return;

			const stillOnDrawn =
				this.target !== null &&
				file !== null &&
				file.path === this.target.path;
			if (stillOnDrawn) return;
			this.mode = "follow";
		}

		if (!file) {
			this.mode = "follow";
			this.target = null;
			this.emptyReason = t("view.emptyNoNote");
			this.emptyHint = "";
			// 没打开笔记谈不上"不参与复习", 别挂提示
			this.outOfScopeReason = null;
			if (opts.autoDraw && !sameNote) await this.drawHere();
			return;
		}

		const described = this.plugin.describeNote(file);

		if (described.ok && !described.candidate.state?.skip) {
			this.mode = "follow";
			this.target = described.candidate;
			this.emptyReason = "";
			this.emptyHint = "";
			this.result = "";
			this.outOfScopeReason = null;
			return;
		}

		// 不跟随就得说清楚为什么 —— 否则用户打开一篇笔记只看到一片空白,
		// 根本不知道是被规则挡了, 还是插件坏了。
		this.mode = "follow";
		this.target = null;
		if (described.ok) {
			this.emptyReason = t("view.emptyArchived");
			this.emptyHint = t("view.hintArchived");
			this.outOfScopeReason = t("state.archived");
		} else {
			this.emptyReason = t("view.emptyExcluded", {
				reason: described.reason,
			});
			this.emptyHint = t("view.hintExcluded");
			this.outOfScopeReason = described.reason;
		}
		// 面板空着, 给一张; 同一篇不重复给(见 alignToActive 的说明)
		if (opts.autoDraw && !sameNote) await this.drawHere();
	}

	/** 供插件在切换笔记 / 打开文件等事件里调用 */
	async refreshContext(): Promise<void> {
		await this.alignToActive({ autoDraw: true });
		this.render();
	}

	/**
	 * 回到当前笔记。
	 * **只切换侧边栏视图**: 不打开、不跳转、不改动任何文件, 也不抽卡。
	 * (早先它走 alignToActive, 一旦当前笔记不可跟随就会顺手抽一张, 变成乱跳)
	 */
	private backToCurrent(): void {
		const file = this.app.workspace.getActiveFile();
		const described = file ? this.plugin.describeNote(file) : null;
		if (described?.ok) {
			this.mode = "follow";
			this.target = described.candidate;
			this.result = "";
			this.emptyReason = "";
			this.emptyHint = "";
		}
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("spaced-dive-view");

		this.renderHead(root);

		if (this.result) {
			root.createDiv({ cls: "spaced-dive-result", text: this.result });
		}

		const c = this.target;
		if (!c) {
			const box = root.createDiv({ cls: "spaced-dive-empty" });
			box.createEl("p", {
				text: this.emptyReason || t("view.emptyDefault"),
			});
			if (this.emptyHint) {
				box.createEl("p", {
					cls: "spaced-dive-empty-hint",
					text: this.emptyHint,
				});
			}
			this.renderFooter(root);
			return;
		}

		// 悬停标题能看到完整路径。元信息里不再显示目录名, 但"这篇在哪"不该
		// 彻底消失 —— 挂在 title 属性上零视觉成本, 真想找的时候找得到。
		const title = root.createEl("h3", {
			cls: "spaced-dive-title",
			attr: { title: c.file.path },
		});
		title.setText(c.file.basename);
		if (this.mode === "draw") {
			title.addEventListener("click", () =>
				void this.plugin.openInMainArea(c.file),
			);
		}

		// 这里不显示目录名: 抽卡时你关心的是"这是什么", 不是"它存在哪" ——
		// 想定位就点标题把笔记打开, 路径自然出现在标签页上。
		// 注意 c.domain 本身不能删: scheduler 的 domainFactor() 靠它做分区平衡,
		// 那是个后台加权, 和显示与否无关。
		const bits: string[] = [];
		bits.push(
			c.state
				? t("view.metaReviewed", {
						n: c.state.times,
						date: shortDate(c.state.last),
					})
				: t("view.metaNever", { n: c.bornDays }),
		);
		bits.push(t("view.metaSize", { n: c.sizeChars }));

		// 排期状态并进元信息行, 不再单独占一个带底色的块。
		// 理由: 它本来就是同一类信息(这篇笔记的元状态), 独立成块反而会被
		// 当成按钮; 而且"已逾期 N 天"对动作没有任何影响 —— 既然都抽到它了,
		// 逾期 3 天和 30 天要做的事完全一样。
		// 但别整个删掉: follow 模式下"下次什么时候再见到它"是别处看不到的信息。
		const meta = root.createDiv({ cls: "spaced-dive-meta-line" });
		meta.append(bits.join("  ·  "));

		const due = describeDue(c.state, c.overdueDays);
		if (due) {
			meta.append("  ·  ");
			const span = meta.createSpan({ text: due.text });
			if (due.urgent) span.addClass("spaced-dive-meta-urgent");
		}

		if (this.mode === "draw") {
			const actions = root.createDiv({ cls: "spaced-dive-actions" });
			this.button(actions, t("view.open"), "spaced-dive-primary", () =>
				void this.plugin.openInMainArea(c.file),
			);
			this.button(actions, t("view.reroll"), "spaced-dive-ghost", () =>
				void this.plugin.pickAndShow(),
			);
		}

		root.createEl("p", {
			cls: "spaced-dive-hint",
			text: this.hintFor(c),
		});

		const grid = root.createDiv({ cls: "spaced-dive-grid" });
		for (const q of GRADE_ORDER) {
			const btn = grid.createEl("button", {
				cls: `spaced-dive-grade spaced-dive-grade-${q}`,
			});
			btn.createDiv({ cls: "spaced-dive-grade-num", text: String(q) });
			btn.createDiv({
				cls: "spaced-dive-grade-label",
				text: gradeLabel(q),
			});
			btn.addEventListener("click", () => void this.grade(q));
		}

		this.renderFooter(root);
	}

	/** 未到期时把后果说清楚 —— 现在打分等于提前复习, 会重置进度 */
	private hintFor(c: Candidate): string {
		if (c.state && !c.state.skip && (c.overdueDays ?? 0) < 0) {
			return t("view.hintEarly");
		}
		return t("view.hintRecall");
	}

	/**
	 * 两种模式的头部必须长一个样: 左边一个模式标签, 右边一个文字按钮。
	 * 早先抽卡模式多挂了一行 badge, 切换时整个面板高度会跳一下。
	 */
	/**
	 * 抽卡模式下该不该给「返回当前笔记」。三条都得满足, 缺一个就不放按钮:
	 *   1. 有打开的笔记
	 *   2. 它可被跟随(在范围、未封存)
	 *   3. 它**不是**当前抽到的这一篇 —— 你已经在看它了, "返回"毫无意义
	 */
	private canReturnToCurrent(): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!file) return false;
		// 已经打开的就是抽到的这篇, 返回等于原地不动
		if (this.target && file.path === this.target.path) return false;
		const described = this.plugin.describeNote(file);
		return described.ok && !described.candidate.state?.skip;
	}

	private renderHead(root: HTMLElement): void {
		const head = root.createDiv({ cls: "spaced-dive-head" });
		const isDraw = this.mode === "draw";
		// 抽卡时: 有得返就给"返回", 没得返就给"换一篇"
		const canReturn = isDraw && this.canReturnToCurrent();

		head.createSpan({
			cls: `spaced-dive-head-label${isDraw ? " is-draw" : ""}`,
			text: isDraw ? t("view.headDrawn") : t("view.headCurrent"),
		});

		// 当前这篇不参与复习: 常驻提示, 抽到卡之后也挂着。
		// 不挂的话, 用户会以为面板上这篇就是眼前这篇的状态 —— 它其实是替补。
		// 具体原因放 title, 悬停才看, 免得把窄窄一行挤爆。
		if (this.outOfScopeReason !== null) {
			head.createSpan({
				cls: "spaced-dive-head-note",
				text: t("view.headOutOfScope"),
				attr: { title: this.outOfScopeReason },
			});
		}

		// 没得可返回的笔记就干脆不放按钮 —— 放了也不知道该回哪儿。
		// (换一篇的入口在下方操作行里, 不会丢)
		if (isDraw && !canReturn) return;

		// 用 <a> 而不是 <button>: Obsidian 主题给 button 的样式优先级很高,
		// 靠 CSS 覆盖压不住, 干脆换成没有按钮默认样式的元素。
		const action = head.createEl("a", {
			cls: "spaced-dive-head-link",
			text: isDraw ? t("view.linkBack") : t("view.linkPick"),
			href: "#",
		});
		action.addEventListener("click", (event) => {
			event.preventDefault();
			if (isDraw) this.backToCurrent();
			else void this.plugin.pickAndShow();
		});
	}

	private renderFooter(root: HTMLElement): void {
		const due = this.plugin.countDue();
		root.createDiv({
			cls: "spaced-dive-footer",
			text:
				due > 0 ? t("view.footerDue", { n: due }) : t("view.footerNone"),
		});
	}

	private async grade(quality: number): Promise<void> {
		const target = this.target;
		if (!target) return;
		this.result = await this.plugin.grade(target, quality);

		// 打完分直接给下一篇 —— 连续复习是主线用法, 每篇都回手点一次骰子太累。
		// 这里刻意不复用 setDrawn(): 它会清空 result, 而刚那一下对应的
		// "多少天后再见"必须留在面板上。结果文案里带了篇名, 所以它挂在下一张
		// 卡片上方也不会被误读成在说这一张。
		const next = await this.plugin.drawOne();
		if (next) {
			this.mode = "draw";
			this.target = next;
			this.emptyReason = "";
			this.emptyHint = "";
			this.render();
			return;
		}

		// 抽不到下一张(池子空 / 到了每日上限 / 全复习完): 沿用原来的收尾 ——
		// 回到"当前笔记", 让结果和那条 Notice 一起把情况说清楚。
		this.mode = "follow";
		this.target = null;
		await this.alignToActive({ autoDraw: false });
		this.render();
	}

	private button(
		parent: HTMLElement,
		text: string,
		cls: string,
		onClick: () => void,
	): HTMLElement {
		const btn = parent.createEl("button", { cls, text });
		btn.addEventListener("click", onClick);
		return btn;
	}
}

/** YYYY-MM-DD -> MM-DD, 省掉年份。侧边栏一格只放得下这么点。 */
function shortDate(iso: string | null): string {
	if (!iso) return t("view.dateUnknown");
	return iso.length >= 10 ? iso.slice(5) : iso;
}

function describeDue(
	state: ReviewState | null,
	overdueDays: number | null,
): { text: string; urgent: boolean } | null {
	if (!state || state.skip) return null;
	if (overdueDays === null) {
		return { text: t("view.dueNotScheduled"), urgent: false };
	}
	if (overdueDays < 0) {
		return {
			text: t("view.dueFuture", {
				date: shortDate(state.due),
				n: -overdueDays,
			}),
			urgent: false,
		};
	}
	if (overdueDays === 0) {
		return { text: t("view.dueToday"), urgent: true };
	}
	return { text: t("view.dueOverdue", { n: overdueDays }), urgent: true };
}
