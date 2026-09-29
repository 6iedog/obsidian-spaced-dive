---
name: spaced-dive
description: "Draw a note from an Obsidian vault on a forgetting curve, then review it with the user. Use when the user asks to review a note, pick something to study, or says 抽一张 / 深潜 / 复习一篇 / 今天复习什么."
description_zh: "按遗忘曲线从 Obsidian 知识库抽一篇笔记来复习"
description_en: "Pick a note from an Obsidian vault on a forgetting curve and review it"
version: 1.0.0
display_name: "spaced-dive"
display_name_zh: "知识深潜"
display_name_en: "spaced-dive"
visibility: "private"
---

# 知识深潜 · Spaced Dive

按遗忘曲线从 Obsidian 知识库里抽一篇笔记，陪用户复习。

**分工**：代码管「抽谁」，你管「怎么拆」。抽卡、排期、进度全部由命令行负责，
你只做理解和追问。**不要自己挑笔记**——随机和加权都算好了，你挑的不如它准。

这套东西和 Obsidian 插件 [Spaced Dive](https://github.com/6iedog/obsidian-spaced-dive)
共用同一份抽卡规则和同一份进度数据，所以在插件里复习过的笔记，这里认得。

---

## 触发场景

- 用户说「抽一张」「抽一篇」「深潜」「今天复习什么」「复习一篇」
- 用户问某篇笔记「该复习了吗」「复习到哪了」
- 定时任务（每日深潜）触发

---

## 运行环境

```
CLI   与本 SKILL.md 同目录的 spaced-dive.cjs
```

它是个**自包含的单文件脚本**，不依赖 Obsidian 开着，不依赖 Electron，
只要机器上有 **Node 18+** 就能跑。把上面 skill 加载信息里的 `SKILL.md`
换成 `spaced-dive.cjs`，就是它的完整路径。

**库根不用你操心**，它会自己找（顺序：`--vault` → 环境变量 → 同目录 `vault.txt`
→ 当前目录向上找 `.obsidian` → Obsidian 全局配置 → 脚本自身位置）。
实在找不到时它会把每一条试过的路都打印出来，照着提示指一条即可。

**第一次通话先自检一句**（确认路径和库都对上了）：

```bash
node "<skill 目录>/spaced-dive.cjs" stats
```

输出里的 `vault` 是它认定的库根，`vault_source` 说明是靠哪条规则找到的。
如果 `vault` 指向的不是用户想复习的那个库，按下面的办法钉死。

### 钉死库根（多库 / 找不到时）

在 `spaced-dive.cjs` **同目录**建一个 `vault.txt`，里面写一行绝对路径：

```
C:\Users\you\Documents\MyVault
```

或者临时指定：`--vault "<库根>"`，或设环境变量 `SPACED_DIVE_VAULT`。

---

## 命令

先包一层函数，省得每次写长路径：

```bash
sd() { node "<skill 目录>/spaced-dive.cjs" "$@"; }
```

**别写成 `SD='node "..."'` 再用 `$SD`** —— bash 展开变量时不做引号解析，
路径里的引号会变成字面字符，报 `Cannot find module`。
用函数，或者路径没有空格时干脆去掉引号。

每个 shell 会话都要重新定义一次（或者直接写全路径）。

### pick — 抽一篇

```bash
sd pick            # 只要元信息
sd pick --content  # 连正文一起给（推荐：省一次读文件）
```

输出 JSON：

| 字段 | 含义 |
| --- | --- |
| `path` | 绝对路径 |
| `rel` | 相对库根路径，**登记时要用这个** |
| `basename` | 篇名 |
| `domain` | 分区（顶层目录） |
| `chars` | 估算字数（< 300 就是残页） |
| `age_days` | 尘封天数 |
| `mode` | `explore` 开荒 / `review` 复习到期项 |
| `is_new` | 是否从未复习过 |
| `times_reviewed` | 已复习次数 |
| `last_reviewed` | 上次复习日期 |
| `due` / `overdue_days` | 到期日 / 逾期天数 |
| `content` | 正文（加了 `--content` 才有） |

### done — 登记进度

```bash
sd done "<rel>" <q>
```

`q` 取 0..5。**只有用户确认后才能执行**，见下方流程第 5 步。

### 其它

```bash
sd stats          # 库存 / 覆盖率 / 待复习数 / 分区分布 / 库根
sd due 20         # 到期清单
sd peek 15        # 预览权重最高的 15 篇（不写状态）
sd check "<rel>"  # 反查一篇是否参与复习，以及原因
```

---

## 评分标准

| q | 含义 | 间隔变化 |
| --- | --- | --- |
| 5 | 滚瓜烂熟 | 进 1 格 |
| 4 | 记得清楚 | 进 1 格 |
| 3 | 基本记得 | 原地不动 |
| 2 | 模糊，只对了一半 | 退 2 格 |
| 1 | 完全想不起来 | 退 2 格 |
| 0 | 这篇没价值，永不再抽 | 封存 |

间隔阶梯（天）：1 → 3 → 7 → 16 → 35 → 90 → 180 → 365 → 730

---

## 复习流程

### 第 1 步 · 抽篇目

```bash
sd pick --content
```

### 第 2 步 · 提炼要点

先交代主角：**篇名 + 分区 + 尘封天数 + 已复习次数**。

然后三到五句话讲清这篇讲了什么。**不复述原文，是提炼**——
用户扫一眼就该想起这个知识点在说什么。复述是搬运，拆解才是思考。

### 第 3 步 · 拆骨架

追问四件事：

1. **原始问题** —— 这知识出生前的世界长什么样？它要解决什么痛点？
2. **最小内核** —— 三句话讲清第一性原理。剥掉例子、剥掉术语，剩下什么？
3. **隐含前提** —— 它依赖哪些没说出口的假设？什么时候会失效？边界在哪？
4. **设计取舍** —— 如果是人为设计：为什么选这条路？被放弃的那条差在哪？

### 第 4 步 · 连网络 + 找缺口

在库里搜相关笔记（用 Grep / Glob 直接搜文件，或 `sd check`）：

- 哪几篇跟它是**同一个问题的两副面孔**？（跨分区的连接最值钱）
- 有没有跟它**矛盾**的？矛盾是金矿
- 笔记哪里写得不清楚 / 太薄 / 过时？有没有边界情况、反例、坑没记？

### 第 5 步 · 给建议，不落笔

先输出两块：

1. **建议补充** —— 整理成可直接粘贴的 markdown，用代码块包好。
   残页（`chars` < 300）走**补全模式**：建议直接补进正文，而不是只挂一节增量。
   不确定的数据标注 `#可信状态/需要验证`。

2. **建议评分 q** —— 依据尘封时长 + 笔记完整度推测，不是实测。

收尾固定一句：**「要我把建议内容写进原笔记吗？」**

**用户确认之后**，才动笔记、才执行 `sd done "<rel>" <q>`。

---

## 铁律

- **不复述笔记。** 复述是搬运，拆解才是思考。
- **一次输出到底。** 不问「想好了吗」，不拆成多轮。
- **不写任何文件，除非用户明确回复确认。** 包括笔记和 `done` 登记。
- **抽谁不由你定。** 想换一篇就再跑一次 `sd pick`，别自己挑。
- **找不到就写「没找到」。** 不许编造库里不存在的笔记或链接。
- **删除 / 覆盖原文前先问。** Journal 类永不动。
- 说话干脆，有判断力，不写套话。觉得某个知识点无聊就直说无聊，觉得妙就说妙。

---

## 关于数据

进度存在**笔记自己的 frontmatter** 里，字段带 `sr-` 前缀：

```yaml
sr-added: 2026-09-28    # 纳入复习池的日期
sr-due: 2026-10-01      # 下次到期
sr-step: 1              # 间隔阶梯下标
sr-times: 2             # 累计复习次数
sr-last: 2026-09-28     # 上次复习
sr-quality: 5           # 上次评分
sr-skip: true           # 封存，不再抽
```

- **不要直接改这些字段。** 一律走 `sd done`，它才算得对阶梯和到期日。
- `done` 只动 `sr-` 开头的行，其余 frontmatter 和正文原样照抄。
- 哪些笔记参与复习：排除插件设置里 `excludeFolders`（默认 Journal / Inbox / Meta）、
  带封存标签的、索引导读页、命中 `skipNamePattern` 的导航页。
  拿不准某篇为什么被排除，跑 `sd check "<rel>"`——它会明说原因。
- 扫描只读每个文件的**头部 16KB** 拿 frontmatter，正文字数按文件字节估算，
  所以几千篇也是秒级。**已知偏差**：写在正文里的 `#标签` 读不到，
  需要按标签选材时请用 Obsidian 插件那边。

---

## 维护

CLI 的抽卡逻辑和插件共用同一份源码（`src/rules.ts` + `src/scheduler.ts`），
规则改动后要重新打包，否则两边会漂移：

```bash
cd <插件仓库>
npm run build:cli    # 产出 skills/spaced-dive/spaced-dive.cjs
npm run skill        # 同步到 ~/.workbuddy/skills/spaced-dive/
```

规则改动后跑 `npm test` 和 `npm run test:cli` 确认没退化。
（`npm run ship` 一次跑完测试 + 两个构建 + 同步。）

`spaced-dive.cjs` 是构建产物，随仓库一起提交，所以下载解压即可用，
不需要用户自己构建。
