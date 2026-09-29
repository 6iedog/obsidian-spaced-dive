/** 艾宾浩斯简化阶梯(天), 沿用 picker.py 里调过手的参数 */
export const DEFAULT_INTERVALS = [1, 3, 7, 16, 35, 90, 180, 365, 730];

/** data.json 里的历史最多保留多少条 */
export const HISTORY_CAP = 500;

/** 视图类型标识 */
export const REVIEW_VIEW_TYPE = "spaced-dive-review-view";

/** 待复习数量的缓存时长(毫秒)。切标签很频繁, 别每次都扫全库。 */
export const DUE_CACHE_MS = 10000;

/** 仓库的 owner/name。地址和安装命令都由它拼出来, 改一处就够。 */
export const REPO_SLUG = "6iedog/obsidian-spaced-dive";

/** 仓库名。设置面板里当链接文字用 —— 专有名词, 不过 sentence case。 */
export const REPO_NAME = "obsidian-spaced-dive";

/** 仓库地址。设置面板里"给 AI 助手用"那一段要用。 */
export const REPO_URL = `https://github.com/${REPO_SLUG}`;

/** 技能包的一条命令装法, 给设置面板里的复制按钮用 */
export const SKILL_INSTALL_CMD = `npx skills add ${REPO_SLUG}`;

/** 技能包在仓库里的位置, 设置面板里指向它 */
export const SKILL_DIR_URL = `${REPO_URL}/tree/master/skills/spaced-dive`;
