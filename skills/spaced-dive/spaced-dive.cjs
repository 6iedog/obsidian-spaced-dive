#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var fs = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path = __toESM(require("node:path"));

// src/constants.ts
var DEFAULT_INTERVALS = [1, 3, 7, 16, 35, 90, 180, 365, 730];
var REPO_SLUG = "6iedog/obsidian-spaced-dive";
var REPO_URL = `https://github.com/${REPO_SLUG}`;
var SKILL_INSTALL_CMD = `npx skills add ${REPO_SLUG}`;
var SKILL_DIR_URL = `${REPO_URL}/tree/main/skills/spaced-dive`;

// src/settings.ts
var DEFAULT_SETTINGS = {
  scopeMode: "all",
  includeFolders: [],
  excludeFolders: ["Journal", "Inbox", "Meta"],
  reviewTag: "review",
  skipTag: "sr-skip",
  skipNamePattern: "(directory|\u76EE\u5F55|TOC|toc|index|Index|README|readme|\u5BFC\u822A|\u7D22\u5F15)",
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
  uiLanguage: "auto"
};

// src/utils.ts
var MS_PER_DAY = 864e5;
function todayISO(now = /* @__PURE__ */ new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function toDayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t2 = Date.UTC(y, mo - 1, d);
  const back = new Date(t2);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return Math.floor(t2 / MS_PER_DAY);
}
function addDays(iso, n) {
  const d = toDayNumber(iso);
  if (d === null) return null;
  const back = new Date((d + n) * MS_PER_DAY);
  const y = back.getUTCFullYear();
  const m = String(back.getUTCMonth() + 1).padStart(2, "0");
  const day = String(back.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateFromMillis(ms) {
  const d = new Date(ms);
  return todayISO(d);
}
function estimateChars(bytes) {
  return Math.round(bytes / 2.4);
}

// src/scheduler.ts
var Scheduler = class {
  constructor(getSettings) {
    this.getSettings = getSettings;
  }
  /** 综合权重: 逾期度 x 复习次数 x 分区平衡 x 内容厚度 */
  weight(candidate, recentDomains) {
    const s = this.getSettings();
    if (candidate.state) {
      if (candidate.state.skip) return 0;
      const overdue = candidate.overdueDays ?? -1;
      if (overdue < 0) return 0;
      let w2 = 1 + Math.log1p(Math.max(0, overdue));
      w2 *= 1 + 0.35 * Math.min(candidate.state.times, 5);
      if (candidate.sizeChars < s.minChars) w2 *= 0.3;
      w2 *= this.domainFactor(candidate.domain, recentDomains);
      return Math.max(0, w2);
    }
    let w = 0.8 + 0.55 * Math.log1p(candidate.bornDays);
    if (candidate.sizeChars < s.minChars) w *= 0.15;
    w *= this.domainFactor(candidate.domain, recentDomains);
    return Math.max(0, w);
  }
  /**
   * 分区平衡系数。
   * 近期抽过的分区压权重, 越近期压得越狠(0 < decay < 1)。
   */
  domainFactor(domain, recentDomains) {
    const s = this.getSettings();
    if (!domain || recentDomains.length === 0) return 1;
    const lastIdx = recentDomains.lastIndexOf(domain);
    if (lastIdx < 0) return 1;
    return Math.pow(s.recentDecay, lastIdx + 1);
  }
  /** 加权随机抽一张。泛型: 传 Candidate[] 就返回 Candidate, 传纯数据就返回纯数据。 */
  pick(candidates, recentDomains) {
    const s = this.getSettings();
    if (candidates.length === 0) return null;
    const fresh = candidates.filter((c) => c.state === null);
    const due = candidates.filter(
      (c) => c.state !== null && !c.state.skip && (c.overdueDays ?? -1) >= 0
    );
    let pool = due;
    let mode = "review";
    if (Math.random() < s.exploreRate || due.length === 0) {
      pool = fresh;
      mode = "explore";
    }
    if (pool.length === 0) {
      pool = fresh.length > 0 ? fresh : candidates;
      mode = pool === fresh ? "explore" : "review";
    }
    if (pool.length === 0) return null;
    const weights = pool.map((c) => this.weight(c, recentDomains));
    const total = weights.reduce((a, b) => a + b, 0);
    let chosen;
    if (total <= 0) {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    } else {
      chosen = weightedChoice(pool, weights, total);
    }
    return { candidate: chosen, mode, poolSize: pool.length };
  }
  /** 到期/逾期清单, 按逾期天数降序 */
  dueList(candidates) {
    return candidates.filter(
      (c) => c.state !== null && !c.state.skip && (c.overdueDays ?? -1) >= 0
    ).sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
  }
  /**
   * 由评分推算新状态。
   * @param bornISO 笔记的冻结诞生日, 首次复习时落进 sr-added 后就不再变
   */
  nextState(prev, quality, today, bornISO) {
    const s = this.getSettings();
    if (quality === 0) {
      return {
        skip: true,
        added: prev?.added ?? bornISO,
        last: today,
        quality: 0
      };
    }
    const prevStep = prev?.step ?? s.initialStep;
    let step = prevStep;
    if (quality >= 4) {
      step = Math.min(prevStep + 1, s.intervals.length - 1);
    } else if (quality === 3) {
      step = prevStep;
    } else {
      step = Math.max(0, prevStep - s.stepsBackOnFail);
    }
    const interval = s.intervals[Math.min(step, s.intervals.length - 1)] ?? 1;
    return {
      skip: false,
      added: prev?.added ?? bornISO,
      step,
      times: (prev?.times ?? 0) + 1,
      last: today,
      quality,
      due: addDays(today, interval) ?? today
    };
  }
};
function weightedChoice(items, weights, total) {
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// src/i18n/en.ts
var en = {
  command: {
    pick: "Draw a note to review",
    openPanel: "Open review panel",
    stats: "Show review stats",
    resetCurrent: "Clear review record of current note"
  },
  menu: {
    clearRecord: "Clear this note's review record"
  },
  ribbon: {
    tooltip: "Draw a note to review"
  },
  status: {
    aria: "Spaced Dive: click to draw a note",
    due: "{n} due",
    none: "Nothing due"
  },
  notice: {
    dailyLimit: "Daily limit reached ({n} notes)",
    emptyPool: "Candidate pool is empty \u2014 widen the scope in settings",
    nothingToPick: "Nothing to draw",
    archived: 'Archived "{name}" \u2014 it will not come up again',
    archivedDry: 'Dry run \u2014 would archive "{name}", nothing written',
    // 带笔记名是必须的: 这条会显示在**下一篇**卡片的上方, 不写名字
    // 会被读成在说新抽到的那篇。(普通打分不提示 —— 见 main.ts 的 grade())
    gradedDry: 'Dry run \u2014 would record "{name}" at {q}, due in {days} days',
    stats: "{total} notes \xB7 {seen} reviewed ({pct}%) \xB7 {due} due",
    cleared: "Cleared this note's review record",
    clearedAll: "All review records cleared",
    noActiveNote: "No note is open",
    copied: "Install command copied to clipboard"
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
    emptyExcluded: "This note is out of scope \u2014 {reason}",
    hintExcluded: "To include it, adjust the scope in settings",
    metaReviewed: "Reviewed {n}\xD7 \xB7 last {date}",
    metaNever: "Never reviewed \xB7 {n} days untouched",
    metaSize: "~{n} chars",
    dueNotScheduled: "Not scheduled",
    dueFuture: "Due {date} (in {n} days)",
    dueToday: "Due today",
    dueOverdue: "{n} days overdue",
    hintEarly: "Not due yet \u2014 grading now resets the schedule.",
    hintRecall: "How well did you recall it?",
    footerDue: "{n} notes due today",
    footerNone: "Nothing due right now",
    dateUnknown: "unknown"
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
    0: "Archive"
  },
  /** 面板里"这篇为什么不参与"的原因, 由扫描器拼出来 */
  exclude: {
    rootFile: "files in the vault root are excluded by default",
    inFolder: "{name} is in an excluded folder",
    notInScope: "not inside the specified folders",
    namePattern: "filename matches the exclusion rule (usually an index page)",
    isIndex: "this is an index page, not a knowledge note",
    skipTag: "tagged as archived",
    noReviewTag: "missing the #{tag} tag"
  },
  /** 单篇状态的短描述 */
  state: {
    never: "Never reviewed",
    archived: "Archived",
    reviewed: "Reviewed {n}\xD7 \xB7 last {date}"
  },
  settings: {
    head: {
      scope: {
        name: "Scope",
        desc: "Decides which notes are eligible."
      },
      filter: {
        name: "Filters",
        desc: "Weed out index pages, stubs and anything else not worth reviewing."
      },
      schedule: {
        name: "Schedule",
        desc: "The backbone of the forgetting curve."
      },
      pick: {
        name: "Picking",
        desc: "How to choose from the candidate pool."
      },
      storage: {
        name: "Storage",
        desc: "Whether scheduling data lives in note frontmatter or in the plugin data file."
      },
      ui: {
        name: "Interface",
        desc: "Status bar, language, and what happens after a draw."
      },
      maintenance: {
        name: "Data maintenance",
        desc: "Think twice before clearing \u2014 there is no undo."
      },
      about: {
        name: "Use it from an AI assistant",
        desc: "Optional. Lets Claude Code, WorkBuddy or similar draw from the same pool \u2014 same picking rules, same progress."
      }
    },
    scope: {
      mode: {
        name: "Scope mode",
        desc: "Whole vault, specific folders, or by tag."
      },
      modeAll: "Whole vault",
      modeFolders: "Specific folders only",
      modeTag: "Tagged notes only",
      include: {
        name: "Include folders",
        desc: "One folder path per line, relative to the vault root. Empty means the whole vault.",
        /** 示例, 不是界面文案 —— 照用户的目录名写, 别按 sentence case 改 */
        placeholder: "CS Foundation\nPhilosophy"
      },
      exclude: {
        name: "Exclude folders",
        desc: "Applies in every mode. Journals and inboxes are worth excluding.",
        placeholder: "Journal\nInbox"
      },
      reviewTag: {
        name: "Review tag",
        desc: "Only notes with this tag are eligible (without the #)."
      },
      skipTag: {
        name: "Archive tag",
        desc: "Notes with this tag are never picked."
      }
    },
    filter: {
      namePattern: {
        name: "Filename exclusion rule",
        desc: "Filenames matching this regex are skipped \u2014 use it to block index and directory pages."
      },
      skipRoot: {
        name: "Skip loose files in vault root",
        desc: "Loose notes at the vault root are usually navigation pages. Enable to exclude them; off by default (they participate)."
      },
      minChars: {
        name: "Stub length threshold",
        desc: "Notes estimated below this length count as stubs and get down-weighted."
      },
      dropThin: {
        name: "Drop stubs entirely",
        desc: "When enabled, stubs are excluded from the pool instead of down-weighted."
      }
    },
    schedule: {
      intervals: {
        name: "Interval ladder (days)",
        desc: "Comma separated. A better grade moves one step up."
      },
      stepsBack: {
        name: "Steps back on fail",
        desc: "How many steps to fall back when rated 1 or 2."
      },
      initialStep: {
        name: "Starting step",
        desc: "The step a first review starts from; a good grade moves it up one."
      }
    },
    pick: {
      exploreRate: {
        name: "Explore rate",
        desc: "Chance of skipping the due list and exploring never-reviewed ground."
      },
      recentWindow: {
        name: "Folder balance window",
        desc: "How many recent reviews to look back at for folder balancing."
      },
      recentDecay: {
        name: "Folder decay factor",
        desc: "Closer to 0 pushes recently drawn folders down harder, spreading picks more evenly."
      },
      dailyLimit: {
        name: "Daily limit",
        desc: "Max notes per day. 0 means no limit."
      }
    },
    storage: {
      mode: {
        name: "Storage mode",
        desc: "Frontmatter: data travels with the note, queryable by Dataview and Bases, syncs reliably. Plugin data: notes stay untouched, but renaming a note orphans its record."
      },
      modeFrontmatter: "Note frontmatter (recommended)",
      modeJson: "Plugin data file",
      prefix: {
        name: "Field prefix",
        desc: "Prefix for frontmatter field names. Don't change it casually \u2014 old fields become unreadable."
      }
    },
    ui: {
      statusBar: {
        name: "Show status bar",
        desc: "Show today's due count at the bottom."
      },
      follow: {
        name: "Follow the active note",
        desc: "The panel shows the note you're reading and lets you grade it directly. Off means it only reacts to the dice button."
      },
      openIn: {
        name: "Where notes open",
        desc: "Current tab: reuses the tab you're on, skipping pinned tabs. New tab / Split: always opens fresh, never replaces anything."
      },
      openInCurrent: "Current tab",
      openInTab: "New tab",
      openInSplit: "Split view",
      ribbon: {
        name: "Show ribbon icon",
        desc: "Adds a dice button to the left ribbon. Obsidian's own random note lives in the same spot."
      },
      dryRun: {
        name: "Dry run",
        desc: "Runs the whole flow without writing any fields. Worth leaving on for a few rounds at first, to see what it actually picks."
      },
      language: {
        name: "Interface language",
        desc: "Follows Obsidian's language by default. Command names in the palette update after reloading the plugin."
      },
      langAuto: "Follow Obsidian",
      langEn: "English",
      langZh: "\u7B80\u4F53\u4E2D\u6587"
    },
    maintenance: {
      clear: {
        name: "Clear all review records",
        descFm: "Wipes scheduling fields from each note's frontmatter. Note content is untouched.",
        descJson: "Clears every record in the plugin data file."
      },
      clearBtn: "Clear"
    },
    about: {
      what: {
        name: "What this is",
        desc: "A skill package shipped alongside this plugin. It runs a single-file command-line program that reads and writes the same frontmatter fields the plugin does, so the assistant and this panel share one progress record. Obsidian does not need to be running."
      },
      install: {
        name: "Install",
        desc: "Download the spaced-dive folder from the repo and drop it into your assistant's skills directory \u2014 WorkBuddy reads ~/.workbuddy/skills/, Claude Code reads ~/.claude/skills/. Or install it in one command:"
      },
      usage: {
        name: "How to use it",
        desc: 'Then just ask the assistant to draw one \u2014 "draw a note", "deep dive". It picks the note, you talk it through, and the grade that gets recorded shows up in this panel too.'
      },
      repo: {
        name: "More",
        desc: "Full instructions and the skill package: "
      },
      copyBtn: "Copy"
    }
  }
};

// src/i18n/zh.ts
var zh = {
  command: {
    pick: "\u62BD\u53D6\u4E00\u7BC7\u7B14\u8BB0\u590D\u4E60",
    openPanel: "\u6253\u5F00\u590D\u4E60\u9762\u677F",
    stats: "\u663E\u793A\u590D\u4E60\u7EDF\u8BA1",
    resetCurrent: "\u6E05\u9664\u5F53\u524D\u7B14\u8BB0\u7684\u590D\u4E60\u8BB0\u5F55"
  },
  menu: {
    clearRecord: "\u6E05\u9664\u8FD9\u7BC7\u7684\u590D\u4E60\u8BB0\u5F55"
  },
  ribbon: {
    tooltip: "\u62BD\u4E00\u7BC7\u7B14\u8BB0\u590D\u4E60"
  },
  status: {
    aria: "Spaced Dive\uFF1A\u70B9\u4E00\u4E0B\u62BD\u4E00\u7BC7",
    due: "\u5F85\u590D\u4E60 {n}",
    none: "\u65E0\u5F85\u590D\u4E60"
  },
  notice: {
    dailyLimit: "\u4ECA\u65E5\u62BD\u5361\u5DF2\u8FBE\u4E0A\u9650 {n} \u7BC7",
    emptyPool: "\u5019\u9009\u6C60\u662F\u7A7A\u7684\uFF0C\u53BB\u8BBE\u7F6E\u91CC\u653E\u5F00\u62BD\u5361\u8303\u56F4",
    nothingToPick: "\u6CA1\u6709\u53EF\u62BD\u7684\u7B14\u8BB0",
    archived: "\u5DF2\u5C01\u5B58\u300A{name}\u300B\uFF0C\u4E0D\u518D\u62BD\u5230",
    archivedDry: "\u6F14\u7EC3 \xB7 \u4F1A\u5C01\u5B58\u300A{name}\u300B\uFF0C\u672A\u5199\u5165",
    // 带篇名是必须的: 这条会落在**下一篇**卡片的上方, 不写名字会被读成
    // 在说新抽到的那篇。(普通打分不提示 —— 见 main.ts 的 grade())
    gradedDry: "\u6F14\u7EC3 \xB7 \u300A{name}\u300B\u4F1A\u8BB0 {q}\uFF0C{days} \u5929\u540E\u5230\u671F\uFF08\u672A\u5199\u5165\uFF09",
    stats: "\u5171 {total} \u7BC7 \xB7 \u590D\u4E60\u8FC7 {seen} \u7BC7 ({pct}%) \xB7 \u5F85\u590D\u4E60 {due} \u7BC7",
    cleared: "\u5DF2\u6E05\u9664\u8FD9\u7BC7\u7684\u590D\u4E60\u8BB0\u5F55",
    clearedAll: "\u590D\u4E60\u8BB0\u5F55\u5DF2\u6E05\u7A7A",
    noActiveNote: "\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u7B14\u8BB0",
    copied: "\u5B89\u88C5\u547D\u4EE4\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"
  },
  view: {
    title: "\u4ECA\u65E5\u6DF1\u6F5C",
    headCurrent: "\u5F53\u524D\u7B14\u8BB0",
    headDrawn: "\u62BD\u5230\u7684\u7BC7\u76EE",
    headOutOfScope: "\u5F53\u524D\u7B14\u8BB0\u4E0D\u53C2\u4E0E\u590D\u4E60",
    linkPick: "\u62BD\u4E00\u7BC7",
    linkBack: "\u8FD4\u56DE\u5F53\u524D\u7B14\u8BB0",
    open: "\u6253\u5F00\u8FD9\u7BC7\u7B14\u8BB0",
    reroll: "\u6362\u4E00\u7BC7",
    emptyDefault: "\u70B9\u53F3\u4E0A\u89D2\u7684\u300C\u62BD\u4E00\u7BC7\u300D\u6311\u4E00\u7BC7\u6765\u770B\u3002",
    emptyNoNote: "\u6CA1\u6709\u6253\u5F00\u7684\u7B14\u8BB0",
    emptyArchived: "\u8FD9\u7BC7\u5DF2\u5C01\u5B58",
    hintArchived: "\u5728\u7B14\u8BB0\u4E0A\u53F3\u952E\u53EF\u4EE5\u6E05\u9664\u5B83\u7684\u590D\u4E60\u8BB0\u5F55",
    emptyExcluded: "\u8FD9\u7BC7\u4E0D\u53C2\u4E0E\u590D\u4E60 \u2014\u2014 {reason}",
    hintExcluded: "\u60F3\u8BA9\u5B83\u53C2\u4E0E\uFF0C\u53BB\u8BBE\u7F6E\u91CC\u8C03\u6574\u62BD\u5361\u8303\u56F4",
    metaReviewed: "\u590D\u4E60 {n} \u6B21\uFF0C\u4E0A\u6B21 {date}",
    metaNever: "\u672A\u590D\u4E60\uFF0C\u5C18\u5C01 {n} \u5929",
    metaSize: "\u7EA6 {n} \u5B57",
    dueNotScheduled: "\u8FD8\u6CA1\u6392\u671F",
    dueFuture: "\u4E0B\u6B21\u5230\u671F {date}\uFF08\u8FD8\u6709 {n} \u5929\uFF09",
    dueToday: "\u4ECA\u5929\u5230\u671F",
    dueOverdue: "\u5DF2\u903E\u671F {n} \u5929",
    hintEarly: "\u8FD8\u6CA1\u5230\u671F\uFF0C\u73B0\u5728\u6253\u5206\u4F1A\u91CD\u7F6E\u8FDB\u5EA6\u3002",
    hintRecall: "\u56DE\u60F3\u5F97\u600E\u4E48\u6837\uFF1F",
    footerDue: "\u4ECA\u65E5\u5F85\u590D\u4E60 {n} \u7BC7",
    footerNone: "\u6682\u65F6\u6CA1\u6709\u5230\u671F\u7684\u7B14\u8BB0",
    dateUnknown: "\u672A\u77E5"
  },
  grade: {
    5: "\u6EDA\u74DC\u70C2\u719F",
    4: "\u8BB0\u5F97\u6E05\u695A",
    3: "\u57FA\u672C\u8BB0\u5F97",
    2: "\u6A21\u7CCA\uFF0C\u53EA\u5BF9\u4E00\u534A",
    1: "\u5B8C\u5168\u60F3\u4E0D\u8D77\u6765",
    0: "\u5C01\u5B58\uFF0C\u4E0D\u518D\u62BD"
  },
  exclude: {
    rootFile: "\u5E93\u6839\u76EE\u5F55\u7684\u6587\u4EF6\u9ED8\u8BA4\u4E0D\u53C2\u4E0E",
    inFolder: "{name} \u5728\u6392\u9664\u76EE\u5F55\u91CC",
    notInScope: "\u4E0D\u5728\u6307\u5B9A\u7684\u62BD\u5361\u76EE\u5F55\u5185",
    namePattern: "\u6587\u4EF6\u540D\u547D\u4E2D\u6392\u9664\u89C4\u5219\uFF08\u901A\u5E38\u662F\u4E2A\u76EE\u5F55\u9875\uFF09",
    isIndex: "\u8FD9\u662F\u4E2A\u7D22\u5F15\u5BFC\u8BFB\u9875\uFF0C\u4E0D\u662F\u77E5\u8BC6\u9875",
    skipTag: "\u5E26\u4E86\u5C01\u5B58\u6807\u7B7E",
    noReviewTag: "\u6CA1\u6709 #{tag} \u6807\u7B7E"
  },
  state: {
    never: "\u4ECE\u672A\u590D\u4E60",
    archived: "\u5DF2\u5C01\u5B58",
    reviewed: "\u5DF2\u590D\u4E60 {n} \u6B21 \xB7 \u4E0A\u6B21 {date}"
  },
  settings: {
    head: {
      scope: {
        name: "\u62BD\u5361\u8303\u56F4",
        desc: "\u51B3\u5B9A\u54EA\u4E9B\u7B14\u8BB0\u6709\u8D44\u683C\u88AB\u62BD\u5230\u3002"
      },
      filter: {
        name: "\u5185\u5BB9\u7B5B\u9009",
        desc: "\u628A\u5BFC\u822A\u9875\u3001\u6B8B\u9875\u8FD9\u7C7B\u4E0D\u8BE5\u590D\u4E60\u7684\u4E1C\u897F\u5254\u6389\u3002"
      },
      schedule: {
        name: "\u8C03\u5EA6\u9636\u68AF",
        desc: "\u9057\u5FD8\u66F2\u7EBF\u7684\u9AA8\u67B6\u3002"
      },
      pick: {
        name: "\u62BD\u53D6\u7B56\u7565",
        desc: "\u7528\u4EC0\u4E48\u773C\u5149\u5728\u5019\u9009\u6C60\u91CC\u6311\u3002"
      },
      storage: {
        name: "\u5B58\u50A8\u4F4D\u7F6E",
        desc: "\u8C03\u5EA6\u6570\u636E\u653E\u7B14\u8BB0\u5934\u90E8\uFF0C\u8FD8\u662F\u96C6\u4E2D\u653E\u5728\u63D2\u4EF6\u6570\u636E\u6587\u4EF6\u91CC\u3002"
      },
      ui: {
        name: "\u754C\u9762",
        desc: "\u72B6\u6001\u680F\u3001\u8BED\u8A00\uFF0C\u4EE5\u53CA\u62BD\u5361\u4E4B\u540E\u7684\u52A8\u4F5C\u3002"
      },
      maintenance: {
        name: "\u6570\u636E\u7EF4\u62A4",
        desc: "\u6E05\u7A7A\u4E4B\u524D\u5148\u60F3\u6E05\u695A\uFF0C\u8FD9\u4E00\u6B65\u6CA1\u6709\u64A4\u9500\u3002"
      },
      about: {
        name: "\u7ED9 AI \u52A9\u624B\u7528",
        desc: "\u53EF\u9009\u3002\u8BA9 Claude Code\u3001WorkBuddy \u4E4B\u7C7B\u7684\u52A9\u624B\u6309\u540C\u4E00\u5957\u89C4\u5219\u3001\u540C\u4E00\u4EFD\u8FDB\u5EA6\u62BD\u5361\u590D\u4E60\u3002"
      }
    },
    scope: {
      mode: {
        name: "\u8303\u56F4\u6A21\u5F0F",
        desc: "\u5168\u5E93\u3001\u6307\u5B9A\u76EE\u5F55\u3001\u6216\u51ED\u6807\u7B7E\u5165\u9009\u3002"
      },
      modeAll: "\u5168\u5E93",
      modeFolders: "\u4EC5\u6307\u5B9A\u76EE\u5F55",
      modeTag: "\u4EC5\u5E26\u6807\u7B7E\u7684\u7B14\u8BB0",
      include: {
        name: "\u5305\u542B\u76EE\u5F55",
        desc: "\u6BCF\u884C\u4E00\u4E2A\u76EE\u5F55\u8DEF\u5F84\uFF0C\u76F8\u5BF9\u5E93\u6839\u3002\u7559\u7A7A\u5219\u7B49\u4E8E\u5168\u5E93\u3002",
        placeholder: "\u8BA1\u7B97\u673A\u57FA\u7840\n\u54F2\u5B66"
      },
      exclude: {
        name: "\u6392\u9664\u76EE\u5F55",
        desc: "\u4EFB\u4F55\u6A21\u5F0F\u4E0B\u90FD\u751F\u6548\u3002\u65E5\u8BB0\u3001\u6536\u96C6\u7BB1\u8FD9\u7C7B\u5730\u5E26\u5EFA\u8BAE\u6392\u9664\u3002",
        placeholder: "\u65E5\u8BB0\n\u6536\u96C6\u7BB1"
      },
      reviewTag: {
        name: "\u590D\u4E60\u6807\u7B7E",
        desc: "\u5E26\u8FD9\u4E2A\u6807\u7B7E\u7684\u7B14\u8BB0\u624D\u4F1A\u5165\u9009\uFF08\u4E0D\u542B # \u53F7\uFF09\u3002"
      },
      skipTag: {
        name: "\u5C01\u5B58\u6807\u7B7E",
        desc: "\u5E26\u8FD9\u4E2A\u6807\u7B7E\u7684\u7B14\u8BB0\u6C38\u4E0D\u5165\u9009\u3002"
      }
    },
    filter: {
      namePattern: {
        name: "\u6587\u4EF6\u540D\u6392\u9664\u89C4\u5219",
        desc: "\u547D\u4E2D\u8FD9\u4E2A\u6B63\u5219\u7684\u6587\u4EF6\u540D\u4F1A\u88AB\u8DF3\u8FC7\uFF0C\u7528\u6765\u6321\u6389\u76EE\u5F55\u9875\u548C\u7D22\u5F15\u9875\u3002"
      },
      skipRoot: {
        name: "\u8DF3\u8FC7\u6839\u76EE\u5F55\u6563\u6587\u4EF6",
        desc: "\u5E93\u6839\u4E0A\u7684\u5B64\u7ACB\u7B14\u8BB0\u591A\u534A\u662F\u5BFC\u822A\u9875\u3002\u5F00\u542F\u540E\u5B83\u4EEC\u4E0D\u53C2\u4E0E\u62BD\u5361\uFF0C\u9ED8\u8BA4\u5173\u95ED\uFF08\u4E5F\u5C31\u662F\u53C2\u4E0E\uFF09\u3002"
      },
      minChars: {
        name: "\u6B8B\u9875\u5B57\u6570\u95E8\u69DB",
        desc: "\u4F30\u7B97\u6B63\u6587\u5C11\u4E8E\u8FD9\u4E2A\u5B57\u6570\u7684\u7B14\u8BB0\u89C6\u4E3A\u6B8B\u9875\uFF0C\u4F1A\u88AB\u964D\u6743\u3002"
      },
      dropThin: {
        name: "\u6B8B\u9875\u76F4\u63A5\u6392\u9664",
        desc: "\u5F00\u542F\u540E\u6B8B\u9875\u4E0D\u518D\u964D\u6743\uFF0C\u800C\u662F\u5F7B\u5E95\u4E0D\u8FDB\u5019\u9009\u6C60\u3002"
      }
    },
    schedule: {
      intervals: {
        name: "\u95F4\u9694\u9636\u68AF\uFF08\u5929\uFF09",
        desc: "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u8BC4\u5206\u8D8A\u597D\u8D8A\u5F80\u4E0A\u8D70\u4E00\u683C\u3002"
      },
      stepsBack: {
        name: "\u5FD8\u4E86\u9000\u51E0\u683C",
        desc: "\u8BC4\u5206\u4E3A 1 \u6216 2 \u65F6\uFF0C\u9636\u68AF\u5F80\u540E\u9000\u7684\u683C\u6570\u3002"
      },
      initialStep: {
        name: "\u8D77\u59CB\u9636\u68AF",
        desc: "\u7B2C\u4E00\u6B21\u590D\u4E60\u65F6\u4ECE\u8FD9\u4E2A\u4F4D\u7F6E\u8D77\u6B65\uFF0C\u8BC4\u5F97\u597D\u518D\u5F80\u4E0A\u8D70\u4E00\u683C\u3002"
      }
    },
    pick: {
      exploreRate: {
        name: "\u63A2\u7D22\u7387",
        desc: "\u6709\u591A\u5927\u6982\u7387\u8DF3\u8FC7\u5230\u671F\u6E05\u5355\uFF0C\u53BB\u6CA1\u590D\u4E60\u8FC7\u7684\u8352\u5730\u63A2\u9669\u3002"
      },
      recentWindow: {
        name: "\u5206\u533A\u56DE\u770B\u6B21\u6570",
        desc: "\u56DE\u770B\u6700\u8FD1\u51E0\u6B21\u590D\u4E60\u843D\u5728\u54EA\u4E9B\u5206\u533A\uFF0C\u7528\u6765\u505A\u5206\u533A\u5E73\u8861\u3002"
      },
      recentDecay: {
        name: "\u5206\u533A\u8870\u51CF\u7CFB\u6570",
        desc: "\u8D8A\u63A5\u8FD1 0\uFF0C\u8FD1\u671F\u62BD\u8FC7\u7684\u5206\u533A\u88AB\u538B\u5F97\u8D8A\u72E0\uFF0C\u5206\u5E03\u8D8A\u5747\u5300\u3002"
      },
      dailyLimit: {
        name: "\u6BCF\u65E5\u4E0A\u9650",
        desc: "\u4E00\u5929\u6700\u591A\u62BD\u51E0\u7BC7\uFF0C0 \u8868\u793A\u4E0D\u9650\u3002"
      }
    },
    storage: {
      mode: {
        name: "\u5B58\u50A8\u65B9\u5F0F",
        desc: "\u7B14\u8BB0\u5934\u90E8\uFF1A\u6570\u636E\u8DDF\u7740\u7B14\u8BB0\u8D70\uFF0CDataview \u548C Bases \u53EF\u4EE5\u76F4\u63A5\u67E5\uFF0C\u591A\u7AEF\u540C\u6B65\u66F4\u7A33\u3002\u63D2\u4EF6\u6570\u636E\uFF1A\u4E0D\u6539\u52A8\u7B14\u8BB0\uFF0C\u4F46\u7B14\u8BB0\u6539\u540D\u4F1A\u5931\u8054\u3002"
      },
      modeFrontmatter: "\u7B14\u8BB0\u5934\u90E8\uFF08\u63A8\u8350\uFF09",
      modeJson: "\u63D2\u4EF6\u6570\u636E\u6587\u4EF6",
      prefix: {
        name: "\u5B57\u6BB5\u524D\u7F00",
        desc: "\u5199\u5728\u7B14\u8BB0\u5934\u90E8\u7684\u5B57\u6BB5\u540D\u524D\u7F00\u3002\u522B\u4E71\u6539\uFF0C\u6539\u4E86\u65E7\u5B57\u6BB5\u5C31\u627E\u4E0D\u56DE\u6765\u4E86\u3002"
      }
    },
    ui: {
      statusBar: {
        name: "\u663E\u793A\u72B6\u6001\u680F",
        desc: "\u5E95\u90E8\u663E\u793A\u4ECA\u65E5\u5F85\u590D\u4E60\u6570\u91CF\u3002"
      },
      follow: {
        name: "\u8DDF\u968F\u5F53\u524D\u7B14\u8BB0",
        desc: "\u9762\u677F\u81EA\u52A8\u663E\u793A\u4F60\u6B63\u5728\u770B\u7684\u8FD9\u7BC7\u7684\u590D\u4E60\u72B6\u6001\uFF0C\u53EF\u4EE5\u76F4\u63A5\u6253\u5206\u3002\u5173\u6389\u5219\u53EA\u6709\u70B9\u9AB0\u5B50\u62BD\u5361\u65F6\u624D\u52A8\u3002"
      },
      openIn: {
        name: "\u7B14\u8BB0\u6253\u5F00\u4F4D\u7F6E",
        desc: "\u5F53\u524D\u6807\u7B7E\uFF1A\u590D\u7528\u6B63\u5728\u770B\u7684\u6807\u7B7E\u9875\uFF0C\u4F1A\u81EA\u52A8\u8DF3\u8FC7\u56FA\u5B9A\u4F4F\u7684\u6807\u7B7E\u3002\u65B0\u6807\u7B7E / \u62C6\u5206\uFF1A\u6BCF\u6B21\u65B0\u5F00\uFF0C\u7EDD\u4E0D\u9876\u6389\u4EFB\u4F55\u4E1C\u897F\u3002"
      },
      openInCurrent: "\u5F53\u524D\u6807\u7B7E",
      openInTab: "\u65B0\u6807\u7B7E",
      openInSplit: "\u62C6\u5206\u89C6\u56FE",
      ribbon: {
        name: "\u663E\u793A\u4FA7\u680F\u56FE\u6807",
        desc: "\u5DE6\u4FA7\u680F\u52A0\u4E00\u4E2A\u9AB0\u5B50\u6309\u94AE\uFF0C\u70B9\u4E00\u4E0B\u5C31\u62BD\u5361\u3002\u5B98\u65B9\u968F\u673A\u7B14\u8BB0\u4E5F\u5728\u540C\u4E00\u4F4D\u7F6E\u3002"
      },
      dryRun: {
        name: "\u6F14\u7EC3\u6A21\u5F0F",
        desc: "\u8D70\u5B8C\u6574\u5957\u6D41\u7A0B\uFF0C\u4F46\u4E0D\u5F80\u7B14\u8BB0\u91CC\u5199\u4EFB\u4F55\u5B57\u6BB5\u3002\u7B2C\u4E00\u6B21\u7528\u5EFA\u8BAE\u5148\u5F00\u7740\u8DD1\u51E0\u8F6E\uFF0C\u770B\u6E05\u5B83\u62BD\u7684\u662F\u54EA\u4E9B\u7B14\u8BB0\u518D\u8BF4\u3002"
      },
      language: {
        name: "\u754C\u9762\u8BED\u8A00",
        desc: "\u9ED8\u8BA4\u8DDF\u968F Obsidian \u7684\u8BED\u8A00\u8BBE\u7F6E\u3002\u547D\u4EE4\u9762\u677F\u91CC\u7684\u540D\u79F0\u8981\u91CD\u8F7D\u63D2\u4EF6\u540E\u624D\u66F4\u65B0\u3002"
      },
      langAuto: "\u8DDF\u968F Obsidian",
      langEn: "English",
      langZh: "\u7B80\u4F53\u4E2D\u6587"
    },
    maintenance: {
      clear: {
        name: "\u6E05\u7A7A\u5168\u90E8\u590D\u4E60\u8BB0\u5F55",
        descFm: "\u9010\u7BC7\u62B9\u6389\u7B14\u8BB0\u5934\u90E8\u7684\u8C03\u5EA6\u5B57\u6BB5\uFF0C\u7B14\u8BB0\u6B63\u6587\u4E0D\u53D7\u5F71\u54CD\u3002",
        descJson: "\u6E05\u6389\u63D2\u4EF6\u6570\u636E\u6587\u4EF6\u91CC\u7684\u5168\u90E8\u8BB0\u5F55\u3002"
      },
      clearBtn: "\u6E05\u7A7A"
    },
    about: {
      what: {
        name: "\u8FD9\u662F\u4EC0\u4E48",
        desc: "\u968F\u63D2\u4EF6\u4E00\u8D77\u5206\u53D1\u7684\u6280\u80FD\u5305\u3002\u5B83\u8DD1\u4E00\u4E2A\u5355\u6587\u4EF6\u547D\u4EE4\u884C\u7A0B\u5E8F\uFF0C\u8BFB\u5199\u7684\u662F\u548C\u63D2\u4EF6\u5B8C\u5168\u76F8\u540C\u7684\u5934\u90E8\u5B57\u6BB5\uFF0C\u6240\u4EE5\u52A9\u624B\u7684\u8FDB\u5EA6\u548C\u8FD9\u4E2A\u9762\u677F\u7684\u8FDB\u5EA6\u662F\u540C\u4E00\u4EFD\u3002\u4E0D\u9700\u8981\u5F00\u7740 Obsidian\u3002"
      },
      install: {
        name: "\u600E\u4E48\u88C5",
        desc: "\u4ECE\u4ED3\u5E93\u4E0B\u8F7D spaced-dive \u6587\u4EF6\u5939\uFF0C\u653E\u8FDB\u52A9\u624B\u7684 skills \u76EE\u5F55 \u2014\u2014 WorkBuddy \u8BFB ~/.workbuddy/skills/\uFF0CClaude Code \u8BFB ~/.claude/skills/\u3002\u6216\u8005\u4E00\u6761\u547D\u4EE4\u88C5\u597D\uFF1A"
      },
      usage: {
        name: "\u600E\u4E48\u7528",
        desc: "\u88C5\u5B8C\u76F4\u63A5\u8DDF\u52A9\u624B\u8BF4\u300C\u62BD\u4E00\u5F20\u300D\u300C\u6DF1\u6F5C\u300D\u5373\u53EF\u3002\u5B83\u8D1F\u8D23\u6311\uFF0C\u4F60\u8D1F\u8D23\u804A\uFF1B\u804A\u5B8C\u767B\u8BB0\u7684\u8BC4\u5206\uFF0C\u5728\u8FD9\u4E2A\u9762\u677F\u91CC\u4E5F\u80FD\u770B\u5230\u3002"
      },
      repo: {
        name: "\u66F4\u591A",
        desc: "\u5B8C\u6574\u8BF4\u660E\u548C\u6280\u80FD\u5305\u90FD\u5728\u8FD9\u91CC\uFF1A"
      },
      copyBtn: "\u590D\u5236"
    }
  }
};

// src/i18n/index.ts
var TABLES = {
  en,
  zh,
  "zh-cn": zh,
  "zh-hans": zh
};
var table = en;
function setLocale(lang) {
  const lower = lang.toLowerCase();
  table = TABLES[lower] ?? TABLES[lower.split("-")[0]] ?? en;
}
function lookup(key, dict) {
  let node = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}
function t(key, vars) {
  const raw = lookup(key, table) ?? lookup(key, en) ?? key;
  if (!vars) return raw;
  return raw.replace(
    /\{(\w+)\}/g,
    (whole, name) => name in vars ? String(vars[name]) : whole
  );
}

// src/rules.ts
var EASE_DEFAULT = 2500;
function asISODate(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return toDayNumber(trimmed) === null ? null : trimmed;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateFromMillis(value.getTime());
  }
  return null;
}
function asInt(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}
function asBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
function stateFromFrontmatter(fm, prefix) {
  if (!fm) return null;
  const key = (base) => prefix + base;
  const due = asISODate(fm[key("due")]);
  const added = asISODate(fm[key("added")]);
  const last = asISODate(fm[key("last")]);
  const times = asInt(fm[key("times")], 0);
  const rawQuality = fm[key("quality")];
  if (due === null && added === null && last === null && times === 0 && rawQuality === void 0) {
    return null;
  }
  return {
    added,
    due,
    step: Math.max(0, asInt(fm[key("step")], 0)),
    times,
    last,
    quality: rawQuality === void 0 ? null : asInt(rawQuality, 0),
    ease: asInt(fm[key("ease")], EASE_DEFAULT),
    skip: asBool(fm[key("skip")], false)
  };
}
function frontmatterPatch(patch, prefix) {
  const out = {};
  const put = (base, value) => {
    out[prefix + base] = value;
  };
  if (patch.added !== void 0) put("added", patch.added);
  if (patch.due !== void 0) put("due", patch.due);
  if (patch.step !== void 0) put("step", patch.step);
  if (patch.times !== void 0) put("times", patch.times);
  if (patch.last !== void 0) put("last", patch.last);
  if (patch.quality !== void 0) put("quality", patch.quality);
  if (patch.ease !== void 0) put("ease", patch.ease);
  if (patch.skip !== void 0) put("skip", patch.skip ? true : null);
  return out;
}
var regexCache = /* @__PURE__ */ new Map();
function compile(pattern) {
  if (regexCache.has(pattern)) return regexCache.get(pattern) ?? null;
  let re = null;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = null;
  }
  regexCache.set(pattern, re);
  return re;
}
function tagsFromFrontmatter(fm) {
  const out = [];
  const raw = fm?.["tags"];
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const norm = item.replace(/^#/, "").trim().toLowerCase();
    if (norm) out.push(norm);
  }
  return out;
}
function normPath(p) {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}
function buildFilter(settings) {
  const exclude = new Set(settings.excludeFolders.map(normPath));
  const include = new Set(settings.includeFolders.map(normPath));
  const nameRe = compile(settings.skipNamePattern);
  const reviewTag = settings.reviewTag.replace(/^#/, "").toLowerCase();
  const skipTag = settings.skipTag.replace(/^#/, "").toLowerCase();
  return (note) => {
    const segments = note.path.split("/");
    if (settings.skipRootFiles && segments.length < 2) {
      return t("exclude.rootFile");
    }
    const hit = segments.find((seg) => exclude.has(seg));
    if (hit !== void 0) return t("exclude.inFolder", { name: hit });
    if (settings.scopeMode === "folders") {
      if (!segments.some((seg) => include.has(seg))) {
        return t("exclude.notInScope");
      }
    }
    if (nameRe && nameRe.test(note.basename)) {
      return t("exclude.namePattern");
    }
    const fm = note.frontmatter;
    const noteType = fm?.["type"];
    if (typeof noteType === "string" && /^folder_(brief|index)$/i.test(noteType.trim())) {
      return t("exclude.isIndex");
    }
    let tags = null;
    if (skipTag || settings.scopeMode === "tag") {
      tags = new Set(note.tags);
      for (const extra of tagsFromFrontmatter(note.frontmatter)) {
        tags.add(extra);
      }
    }
    if (skipTag && tags?.has(skipTag)) return t("exclude.skipTag");
    if (settings.scopeMode === "tag" && !tags?.has(reviewTag)) {
      return t("exclude.noReviewTag", { tag: reviewTag });
    }
    return null;
  };
}
function buildCandidate(note, state, today) {
  const todayNum = toDayNumber(today) ?? 0;
  const bornISO = state?.added ?? todayISO(new Date(note.mtime));
  const bornNum = toDayNumber(bornISO) ?? todayNum;
  let overdueDays = null;
  if (state?.due) {
    const dueNum = toDayNumber(state.due);
    if (dueNum !== null) overdueDays = todayNum - dueNum;
  }
  const segments = note.path.split("/");
  return {
    path: note.path,
    basename: note.basename,
    domain: segments.length > 1 ? segments[0] : "",
    sizeChars: estimateChars(note.size),
    bornISO,
    bornDays: Math.max(0, todayNum - bornNum),
    state,
    overdueDays
  };
}

// src/cli/frontmatter-text.ts
function stripQuote(s) {
  if (s.length >= 2) {
    const head = s[0];
    if ((head === '"' || head === "'") && s[s.length - 1] === head) {
      return s.slice(1, -1);
    }
  }
  return s;
}
function parseScalar(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((x) => stripQuote(x.trim())).filter((x) => x !== "");
  }
  return stripQuote(v);
}
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { has: false, endLine: -1, data: {} };
  }
  let end = -1;
  for (let i2 = 1; i2 < lines.length; i2++) {
    if (lines[i2].trim() === "---") {
      end = i2;
      break;
    }
  }
  if (end < 0) return { has: false, endLine: -1, data: {} };
  const data = {};
  let i = 1;
  while (i < end) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (rest.trim() === "") {
      const items = [];
      let j = i + 1;
      while (j < end) {
        const sub = /^\s+-\s*(.*)$/.exec(lines[j]);
        if (!sub) break;
        items.push(stripQuote(sub[1].trim()));
        j++;
      }
      if (items.length > 0) {
        data[key] = items;
        i = j;
        continue;
      }
      data[key] = "";
      i++;
      continue;
    }
    data[key] = parseScalar(rest);
    i++;
  }
  return { has: true, endLine: end, data };
}
function formatScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const s = value.trim();
  if (s === "") return '""';
  if (/[:#[\]{},"'|>&*!?%@`]/.test(s)) return JSON.stringify(s);
  return s;
}
function writeFrontmatter(text, patch) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const block = parseFrontmatter(text);
  const keys = Object.keys(patch);
  if (!block.has) {
    const out2 = ["---"];
    for (const key of keys) {
      const value = patch[key];
      if (value !== null) out2.push(`${key}: ${formatScalar(value)}`);
    }
    out2.push("---");
    const gap = /^\r?\n/.test(text) ? "" : eol;
    return out2.join(eol) + eol + gap + text;
  }
  const out = ["---"];
  const applied = /* @__PURE__ */ new Set();
  for (let i = 1; i < block.endLine; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:/.exec(lines[i]);
    const key = m?.[1];
    if (key !== void 0 && key in patch) {
      if (applied.has(key)) continue;
      applied.add(key);
      const value = patch[key];
      if (value === null) continue;
      out.push(`${key}: ${formatScalar(value)}`);
      continue;
    }
    out.push(lines[i]);
  }
  for (const key of keys) {
    const value = patch[key];
    if (applied.has(key) || value === null) continue;
    out.push(`${key}: ${formatScalar(value)}`);
  }
  out.push("---");
  out.push(...lines.slice(block.endLine + 1));
  return out.join(eol);
}

// src/cli.ts
var HEAD_BYTES = 16384;
function parseArgs(argv) {
  const out = {
    cmd: "help",
    positional: [],
    vault: null,
    lang: "zh",
    force: false,
    content: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--vault") out.vault = argv[++i] ?? null;
    else if (a === "--lang") out.lang = argv[++i] ?? "zh";
    else if (a === "--force") out.force = true;
    else if (a === "--content" || a === "-c") out.content = true;
    else if (a.startsWith("--")) continue;
    else if (out.cmd === "help") out.cmd = a;
    else out.positional.push(a);
  }
  return out;
}
function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
function fail(message, code = 1) {
  emit({ error: message });
  process.exit(code);
}
var SELF_DIR = __dirname;
var VAULT_HINT_FILE = path.join(SELF_DIR, "vault.txt");
function isVault(dir) {
  try {
    return fs.statSync(path.join(dir, ".obsidian")).isDirectory();
  } catch {
    return false;
  }
}
function vaultFromSelf() {
  const parts = SELF_DIR.replace(/\\/g, "/").split("/");
  if (parts.slice(-3).join("/") !== ".obsidian/plugins/spaced-dive") return null;
  const vault = parts.slice(0, -3).join("/");
  return vault === "" ? null : vault;
}
function vaultFromObsidianConfig() {
  const home = os.homedir();
  const files = [
    // Windows
    process.env["APPDATA"] && path.join(process.env["APPDATA"], "obsidian", "obsidian.json"),
    // Linux
    process.env["XDG_CONFIG_HOME"] && path.join(process.env["XDG_CONFIG_HOME"], "obsidian", "obsidian.json"),
    path.join(home, ".config", "obsidian", "obsidian.json"),
    // macOS
    path.join(home, "Library", "Application Support", "obsidian", "obsidian.json")
  ].filter((f) => typeof f === "string" && f !== "");
  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const vaults = Object.values(raw.vaults ?? {}).filter(
      (v) => typeof v.path === "string" && isVault(v.path)
    );
    if (vaults.length === 0) continue;
    const open = vaults.find((v) => v.open === true);
    if (open) return open.path;
    vaults.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    return vaults[0].path;
  }
  return null;
}
function vaultFromCwd() {
  let dir = path.resolve(process.cwd());
  for (; ; ) {
    if (isVault(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
var VAULT_SOURCE = "";
function resolveVault(explicit) {
  if (explicit) {
    VAULT_SOURCE = "--vault";
    return path.resolve(explicit);
  }
  const fromEnv = process.env["SPACED_DIVE_VAULT"];
  if (fromEnv) {
    VAULT_SOURCE = "SPACED_DIVE_VAULT";
    return path.resolve(fromEnv);
  }
  try {
    const hinted = fs.readFileSync(VAULT_HINT_FILE, "utf8").trim();
    if (hinted !== "" && isVault(hinted)) {
      VAULT_SOURCE = "vault.txt";
      return path.resolve(hinted);
    }
  } catch {
  }
  const fromCwd = vaultFromCwd();
  if (fromCwd) {
    VAULT_SOURCE = "\u5F53\u524D\u76EE\u5F55\u5411\u4E0A";
    return fromCwd;
  }
  const fromObsidian = vaultFromObsidianConfig();
  if (fromObsidian) {
    VAULT_SOURCE = "Obsidian \u914D\u7F6E";
    return fromObsidian;
  }
  const fromSelf = vaultFromSelf();
  if (fromSelf && isVault(fromSelf)) {
    VAULT_SOURCE = "\u811A\u672C\u4F4D\u7F6E";
    return fromSelf;
  }
  fail(
    [
      "\u627E\u4E0D\u5230\u77E5\u8BC6\u5E93\u3002\u4EE5\u4E0B\u90FD\u8BD5\u8FC7\u4E86, \u90FD\u6CA1\u547D\u4E2D:",
      "  1. --vault <\u5E93\u6839>",
      "  2. \u73AF\u5883\u53D8\u91CF SPACED_DIVE_VAULT",
      `  3. ${VAULT_HINT_FILE} (\u91CC\u9762\u5199\u4E00\u884C\u5E93\u6839\u8DEF\u5F84\u5373\u53EF)`,
      "  4. \u4ECE\u5F53\u524D\u76EE\u5F55\u9010\u7EA7\u5411\u4E0A\u627E .obsidian",
      "  5. Obsidian \u5168\u5C40\u914D\u7F6E obsidian.json",
      "  6. \u811A\u672C\u81EA\u8EAB\u4F4D\u7F6E",
      "\u6307\u4E00\u6761\u8FC7\u53BB\u5C31\u80FD\u7528\u3002"
    ].join("\n")
  );
}
function loadSettings(vault) {
  const file = path.join(
    vault,
    ".obsidian",
    "plugins",
    "spaced-dive",
    "data.json"
  );
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...DEFAULT_SETTINGS, ...raw.settings ?? {} };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function walkMarkdown(root) {
  const out = [];
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = rel === "" ? root : path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) continue;
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) stack.push(childRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        out.push(childRel);
      }
    }
  }
  return out;
}
function readHead(abs) {
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const read = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, read).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
function factsOf(vault, rel) {
  const abs = path.join(vault, rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  const fm = parseFrontmatter(readHead(abs)).data;
  return {
    path: rel,
    basename: path.basename(rel).replace(/\.md$/i, ""),
    size: stat.size,
    mtime: stat.mtimeMs,
    frontmatter: fm,
    tags: tagsFromFrontmatter(fm)
  };
}
function scan(vault, settings) {
  const excluded = buildFilter(settings);
  const today = todayISO();
  const candidates = [];
  const touched = [];
  for (const rel of walkMarkdown(vault)) {
    const facts = factsOf(vault, rel);
    if (!facts) continue;
    if (excluded(facts)) continue;
    const state = stateFromFrontmatter(
      facts.frontmatter,
      settings.fieldPrefix
    );
    const candidate = buildCandidate(facts, state, today);
    if (settings.dropThinNotes && candidate.sizeChars < settings.minChars) {
      continue;
    }
    candidates.push(candidate);
    if (state?.last) {
      touched.push({ last: state.last, domain: candidate.domain });
    }
  }
  touched.sort((a, b) => a.last < b.last ? -1 : a.last > b.last ? 1 : 0);
  const recent = touched.slice(-Math.max(0, settings.recentWindow)).map((t2) => t2.domain).filter((d) => d !== "");
  return { candidates, recent };
}
function toRel(vault, input) {
  const abs = path.isAbsolute(input) ? path.resolve(input) : path.resolve(vault, input);
  const rel = path.relative(vault, abs).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    fail(`\u8DEF\u5F84\u4E0D\u5728\u77E5\u8BC6\u5E93\u91CC: ${input}`);
  }
  return rel;
}
function cmdPick(args, vault, settings) {
  const { candidates, recent } = scan(vault, settings);
  if (candidates.length === 0) {
    fail("\u5019\u9009\u6C60\u662F\u7A7A\u7684\u3002\u53BB\u63D2\u4EF6\u7684\u8BBE\u7F6E\u91CC\u653E\u5F00\u62BD\u5361\u8303\u56F4\u3002");
  }
  const scheduler = new Scheduler(() => settings);
  const result = scheduler.pick(candidates, recent);
  if (!result) fail("\u6CA1\u6709\u53EF\u62BD\u7684\u7B14\u8BB0\u3002");
  const c = result.candidate;
  const info = {
    path: path.join(vault, c.path),
    rel: c.path,
    basename: c.basename,
    domain: c.domain,
    chars: c.sizeChars,
    age_days: c.bornDays,
    mode: result.mode,
    is_new: c.state === null,
    times_reviewed: c.state?.times ?? 0,
    last_reviewed: c.state?.last ?? null,
    due: c.state?.due ?? null,
    overdue_days: c.overdueDays,
    pool_size: result.poolSize,
    pool_total: candidates.length
  };
  if (args.content) {
    try {
      info["content"] = fs.readFileSync(path.join(vault, c.path), "utf8");
    } catch {
      info["content"] = null;
    }
  }
  emit(info);
}
function cmdDone(args, vault, settings) {
  const [rawPath, rawQuality] = args.positional;
  if (!rawPath || rawQuality === void 0) {
    fail("\u7528\u6CD5: spaced-dive done <\u76F8\u5BF9\u8DEF\u5F84> <\u8BC4\u5206 0-5>");
  }
  const quality = Number(rawQuality);
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    fail(`\u8BC4\u5206\u5FC5\u987B\u662F 0..5 \u7684\u6574\u6570, \u6536\u5230: ${rawQuality}`);
  }
  const rel = toRel(vault, rawPath);
  const abs = path.join(vault, rel);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    fail(`\u8BFB\u4E0D\u5230\u8FD9\u7BC7\u7B14\u8BB0: ${rel}`);
  }
  const facts = factsOf(vault, rel);
  if (!facts) fail(`\u8BFB\u4E0D\u5230\u8FD9\u7BC7\u7B14\u8BB0: ${rel}`);
  const state = stateFromFrontmatter(facts.frontmatter, settings.fieldPrefix);
  const candidate = buildCandidate(facts, state, todayISO());
  const scheduler = new Scheduler(() => settings);
  const patch = scheduler.nextState(
    state,
    quality,
    todayISO(),
    candidate.bornISO
  );
  if (settings.dryRun && !args.force) {
    emit({
      ok: false,
      dry_run: true,
      rel,
      message: "\u63D2\u4EF6\u5F00\u7740\u6F14\u7EC3\u6A21\u5F0F, \u6CA1\u6709\u5199\u5165\u3002\u52A0 --force \u53EF\u5F3A\u5236\u843D\u76D8\u3002",
      would_be: patch
    });
    return;
  }
  const next = writeFrontmatter(
    text,
    frontmatterPatch(patch, settings.fieldPrefix)
  );
  fs.writeFileSync(abs, next, "utf8");
  emit({
    ok: true,
    rel,
    quality,
    step: patch.step ?? null,
    times: patch.times ?? null,
    next_due: patch.due ?? null,
    skipped: patch.skip === true
  });
}
function cmdStats(vault, settings) {
  const { candidates } = scan(vault, settings);
  const total = candidates.length;
  const reviewed = candidates.filter((c) => c.state !== null).length;
  const due = candidates.filter(
    (c) => c.state && !c.state.skip && (c.overdueDays ?? -1) >= 0
  ).length;
  const domains = {};
  for (const c of candidates) {
    const key = c.domain || "(\u5E93\u6839)";
    domains[key] = (domains[key] ?? 0) + 1;
  }
  const sorted = Object.fromEntries(
    Object.entries(domains).sort((a, b) => b[1] - a[1])
  );
  emit({
    vault,
    vault_source: VAULT_SOURCE,
    // 抽错了谱系时, 一眼看出是哪条路找来的
    total_notes: total,
    reviewed_ever: reviewed,
    coverage: total === 0 ? "0.0%" : `${(reviewed / total * 100).toFixed(1)}%`,
    due_today: due,
    domains: sorted
  });
}
function cmdDue(args, vault, settings) {
  const limit = Number(args.positional[0] ?? 20);
  const { candidates } = scan(vault, settings);
  const scheduler = new Scheduler(() => settings);
  const list = scheduler.dueList(candidates).slice(0, limit);
  emit({
    count: list.length,
    items: list.map((c) => ({
      rel: c.path,
      domain: c.domain,
      overdue_days: c.overdueDays,
      times_reviewed: c.state?.times ?? 0,
      due: c.state?.due ?? null
    }))
  });
}
function cmdPeek(args, vault, settings) {
  const limit = Number(args.positional[0] ?? 15);
  const { candidates, recent } = scan(vault, settings);
  const scheduler = new Scheduler(() => settings);
  const ranked = candidates.map((c) => ({ c, w: scheduler.weight(c, recent) })).filter((row) => row.w > 0).sort((a, b) => b.w - a.w).slice(0, limit);
  emit({
    count: ranked.length,
    items: ranked.map(({ c, w }) => ({
      rel: c.path,
      domain: c.domain,
      weight: Number(w.toFixed(3)),
      is_new: c.state === null,
      overdue_days: c.overdueDays,
      age_days: c.bornDays
    }))
  });
}
function cmdCheck(args, vault, settings) {
  const raw = args.positional[0];
  if (!raw) fail("\u7528\u6CD5: spaced-dive check <\u76F8\u5BF9\u8DEF\u5F84>");
  const rel = toRel(vault, raw);
  const facts = factsOf(vault, rel);
  if (!facts) fail(`\u8BFB\u4E0D\u5230\u8FD9\u7BC7\u7B14\u8BB0: ${rel}`);
  const why = buildFilter(settings)(facts);
  if (why !== null) {
    emit({ ok: false, rel, reason: why });
    return;
  }
  const state = stateFromFrontmatter(facts.frontmatter, settings.fieldPrefix);
  const candidate = buildCandidate(facts, state, todayISO());
  emit({
    ok: true,
    rel,
    domain: candidate.domain,
    chars: candidate.sizeChars,
    is_new: state === null,
    skipped: state?.skip ?? false,
    times_reviewed: state?.times ?? 0,
    last_reviewed: state?.last ?? null,
    due: state?.due ?? null,
    overdue_days: candidate.overdueDays,
    age_days: candidate.bornDays
  });
}
var HELP = `Spaced Dive CLI \u2014\u2014 \u6309\u9057\u5FD8\u66F2\u7EBF\u62BD\u4E00\u7BC7\u7B14\u8BB0\u6765\u590D\u4E60

  pick [--content]        \u62BD\u4E00\u7BC7, \u8F93\u51FA JSON(--content \u8FDE\u6B63\u6587\u4E00\u8D77\u7ED9)
  done <rel> <q>          \u767B\u8BB0\u590D\u4E60\u7ED3\u679C, q = 0..5 (0 = \u5C01\u5B58, \u4E0D\u518D\u62BD)
  stats                   \u5E93\u5B58\u4E0E\u8986\u76D6\u7387(\u542B\u5E93\u6839\u4E0E\u5B83\u662F\u600E\u4E48\u627E\u7740\u7684)
  due [n]                 \u5230\u671F\u6E05\u5355(\u9ED8\u8BA4 20)
  peek [n]                \u9884\u89C8\u6743\u91CD\u6700\u9AD8\u7684 n \u7BC7(\u4E0D\u5199\u72B6\u6001)
  check <rel>             \u53CD\u67E5\u4E00\u7BC7\u662F\u5426\u53C2\u4E0E\u590D\u4E60, \u4EE5\u53CA\u539F\u56E0

\u901A\u7528\u53C2\u6570
  --vault <\u5E93\u6839>          \u4E0D\u4F20\u5C31\u81EA\u5DF1\u627E: \u5F53\u524D\u76EE\u5F55\u5411\u4E0A \u2192 Obsidian \u914D\u7F6E \u2192 ...
  --lang zh|en            \u63D0\u793A\u6587\u6848\u8BED\u8A00(\u9ED8\u8BA4 zh)
  --force                 \u6F14\u7EC3\u6A21\u5F0F\u4E0B\u4E5F\u5F3A\u5236\u5199\u5165

\u5E93\u6839\u600E\u4E48\u627E\u7684
  1. --vault <\u5E93\u6839>
  2. \u73AF\u5883\u53D8\u91CF SPACED_DIVE_VAULT
  3. \u4E0E\u672C\u811A\u672C\u540C\u76EE\u5F55\u7684 vault.txt (\u5199\u4E00\u884C\u8DEF\u5F84\u8FDB\u53BB\u5373\u53EF\u56FA\u5B9A)
  4. \u4ECE\u5F53\u524D\u76EE\u5F55\u9010\u7EA7\u5411\u4E0A\u627E .obsidian
  5. Obsidian \u5168\u5C40\u914D\u7F6E obsidian.json (\u591A\u4E2A\u5E93\u65F6\u53D6\u6B63\u5F00\u7740\u7684\u90A3\u4E2A)
  6. \u811A\u672C\u81EA\u8EAB\u4F4D\u7F6E

\u8BC4\u5206\u542B\u4E49
  5 \u6EDA\u74DC\u70C2\u719F   4 \u8BB0\u5F97\u6E05\u695A   3 \u57FA\u672C\u8BB0\u5F97
  2 \u6A21\u7CCA\u53EA\u5BF9\u4E00\u534A   1 \u5B8C\u5168\u60F3\u4E0D\u8D77\u6765   0 \u5C01\u5B58\u4E0D\u518D\u62BD
`;
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "help" || args.cmd === "--help" || args.cmd === "-h") {
    process.stdout.write(HELP);
    return;
  }
  setLocale(args.lang === "auto" ? "" : args.lang);
  const vault = resolveVault(args.vault);
  const settings = loadSettings(vault);
  switch (args.cmd) {
    case "pick":
      cmdPick(args, vault, settings);
      break;
    case "done":
      cmdDone(args, vault, settings);
      break;
    case "stats":
      cmdStats(vault, settings);
      break;
    case "due":
      cmdDue(args, vault, settings);
      break;
    case "peek":
      cmdPeek(args, vault, settings);
      break;
    case "check":
      cmdCheck(args, vault, settings);
      break;
    default:
      process.stdout.write(HELP);
      process.exit(1);
  }
}
main();
