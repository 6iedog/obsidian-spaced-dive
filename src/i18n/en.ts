/**
 * 英文是唯一真源。
 *
 * 别的语言都声明成 `Dict`, 少一个 key 编译器立刻报错 ——
 * 靠人肉比对两个上百条的文件迟早会漏, 交给 tsc 更靠谱。
 */
export const en = {
	command: {
		pick: "Draw a note to review",
		openPanel: "Open review panel",
		stats: "Show review stats",
		resetCurrent: "Clear review record of current note",
	},

	menu: {
		clearRecord: "Clear this note's review record",
	},

	ribbon: {
		tooltip: "Draw a note to review",
	},

	status: {
		aria: "Spaced Dive: click to draw a note",
		due: "{n} due",
		none: "Nothing due",
	},

	notice: {
		dailyLimit: "Daily limit reached ({n} notes)",
		emptyPool: "Candidate pool is empty — widen the scope in settings",
		nothingToPick: "Nothing to draw",
		archived: 'Archived "{name}" — it will not come up again',
		archivedDry: 'Dry run — would archive "{name}", nothing written',
		// 带上笔记名是必须的: 打完分会自动抽下一张, 这条结果就显示在
		// **下一篇**的卡片上方 —— 不写名字的话会被读成在说新抽到的那篇。
		gradedDry: 'Dry run — would record "{name}" at {q}, due in {days} days',
		graded: 'Recorded "{name}" — see you in {days} days',
		stats: "{total} notes · {seen} reviewed ({pct}%) · {due} due",
		cleared: "Cleared this note's review record",
		clearedAll: "All review records cleared",
		noActiveNote: "No note is open",
		copied: "Install command copied to clipboard",
	},

	view: {
		title: "Daily dive",
		headCurrent: "Current note",
		headDrawn: "Drawn note",
		headOutOfScope: "Current note out of scope",
		linkPick: "Draw one",
		linkBack: "Back to current note",
		open: "Open this note",
		reroll: "Draw another",
		emptyDefault: 'Click "Draw one" at the top right to pick a note.',
		emptyNoNote: "No note is open",
		emptyArchived: "This note is archived",
		hintArchived: "Right-click the note to clear its review record",
		emptyExcluded: "This note is out of scope — {reason}",
		hintExcluded: "To include it, adjust the scope in settings",
		metaReviewed: "Reviewed {n}× · last {date}",
		metaNever: "Never reviewed · {n} days untouched",
		metaSize: "~{n} chars",
		dueNotScheduled: "Not scheduled",
		dueFuture: "Due {date} (in {n} days)",
		dueToday: "Due today",
		dueOverdue: "{n} days overdue",
		hintEarly: "Not due yet — grading now resets the schedule.",
		hintRecall: "How well did you recall it?",
		footerDue: "{n} notes due today",
		footerNone: "Nothing due right now",
		dateUnknown: "unknown",
	},

	/**
	 * 评分档位。
	 * 数字键推导不出点号路径(keyof 里 number & string = never),
	 * 所以单独放一份, 走 gradeLabel() 取, 不走 t()。
	 */
	grade: {
		5: "Instant recall",
		4: "Clear recall",
		3: "Mostly recall",
		2: "Vague",
		1: "Blank",
		0: "Archive",
	} as Record<number, string>,

	/** 面板里"这篇为什么不参与"的原因, 由扫描器拼出来 */
	exclude: {
		rootFile: "files in the vault root are excluded by default",
		inFolder: "{name} is in an excluded folder",
		notInScope: "not inside the specified folders",
		namePattern: "filename matches the exclusion rule (usually an index page)",
		isIndex: "this is an index page, not a knowledge note",
		skipTag: "tagged as archived",
		noReviewTag: "missing the #{tag} tag",
	},

	/** 单篇状态的短描述 */
	state: {
		never: "Never reviewed",
		archived: "Archived",
		reviewed: "Reviewed {n}× · last {date}",
	},

	settings: {
		head: {
			scope: {
				name: "Scope",
				desc: "Decides which notes are eligible.",
			},
			filter: {
				name: "Filters",
				desc: "Weed out index pages, stubs and anything else not worth reviewing.",
			},
			schedule: {
				name: "Schedule",
				desc: "The backbone of the forgetting curve.",
			},
			pick: {
				name: "Picking",
				desc: "How to choose from the candidate pool.",
			},
			storage: {
				name: "Storage",
				desc: "Whether scheduling data lives in note frontmatter or in the plugin data file.",
			},
			ui: {
				name: "Interface",
				desc: "Status bar, language, and what happens after a draw.",
			},
			maintenance: {
				name: "Data maintenance",
				desc: "Think twice before clearing — there is no undo.",
			},
			about: {
				name: "Use it from an AI assistant",
				desc: "Optional. Lets Claude Code, WorkBuddy or similar draw from the same pool — same picking rules, same progress.",
			},
		},

		scope: {
			mode: {
				name: "Scope mode",
				desc: "Whole vault, specific folders, or by tag.",
			},
			modeAll: "Whole vault",
			modeFolders: "Specific folders only",
			modeTag: "Tagged notes only",
			include: {
				name: "Include folders",
				desc: "One folder path per line, relative to the vault root. Empty means the whole vault.",
				/** 示例, 不是界面文案 —— 照用户的目录名写, 别按 sentence case 改 */
				placeholder: "CS Foundation\nPhilosophy",
			},
			exclude: {
				name: "Exclude folders",
				desc: "Applies in every mode. Journals and inboxes are worth excluding.",
				placeholder: "Journal\nInbox",
			},
			reviewTag: {
				name: "Review tag",
				desc: "Only notes with this tag are eligible (without the #).",
			},
			skipTag: {
				name: "Archive tag",
				desc: "Notes with this tag are never picked.",
			},
		},

		filter: {
			namePattern: {
				name: "Filename exclusion rule",
				desc: "Filenames matching this regex are skipped — use it to block index and directory pages.",
			},
			skipRoot: {
				name: "Skip loose files in vault root",
				desc: "Loose notes at the vault root are usually navigation pages. Enable to exclude them; off by default (they participate).",
			},
			minChars: {
				name: "Stub length threshold",
				desc: "Notes estimated below this length count as stubs and get down-weighted.",
			},
			dropThin: {
				name: "Drop stubs entirely",
				desc: "When enabled, stubs are excluded from the pool instead of down-weighted.",
			},
		},

		schedule: {
			intervals: {
				name: "Interval ladder (days)",
				desc: "Comma separated. A better grade moves one step up.",
			},
			stepsBack: {
				name: "Steps back on fail",
				desc: "How many steps to fall back when rated 1 or 2.",
			},
			initialStep: {
				name: "Starting step",
				desc: "The step a first review starts from; a good grade moves it up one.",
			},
		},

		pick: {
			exploreRate: {
				name: "Explore rate",
				desc: "Chance of skipping the due list and exploring never-reviewed ground.",
			},
			recentWindow: {
				name: "Folder balance window",
				desc: "How many recent reviews to look back at for folder balancing.",
			},
			recentDecay: {
				name: "Folder decay factor",
				desc: "Closer to 0 pushes recently drawn folders down harder, spreading picks more evenly.",
			},
			dailyLimit: {
				name: "Daily limit",
				desc: "Max notes per day. 0 means no limit.",
			},
		},

		storage: {
			mode: {
				name: "Storage mode",
				desc: "Frontmatter: data travels with the note, queryable by Dataview and Bases, syncs reliably. Plugin data: notes stay untouched, but renaming a note orphans its record.",
			},
			modeFrontmatter: "Note frontmatter (recommended)",
			modeJson: "Plugin data file",
			prefix: {
				name: "Field prefix",
				desc: "Prefix for frontmatter field names. Don't change it casually — old fields become unreadable.",
			},
		},

		ui: {
			statusBar: {
				name: "Show status bar",
				desc: "Show today's due count at the bottom.",
			},
			follow: {
				name: "Follow the active note",
				desc: "The panel shows the note you're reading and lets you grade it directly. Off means it only reacts to the dice button.",
			},
			openIn: {
				name: "Where notes open",
				desc: "Current tab: reuses the tab you're on, skipping pinned tabs. New tab / Split: always opens fresh, never replaces anything.",
			},
			openInCurrent: "Current tab",
			openInTab: "New tab",
			openInSplit: "Split view",
			ribbon: {
				name: "Show ribbon icon",
				desc: "Adds a dice button to the left ribbon. Obsidian's own random note lives in the same spot.",
			},
			dryRun: {
				name: "Dry run",
				desc: "Runs the whole flow without writing any fields. Worth leaving on for a few rounds at first, to see what it actually picks.",
			},
			language: {
				name: "Interface language",
				desc: "Follows Obsidian's language by default. Command names in the palette update after reloading the plugin.",
			},
			langAuto: "Follow Obsidian",
			langEn: "English",
			langZh: "简体中文",
		},

		maintenance: {
			clear: {
				name: "Clear all review records",
				descFm: "Wipes scheduling fields from each note's frontmatter. Note content is untouched.",
				descJson: "Clears every record in the plugin data file.",
			},
			clearBtn: "Clear",
		},

		about: {
			what: {
				name: "What this is",
				desc: "A skill package shipped alongside this plugin. It runs a single-file command-line program that reads and writes the same frontmatter fields the plugin does, so the assistant and this panel share one progress record. Obsidian does not need to be running.",
			},
			install: {
				name: "Install",
				desc: "Download the spaced-dive folder from the repo and drop it into your assistant's skills directory — WorkBuddy reads ~/.workbuddy/skills/, Claude Code reads ~/.claude/skills/. Or install it in one command:",
			},
			usage: {
				name: "How to use it",
				desc: "Then just ask the assistant to draw one — \"draw a note\", \"deep dive\". It picks the note, you talk it through, and the grade that gets recorded shows up in this panel too.",
			},
			repo: {
				name: "More",
				desc: "Full instructions and the skill package: ",
			},
			copyBtn: "Copy",
		},
	},
};

export type Dict = typeof en;
