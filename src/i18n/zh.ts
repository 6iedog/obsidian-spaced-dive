import type { Dict } from "./en";

/** 声明成 Dict: 英文那边加一个 key, 这里不补就编译不过。 */
export const zh: Dict = {
	command: {
		pick: "抽取一篇笔记复习",
		openPanel: "打开复习面板",
		stats: "显示复习统计",
		resetCurrent: "清除当前笔记的复习记录",
	},

	menu: {
		clearRecord: "清除这篇的复习记录",
	},

	ribbon: {
		tooltip: "抽一篇笔记复习",
	},

	status: {
		aria: "Spaced Dive：点一下抽一篇",
		due: "待复习 {n}",
		none: "无待复习",
	},

	notice: {
		dailyLimit: "今日抽卡已达上限 {n} 篇",
		emptyPool: "候选池是空的，去设置里放开抽卡范围",
		nothingToPick: "没有可抽的笔记",
		archived: "已封存《{name}》，不再抽到",
		archivedDry: "演练 · 会封存《{name}》，未写入",
		// 带篇名是必须的: 这条会落在**下一篇**卡片的上方, 不写名字会被读成
		// 在说新抽到的那篇。(普通打分不提示 —— 见 main.ts 的 grade())
		gradedDry: "演练 · 《{name}》会记 {q}，{days} 天后到期（未写入）",
		stats: "共 {total} 篇 · 复习过 {seen} 篇 ({pct}%) · 待复习 {due} 篇",
		cleared: "已清除这篇的复习记录",
		clearedAll: "复习记录已清空",
		noActiveNote: "当前没有打开的笔记",
		copied: "安装命令已复制到剪贴板",
	},

	view: {
		title: "今日深潜",
		headCurrent: "当前笔记",
		headDrawn: "抽到的篇目",
		headOutOfScope: "当前笔记不参与复习",
		linkPick: "抽一篇",
		linkBack: "返回当前笔记",
		open: "打开这篇笔记",
		reroll: "换一篇",
		emptyDefault: "点右上角的「抽一篇」挑一篇来看。",
		emptyNoNote: "没有打开的笔记",
		emptyArchived: "这篇已封存",
		hintArchived: "在笔记上右键可以清除它的复习记录",
		emptyExcluded: "这篇不参与复习 —— {reason}",
		hintExcluded: "想让它参与，去设置里调整抽卡范围",
		metaReviewed: "复习 {n} 次，上次 {date}",
		metaNever: "未复习，尘封 {n} 天",
		metaSize: "约 {n} 字",
		dueNotScheduled: "还没排期",
		dueFuture: "下次到期 {date}（还有 {n} 天）",
		dueToday: "今天到期",
		dueOverdue: "已逾期 {n} 天",
		hintEarly: "还没到期，现在打分会重置进度。",
		hintRecall: "回想得怎么样？",
		footerDue: "今日待复习 {n} 篇",
		footerNone: "暂时没有到期的笔记",
		dateUnknown: "未知",
	},

	grade: {
		5: "滚瓜烂熟",
		4: "记得清楚",
		3: "基本记得",
		2: "模糊，只对一半",
		1: "完全想不起来",
		0: "封存，不再抽",
	},

	exclude: {
		rootFile: "库根目录的文件默认不参与",
		inFolder: "{name} 在排除目录里",
		notInScope: "不在指定的抽卡目录内",
		namePattern: "文件名命中排除规则（通常是个目录页）",
		isIndex: "这是个索引导读页，不是知识页",
		skipTag: "带了封存标签",
		noReviewTag: "没有 #{tag} 标签",
	},

	state: {
		never: "从未复习",
		archived: "已封存",
		reviewed: "已复习 {n} 次 · 上次 {date}",
	},

	settings: {
		head: {
			scope: {
				name: "抽卡范围",
				desc: "决定哪些笔记有资格被抽到。",
			},
			filter: {
				name: "内容筛选",
				desc: "把导航页、残页这类不该复习的东西剔掉。",
			},
			schedule: {
				name: "调度阶梯",
				desc: "遗忘曲线的骨架。",
			},
			pick: {
				name: "抽取策略",
				desc: "用什么眼光在候选池里挑。",
			},
			storage: {
				name: "存储位置",
				desc: "调度数据放笔记头部，还是集中放在插件数据文件里。",
			},
			ui: {
				name: "界面",
				desc: "状态栏、语言，以及抽卡之后的动作。",
			},
			maintenance: {
				name: "数据维护",
				desc: "清空之前先想清楚，这一步没有撤销。",
			},
			about: {
				name: "给 AI 助手用",
				desc: "可选。让 Claude Code、WorkBuddy 之类的助手按同一套规则、同一份进度抽卡复习。",
			},
		},

		scope: {
			mode: {
				name: "范围模式",
				desc: "全库、指定目录、或凭标签入选。",
			},
			modeAll: "全库",
			modeFolders: "仅指定目录",
			modeTag: "仅带标签的笔记",
			include: {
				name: "包含目录",
				desc: "每行一个目录路径，相对库根。留空则等于全库。",
				placeholder: "计算机基础\n哲学",
			},
			exclude: {
				name: "排除目录",
				desc: "任何模式下都生效。日记、收集箱这类地带建议排除。",
				placeholder: "日记\n收集箱",
			},
			reviewTag: {
				name: "复习标签",
				desc: "带这个标签的笔记才会入选（不含 # 号）。",
			},
			skipTag: {
				name: "封存标签",
				desc: "带这个标签的笔记永不入选。",
			},
		},

		filter: {
			namePattern: {
				name: "文件名排除规则",
				desc: "命中这个正则的文件名会被跳过，用来挡掉目录页和索引页。",
			},
			skipRoot: {
				name: "跳过根目录散文件",
				desc: "库根上的孤立笔记多半是导航页。开启后它们不参与抽卡，默认关闭（也就是参与）。",
			},
			minChars: {
				name: "残页字数门槛",
				desc: "估算正文少于这个字数的笔记视为残页，会被降权。",
			},
			dropThin: {
				name: "残页直接排除",
				desc: "开启后残页不再降权，而是彻底不进候选池。",
			},
		},

		schedule: {
			intervals: {
				name: "间隔阶梯（天）",
				desc: "用逗号分隔，评分越好越往上走一格。",
			},
			stepsBack: {
				name: "忘了退几格",
				desc: "评分为 1 或 2 时，阶梯往后退的格数。",
			},
			initialStep: {
				name: "起始阶梯",
				desc: "第一次复习时从这个位置起步，评得好再往上走一格。",
			},
		},

		pick: {
			exploreRate: {
				name: "探索率",
				desc: "有多大概率跳过到期清单，去没复习过的荒地探险。",
			},
			recentWindow: {
				name: "分区回看次数",
				desc: "回看最近几次复习落在哪些分区，用来做分区平衡。",
			},
			recentDecay: {
				name: "分区衰减系数",
				desc: "越接近 0，近期抽过的分区被压得越狠，分布越均匀。",
			},
			dailyLimit: {
				name: "每日上限",
				desc: "一天最多抽几篇，0 表示不限。",
			},
		},

		storage: {
			mode: {
				name: "存储方式",
				desc: "笔记头部：数据跟着笔记走，Dataview 和 Bases 可以直接查，多端同步更稳。插件数据：不改动笔记，但笔记改名会失联。",
			},
			modeFrontmatter: "笔记头部（推荐）",
			modeJson: "插件数据文件",
			prefix: {
				name: "字段前缀",
				desc: "写在笔记头部的字段名前缀。别乱改，改了旧字段就找不回来了。",
			},
		},

		ui: {
			statusBar: {
				name: "显示状态栏",
				desc: "底部显示今日待复习数量。",
			},
			follow: {
				name: "跟随当前笔记",
				desc: "面板自动显示你正在看的这篇的复习状态，可以直接打分。关掉则只有点骰子抽卡时才动。",
			},
			openIn: {
				name: "笔记打开位置",
				desc: "当前标签：复用正在看的标签页，会自动跳过固定住的标签。新标签 / 拆分：每次新开，绝不顶掉任何东西。",
			},
			openInCurrent: "当前标签",
			openInTab: "新标签",
			openInSplit: "拆分视图",
			ribbon: {
				name: "显示侧栏图标",
				desc: "左侧栏加一个骰子按钮，点一下就抽卡。官方随机笔记也在同一位置。",
			},
			dryRun: {
				name: "演练模式",
				desc: "走完整套流程，但不往笔记里写任何字段。第一次用建议先开着跑几轮，看清它抽的是哪些笔记再说。",
			},
			language: {
				name: "界面语言",
				desc: "默认跟随 Obsidian 的语言设置。命令面板里的名称要重载插件后才更新。",
			},
			langAuto: "跟随 Obsidian",
			langEn: "English",
			langZh: "简体中文",
		},

		maintenance: {
			clear: {
				name: "清空全部复习记录",
				descFm: "逐篇抹掉笔记头部的调度字段，笔记正文不受影响。",
				descJson: "清掉插件数据文件里的全部记录。",
			},
			clearBtn: "清空",
		},

		about: {
			what: {
				name: "这是什么",
				desc: "随插件一起分发的技能包。它跑一个单文件命令行程序，读写的是和插件完全相同的头部字段，所以助手的进度和这个面板的进度是同一份。不需要开着 Obsidian。",
			},
			install: {
				name: "怎么装",
				desc: "从仓库下载 spaced-dive 文件夹，放进助手的 skills 目录 —— WorkBuddy 读 ~/.workbuddy/skills/，Claude Code 读 ~/.claude/skills/。或者一条命令装好：",
			},
			usage: {
				name: "怎么用",
				desc: "装完直接跟助手说「抽一张」「深潜」即可。它负责挑，你负责聊；聊完登记的评分，在这个面板里也能看到。",
			},
			repo: {
				name: "更多",
				desc: "完整说明和技能包都在这里：",
			},
			copyBtn: "复制",
		},
	},
};
