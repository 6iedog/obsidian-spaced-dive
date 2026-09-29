import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SpacedDivePlugin from "../main";
import { parsePathList } from "../utils";
import { setLocale, t } from "../i18n";
import { resolveLocale } from "../i18n/locale";
import type { UiLanguage } from "../settings";
import { REPO_NAME, SKILL_DIR_URL, SKILL_INSTALL_CMD } from "../constants";

export class SpacedDiveSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: SpacedDivePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.sectionScope(containerEl);
		this.sectionFilter(containerEl);
		this.sectionSchedule(containerEl);
		this.sectionPick(containerEl);
		this.sectionStorage(containerEl);
		this.sectionUi(containerEl);
		this.sectionAbout(containerEl);
	}

	private heading(el: HTMLElement, name: string, desc: string): void {
		new Setting(el).setName(name).setDesc(desc).setHeading();
	}

	// ---------- 抽卡范围 ----------
	private sectionScope(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.scope.name"),
			t("settings.head.scope.desc"),
		);

		new Setting(el)
			.setName(t("settings.scope.mode.name"))
			.setDesc(t("settings.scope.mode.desc"))
			.addDropdown((d) =>
				d
					.addOption("all", t("settings.scope.modeAll"))
					.addOption("folders", t("settings.scope.modeFolders"))
					.addOption("tag", t("settings.scope.modeTag"))
					.setValue(this.plugin.settings.scopeMode)
					.onChange(async (v) => {
						this.plugin.settings.scopeMode = v as typeof this.plugin.settings.scopeMode;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.scopeMode === "folders") {
			new Setting(el)
				.setName(t("settings.scope.include.name"))
				.setDesc(t("settings.scope.include.desc"))
				.addTextArea((input) =>
					input
						.setPlaceholder(t("settings.scope.include.placeholder"))
						.setValue(this.plugin.settings.includeFolders.join("\n"))
						.onChange(async (v) => {
							this.plugin.settings.includeFolders = parsePathList(v);
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(el)
			.setName(t("settings.scope.exclude.name"))
			.setDesc(t("settings.scope.exclude.desc"))
			.addTextArea((input) =>
				input
					.setPlaceholder(t("settings.scope.exclude.placeholder"))
					.setValue(this.plugin.settings.excludeFolders.join("\n"))
					.onChange(async (v) => {
						this.plugin.settings.excludeFolders = parsePathList(v);
						await this.plugin.saveSettings();
					}),
			);

		if (this.plugin.settings.scopeMode === "tag") {
			new Setting(el)
				.setName(t("settings.scope.reviewTag.name"))
				.setDesc(t("settings.scope.reviewTag.desc"))
				.addText((input) =>
					input
						.setValue(this.plugin.settings.reviewTag)
						.onChange(async (v) => {
							this.plugin.settings.reviewTag = v.trim();
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(el)
			.setName(t("settings.scope.skipTag.name"))
			.setDesc(t("settings.scope.skipTag.desc"))
			.addText((input) =>
				input
					.setValue(this.plugin.settings.skipTag)
					.onChange(async (v) => {
						this.plugin.settings.skipTag = v.trim();
						await this.plugin.saveSettings();
					}),
			);
	}

	// ---------- 内容筛选 ----------
	private sectionFilter(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.filter.name"),
			t("settings.head.filter.desc"),
		);

		new Setting(el)
			.setName(t("settings.filter.namePattern.name"))
			.setDesc(t("settings.filter.namePattern.desc"))
			.addText((input) =>
				input
					.setValue(this.plugin.settings.skipNamePattern)
					.onChange(async (v) => {
						this.plugin.settings.skipNamePattern = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.filter.skipRoot.name"))
			.setDesc(t("settings.filter.skipRoot.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.skipRootFiles)
					.onChange(async (v) => {
						this.plugin.settings.skipRootFiles = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.filter.minChars.name"))
			.setDesc(t("settings.filter.minChars.desc"))
			.addText((input) =>
				input
					.setValue(String(this.plugin.settings.minChars))
					.onChange(async (v) => {
						const n = Number(v);
						if (Number.isFinite(n) && n >= 0) {
							this.plugin.settings.minChars = Math.trunc(n);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(el)
			.setName(t("settings.filter.dropThin.name"))
			.setDesc(t("settings.filter.dropThin.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.dropThinNotes)
					.onChange(async (v) => {
						this.plugin.settings.dropThinNotes = v;
						await this.plugin.saveSettings();
					}),
			);
	}

	// ---------- 调度 ----------
	private sectionSchedule(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.schedule.name"),
			t("settings.head.schedule.desc"),
		);

		new Setting(el)
			.setName(t("settings.schedule.intervals.name"))
			.setDesc(t("settings.schedule.intervals.desc"))
			.addText((input) =>
				input
					.setValue(this.plugin.settings.intervals.join(", "))
					.onChange(async (v) => {
						const nums = v
							.split(/[,，\s]+/)
							.map((x) => Number(x))
							.filter((n) => Number.isFinite(n) && n > 0)
							.map((n) => Math.trunc(n));
						if (nums.length > 0) {
							this.plugin.settings.intervals = nums;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(el)
			.setName(t("settings.schedule.stepsBack.name"))
			.setDesc(t("settings.schedule.stepsBack.desc"))
			.addSlider((s) =>
				s
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.stepsBackOnFail)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.stepsBackOnFail = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.schedule.initialStep.name"))
			.setDesc(t("settings.schedule.initialStep.desc"))
			.addSlider((s) =>
				s
					.setLimits(0, 4, 1)
					.setValue(this.plugin.settings.initialStep)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.initialStep = v;
						await this.plugin.saveSettings();
					}),
			);
	}

	// ---------- 抽取 ----------
	private sectionPick(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.pick.name"),
			t("settings.head.pick.desc"),
		);

		new Setting(el)
			.setName(t("settings.pick.exploreRate.name"))
			.setDesc(t("settings.pick.exploreRate.desc"))
			.addSlider((s) =>
				s
					.setLimits(0, 1, 0.05)
					.setValue(this.plugin.settings.exploreRate)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.exploreRate = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.pick.recentWindow.name"))
			.setDesc(t("settings.pick.recentWindow.desc"))
			.addSlider((s) =>
				s
					.setLimits(0, 20, 1)
					.setValue(this.plugin.settings.recentWindow)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.recentWindow = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.pick.recentDecay.name"))
			.setDesc(t("settings.pick.recentDecay.desc"))
			.addSlider((s) =>
				s
					.setLimits(0.05, 1, 0.05)
					.setValue(this.plugin.settings.recentDecay)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.recentDecay = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.pick.dailyLimit.name"))
			.setDesc(t("settings.pick.dailyLimit.desc"))
			.addText((input) =>
				input
					.setValue(String(this.plugin.settings.dailyLimit))
					.onChange(async (v) => {
						const n = Number(v);
						if (Number.isFinite(n) && n >= 0) {
							this.plugin.settings.dailyLimit = Math.trunc(n);
							await this.plugin.saveSettings();
						}
					}),
			);
	}

	// ---------- 存储 ----------
	private sectionStorage(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.storage.name"),
			t("settings.head.storage.desc"),
		);

		new Setting(el)
			.setName(t("settings.storage.mode.name"))
			.setDesc(t("settings.storage.mode.desc"))
			.addDropdown((d) =>
				d
					.addOption("frontmatter", t("settings.storage.modeFrontmatter"))
					.addOption("json", t("settings.storage.modeJson"))
					.setValue(this.plugin.settings.storage)
					.onChange(async (v) => {
						this.plugin.settings.storage = v as typeof this.plugin.settings.storage;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.storage === "frontmatter") {
			new Setting(el)
				.setName(t("settings.storage.prefix.name"))
				.setDesc(t("settings.storage.prefix.desc"))
				.addText((input) =>
					input
						.setValue(this.plugin.settings.fieldPrefix)
						.onChange(async (v) => {
							this.plugin.settings.fieldPrefix = v.trim();
							await this.plugin.saveSettings();
						}),
				);
		}
	}

	// ---------- 界面 ----------
	private sectionUi(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.ui.name"),
			t("settings.head.ui.desc"),
		);

		new Setting(el)
			.setName(t("settings.ui.statusBar.name"))
			.setDesc(t("settings.ui.statusBar.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (v) => {
						this.plugin.settings.showStatusBar = v;
						await this.plugin.saveSettings();
						this.plugin.refreshStatusBar();
					}),
			);

		new Setting(el)
			.setName(t("settings.ui.follow.name"))
			.setDesc(t("settings.ui.follow.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.followActiveNote)
					.onChange(async (v) => {
						this.plugin.settings.followActiveNote = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.ui.openIn.name"))
			.setDesc(t("settings.ui.openIn.desc"))
			.addDropdown((d) =>
				d
					.addOption("current", t("settings.ui.openInCurrent"))
					.addOption("tab", t("settings.ui.openInTab"))
					.addOption("split", t("settings.ui.openInSplit"))
					.setValue(this.plugin.settings.openIn)
					.onChange(async (v) => {
						this.plugin.settings.openIn = v as typeof this.plugin.settings.openIn;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.ui.ribbon.name"))
			.setDesc(t("settings.ui.ribbon.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.showRibbonIcon)
					.onChange(async (v) => {
						this.plugin.settings.showRibbonIcon = v;
						await this.plugin.saveSettings();
						this.plugin.refreshRibbon();
					}),
			);

		new Setting(el)
			.setName(t("settings.ui.dryRun.name"))
			.setDesc(t("settings.ui.dryRun.desc"))
			.addToggle((input) =>
				input
					.setValue(this.plugin.settings.dryRun)
					.onChange(async (v) => {
						this.plugin.settings.dryRun = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(el)
			.setName(t("settings.ui.language.name"))
			.setDesc(t("settings.ui.language.desc"))
			.addDropdown((d) =>
				d
					.addOption("auto", t("settings.ui.langAuto"))
					.addOption("en", t("settings.ui.langEn"))
					.addOption("zh", t("settings.ui.langZh"))
					.setValue(this.plugin.settings.uiLanguage)
					.onChange(async (v) => {
						this.plugin.settings.uiLanguage = v as UiLanguage;
						await this.plugin.saveSettings();
						// 面板和提示立刻换语言; 命令名是注册时定型的, 得重载才跟得上
						setLocale(resolveLocale(this.plugin.settings.uiLanguage));
						this.display();
					}),
			);

		this.heading(
			el,
			t("settings.head.maintenance.name"),
			t("settings.head.maintenance.desc"),
		);

		new Setting(el)
			.setName(t("settings.maintenance.clear.name"))
			.setDesc(
				this.plugin.settings.storage === "frontmatter"
					? t("settings.maintenance.clear.descFm")
					: t("settings.maintenance.clear.descJson"),
			)
			.addButton((b) =>
				b
					.setButtonText(t("settings.maintenance.clearBtn"))
					.setWarning()
					.onClick(async () => {
						await this.plugin.clearAllRecords();
						new Notice(t("notice.clearedAll"));
					}),
			);
	}

	// ---------- 给 AI 助手用 ----------

	/**
	 * 面板的最后一段: 纯信息, 不写任何设置。
	 *
	 * 放在最后是有意的 —— 上面每一段都在问"配什么", 这一段说的是"还能怎么用"。
	 * 不打算让 AI 碰笔记的人扫一眼就能跳过, 不会挡在配置路径上。
	 */
	private sectionAbout(el: HTMLElement): void {
		this.heading(
			el,
			t("settings.head.about.name"),
			t("settings.head.about.desc"),
		);

		new Setting(el)
			.setName(t("settings.about.what.name"))
			.setDesc(t("settings.about.what.desc"));

		new Setting(el)
			.setName(t("settings.about.install.name"))
			.setDesc(
				createFragment((frag) => {
					frag.append(t("settings.about.install.desc"));
					frag.createEl("code", {
						text: SKILL_INSTALL_CMD,
						cls: "spaced-dive-cmd",
					});
				}),
			)
			.addButton((input) =>
				input
					.setButtonText(t("settings.about.copyBtn"))
					.onClick(() => void this.copyInstallCmd()),
			);

		new Setting(el)
			.setName(t("settings.about.usage.name"))
			.setDesc(t("settings.about.usage.desc"));

		new Setting(el)
			.setName(t("settings.about.repo.name"))
			.setDesc(
				createFragment((frag) => {
					frag.append(t("settings.about.repo.desc"));
					frag.createEl("a", {
						text: REPO_NAME,
						href: SKILL_DIR_URL,
					});
				}),
			);
	}

	/** 剪贴板被拒(没焦点 / 没权限)时静默失败 —— 命令就印在屏幕上, 手抄也行 */
	private async copyInstallCmd(): Promise<void> {
		try {
			await navigator.clipboard.writeText(SKILL_INSTALL_CMD);
			new Notice(t("notice.copied"));
		} catch {
			/* 忽略 */
		}
	}
}
