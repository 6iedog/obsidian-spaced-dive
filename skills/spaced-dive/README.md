# Spaced Dive · AI 助手技能包

让 Claude Code / WorkBuddy / Cursor 之类的 AI 助手，也能按遗忘曲线从你的
Obsidian 库里抽一篇笔记来陪你复习。

里面就三个文件：

```
spaced-dive.cjs    命令行程序（单文件，无依赖，不需要 npm install）
SKILL.md           给 AI 看的说明书，AI 读它就知道怎么用
README.md          你正在读的这份
```

它和 Obsidian 插件 [Spaced Dive](https://github.com/6iedog/obsidian-spaced-dive)
**共用同一份抽卡规则和同一份进度数据**——进度写在笔记自己的 `sr-*` frontmatter 里，
所以在插件里复习过的笔记，AI 这边认得；反过来也一样。

## 前置要求

- **Node.js 18 或更高**。`node -v` 能打印版本号就行。
- 一个 Obsidian 库（有 `.obsidian` 目录的那个文件夹）。
- 装了 Spaced Dive 插件更好（会沿用你在插件里配的抽卡范围），
  **但没装也能跑**，那时用默认规则。

不需要联网，不上传任何东西。

## 安装

### 方式一：一条命令（推荐）

```bash
npx skills add 6iedog/obsidian-spaced-dive
```

会交互式地问你装到哪些 agent、装到当前项目还是全局。想一步到位：

```bash
npx skills add 6iedog/obsidian-spaced-dive -g -a claude-code -y
```

几个值得知道的参数：

| 参数 | 作用 |
| --- | --- |
| `--list` | 只列出仓库里有什么，先看不装 |
| `-g` | 装到用户目录（跨项目可用），不加则装进当前项目 |
| `-a <agent>` | 指定目标，如 `claude-code`、`cursor`、`codex`、`opencode` |
| `--copy` | 复制文件，而不是软链到一份共享副本 |
| `-y` | 跳过全部确认 |

后续 `npx skills list` 看装了啥、`npx skills update` 升级、`npx skills remove spaced-dive` 卸载。

> **注意目标 agent**：这个 CLI 支持 80 多个 agent，但**没有 WorkBuddy**。
> WorkBuddy 读的是 `~/.workbuddy/skills/`，而 CLI 里最接近的是 `codebuddy`
> （装到 `~/.codebuddy/skills/`）。所以 **WorkBuddy 用户请走方式二**。
> 这个仓库也没人替你验证过 CLI 到底会把 `sr-*` 之外的什么东西一起拷过去，
> 介意的话先 `--list` 看一眼再装。

### 方式二：手动下载（WorkBuddy 走这条）

1. 把 `spaced-dive` 文件夹整个下载下来
   （仓库里点进 `skills/spaced-dive/`，或 `git clone` 后取这一层）。
2. 放到你所用工具的 skills 目录：

   | 工具 | 放哪儿 |
   | --- | --- |
   | WorkBuddy | `~/.workbuddy/skills/` |
   | Claude Code | `~/.claude/skills/` |
   | 其它 | 查它的 skill / rules 文档 |

   放完应该是 `~/.workbuddy/skills/spaced-dive/SKILL.md` 这样。
3. 完事了。没有构建步骤，也不用装依赖 —— `spaced-dive.cjs` 是打好的单文件。

### 方式三：Claude Code 插件市场

仓库根目录带了 `.claude-plugin/marketplace.json`，所以在 Claude Code 里也可以：

```
/plugin marketplace add 6iedog/obsidian-spaced-dive
/plugin install spaced-dive@obsidian-spaced-dive
```

这条路的好处是版本会被锁住、能自动更新；代价是它会把整个仓库当成一个插件拉下来
（比方式一重），而且只有 Claude Code 认。

## 验证

```bash
node ~/.workbuddy/skills/spaced-dive/spaced-dive.cjs stats
```

能打印出一段 JSON 就说明通了。看两个字段：

```json
{
  "vault": "C:\\Users\\you\\Documents\\MyVault",   ← 它认定的库根
  "vault_source": "Obsidian 配置",                  ← 靠哪条规则找到的
  "total_notes": 2395,
  "reviewed_ever": 812,
  "coverage": "33.9%",
  "due_today": 17
}
```

`vault` 对不上你想复习的库 → 看下面。

## 库根：默认自动找，不对再手动钉

脚本按这个顺序找库：`--vault` → 环境变量 `SPACED_DIVE_VAULT` → 同目录 `vault.txt`
→ 从当前目录逐级向上找 `.obsidian` → Obsidian 全局配置 → 脚本自身位置。

**多数人什么都不用配**——第 5 条会去读 Obsidian 自己的配置
（Windows 在 `%APPDATA%\obsidian\obsidian.json`，macOS 在
`~/Library/Application Support/obsidian/obsidian.json`），
那里记着你所有库的路径。有多个库时它优先取**正开着的那个**。

要强制指定，就在 `spaced-dive.cjs` 旁边建一个 `vault.txt`，写一行绝对路径：

```
C:\Users\you\Documents\MyVault
```

（这个文件被 `.gitignore` 排除了，是你自己的，不会被覆盖。）

## 命令速查

```bash
SD=~/.workbuddy/skills/spaced-dive/spaced-dive.cjs

node "$SD" pick --content              # 抽一篇，连正文一起输出 JSON
node "$SD" done "Meta/某篇.md" 4       # 登记复习结果，评分 0..5
node "$SD" stats                       # 库存 / 覆盖率 / 待复习 / 分区分布
node "$SD" due 20                      # 到期清单
node "$SD" peek 15                     # 预览权重最高的 15 篇（不写状态）
node "$SD" check "Meta/某篇.md"        # 反查这篇为什么参与 / 不参与复习
node "$SD" help                        # 全部参数
```

> 路径有空格时一定要加引号。另外**别**写成
> `SD='node "/带 空格/的路径.cjs"'` 再 `$SD pick` —— bash 展开变量时不解析引号，
> 会报 `Cannot find module`。用变量只存**文件路径**（如上），`node` 留在外面。

评分含义：

| q | 含义 | 间隔变化 |
| --- | --- | --- |
| 5 | 滚瓜烂熟 | 进 1 格 |
| 4 | 记得清楚 | 进 1 格 |
| 3 | 基本记得 | 原地不动 |
| 2 | 模糊，只对了一半 | 退 2 格 |
| 1 | 完全想不起来 | 退 2 格 |
| 0 | 没有价值，永不再抽 | 封存 |

间隔阶梯（天）：`1 → 3 → 7 → 16 → 35 → 90 → 180 → 365 → 730`

## 怎么用

装好之后直接跟 AI 说「抽一张」「深潜」「今天复习什么」就行，
`SKILL.md` 里写了完整的五步流程（抽篇目 → 提炼 → 拆骨架 → 连网络 → 给建议）。

也可以手动调，把 `pick --content` 的输出喂给任何你想要的地方。

## 排错

| 现象 | 原因 |
| --- | --- |
| `Cannot find module '...'` | 路径写错，或引号被 shell 吃掉了。见上面那条警告。 |
| `找不到知识库` | 六条路都没命中。报错信息里会列出试过哪些，挑一条指过去。 |
| `total_notes: 0` 或数字偏小 | 抽卡范围被插件设置收得太窄。去插件设置里看「抽卡范围」。 |
| 抽出来的是不想复习的笔记 | 插件设置里加排除目录 / 标签，或用 `check "<rel>"` 看它为什么被判进来。 |
| `node: command not found` | 装 Node 18+，或改用 `node` 的绝对路径。 |

## 和 Obsidian 插件的关系

| | 插件 | 这个技能包 |
| --- | --- | --- |
| 谁用 | 你，在 Obsidian 里点 | AI 助手，在终端里调 |
| 需要 Obsidian 开着吗 | 当然 | **不需要** |
| 抽卡规则 | `src/rules.ts` + `src/scheduler.ts` | 同一份源码 |
| 进度数据 | 笔记 frontmatter 的 `sr-*` | 同一份 |

插件负责"读的时候舒服"，技能包负责"AI 能调得动"。两边不会算出不同结果。

## License

MIT
