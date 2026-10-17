import z from "@deepseek-ai/schemastery";
import { AsyncLocalStorage } from "node:async_hooks";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { dump, load } from "js-yaml";
import { isSkillName } from "@deepseek-ai/dsh-skill";
import { randomUUID } from "node:crypto";
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region src/protocol/api.ts
/**
* Root path of the skill-hub API family. The host also registers this as its
* 404 catch-all prefix, so a mistyped path answers with a plain 404 naming the
* path instead of falling through to the SPA fallback (which answers 401 and
* reads like an auth problem).
*/
const SKILL_HUB_API_ROOT = "/api/skill-hub";
/** Browser-facing base paths of the skill-hub API family. */
const SKILL_HUB_API = {
	catalog: "/api/skill-hub/catalog",
	skill: "/api/skill-hub/skill",
	toggle: "/api/skill-hub/toggle",
	toggleBatch: "/api/skill-hub/toggle-batch",
	create: "/api/skill-hub/create",
	/** 删除磁盘上的技能本体（仅限用户级可写根，用户确认后才会调用）。 */
	skillDelete: "/api/skill-hub/skill/delete",
	stats: "/api/skill-hub/stats",
	config: "/api/skill-hub/config",
	market: "/api/skill-hub/market",
	marketSource: "/api/skill-hub/market/source",
	marketSourceDelete: "/api/skill-hub/market/source/delete",
	marketSourceRef: "/api/skill-hub/market/source/ref",
	marketCheck: "/api/skill-hub/market/check",
	marketSync: "/api/skill-hub/market/source/sync",
	repo: "/api/skill-hub/repo",
	repoImport: "/api/skill-hub/repo/import",
	repoImportProgress: "/api/skill-hub/repo/import/progress",
	repoImportCancel: "/api/skill-hub/repo/import/cancel",
	groups: "/api/skill-hub/groups",
	tag: "/api/skill-hub/tag",
	tagDelete: "/api/skill-hub/tag/delete",
	tagMembers: "/api/skill-hub/tag/members",
	sources: "/api/skill-hub/sources",
	sourceCheck: "/api/skill-hub/sources/check",
	sourceSync: "/api/skill-hub/sources/sync",
	diagnosticFix: "/api/skill-hub/diagnostic/fix",
	marketSourceVersions: "/api/skill-hub/market/source/versions",
	marketStats: "/api/skill-hub/market/stats",
	/** 模式级技能隔离：preset 名单 + 每条的接线状态与策略。 */
	presets: "/api/skill-hub/presets",
	/** 写入某个模式的策略（部分更新；`reset: true` 删除策略）。 */
	scope: "/api/skill-hub/scope",
	/** 读取某个模式的可见性展开明细（面板预览）。 */
	scopePreview: "/api/skill-hub/scope/preview",
	/** 工作区名单 + 每个工作区的策略与展开计数。 */
	workspaces: "/api/skill-hub/workspaces",
	/** 写入某个工作区的策略（部分更新；`reset: true` 删除策略）。 */
	workspace: "/api/skill-hub/workspace"
};
//#endregion
//#region src/protocol/config.ts
/**
* 本插件的 Loader 入口 id —— dsh 0.1.7 起 settings 的命名空间就是它（不是包名）。
* 它是 cordis.patch.yml 的 insert id，宿主与浏览器半边共用这份契约：宿主经
* `settings.mutate(HUB_ENTRY_ID, …)` 写入，浏览器半边经
* `ctx.configForms.get(HUB_ENTRY_ID)` 读到同一份表单。
*/
const HUB_ENTRY_ID = "skill-hub";
/**
* Hub config defaults — the single source every layer reads: the cordis
* schema (index.ts), the host's saved-override merge, and the routes'
* fallback view. Changing a default here changes all three.
*/
const HUB_CONFIG_DEFAULTS = {
	enabled: true,
	announceToAgent: true,
	showUseCount: true,
	showUseTime: true,
	showGroupSummary: true,
	statsWindowDays: 14,
	statsScanMinutes: 5
};
/**
* Resolve the effective hub config: saved sidecar overrides win over the
* cordis composition entry (the web card owns runtime config), missing
* booleans fall back to HUB_CONFIG_DEFAULTS, and dot colors pass through
* (saved first, then base) only when set. Numeric stats knobs are clamped to
* their sane ranges (window ≥ 0, scan interval ≥ 1 minute).
*/
function resolveHubConfig(saved, base = {}) {
	const dotModelColor = saved.dotModelColor !== void 0 ? saved.dotModelColor : base.dotModelColor;
	const dotUserColor = saved.dotUserColor !== void 0 ? saved.dotUserColor : base.dotUserColor;
	const githubToken = saved.githubToken !== void 0 ? saved.githubToken : base.githubToken;
	const windowDays = clampNumber(saved.statsWindowDays ?? base.statsWindowDays, 0) ?? HUB_CONFIG_DEFAULTS.statsWindowDays;
	const scanMinutes = clampNumber(saved.statsScanMinutes ?? base.statsScanMinutes, 1) ?? HUB_CONFIG_DEFAULTS.statsScanMinutes;
	return {
		enabled: saved.enabled ?? base.enabled ?? HUB_CONFIG_DEFAULTS.enabled,
		announceToAgent: saved.announceToAgent ?? base.announceToAgent ?? HUB_CONFIG_DEFAULTS.announceToAgent,
		showUseCount: saved.showUseCount ?? base.showUseCount ?? HUB_CONFIG_DEFAULTS.showUseCount,
		showUseTime: saved.showUseTime ?? base.showUseTime ?? HUB_CONFIG_DEFAULTS.showUseTime,
		showGroupSummary: saved.showGroupSummary ?? base.showGroupSummary ?? HUB_CONFIG_DEFAULTS.showGroupSummary,
		statsWindowDays: windowDays,
		statsScanMinutes: scanMinutes,
		...dotModelColor !== void 0 ? { dotModelColor } : {},
		...dotUserColor !== void 0 ? { dotUserColor } : {},
		...githubToken !== void 0 ? { githubToken } : {}
	};
}
/** Clamp a numeric override into a valid value; undefined/invalid stays undefined. */
function clampNumber(value, min) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min) return void 0;
	return Math.floor(value);
}
/**
* Drop the GitHub token from a config-shaped object. Returns a copy, so the
* caller's own config layer keeps the token. Shared by the config route's GET
* and POST responses — neither may echo it back.
*/
function redactGithubToken(value) {
	const copy = { ...value };
	delete copy.githubToken;
	return copy;
}
/** HEX color validation shared by host routes and the settings card. */
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
/** GitHub token validation shared by host routes and the settings card. */
const GITHUB_TOKEN_RE = /^[A-Za-z0-9_\-]{8,255}$/;
//#endregion
//#region src/protocol/scopes.ts
/**
* 技能可见性策略（Scope）的共享契约：模式策略与工作区策略的数据模型、分组键
* 的构造与解析、以及 /presets、/scope、/workspaces、/workspace 端点的载荷形状。
*
* 两种策略的形状与语义完全相同（白名单），只是主体不同：模式策略按 preset 约束
* 会话，工作区策略按 DSH 工作区约束会话。两者是**覆盖**关系：工作区启用隔离时
* 由它独占生效，否则按模式策略，见 domain/scope-policy.ts 的 overridePolicyEntries。
*
* 这一层**不依赖任何宿主 SDK**：宿主半边（`domain/`、`enforcement/`、
* `routes/`）与浏览器半边（面板）都从这里 import 同一个词汇表，避免两侧对
* "分组键长什么样"各写一份而漂移。
*/
/** 分组键前缀。一个键要么指向一个分组，要么指向单个技能名。 */
const SCOPE_ENTRY_PREFIX = {
	/** 场景 tag：`tag:<tagId>`。 */
	tag: "tag:",
	/** 来源集合（origin）：`col:<collectionName>`。 */
	col: "col:",
	/** 来源根：`src:<source>`（user-dsh / project-dsh / …）。 */
	src: "src:",
	/** 单个技能：`skill:<name>`。 */
	skill: "skill:"
};
/** 场景 tag 的分组键。 */
function tagKey(id) {
	return SCOPE_ENTRY_PREFIX.tag + id;
}
/** 来源集合（origin）的分组键。 */
function collectionKey(name) {
	return SCOPE_ENTRY_PREFIX.col + name;
}
/** 来源根的分组键。 */
function sourceKey(source) {
	return SCOPE_ENTRY_PREFIX.src + source;
}
/** 单个技能的分组键（等价于把名字放进 `skills[]`）。 */
function skillKey(name) {
	return SCOPE_ENTRY_PREFIX.skill + name;
}
/**
* 拆一个分组键。
* @param key - 待解析的键。
* @returns 前缀种类与剩余标识；无法识别时返回 undefined（该键被当成悬空项）。
*/
function parseScopeEntry(key) {
	for (const kind of Object.keys(SCOPE_ENTRY_PREFIX)) {
		const prefix = SCOPE_ENTRY_PREFIX[kind];
		if (key.startsWith(prefix) && key.length > prefix.length) return {
			kind,
			value: key.slice(prefix.length)
		};
	}
}
/** 一个 preset id 的合法形状（与 dsh 的 PRESET_ID 同口径：一个路径段）。 */
const PRESET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** 一个工作区 id 的合法形状（uuid；与 preset 同口径的一个短标识）。 */
const WORKSPACE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/**
* 把任意输入清洗成一个策略。坏条目丢弃而不是整体拒绝——与 sidecar 其余
* 字段的容错口径一致；`presetId` 非法时返回 undefined（调用方据此 400）。
* @param raw - 未知形状的输入（sidecar 文档或 HTTP 体）。
* @returns 清洗后的策略，或 presetId 不可用时的 undefined。
*/
function normalizeScopePolicy(raw) {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
	const record = raw;
	const presetId = typeof record.presetId === "string" ? record.presetId.trim() : "";
	if (!PRESET_ID_RE.test(presetId)) return void 0;
	const groups = cleanKeys(record.groups);
	const skills = cleanNames(record.skills);
	return {
		presetId,
		enabled: record.enabled === true,
		groups,
		skills
	};
}
/**
* 把任意输入清洗成一个工作区策略。容错口径与 {@link normalizeScopePolicy}
* 完全一致；`workspaceId` 非法时返回 undefined。
* @param raw - 未知形状的输入（sidecar 文档或 HTTP 体）。
* @returns 清洗后的策略，或 workspaceId 不可用时的 undefined。
*/
function normalizeWorkspacePolicy(raw) {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
	const record = raw;
	const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId.trim() : "";
	if (!WORKSPACE_ID_RE.test(workspaceId)) return void 0;
	return {
		workspaceId,
		enabled: record.enabled === true,
		groups: cleanKeys(record.groups),
		skills: cleanNames(record.skills)
	};
}
/** 清洗分组键列表：仅保留可解析的键，去空去重，保序，受上限约束。 */
function cleanKeys(value) {
	if (!Array.isArray(value)) return [];
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const entry of value) {
		if (typeof entry !== "string" || entry === "") continue;
		const key = parseScopeEntry(entry) !== void 0 ? entry : isSkillNameShape(entry) ? skillKey(entry) : void 0;
		if (key === void 0 || seen.has(key)) continue;
		seen.add(key);
		out.push(key);
		if (out.length >= 2e3) break;
	}
	return out;
}
/** 清洗技能名列表：去空去重，保序，受上限约束。 */
function cleanNames(value) {
	if (!Array.isArray(value)) return [];
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const entry of value) {
		if (typeof entry !== "string" || entry === "" || seen.has(entry)) continue;
		seen.add(entry);
		out.push(entry);
		if (out.length >= 2e3) break;
	}
	return out;
}
/** 与 dsh 的 skill-name 语法同口径（kebab-case），只在清洗时做形状判断。 */
function isSkillNameShape(value) {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
//#endregion
//#region src/config.ts
/**
* 持久字段 schema（plain、非 volatile）：同一份定义既喂下面的 live 视图，也喂
* 设置页渲染的 wire 表单（`.toJSON()`）。`description` 是设置页每行显示的说明；
* `role('secret')` 让 settings 层在每次 wire 读时脱敏。
*/
const ConfigFields = {
	enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled).description("关闭后技能分组的路由、入口与公告全部下线。"),
	announceToAgent: z.boolean().default(HUB_CONFIG_DEFAULTS.announceToAgent).description("在系统提示中加入本插件说明，用户提到技能分组时 Agent 知道如何协作。"),
	dotModelColor: z.string().pattern(HEX_COLOR_RE).description("技能行与聊天「/」菜单中「模型可调」圆点的颜色（#rrggbb）。"),
	dotUserColor: z.string().pattern(HEX_COLOR_RE).description("技能行与聊天「/」菜单中「仅用户可调」圆点的颜色（#rrggbb）。"),
	showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount).description("在技能名旁显示调用次数。"),
	showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime).description("在技能名行显示最近调用时间。"),
	showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary).description("在分组标题后汇总调用次数与最近调用时间。"),
	statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays).description("只统计最近 N 天的使用次数；0 = 全部历史。"),
	statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes).description("后台扫描会话日志的间隔（分钟，最小 1）。"),
	githubToken: z.string().role("secret").description("市场/来源走 GitHub API：匿名每小时 60 次，填 token 后 5000 次。留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。")
};
/** 设置页编辑的 live 配置；字段顺序即设置页渲染的行顺序。 */
const Config = z.object({
	enabled: ConfigFields.enabled.volatile(),
	announceToAgent: ConfigFields.announceToAgent.volatile(),
	dotModelColor: ConfigFields.dotModelColor.volatile(),
	dotUserColor: ConfigFields.dotUserColor.volatile(),
	showUseCount: ConfigFields.showUseCount.volatile(),
	showUseTime: ConfigFields.showUseTime.volatile(),
	showGroupSummary: ConfigFields.showGroupSummary.volatile(),
	statsWindowDays: ConfigFields.statsWindowDays.volatile(),
	statsScanMinutes: ConfigFields.statsScanMinutes.volatile(),
	githubToken: ConfigFields.githubToken.volatile()
});
/**
* 本插件的配置命名空间 —— 0.1.7 起就是 Loader 入口 id（`cordis.patch.yml` 的
* insert id），不是包名。浏览器半边用同一个契约常量经
* `ctx.configForms.get(HUB_ENTRY_ID)` 解析同一张表单。
*/
const ENTRY_ID = HUB_ENTRY_ID;
/** 全部配置字段，顺序与设置页渲染顺序一致（用于遍历 volatile 引用）。 */
const CONFIG_FIELDS = [
	"enabled",
	"announceToAgent",
	"dotModelColor",
	"dotUserColor",
	"showUseCount",
	"showUseTime",
	"showGroupSummary",
	"statsWindowDays",
	"statsScanMinutes",
	"githubToken"
];
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const SKILL_HUB_GUIDANCE = ["本机已安装 skill-hub 插件（DSH Web GUI 技能分组）：设置 →「技能分组」分区为管理主页；本插件的配置卡片（启用/公告开关）在插件管理页——侧边栏「插件」→ 本插件。能力：完整本地技能目录（走官方 ctx.skills 注册表，含第三方 provider 提供的来源）；按来源与自定义场景分组浏览，分组/来源头部的滑动开关可一键开启/关闭整组（跨组冲突时询问）；技能开关是运行时的：只写本插件自己的侧车状态，不改技能文件、不改文件名，因此对只读来源同样生效；市场：内置市场目录（精选仓库一键添加）加自定义仓库源，扫描后勾选安装，每个市场源行显示已装/可更新/上游已删数量，支持「检查全部」与「全部更新」；来源跟踪：从 GitHub 仓库（市场源或直接地址）导入的技能记录上游 repo/commit 快照，可检查更新、选择同步；上游删除只如实报告，本地副本不动，由用户自己决定是否清理；个人技能（无来源记录）不跟踪；调用次数与最近使用时间统计；查看技能正文；发现诊断；新建技能向导（写入 ~/.dsh/skills 或 ~/.agents/skills）。模式级技能隔离：设置 →「技能分组」→「模式」把场景/来源分组或单个技能绑到某个 agent preset 上；该模式启用隔离后，只有勾选的技能对它的会话可见（模型目录与显式调用同时失效），其他模式完全不受影响；实现方式是把一个遮蔽 provider 接进该 preset 的作用域，不改任何 preset 文件，也不动技能文件。全局关闭与模式隔离正交：前者让技能在所有模式消失，后者只在指定模式消失。本插件不提供删除：技能文件请自行管理。路由仅回环可访问。用户提到「技能管理 / 技能列表 / 技能开关 / 技能同步 / 技能市场 / 更新技能 / 新建技能」时即指本插件，请据此协作。", "The skill-hub plugin is installed (the DSH Web GUI skill groups): Settings → \"Skill Groups\" is the management page; the plugin's configuration card (enable / announcement toggles) lives on its own page in the Plugins manager (sidebar → 插件 → the plugin). Capabilities: full local skill catalog (via the official ctx.skills registry, including sources contributed by third-party providers); browsing by source and by custom scenes, each group header carrying a sliding switch to turn the whole group on or off in one click (cross-group conflicts prompt the user); the per-skill switch is runtime-only: it writes this plugin's own sidecar state and never edits or renames skill files, so it works for read-only sources too; market: a built-in catalog of curated repos (one-click add) plus custom repo sources, scan-and-install import, per-source installed / updatable / deleted-upstream badges with \"check all\" and \"update all\" actions; upstream source tracking: skills imported from GitHub repos (market sources or direct URLs) record the repo/commit snapshot, support update checks and selective sync; an upstream deletion is only reported — the local copy is left alone and the user decides what to clean up; personal skills (no source record) are never tracked; invocation counts and last-used times; skill body inspection; discovery diagnostics; new-skill wizard (writes to ~/.dsh/skills or ~/.agents/skills). Mode-level skill isolation: Settings → Skill Groups → Modes binds scenes, source collections, or individual skills to an agent preset; once a mode enables isolation, only the checked skills stay visible to its sessions (both the model catalog and explicit loads stop working for the rest) while every other mode is untouched. It works by attaching a shadowing provider to that preset scope — no preset file is edited and no skill file is touched. Global switching off and mode isolation are orthogonal: the former hides a skill everywhere, the latter only in the named modes. This plugin deletes nothing: manage skill files yourself. Routes are loopback-only. When the user mentions \"skill management / skill list / skill toggle / skill sync / skill market / update skills / new skill\", this plugin is what they mean — collaborate accordingly."].join("\n\n");
//#endregion
//#region src/domain/scope-policy.ts
/**
* 策展层 · 可见性策略的纯语义：把一个**白名单策略**（分组键 + 技能名）展开成
* "该主体可见 / 隐藏哪些技能"。模式策略与工作区策略共用这一份判定，会话上的
* 实际效果是**工作区覆盖模式**，见 {@link overridePolicyEntries}。
*
* 本模块**零 IO、零副作用**：输入是策略、分组索引与目录全集，输出是名字集合。
* 一切副作用（读写 sidecar、扫描目录、注入 provider）都在调用方。这样
* `enforcement` 与 `routes` 两侧共用同一份判定，且判定本身可以被穷举测试。
*/
/**
* 把白名单展开成技能名集合。**不解释 `enabled`**——那属于调用方的策略语义，
* 见 {@link resolveScopeVisibility}。
*
* 展开按 `groups` 在前、`skills` 在后依次累加，保证同一输入下结果稳定；
* 所有结果都裁剪到 `index.known`，因此指向已删除技能的分组不会凭空"复活"它。
* @param policy - 待展开的策略。
* @param index - 分组成员与目录快照。
* @returns 可见集合、逐键明细与悬空键。
*/
function expandScopePolicy(policy, index) {
	const visibleSet = /* @__PURE__ */ new Set();
	const resolved = {};
	const dangling = [];
	for (const key of policy.groups) {
		const parsed = parseScopeEntry(key);
		if (parsed === void 0) {
			resolved[key] = [];
			dangling.push(key);
			continue;
		}
		if (parsed.kind === "skill") {
			const hit = index.known.has(parsed.value) ? [parsed.value] : [];
			resolved[key] = [.../* @__PURE__ */ new Set([...resolved[key] ?? [], ...hit])];
			for (const name of hit) visibleSet.add(name);
			continue;
		}
		const members = index.members.get(key);
		if (members === void 0) {
			resolved[key] = [];
			dangling.push(key);
			continue;
		}
		const kept = [...new Set(members.filter((name) => index.known.has(name)))].sort((a, b) => a.localeCompare(b));
		resolved[key] = kept;
		for (const name of kept) visibleSet.add(name);
	}
	for (const name of policy.skills) {
		if (!index.known.has(name)) continue;
		const key = `skill:${name}`;
		resolved[key] = [.../* @__PURE__ */ new Set([...resolved[key] ?? [], name])];
		visibleSet.add(name);
	}
	return {
		visible: [...visibleSet].sort((a, b) => a.localeCompare(b)),
		visibleSet,
		resolved,
		dangling: [...new Set(dangling)]
	};
}
/**
* 解析一个策略最终生效的可见性。这是 host、gate 与面板**唯一**的判定入口。
*
* `enabled === false`（默认）时不做任何限制：`visible` 为全集、`hidden` 为空
* ——策略仍然被展开并返回，面板据此算每个分组贡献了多少成员、哪些键已悬空。
* @param policy - 待判定的策略（模式、工作区，或覆盖后择一生效的那份）。
* @param index - 分组成员与目录快照。
* @param all - 目录中全部技能名（升序不必保证，本函数会排序）。
* @returns 判定结果。
*/
function resolveScopeVisibility(policy, index, all) {
	const expanded = expandScopePolicy(policy, index);
	const sorted = [...all].sort((a, b) => a.localeCompare(b));
	if (!policy.enabled) return {
		enabled: false,
		visible: sorted,
		hidden: [],
		resolved: expanded.resolved,
		dangling: expanded.dangling
	};
	return {
		enabled: true,
		visible: sorted.filter((name) => expanded.visibleSet.has(name)),
		hidden: sorted.filter((name) => !expanded.visibleSet.has(name)),
		resolved: expanded.resolved,
		dangling: expanded.dangling
	};
}
/**
* 缓存键：策略内容 + 目录内容都变了才算失效。用于 host 侧避免每次 gate
* 询问都重算展开（gate 由注册表的收集缓存间接节流，但仍可能被连打）。
* @param policy - 待缓存的策略（模式、工作区，或覆盖后择一生效的那份）。
* @param all - 目录全集的当前快照。
* @returns 稳定的字符串键。
*/
function scopeCacheKey(policy, all) {
	return JSON.stringify({
		e: policy.enabled,
		g: [...policy.groups].sort(),
		s: [...policy.skills].sort(),
		a: [...all].sort()
	});
}
/**
* 取一个会话"谁说了算"的生效策略：**工作区覆盖模式**。
*
* 工作区一旦启用隔离，它的白名单就是该工作区目录下所有会话的全部约束，模式策略
* 不再参与；工作区没启用（没有这条策略，或开关关着）时才回落到模式策略。
* 两边都没启用时不约束任何技能（`enabled: false`），与
* {@link resolveScopeVisibility} 对未启用的定义一致。
*
* 覆盖的是**整份策略**而不是逐键取舍：工作区没勾的键不会被模式补上——这正是
* "工作区说了算"的含义，也让判定保持可穷举。
* @param base - 落回用的策略（模式）。
* @param override - 优先的策略（工作区）；只有 `enabled` 为真时才接管。
* @returns 生效策略：`override` 启用时就是它，否则就是 `base`（可能未配置）。
*/
function overridePolicyEntries(base, override) {
	const winner = override?.enabled === true ? override : base;
	if (winner === void 0) return {
		enabled: false,
		groups: [],
		skills: []
	};
	return {
		enabled: winner.enabled === true,
		groups: [...winner.groups],
		skills: [...winner.skills]
	};
}
//#endregion
//#region src/domain/scope-view.ts
/**
* 策展层 · 可见性判定的宿主视图：把 sidecar 里的策略、侧栏的分组成员、以及
* 注册表的目录快照拼成"某个主体此刻可见/隐藏哪些技能"。主体可以是模式，也可以
* 是工作区，还可以是覆盖后择一生效的那份策略——判定只看策略的内容，不看它挂在谁身上。
*
* 它是 `enforcement` 与 `routes` 共用的**唯一数据入口**：gate 从这里取遮蔽
* 名单，面板从这里取可见性判定。所有 IO 都通过注入的函数发生（`catalog` / `groups`
* / `policyOf`），因此本模块可以在测试里用内存替身完整驱动。
*
* 缓存分两级：目录与分组按 `invalidate()` 全清（目录变更、分组变更、策略变更
* 都调它），每份策略的判定按"策略内容 + 目录内容"的键缓存——所以一次目录
* 变更不会让未受影响的策略重算，模式与工作区覆盖合成出的策略也能直接命中。
*/
/** 目录快照的稳定摘要：名字与各自来源任一变化，分组都必须重新展开。 */
function snapshotKey(snapshot) {
	return snapshot.names.map((name) => name + "" + (snapshot.meta.get(name)?.source ?? "")).join("\0");
}
/** 未配置的模式按"不隔离"参与判定。 */
function unrestricted(presetId) {
	return {
		presetId,
		enabled: false,
		groups: [],
		skills: []
	};
}
/**
* 标记"当前 async 流正处在本视图的目录读取里"。
*
* 正常情况下目录读取（`ctx.skills.snapshot()`）不会回调本视图：gate 只注册在
* preset 的 layer，global 快照看不见它。但一旦 gate 被错误地注册进 global
* layer（例如跨副本 dsh-scope 的 Symbol 不匹配），链路就会变成
* `snapshot → skills.snapshot → gate.list → hiddenFor → snapshot`，而 snapshot
* 缓存的正是**同一个未完成 promise** —— 无限等待、无异常、无 CPU 占用。
*
* 用 AsyncLocalStorage 精确识别"重入自我们自己的目录读取"：只有这种调用降级为
* 上一次的目录快照，其他并发调用照常共享同一个 promise 并正常完成。
*/
const insideCatalogRead = new AsyncLocalStorage();
/** 目录读取重入时的兜底快照（没有更早的可用快照时）。 */
function emptySnapshot() {
	return {
		names: [],
		meta: /* @__PURE__ */ new Map()
	};
}
/**
* 叠加上"全局运行时关闭"：关闭的技能对**所有**模式都不可见，与模式自己的
* 白名单隔离正交。关闭名单里的名字必须真实存在于目录快照里，否则跳过——
* 一条指向已消失技能的记录不该凭空制造遮蔽候选。
*/
function withClosed(visibility, closed, known) {
	if (closed.size === 0) return visibility;
	const hiddenSet = new Set(visibility.hidden);
	for (const name of closed) if (known.has(name)) hiddenSet.add(name);
	const hidden = [...hiddenSet].sort((a, b) => a.localeCompare(b));
	const visible = visibility.visible.filter((name) => !hiddenSet.has(name));
	return {
		...visibility,
		enabled: visibility.enabled || hidden.length > 0,
		visible,
		hidden
	};
}
/**
* 模式可见性视图。生命周期与 hub 的宿主半边一致：`invalidate()` 由目录变更、
* 分组变更、策略变更与设置同步触发。
*/
var ScopeView = class {
	deps;
	catalogTtlMs;
	/**
	* 目录快照 + 它的读取时刻。**必须带 TTL**：技能文件也可能在 hub 之外被
	* 增删（手工放进 `~/.dsh/skills`、别的工具写入），那条路径不会经过
	* `invalidate()`；没有 TTL 的话，新出现的技能既不进可见集也不进隐藏集，
	* 于是在"该隔离它的模式"里漏网。判定本身另有内容键缓存，所以 TTL 到期只
	* 重读一次目录，不会重算没变化的模式。
	*/
	catalog;
	/** 最近一次成功完成的目录快照；目录读取被重入时用它兜底。 */
	lastSnapshot;
	/** 分组成员表的 promise，附它对应的快照摘要。 */
	groups;
	/** 判定缓存，键为策略内容 + 目录内容 + 关闭名单的摘要（与主体身份无关）。 */
	visibility = /* @__PURE__ */ new Map();
	/**
	* @param deps - 宿主注入的 IO。
	* @param catalogTtlMs - 目录快照的最长存活时间；默认与面板轮询同周期。
	*/
	constructor(deps, catalogTtlMs = 5e3) {
		this.deps = deps;
		this.catalogTtlMs = catalogTtlMs;
	}
	/** 丢弃全部缓存。目录、分组或策略任一变化后调用。 */
	invalidate() {
		this.catalog = void 0;
		this.lastSnapshot = void 0;
		this.groups = void 0;
		this.visibility.clear();
	}
	/** 当前目录快照（invalidate 或 TTL 到期后重读）。 */
	snapshot() {
		if (insideCatalogRead.getStore() === true) return Promise.resolve(this.lastSnapshot ?? emptySnapshot());
		const now = Date.now();
		if (this.catalog === void 0 || now - this.catalog.at >= this.catalogTtlMs) {
			const value = insideCatalogRead.run(true, () => this.deps.catalog()).then((snapshot) => {
				this.lastSnapshot = snapshot;
				return snapshot;
			});
			value.catch(() => {
				if (this.catalog?.value === value) this.catalog = void 0;
			});
			this.catalog = {
				at: now,
				value
			};
		}
		return this.catalog.value;
	}
	/**
	* 一个模式自己那份策略的可见性判定（面板列表用；不含工作区维度）。
	* @param presetId - preset id；未配置时按"不隔离"返回，仍带展开明细。
	* @returns 判定结果（可见名单、隐藏名单、逐键明细、悬空键）。
	*/
	async visibilityOf(presetId) {
		return this.visibilityFor(await this.deps.policyOf(presetId) ?? unrestricted(presetId));
	}
	/**
	* 任意一份策略的可见性判定（覆盖后的生效策略也走这里）。这是唯一的计算入口：
	* 判定与主体身份无关，只与策略内容、分组成员、目录与全局关闭名单有关。
	* @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
	* @returns 判定结果。
	*/
	async visibilityFor(policy) {
		const snapshot = await this.snapshot();
		const closed = await this.deps.closed();
		const key = scopeCacheKey(policy, snapshot.names) + "" + [...closed].sort().join("\0");
		const cached = this.visibility.get(key);
		if (cached !== void 0) return cached;
		const value = withClosed(resolveScopeVisibility(policy, {
			members: await this.groupIndex(snapshot),
			known: new Set(snapshot.names)
		}, snapshot.names), closed, new Set(snapshot.names));
		if (this.visibility.size >= 128) this.visibility.clear();
		this.visibility.set(key, value);
		return value;
	}
	/**
	* 一份策略需要被 gate 遮蔽的技能及其元数据（隔离 ∪ 全局运行时关闭）。
	* 没有任何需要遮蔽的技能时返回空表——gate 因此完全不干预该作用域。
	* @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
	* @returns 技能名 → 元数据；空表表示不需要遮蔽。
	*/
	async hiddenFor(policy) {
		const result = /* @__PURE__ */ new Map();
		const visibility = await this.visibilityFor(policy);
		if (visibility.hidden.length === 0) return result;
		const snapshot = await this.snapshot();
		for (const name of visibility.hidden) {
			const meta = snapshot.meta.get(name);
			if (meta !== void 0) result.set(name, meta);
		}
		return result;
	}
	/**
	* 一个模式自己那份策略需要被遮蔽的技能（不含工作区维度）。覆盖语义由
	* 装配层（scope-assembly）负责，它拿到两侧策略后走 {@link hiddenFor}。
	* @param presetId - preset id。
	* @returns 技能名 → 元数据。
	*/
	async hiddenOf(presetId) {
		return this.hiddenFor(await this.deps.policyOf(presetId) ?? unrestricted(presetId));
	}
	/** 按目录快照摘要复用分组成员表。 */
	groupIndex(snapshot) {
		const key = snapshotKey(snapshot);
		if (this.groups !== void 0 && this.groups.key === key) return this.groups.value;
		const value = this.deps.groups(snapshot);
		this.groups = {
			key,
			value
		};
		return value;
	}
};
//#endregion
//#region src/error-text.ts
/**
* 错误文案收敛：宿主各处把 unknown 异常转成一行可读文字。原先这条表达式
* 在宿主侧内联了 22 次（`error instanceof Error ? error.message : String(error)`），
* 现在统一走这里。浏览器半有自己的 `helpers.errorMessage`，两半互不引用。
*
* Error 的 `cause` 链（undici 的 `fetch failed`、AggregateError 的多地址
* 失败、TLS 证书错误等）以括号附录带出，避免只剩笼统的顶层 message。
*/
/** cause 链最大展开深度，防自引用/超深链。 */
const MAX_CAUSE_DEPTH = 4;
/** 合成一条 cause 细节；code 已在 message 里则不重复。 */
function causeDetail(message, code) {
	const text = message.trim();
	if (code === "") return text;
	if (text === "") return "[" + code + "]";
	return text.includes(code) ? text : text + " [" + code + "]";
}
/** 深度受限地收集 cause 链细节（AggregateError 展开其 errors）。 */
function collectCauseDetails(cause, depth, seen, out) {
	if (depth > MAX_CAUSE_DEPTH || cause === null || cause === void 0 || seen.has(cause)) return;
	seen.add(cause);
	if (cause instanceof Error) {
		const errors = cause.errors;
		if (Array.isArray(errors)) for (const item of errors) collectCauseDetails(item, depth + 1, seen, out);
		const rawCode = cause.code;
		const code = typeof rawCode === "string" ? rawCode : "";
		const detail = causeDetail(cause.message, code);
		if (detail !== "") out.push(detail);
		collectCauseDetails(cause.cause, depth + 1, seen, out);
		return;
	}
	const detail = causeDetail(String(cause), "");
	if (detail !== "") out.push(detail);
}
/** 从 unknown 异常取出可读文案；非 Error 值用 String 兜底，cause 附在括号里。 */
function errorText(error) {
	if (!(error instanceof Error)) return String(error);
	const details = [];
	collectCauseDetails(error.cause, 1, /* @__PURE__ */ new Set(), details);
	for (let index = details.length - 1; index >= 0; index -= 1) if (details[index] === error.message || details.indexOf(details[index]) !== index) details.splice(index, 1);
	if (details.length === 0) return error.message;
	const suffix = details.join("; ");
	return error.message === "" ? suffix : error.message + " (" + suffix + ")";
}
/** gate provider 在注册表里的名字；同名 provider 在同一层只能有一个。 */
const GATE_PROVIDER_NAME = "skill-hub-gate";
/** 元数据缺失时的兜底描述（`validateCandidate` 要求非空字符串）。 */
const FALLBACK_DESCRIPTION = "hidden in this agent preset by skill-hub";
/**
* 一个 preset 作用域里的闸门。实例由 {@link PresetGateProvider} 的构造方
* 持有，`readHidden` 是闭包——它直接读宿主的 {@link ScopeView}，不走服务
* 查找，因此 gate 不需要知道自己属于哪个 preset，也不需要再问一次。
*/
var PresetGateProvider = class {
	presetId;
	readHidden;
	name = GATE_PROVIDER_NAME;
	/**
	* @param presetId - 该实例负责的 preset（只用于日志与诊断）。
	* @param readHidden - 按会话工作目录读取当前应被遮蔽的技能及元数据；
	*   空表表示不干预（`cwd` 缺省时只算模式策略）。
	*/
	constructor(presetId, readHidden) {
		this.presetId = presetId;
		this.readHidden = readHidden;
	}
	/**
	* 只返回被隐藏技能的同名遮蔽候选；可见技能一律不返回，让真正发现它们的
	* provider 在自己的秩上正常胜出。
	* @param options - 注册表转发给 provider 的查找上下文（工作目录 + 取消信号）。
	* @returns 遮蔽候选列表。
	*/
	async list(options) {
		const hidden = await this.readHidden(options.cwd);
		options.signal?.throwIfAborted();
		if (hidden.size === 0) return [];
		const candidates = [];
		for (const [name, meta] of hidden) candidates.push({
			name,
			description: meta.description !== "" ? meta.description : FALLBACK_DESCRIPTION,
			...meta.whenToUse !== void 0 && meta.whenToUse !== "" ? { whenToUse: meta.whenToUse } : {},
			invocation: {
				modelInvocable: false,
				userInvocable: false
			},
			source: meta.source,
			provider: this.name,
			rank: 0,
			locator: {
				presetId: this.presetId,
				name
			}
		});
		return candidates;
	}
	/**
	* 被遮蔽的技能一律不可加载——这是"遮蔽"能挡住显式调用的关键。
	* @param _candidate - 注册表选中的候选（本 provider 恒不加载）。
	* @param _options - 查找上下文（未使用）。
	* @returns 恒为 undefined。
	*/
	async get(_candidate, _options) {}
};
//#endregion
//#region src/enforcement/scope-wiring.ts
/**
* 自检 gate 这次注册到底落在哪一层。
*
* 这是对"跨副本 dsh-scope 的 Symbol 不匹配 → 静默落进 global layer → 与
* ScopeView 互等挂死"的**运行时保险**：注册完立刻读注册表的 layer 表，
* 落错就回滚。结构读不到（宿主换了存储形状）时返回 undefined，交给
* ScopeView 的重入守卫兜底，绝不影响正常接线。
* @param skills - 子 ctx 上解析到的 SkillRegistry 服务。
* @param key - 本次接线目标的 standing scope key。
* @returns 'scoped'（正确）、'global'（危险）或 undefined（无法判断）。
*/
function gateLayerOf(skills, key) {
	const layers = skills?.layers;
	if (layers === void 0) return void 0;
	if (layers.scoped?.get(key)?.providers?.has("skill-hub-gate") === true) return "scoped";
	if (layers.global?.providers?.has("skill-hub-gate") === true) return "global";
}
/**
* 把闸门接到 preset 作用域上的接线器。一个 hub 实例持有一个。
*/
var PresetWiring = class {
	deps;
	injected = /* @__PURE__ */ new Map();
	/** 已解析的运行时能力。**只缓存成功**：服务晚到（软注入）时下一轮 sync 能跟上。 */
	bindings;
	/** 当前不可用原因；与上一次相同时不重复刷日志。 */
	unavailable;
	/** 上一次记录的不可用原因（日志去重）。 */
	lastReason;
	/** 正在进行的一轮 sync；并发调用共享它而不重复注入。 */
	syncing;
	/** 已警告过"mount 没有 scoped ctx"的 preset（避免 5 秒 tick 刷屏）。 */
	warnedNoCtx = /* @__PURE__ */ new Set();
	/** 已警告过 global layer 里有 gate 残留（日志去重）。 */
	warnedGlobalGate = false;
	/** 已警告过无法自检注册落点（日志去重）。 */
	warnedUnverifiable = false;
	disposed = false;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* 跑一轮同步：清理失效注入（mount 消失或策略关闭），补上缺失的注入
	* （已挂载且策略启用）。并发调用共享同一轮。
	*/
	sync() {
		if (this.disposed) return Promise.resolve();
		this.syncing ??= this.runSync().finally(() => {
			this.syncing = void 0;
		});
		return this.syncing;
	}
	/**
	* 通知某个 preset 的闸门"策略变了"，让注册表丢弃已完成的目录缓存，
	* 从而在会话的下一个 turn 生效。
	* @param presetId - 目标 preset。
	*/
	invalidate(presetId) {
		for (const entry of this.injected.values()) {
			if (entry.presetId !== presetId) continue;
			try {
				entry.control?.invalidate();
			} catch (error) {
				this.log("warn", `invalidating the gate for preset "${presetId}" failed: ${errorText(error)}`);
			}
		}
	}
	/**
	* 通知**全部**已接线的闸门刷新缓存。目录变化（新增/删除/重命名技能）后调用，
	* 让每个模式的隐藏集合按新目录重算。
	*/
	invalidateAll() {
		for (const entry of this.injected.values()) try {
			entry.control?.invalidate();
		} catch (error) {
			this.log("warn", `invalidating the gate for preset "${entry.presetId}" failed: ${errorText(error)}`);
		}
	}
	/** 当前接线状态（面板与诊断用）。 */
	async status() {
		const runtime = await this.load();
		if (runtime === void 0) return {
			available: false,
			...this.unavailable !== void 0 ? { reason: this.unavailable } : {},
			active: this.activeIds(),
			mounted: []
		};
		return {
			available: true,
			active: this.activeIds(),
			mounted: await this.mountedIds(runtime)
		};
	}
	/** 拆掉全部注入并停止后续同步（插件卸载路径）。 */
	async dispose() {
		this.disposed = true;
		const entries = [...this.injected.entries()];
		this.injected.clear();
		for (const [, entry] of entries) await this.disposeEntry(entry);
	}
	async runSync() {
		const runtime = await this.load();
		if (runtime === void 0) return;
		let mounts;
		try {
			mounts = await runtime.livePresetMounts(this.deps.ctx.root.fiber);
		} catch (error) {
			this.log("warn", `enumerating preset mounts failed: ${errorText(error)}`);
			return;
		}
		const live = /* @__PURE__ */ new Map();
		for (const mount of mounts) if (mount.key !== void 0) live.set(mount.key, mount);
		for (const [key, entry] of [...this.injected]) {
			const stillMounted = live.has(key);
			const stillEnforced = stillMounted && await this.enforced(entry.presetId);
			if (stillMounted && stillEnforced) continue;
			this.injected.delete(key);
			await this.disposeEntry(entry);
		}
		for (const [key, mount] of live) {
			if (this.injected.has(key)) continue;
			if (!await this.enforced(mount.presetId)) continue;
			await this.install(mount);
		}
	}
	/**
	* 解析运行时能力。**不缓存失败**：`agentPresets` 是软注入，服务晚到时
	* 下一轮 sync 必须能重新探测，否则整个进程生命周期都停在"不可用"。
	*/
	async load() {
		if (this.bindings !== void 0) return this.bindings;
		try {
			const runtime = await this.deps.runtime();
			if (runtime === void 0) {
				this.markUnavailable("agent-presets service is not mounted (or does not expose acquireScope)");
				return;
			}
			this.bindings = runtime;
			this.markAvailable();
			return runtime;
		} catch (error) {
			this.markUnavailable(errorText(error));
			return;
		}
	}
	/** 记录不可用原因；同一原因只打一次日志。 */
	markUnavailable(reason) {
		this.unavailable = reason;
		if (this.lastReason === reason) return;
		this.lastReason = reason;
		this.log("warn", "preset scope wiring unavailable: " + reason);
	}
	markAvailable() {
		this.unavailable = void 0;
		this.lastReason = void 0;
	}
	/** global layer 里已有 gate 残留时提示一次（本实例无法注销别人的注册）。 */
	warnGlobalGateOnce() {
		if (this.warnedGlobalGate) return;
		this.warnedGlobalGate = true;
		this.log("warn", `a "${GATE_PROVIDER_NAME}" provider is already present in the GLOBAL skill layer; this hub cannot remove it — restart dsh to clear it. Preset gates are still attached to their scoped layers.`);
	}
	/** 宿主注册表结构不可自检时提示一次：仍有 ScopeView 的重入守卫兜底。 */
	warnUnverifiableOnce() {
		if (this.warnedUnverifiable) return;
		this.warnedUnverifiable = true;
		this.log("warn", "cannot verify the gate registration layer on this dsh build; relying on the catalog re-entrancy guard to prevent a self-deadlock");
	}
	/** 策略是否启用；查询失败按"不启用"处理（宁可不遮蔽也不误伤）。 */
	async enforced(presetId) {
		try {
			return await this.deps.isEnforced(presetId);
		} catch (error) {
			this.log("warn", `reading the scope policy for preset "${presetId}" failed: ${errorText(error)}`);
			return false;
		}
	}
	/** 在一个 preset 的 standing scope 上注入闸门。 */
	async install(mount) {
		const { presetId } = mount;
		const key = mount.key;
		if (key === void 0) return;
		if (mount.ctx === void 0) {
			if (!this.warnedNoCtx.has(presetId)) {
				this.warnedNoCtx.add(presetId);
				this.log("warn", `preset "${presetId}" is mounted but exposes no scoped context; gate skipped`);
			}
			return;
		}
		this.warnedNoCtx.delete(presetId);
		const provider = new PresetGateProvider(presetId, (cwd) => this.deps.hiddenOf(presetId, cwd));
		let providerDispose;
		let failure;
		let failureReported = false;
		let fiber;
		const reportFailure = (error) => {
			failure = error;
			if (failureReported) return;
			failureReported = true;
			this.log("warn", `attaching the gate to preset "${presetId}" failed: ${errorText(error)}`);
		};
		const entry = {
			presetId,
			dispose: () => {
				try {
					providerDispose?.();
				} catch {}
				return fiber?.dispose();
			}
		};
		try {
			fiber = mount.ctx.plugin({
				inject: ["skills"],
				apply: (scoped) => {
					try {
						const before = gateLayerOf(scoped.skills, key);
						providerDispose = scoped.skills.registerProvider((given) => {
							entry.control = given;
							return provider;
						});
						const after = gateLayerOf(scoped.skills, key);
						if (after === "global" && before !== "global") {
							try {
								providerDispose?.();
							} catch {}
							providerDispose = void 0;
							throw new Error(`gate "${GATE_PROVIDER_NAME}" was registered into the GLOBAL skill layer instead of the preset scope; rolled back`);
						}
						if (before === "global") this.warnGlobalGateOnce();
						if (after === void 0 && before === void 0) this.warnUnverifiableOnce();
					} catch (error) {
						reportFailure(error);
						this.injected.delete(key);
						queueMicrotask(() => {
							fiber?.dispose();
						});
					}
				}
			});
		} catch (error) {
			reportFailure(error);
		}
		if (failure !== void 0) {
			if (fiber !== void 0) fiber.dispose();
			return;
		}
		this.injected.set(key, entry);
		this.log("info", `gate attached to preset "${presetId}"`);
	}
	/** 拆掉一条注入：只注销 hub 自己的子 fiber，宿主 preset 的 scope 不动。 */
	async disposeEntry(entry) {
		try {
			await entry.dispose();
			this.log("info", `gate detached from preset "${entry.presetId}"`);
		} catch (error) {
			this.log("warn", `detaching the gate from preset "${entry.presetId}" failed: ${errorText(error)}`);
		}
	}
	activeIds() {
		return [...new Set([...this.injected.values()].map((entry) => entry.presetId))].sort();
	}
	async mountedIds(runtime) {
		try {
			return [...new Set((await runtime.livePresetMounts(this.deps.ctx.root.fiber)).filter((mount) => mount.key !== void 0).map((mount) => mount.presetId))].sort();
		} catch {
			return [];
		}
	}
	log(level, message) {
		if (this.deps.log !== void 0) {
			this.deps.log(level, message);
			return;
		}
		if (level === "warn") console.warn("[skill-hub] " + message);
		else console.info("[skill-hub] " + message);
	}
};
/**
* 用注册表服务合成 `livePresetMounts`：逐个探测 preset 的挂载状态，并带上
* 宿主 mint 的 scoped context。
*
* `acquireScope(id)` 对**已挂载**的 preset 借出一个 revision 租约，租约里的
* `key` 就是该 preset 的 standing scope key；未挂载或激活失败的 preset 会抛
* `agent-preset/invalid`，据此判定"挂载中"。
*
* scoped context 取自注册表内部按同一个 key 索引的 revision 记录：那个 ctx 是
* **宿主的** `createScope` 创建的，tag 与宿主 `scopeOf()` 同源。绝不能用插件自己
* import 的 dsh-scope 去 mint scope —— 副本不同 → Symbol 不同 → 注册落进 global
* layer → 与 ScopeView 的回读形成死锁（见文件头）。
*
* 只借读数、立即归还租约：长期持有会顶住注册表的引用计数，让已退休的 revision
* 无法回收；而只要 preset 仍在挂载中，那个 standing key 就一直有效。
* @param service - `ctx.agentPresets`（缺席或形状不符时返回 undefined）。
* @returns 枚举函数，或服务不可用时的 undefined。
*/
function serviceMounts(service) {
	const candidate = service;
	if (candidate === null || candidate === void 0) return void 0;
	if (typeof candidate.list !== "function" || typeof candidate.acquireScope !== "function") return void 0;
	const generations = candidate.generations;
	if (!(generations instanceof Map)) return void 0;
	const scopedCtx = (key) => {
		return generations.get(key)?.scope?.ctx;
	};
	return async () => {
		let declared;
		try {
			declared = await candidate.list();
		} catch {
			return [];
		}
		if (!Array.isArray(declared)) return [];
		const mounts = [];
		for (const preset of declared) {
			const id = preset?.id;
			if (typeof id !== "string" || id === "") continue;
			try {
				const lease = await candidate.acquireScope(id);
				let mount;
				try {
					const key = lease?.key;
					if (typeof key === "object" && key !== null) {
						const ctx = scopedCtx(key);
						mount = {
							presetId: id,
							key,
							...ctx !== void 0 ? { ctx } : {}
						};
					}
				} finally {
					await lease?.[Symbol.asyncDispose]?.();
				}
				if (mount !== void 0) mounts.push(mount);
			} catch {}
		}
		return mounts;
	};
}
/**
* 读取宿主提供的接线能力。**不再 import 任何 dsh 包**：所有数据都来自
* `ctx.agentPresets`（软注入，每次现读，服务晚到或热重载都能跟上）。
*
* 服务缺席、形状不符或拿不到内部 revision 表时返回 undefined，接线器整体降级为
* "策略仅预览"——绝不冒把 provider 注册进 global layer 的风险。
* @param options.presets - `ctx.agentPresets` 软注入的读取器。
* @returns 可用的运行时绑定，或 undefined。
*/
async function loadScopeRuntime(options) {
	const mounts = serviceMounts(options.presets());
	return mounts === void 0 ? void 0 : { livePresetMounts: mounts };
}
//#endregion
//#region src/enforcement/roster.ts
/**
* 读取 preset 名单。
* @param service - `ctx.agentPresets`（形状不符时返回 undefined，调用方据此降级）。
* @returns 名单，或服务不可用时的 undefined。
*/
async function readPresetRoster(service) {
	const candidate = service;
	if (candidate === void 0 || candidate === null || typeof candidate.list !== "function") return void 0;
	let presets;
	try {
		presets = await candidate.list();
	} catch {
		return;
	}
	if (!Array.isArray(presets)) return void 0;
	const defaultId = typeof candidate.defaultId === "string" ? candidate.defaultId : void 0;
	const entries = [];
	const seen = /* @__PURE__ */ new Set();
	for (const preset of presets) {
		if (preset === null || typeof preset !== "object") continue;
		const id = typeof preset.id === "string" ? preset.id : "";
		if (id === "" || seen.has(id)) continue;
		seen.add(id);
		entries.push({
			id,
			...typeof preset.name === "string" && preset.name !== "" ? { name: preset.name } : {},
			...typeof preset.description === "string" && preset.description !== "" ? { description: preset.description } : {},
			trust: preset.trust === "system" ? "system" : "user",
			isDefault: id === defaultId,
			...typeof preset.broken === "string" && preset.broken !== "" ? { broken: preset.broken } : {}
		});
	}
	return entries;
}
//#endregion
//#region src/enforcement/workspace-roster.ts
/**
* 执行层 · 工作区名单：把 `ctx.workspaceRegistry` 的服务读数投影成面板需要的行。
*
* 与 {@link readPresetRoster} 同一口径：只做**只读投影**，不创建、不删除、不
* 推断。工作区的权威定义在 `dsh-workspace`，hub 只把"有哪些工作区、各自的目录、
* 标题与会话数"读出来，让设置界面能对着它们配置可见性。
*
* 服务本身没有静态依赖：`ctx.workspaceRegistry` 在缺包/形状不符时返回
* undefined，调用方据此把「工作区」tab 降级为只读，插件其余功能毫无感知。
*/
/**
* 读取工作区名单。
* @param service - `ctx.workspaceRegistry`（形状不符时返回 undefined，调用方据此降级）。
* @returns 名单，或服务不可用时的 undefined。
*/
async function readWorkspaceRoster(service) {
	const candidate = service;
	if (candidate === void 0 || candidate === null || typeof candidate.list !== "function") return void 0;
	let workspaces;
	try {
		workspaces = await candidate.list();
	} catch {
		return;
	}
	if (!Array.isArray(workspaces)) return void 0;
	const entries = [];
	const seen = /* @__PURE__ */ new Set();
	for (const workspace of workspaces) {
		if (workspace === null || typeof workspace !== "object") continue;
		const id = typeof workspace.id === "string" ? workspace.id : "";
		const path = typeof workspace.path === "string" ? workspace.path : "";
		if (id === "" || path === "" || seen.has(id)) continue;
		seen.add(id);
		const title = typeof workspace.title === "string" && workspace.title !== "" ? workspace.title : void 0;
		entries.push({
			id,
			path,
			...title !== void 0 ? { title } : {},
			sessionCount: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0
		});
	}
	return entries;
}
/**
* 会话工作目录 → 工作区 id。归属判定与 dsh 一致：**精确相等**（工作区的 `path`
* 在建档时已 realpath 规范化），子目录不算属于该工作区。cwd 没直接命中时才做一次
* 路径规范化兜底（会话 cwd 一般已是规范路径，这步只兜住软链与 `..` 之类）。
*
* @param entries - 工作区名单（来自 {@link readWorkspaceRoster}）。
* @param cwd - 会话工作目录；缺省或空串按"没有工作区"处理。
* @param normalize - 路径规范化实现，默认 `fs.realpath`；注入便于测试。
* @returns 命中的工作区 id，或 undefined（没有工作区 / 目录已不存在）。
*/
async function resolveWorkspaceId(entries, cwd, normalize = realpath) {
	if (cwd === void 0 || cwd === "") return void 0;
	const exact = entries.find((entry) => entry.path === cwd);
	if (exact !== void 0) return exact.id;
	let normalized;
	try {
		normalized = await normalize(cwd);
	} catch {
		return;
	}
	return entries.find((entry) => entry.path === normalized)?.id;
}
//#endregion
//#region src/env.ts
/**
* 进程环境路径：DSH 主目录与 agents 目录。
*
* 只依赖 node 内置模块，位于依赖图最底层——发现层（skillfs/）、策展层
* （store/）与组装点（index.ts）都要解析这两个目录。此前 `dshHome` 定义在
* `store/paths.ts`，逼得 skillfs 反向去引 store 的聚合 barrel。
*/
/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
/** Resolve the agents home directory (the user-agents root base). */
function agentsHome() {
	return process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents");
}
//#endregion
//#region src/skillfs/frontmatter.ts
/** Parse a SKILL.md the way the official filesystem provider does. */
function parseFrontmatter(text) {
	const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/.exec(text);
	if (match === null) return { error: "missing YAML frontmatter (--- block)" };
	let data;
	let rawFrontmatter = match[1];
	try {
		data = load(rawFrontmatter);
	} catch (error) {
		const repaired = repairFrontmatterScalarFields(rawFrontmatter);
		if (repaired !== null) try {
			data = load(repaired);
			rawFrontmatter = repaired;
		} catch {
			return { error: "invalid YAML frontmatter: " + errorText(error) };
		}
		else return { error: "invalid YAML frontmatter: " + errorText(error) };
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return { error: "frontmatter must be a YAML mapping" };
	const record = data;
	const name = typeof record.name === "string" ? record.name.trim() : "";
	if (name === "") return { error: "frontmatter requires a name field" };
	if (!isSkillName(name)) return { error: "invalid skill name \"" + name + "\" (must be kebab-case)" };
	const description = typeof record.description === "string" ? record.description.trim() : "";
	if (description === "") return { error: "frontmatter requires a description field" };
	const whenToUse = typeof record.whenToUse === "string" && record.whenToUse.trim() !== "" ? record.whenToUse.trim() : void 0;
	if (Object.hasOwn(record, "disableModelInvocation")) return { error: "frontmatter field \"disableModelInvocation\" is unsupported; use \"disable-model-invocation\"" };
	if (Object.hasOwn(record, "modelInvocable")) return { error: "frontmatter field \"modelInvocable\" is unsupported; use \"disable-model-invocation\"" };
	if (Object.hasOwn(record, "userInvocable")) return { error: "frontmatter field \"userInvocable\" is unsupported; use \"user-invocable\"" };
	let invocation;
	try {
		const disableModel = frontmatterBoolean(record, "disable-model-invocation");
		const userInvocable = frontmatterBoolean(record, "user-invocable");
		invocation = {
			modelInvocable: disableModel !== true,
			userInvocable: userInvocable !== false
		};
	} catch (error) {
		return { error: errorText(error) };
	}
	return { value: {
		name,
		description,
		...whenToUse !== void 0 ? { whenToUse } : {},
		invocation,
		content: (match[2] ?? "").trim()
	} };
}
/**
* Repair bare scalar fields that contain an unquoted colon (e.g. `description: Build for AWS: ECS`)
* or an invalid flow-like scalar (`@`, `` ` ``, `[`, `{`). Mirrors codex `repair_frontmatter_scalar_fields`:
* line-oriented, only touches lines where quoting makes the YAML valid, and preserves block scalars.
* Returns the repaired frontmatter string when at least one line was quoted, otherwise null.
*/
function repairFrontmatterScalarFields(frontmatter) {
	let changed = false;
	let blockScalarIndent = null;
	const repairedLines = [];
	for (const line of frontmatter.split("\n")) {
		const indent = line.search(/[^ ]/);
		const effectiveIndent = indent === -1 ? line.length : indent;
		if (blockScalarIndent !== null) {
			if (line.trim() === "" || effectiveIndent > blockScalarIndent) {
				repairedLines.push(line);
				continue;
			}
			blockScalarIndent = null;
		}
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			repairedLines.push(line);
			continue;
		}
		const key = line.slice(0, colonIndex);
		const value = line.slice(colonIndex + 1);
		if (key.trim() === "" || value.length === 0 || !/^\s/.test(value)) {
			repairedLines.push(line);
			continue;
		}
		const trimmedStart = value.trimStart();
		const leadingWhitespace = value.slice(0, value.length - trimmedStart.length);
		let scalar = trimmedStart;
		let comment = "";
		for (let idx = 0; idx < trimmedStart.length; idx += 1) if (trimmedStart[idx] === "#") {
			const prev = idx === 0 ? " " : trimmedStart[idx - 1];
			const next = idx + 1 < trimmedStart.length ? trimmedStart[idx + 1] : " ";
			if (/\s/.test(prev) && /\s/.test(next)) {
				const commentStart = trimmedStart.slice(0, idx).trimEnd().length;
				scalar = trimmedStart.slice(0, commentStart);
				comment = trimmedStart.slice(commentStart);
				break;
			}
		}
		scalar = scalar.trimEnd();
		if (scalar === "") {
			repairedLines.push(line);
			continue;
		}
		const firstChar = scalar[0];
		if (firstChar === "|" || firstChar === ">") {
			blockScalarIndent = effectiveIndent;
			repairedLines.push(line);
			continue;
		}
		if (firstChar === "'" || firstChar === "\"") {
			repairedLines.push(line);
			continue;
		}
		let hasColonSeparator = false;
		for (let i = 0; i < scalar.length - 1; i += 1) if (scalar[i] === ":" && /\s/.test(scalar[i + 1])) {
			hasColonSeparator = true;
			break;
		}
		let invalidFlowLike = false;
		if (firstChar === "[" || firstChar === "{" || firstChar === "@" || firstChar === "`") try {
			load(scalar);
		} catch {
			invalidFlowLike = true;
		}
		if (!hasColonSeparator && !invalidFlowLike) {
			repairedLines.push(line);
			continue;
		}
		const quotedScalar = "'" + scalar.replace(/'/g, "''") + "'";
		repairedLines.push(key + ":" + leadingWhitespace + quotedScalar + comment);
		changed = true;
	}
	return changed ? repairedLines.join("\n") : null;
}
/** Try to repair a SKILL.md's frontmatter in place (unquoted colon etc.). Returns the new file text or null when not fixable. */
function repairFrontmatterFileText(text) {
	const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/.exec(text);
	if (match === null) return null;
	const repaired = repairFrontmatterScalarFields(match[1]);
	if (repaired === null) return null;
	try {
		load(repaired);
	} catch {
		return null;
	}
	const body = match[2] ?? "";
	return "---\n" + repaired + "\n---" + (body !== "" ? "\n" + body : "");
}
/** Official boolean grammar: true/false, 1/0, and the common string spellings. */
function frontmatterBoolean(data, key) {
	if (!Object.hasOwn(data, key)) return void 0;
	const value = data[key];
	if (typeof value === "boolean") return value;
	if (value === 1 || value === "1") return true;
	if (value === 0 || value === "0") return false;
	if (typeof value === "string") switch (value.toLowerCase()) {
		case "true":
		case "yes":
		case "on": return true;
		case "false":
		case "no":
		case "off": return false;
	}
	throw new TypeError("frontmatter field \"" + key + "\" must be a boolean");
}
//#endregion
//#region src/skillfs/paths.ts
/** Root ids this module may write to. */
const WRITABLE_ROOTS = ["user-dsh", "user-agents"];
/** Resolve the absolute directory of one writable root. */
function rootPath(root, home = dshHome()) {
	switch (root) {
		case "user-dsh": return join(home, "skills");
		case "user-agents": return join(agentsHome(), "skills");
		default: throw new TypeError("unknown root: " + String(root));
	}
}
/** Root of an absolute skill file path, or undefined when not user-owned. */
function rootOfPath(path, home = dshHome()) {
	const normalized = resolve(path);
	for (const root of WRITABLE_ROOTS) {
		const base = resolve(rootPath(root, home));
		if (process.platform === "win32") {
			const n = normalized.toLowerCase();
			const b = base.toLowerCase();
			if (n === b) return root;
			if (n.startsWith(b + "/") || n.startsWith(b + "\\") || n.startsWith(b + sep)) return root;
			const rel = relative(base, normalized);
			if (rel !== "" && !rel.startsWith("../") && !rel.startsWith("..\\") && !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel)) return root;
		} else {
			if (normalized === base) return root;
			if (normalized.startsWith(base + sep) || normalized.startsWith(base + "/") || normalized.startsWith(base + "\\")) return root;
			const rel = relative(base, normalized);
			if (rel !== "" && !rel.startsWith(".." + sep) && !rel.startsWith("../") && !rel.startsWith("..\\") && rel !== ".." && !isAbsolute(rel)) return root;
		}
	}
}
/** Absolute directory of one skill under a writable root: <root>/<name>. */
function skillDir(root, name, home = dshHome()) {
	return join(rootPath(root, home), name);
}
/**
* The on-disk shapes of one skill under a writable root, in probe order: the
* directory bundle's SKILL.md, the bare directory (for directory-level
* metadata), then the flat <name>.md. Callers stat the list in order and stop
* at the first hit.
*/
function skillLocationCandidates(root, name, home = dshHome()) {
	const base = rootPath(root, home);
	const dir = join(base, name);
	return [
		join(dir, "SKILL.md"),
		dir,
		join(base, name + ".md")
	];
}
//#endregion
//#region src/skillfs/scan.ts
/**
* Scan one skills root for discovery files: directory bundles (SKILL.md)
* and flat <name>.md files. Legacy `.disabled` renames (an older hub version
* switched skills off by renaming their files) are ignored, as are
* dot-prefixed entries (including .trash and .system).
*/
async function scanRoot(base) {
	const entries = [];
	let names;
	try {
		names = await readdir(base);
	} catch (error) {
		if (error.code === "ENOENT") return entries;
		throw error;
	}
	for (const name of names) {
		if (name.startsWith(".")) continue;
		const absolute = join(base, name);
		let stats;
		try {
			stats = await stat(absolute);
		} catch {
			continue;
		}
		if (stats.isDirectory()) entries.push({
			path: join(absolute, "SKILL.md"),
			directory: absolute,
			kind: "directory"
		});
		else if (name.endsWith(".md") && !name.endsWith(".md.disabled")) entries.push({
			path: absolute,
			directory: base,
			kind: "flat"
		});
	}
	return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
/** Scan one writable root. */
function listSkillEntries(root, home = dshHome()) {
	return scanRoot(rootPath(root, home));
}
/** Read UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
async function readSkillInterface(directory) {
	const yamlPath = join(directory, "agents", "openai.yaml");
	let text;
	try {
		text = await readFile(yamlPath, "utf8");
	} catch {
		return;
	}
	let data;
	try {
		data = load(text);
	} catch {
		return;
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return void 0;
	const record = data;
	const iface = record.interface ?? record;
	const ifaceObj = typeof record.interface === "object" && record.interface !== null && !Array.isArray(record.interface) ? record.interface : iface;
	const cleanStr = (value, maxLen) => {
		if (typeof value !== "string") return void 0;
		const cleaned = value.split(/\s+/).join(" ").trim();
		if (cleaned === "" || cleaned.length > maxLen) return void 0;
		return cleaned;
	};
	const hexColor = (value) => {
		if (typeof value !== "string") return void 0;
		const trimmed = value.trim();
		return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : void 0;
	};
	const iconPath = (value) => {
		if (typeof value !== "string" || value.trim() === "") return void 0;
		const trimmed = value.trim().replace(/\\/g, "/");
		if (trimmed.startsWith("/") || trimmed.includes("..")) return void 0;
		if (!trimmed.startsWith("assets/")) return void 0;
		return trimmed;
	};
	const displayName = cleanStr(ifaceObj.display_name, 64);
	const shortDescription = cleanStr(ifaceObj.short_description, 1024);
	const brandColor = hexColor(ifaceObj.brand_color);
	const defaultPrompt = cleanStr(ifaceObj.default_prompt, 1024);
	const iconSmall = iconPath(ifaceObj.icon_small);
	const iconLarge = iconPath(ifaceObj.icon_large);
	if (!(displayName !== void 0 || shortDescription !== void 0 || brandColor !== void 0 || iconSmall !== void 0 || iconLarge !== void 0 || defaultPrompt !== void 0)) return void 0;
	return {
		...displayName !== void 0 ? { displayName } : {},
		...shortDescription !== void 0 ? { shortDescription } : {},
		...brandColor !== void 0 ? { brandColor } : {},
		...iconSmall !== void 0 ? { iconSmall } : {},
		...iconLarge !== void 0 ? { iconLarge } : {},
		...defaultPrompt !== void 0 ? { defaultPrompt } : {}
	};
}
/**
* Scan one writable root for files the provider ignores, so the GUI can
* show why a skill never appears — a missing or broken frontmatter must be
* visible, not silent.
*/
async function scanDiagnostics(root, home = dshHome()) {
	const diagnostics = [];
	for (const entry of await listSkillEntries(root, home)) {
		let text;
		try {
			text = await readFile(entry.path, "utf8");
		} catch (error) {
			if (error.code !== "ENOENT") diagnostics.push({
				path: entry.path,
				root,
				reason: "unreadable: " + errorText(error)
			});
			continue;
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) {
			const fixable = repairFrontmatterFileText(text) !== null;
			diagnostics.push({
				path: entry.path,
				root,
				reason: parsed.error,
				...fixable ? { fixable: true } : {}
			});
			continue;
		}
		if (repairFrontmatterFileText(text) !== null) diagnostics.push({
			path: entry.path,
			root,
			reason: "frontmatter contains unquoted colon/bracket (auto-repaired in memory; click Fix to persist)",
			fixable: true
		});
		const { value } = parsed;
		const pathName = entry.kind === "directory" ? basename(entry.directory) : basename(entry.path, ".md");
		if (value.name !== pathName) diagnostics.push({
			path: entry.path,
			root,
			reason: `frontmatter name "${value.name}" does not match the discovery path "${pathName}" (the provider registers by path)`
		});
		if (value.description.length < 10) diagnostics.push({
			path: entry.path,
			root,
			reason: `description is only ${value.description.length} chars; write a one-line description so agents can auto-activate this skill`
		});
	}
	return diagnostics;
}
//#endregion
//#region src/skillfs.ts
/**
* Skill filesystem operations for the writable roots: scaffolding a new skill
* bundle, deleting one the user asked for, and repairing discovery diagnostics
* in place.
*
* Switching a skill off is a runtime decision persisted in the sidecar and
* enforced by the per-preset gate, so it never touches discovery state. The one
* destructive operation here, {@link deleteSkillFiles}, runs only after the
* user confirms a staged deletion in the panel.
*
* Frontmatter parsing mirrors @deepseek-ai/dsh-skill-filesystem semantics:
* required name (kebab-case) + description, optional whenToUse, invocation
* booleans with the same defaults (modelInvocable defaults true,
* userInvocable defaults true), legacy keys rejected, and the returned
* content is the body after the frontmatter block, trimmed.
*/
/**
* Scaffold a directory-bundle skill: <root>/<name>/SKILL.md with a frontmatter
* template. Refuses non-kebab-case names.
* @param content Markdown body written after the frontmatter; when blank the
* scaffold placeholder paragraph is used instead.
* @returns the created SKILL.md path.
*/
async function createSkill(root, name, description, home = dshHome(), content = "") {
	if (!isSkillName(name)) throw new TypeError("skill name must be kebab-case (lowercase letters, digits, dashes): \"" + name + "\"");
	const dir = skillDir(root, name, home);
	const file = join(dir, "SKILL.md");
	await mkdir(dir, { recursive: true });
	const safeDescription = description.trim() === "" ? "New dsh skill created from the Skill Groups panel." : description.trim();
	const safeContent = content.trim();
	await writeFile(file, [
		"---",
		"name: " + dump(name).trim(),
		"description: " + dump(safeDescription).trim(),
		"---",
		"",
		...safeContent === "" ? [
			"# " + name,
			"",
			"Describe what this skill does, when the agent should use it, and what output is expected.",
			""
		] : [safeContent, ""]
	].join("\n"), "utf8");
	return file;
}
/**
* Delete a skill from disk. A directory bundle (`<root>/<name>/SKILL.md`) goes
* away whole, a flat `<root>/<name>.md` file on its own.
*
* The fence is re-checked here rather than trusted from the caller: a path
* outside the writable roots is refused. `rm` does not follow symlinks, so a
* bundle that is a link to a checkout elsewhere loses the link, not the source.
*
* @returns the removed path (bundle directory or flat file).
*/
async function deleteSkillFiles(filePath, home = dshHome()) {
	if (rootOfPath(filePath, home) === void 0) throw new TypeError("not a hub writable skill path: " + filePath);
	const stats = await lstat(filePath).catch(() => void 0);
	if (stats === void 0) throw new TypeError("skill is already gone from disk: " + filePath);
	const target = stats.isDirectory() ? filePath : basename(filePath) === "SKILL.md" ? dirname(filePath) : filePath;
	await rm(target, {
		recursive: true,
		force: true
	});
	return target;
}
/** Repair one file on disk when its frontmatter is auto-fixable. Returns the new text. */
async function fixDiagnosticFile(path, home = dshHome()) {
	if (rootOfPath(path, home) === void 0) throw new TypeError("not a hub writable skill path: " + path);
	const repairedText = repairFrontmatterFileText(await readFile(path, "utf8"));
	if (repairedText === null) throw new TypeError("diagnostic is not auto-fixable: " + path);
	const parsed = parseFrontmatter(repairedText);
	if ("error" in parsed) throw new TypeError("repaired frontmatter still invalid: " + parsed.error);
	await writeFile(path, repairedText, "utf8");
	return path;
}
//#endregion
//#region src/repo/github-client.ts
/**
* GitHub API 统一请求层：token 管理、鉴权头、ETag 缓存、错误映射、
* 带缓存的 JSON GET。从 repo.ts 抽出，原 6 处重复的 try/catch +
* headers + json 解析收敛到 fetchJson / fetchJsonCached 两个入口。
*/
/** Fetch failure carrying a useful HTTP status for the route layer. */
var RepoFetchError = class extends Error {
	status;
	constructor(message, status = 502) {
		super(message);
		this.name = "RepoFetchError";
		this.status = status;
	}
};
/**
* GitHub token for authenticated API calls. Read from GITHUB_TOKEN /
* GH_TOKEN at module load; setGithubToken() overrides it at runtime (the
* host calls it from the settings sync whenever the card value changes;
* an absent value falls back to the env var).
*/
let githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
/** Override the GitHub token at runtime ('' falls back to the env var). */
function setGithubToken(token) {
	githubToken = token !== void 0 && token !== "" ? token : process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
}
/** Authorization header for api.github.com / raw.githubusercontent.com calls. */
function githubAuthHeaders() {
	return githubToken === "" ? {} : { authorization: "Bearer " + githubToken };
}
/**
* 传输层：显式要求服务端返回未压缩实体。
*
* 为什么必须加：dsh 会把**启动环境**里的 `HTTP_PROXY`/`HTTPS_PROXY` 装成
* undici 的全局 dispatcher（`@deepseek-ai/dsh-http-proxy`），插件里的 `fetch`
* 因此走该代理。上游在带代理的环境里诊断出的失败模式是：经代理返回的响应
* **丢掉 `content-encoding` 与 `content-type` 头，而 body 仍是 gzip**；undici
* 只依据 `content-encoding` 决定是否解压，于是 `response.json()` 拿到 gzip
* 二进制并抛错，被上层的 catch 映射成 `invalid github response for <url>`
* ——看起来像 GitHub 坏了，实际是传输层被改写了头部。
*
* 代价是不走压缩（我们的响应体都很小），换来的是**无论中间代理是否改写头部
* 都能正确取到实体**，且用户无需为插件调整启动命令。
*/
const NO_COMPRESSION = { "accept-encoding": "identity" };
/** JSON API 默认请求头（含鉴权）。 */
function apiHeaders() {
	return {
		accept: "application/vnd.github+json",
		...NO_COMPRESSION,
		...githubAuthHeaders()
	};
}
/** ETag cache for GitHub API JSON (mirrors codex lib.rs marker+fingerprint). In-memory only, saves 304 for daily checks. */
const etagCache = /* @__PURE__ */ new Map();
const ETAG_MAX = 200;
function etagCacheSet(url, etag, json) {
	if (etagCache.size >= ETAG_MAX) {
		const first = etagCache.keys().next().value;
		if (first !== void 0) etagCache.delete(first);
	}
	etagCache.set(url, {
		etag,
		json
	});
}
/**
* Build a RepoFetchError; when the response shows an exhausted rate limit,
* report the reset time instead of a bare HTTP status.
*/
function fetchError(context, response, fallbackStatus = 502) {
	const remaining = response.headers.get("x-ratelimit-remaining");
	const reset = response.headers.get("x-ratelimit-reset");
	if (response.status === 403 || response.status === 429) {
		if (remaining === "0" && reset !== null) return new RepoFetchError("github rate limit reached (anonymous quota exhausted); retry after " + (/* @__PURE__ */ new Date(Number(reset) * 1e3)).toLocaleTimeString() + " or set GITHUB_TOKEN", 403);
	}
	return new RepoFetchError(context + " (HTTP " + response.status + ")", response.status === 404 ? 404 : fallbackStatus);
}
/** 是否限流/中断类错误（调用方可直接透出，不再包装）。 */
function isAbortError(error) {
	return error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted") || error.message.includes("Abort"));
}
/**
* 不带缓存的统一 GET+JSON：网络异常、非 2xx、坏 JSON 全部映射为
* RepoFetchError，调用方无需重复写 try/catch。
*/
async function fetchJson(url, fetchImpl, context, headers = apiHeaders()) {
	let response;
	try {
		response = await fetchImpl(url, { headers });
	} catch (error) {
		if (isAbortError(error)) throw error;
		throw new RepoFetchError(context + ": " + errorText(error));
	}
	if (!response.ok) throw fetchError(context, response);
	try {
		return {
			json: await response.json(),
			response
		};
	} catch {
		throw new RepoFetchError("invalid github response for " + url);
	}
}
/**
* Load repo metadata and the recursive git tree at the given ref. The meta
* request always resolves the default branch (used when ref is absent); the
* tree is fetched at `ref ?? default_branch` so an explicit branch/tag scans
* the exact same content a later download would fetch.
*/
async function fetchJsonCached(url, fetchImpl, context) {
	const cached = etagCache.get(url);
	const headers = { ...apiHeaders() };
	if (cached !== void 0) headers["if-none-match"] = cached.etag;
	let response;
	try {
		response = await fetchImpl(url, { headers });
	} catch (error) {
		throw new RepoFetchError(context + ": " + errorText(error));
	}
	if (response.status === 304 && cached !== void 0) return {
		json: cached.json,
		response
	};
	if (!response.ok) throw fetchError(context, response);
	let json;
	try {
		json = await response.json();
	} catch {
		throw new RepoFetchError("invalid github response for " + url);
	}
	const etag = response.headers.get("etag");
	if (etag !== null && etag !== "") etagCacheSet(url, etag, json);
	return {
		json,
		response
	};
}
//#endregion
//#region src/protocol/repo.ts
/** Top-level directory pattern for a skill root: visible, non-dot, safe chars. First char must be alphanum. */
const REPO_ROOT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
/**
* True when a value is a usable root: a visible safe top-level directory name,
* or the empty string for the repo root. Guards the persisted store against
* corrupt roots without rewriting the repo-root sentinel.
*/
function isValidRepoRoot(value) {
	return typeof value === "string" && (value === "" || REPO_ROOT_RE.test(value));
}
/** True when a root denotes the repo root itself (the repo is the skill dir). */
function isRepoRoot(root) {
	return root === "";
}
/**
* The tree prefix delimiting a skill directory: empty for the repo-root skill
* (it owns the whole tree), otherwise `<dir>/`. Single source for collect,
* manifest, diff and the store's baseline cleanup, so they can never disagree.
*/
function skillDirPrefix(dir) {
	return isRepoRoot(dir) ? "" : dir + "/";
}
/**
* A path inside a skill directory, as it appears in the repo tree. Both
* directions of this mapping matter: repo paths are always '/'-joined (never
* node:path's OS separator, these are GitHub paths shown in the UI), and the
* repo-root case must not grow a leading slash.
*/
function skillPathIn(dir, relative) {
	return skillDirPrefix(dir) + relative;
}
/** The SKILL.md path inside a skill directory. */
function skillFileAt(dir) {
	return skillPathIn(dir, "SKILL.md");
}
//#endregion
//#region src/repo/discovery.ts
/**
* 仓库技能发现：从 GitHub 仓库树推断技能根目录、列出可导入技能、
* 生成目录清单并做上游差异比对。纯函数为主，便于单测。
* 从 repo.ts 抽出。
*
* 路径语义集中在几个内部函数上：`skillDirPrefix`（技能目录在树里的前缀）、
* `isRepoTooling`（永不属于技能的仓库基建）、`skillFileAt`（目录内的
* SKILL.md 路径）。collect / manifest / diff 三处必须共用它们，否则差异
* 比对会永远报「有更新」。
*/
/**
* Top-level dot entries are repo tooling, never part of a skill: `.github/`,
* `.claude-plugin/`, `.gitignore`. Only the repo-root skill can reach them,
* since its prefix is empty and would otherwise sweep in the whole repo.
* Nested skill dirs cannot start with a dot (REPO_ROOT_RE), so this is a
* no-op for them.
*/
function isRepoTooling(path) {
	return path.startsWith(".");
}
/** Every tree blob belonging to a skill directory, sorted by path. */
function skillTreeFiles(tree, dir) {
	const prefix = skillDirPrefix(dir);
	return tree.filter((item) => item.type === "blob" && item.path.startsWith(prefix) && !isRepoTooling(item.path)).map((item) => ({
		path: item.path,
		size: typeof item.size === "number" ? item.size : 0
	})).sort((a, b) => a.path.localeCompare(b.path));
}
/**
* A repo file's path relative to its skill directory — the path it is written
* to under the skill's own directory. `dir === ''` means the repo file path
* *is* the relative path; slicing `dir.length + 1` would eat its first
* character.
*/
function relativeToSkillDir(dir, path) {
	return isRepoRoot(dir) ? path : path.slice(dir.length + 1);
}
/** `owner/repo` slug for a parsed reference. */
function repoSlug(ref) {
	return `${ref.owner}/${ref.repo}`;
}
/**
* Normalize a GitHub URL or `owner/repo`/`owner/repo@ref` input.
* Only github.com URLs are accepted in v1.
*/
function normalizeRepoInput(input) {
	let value = input.trim();
	if (value === "") return null;
	let ref;
	const urlMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/#?@]+)(?:\/tree\/([^/?#]+))?/.exec(value);
	if (urlMatch !== null) {
		value = `${urlMatch[1]}/${urlMatch[2]}`;
		ref = urlMatch[3];
	} else {
		if (/^https?:\/\//.test(value)) return null;
		const at = value.indexOf("@");
		if (at !== -1) {
			ref = value.slice(at + 1).trim();
			value = value.slice(0, at).trim();
		}
	}
	value = value.replace(/\.git$/, "").replace(/\/+$/, "");
	const parts = value.split("/").filter(Boolean);
	if (parts.length < 2) return null;
	const owner = parts[0];
	const repo = parts[1];
	if (owner === "" || repo === "" || owner.includes("..") || repo.includes("..")) return null;
	return {
		owner,
		repo,
		...ref !== void 0 && ref !== "" ? { ref } : {}
	};
}
/** Collect every file inside a skill directory, including SKILL.md itself. */
function collectRepoSkillFiles(tree, dir) {
	return skillTreeFiles(tree, dir);
}
/**
* Compute an origin collection name. Multiple roots split by root, one root
* keeps the repo slug. The repo-root skill's name *is* the repo slug, so it
* never gets a trailing-slash suffix (`owner/repo/`).
*/
function originForRoot(repo, rootsPresent, root) {
	if (rootsPresent.size <= 1) return repo;
	return isRepoRoot(root) ? repo : `${repo}/${root}`;
}
/** Discover importable skills from a repo tree. Invalid names are ignored. Roots are auto-derived from the top-level directory of each SKILL.md. */
function discoverRepoEntries(tree, repo, existingNames = /* @__PURE__ */ new Set()) {
	const candidates = [];
	const rootsPresent = /* @__PURE__ */ new Set();
	const repoName = repo.slice(repo.lastIndexOf("/") + 1);
	if (isSkillName(repoName) && tree.some((item) => item.type === "blob" && item.path === "SKILL.md")) {
		rootsPresent.add("");
		candidates.push({
			root: "",
			dir: "",
			name: repoName,
			path: "SKILL.md"
		});
	}
	for (const item of tree) {
		if (item.type !== "blob") continue;
		const slash = item.path.indexOf("/");
		if (slash === -1) continue;
		if (!item.path.endsWith("/SKILL.md")) continue;
		const root = item.path.slice(0, slash);
		if (!REPO_ROOT_RE.test(root)) continue;
		const dir = item.path.slice(0, -9);
		if (dir === root || dir.length <= root.length + 1) continue;
		const name = dir.slice(dir.lastIndexOf("/") + 1);
		if (!isSkillName(name)) continue;
		rootsPresent.add(root);
		candidates.push({
			root,
			dir,
			name,
			path: item.path
		});
	}
	return candidates.map((candidate) => {
		const files = collectRepoSkillFiles(tree, candidate.dir);
		return {
			name: candidate.name,
			dir: candidate.dir,
			path: candidate.path,
			root: candidate.root,
			origin: originForRoot(repo, rootsPresent, candidate.root),
			fileCount: files.length,
			totalBytes: files.reduce((sum, file) => sum + file.size, 0),
			existing: existingNames.has(candidate.name)
		};
	}).sort((a, b) => a.name.localeCompare(b.name));
}
/**
* Build a path→size manifest for one skill directory from a repo tree.
* Shares `skillTreeFiles` with collectRepoSkillFiles: a manifest that
* disagreed with the collected file set would make every update diff report
* "changed" forever.
*/
function skillManifest(tree, dir) {
	const manifest = {};
	for (const file of skillTreeFiles(tree, dir)) manifest[file.path] = file.size;
	return manifest;
}
/**
* The real upstream directory of one tracked skill. Source records keep only
* the short name and top-level root (e.g. root "skills", name "ask-matt"),
* but upstream repos may nest skills under category directories
* (skills/engineering/ask-matt/) or move them between categories. Resolution
* order: exact match under the top-level root in the upstream tree, then the
* manifest's recorded blob path, then any same-name skill in the tree, then
* the flat root/name fallback. Passing the tree paths makes the lookup
* resilient to incomplete manifests and upstream moves.
*
* A repo-root record (root '') has no directory to resolve: its SKILL.md is a
* bare top-level path, so every nested lookup below would miss and the final
* fallback would hand back a bogus '/name'. Answer before them — including
* when the upstream SKILL.md is gone, so diffRemoteSkills reports a deletion
* instead of hunting for a skill that was never nested.
*/
function skillDirOf(source, name, treePaths) {
	if (isRepoRoot(source.root)) return "";
	if (treePaths !== void 0) {
		const rootPrefix = source.root + "/";
		const found = treePaths.find((path) => path.startsWith(rootPrefix) && path.endsWith("/" + name + "/SKILL.md"));
		if (found !== void 0) return found.slice(0, found.lastIndexOf("/"));
	}
	const manifest = source.manifest ?? {};
	const fromManifest = Object.keys(manifest).find((path) => path.endsWith("/" + name + "/SKILL.md"));
	if (fromManifest !== void 0) return fromManifest.slice(0, fromManifest.lastIndexOf("/"));
	if (treePaths !== void 0) {
		const found = treePaths.find((path) => path.endsWith("/" + name + "/SKILL.md"));
		if (found !== void 0) return found.slice(0, found.lastIndexOf("/"));
	}
	return source.root + "/" + name;
}
/**
* Diff one source record against an upstream tree at treeSha: which tracked
* skills disappeared (no SKILL.md blob) and which changed (manifest baseline
* differs, or no baseline exists — treated as changed). Pure over the tree.
* The remote side is read through skillManifest, so the diff compares like
* with like against the baseline recorded at import time.
*/
function diffRemoteSkills(tree, source) {
	const treePaths = tree.filter((item) => item.type === "blob").map((item) => item.path);
	const updated = [];
	const deleted = [];
	const baseline = source.manifest ?? {};
	for (const name of source.skills) {
		const dir = skillDirOf(source, name, treePaths);
		const prefix = skillDirPrefix(dir);
		const remote = skillManifest(tree, dir);
		if (!Object.hasOwn(remote, skillFileAt(dir))) {
			deleted.push(name);
			continue;
		}
		const baselineEntries = Object.entries(baseline).filter(([path]) => path.startsWith(prefix));
		if (baselineEntries.length === 0) {
			updated.push(name);
			continue;
		}
		let differs = baselineEntries.length !== Object.keys(remote).length;
		if (!differs) {
			for (const [path, size] of baselineEntries) if (remote[path] !== size) {
				differs = true;
				break;
			}
		}
		if (differs) updated.push(name);
	}
	return {
		updated,
		deleted
	};
}
/** Minimal RepoSkillEntry for a tracked skill name (sync re-downloads by name). */
function repoSkillEntry(name, root, repo) {
	const dir = isRepoRoot(root) ? "" : root + "/" + name;
	return {
		name,
		dir,
		path: skillFileAt(dir),
		root,
		origin: repo,
		fileCount: 0,
		totalBytes: 0,
		existing: false
	};
}
//#endregion
//#region src/repo/api.ts
/**
* GitHub 仓库读取：仓库树、发布标签、星标/下载量、分支与提交查询。
* 统一走 repo/github-client.ts 的请求层（鉴权、ETag 缓存、错误映射）。
* 从 repo.ts 抽出。
*/
async function loadRepoTree(repo, ref, fetchImpl = fetch) {
	const { json: metaJson } = await fetchJsonCached(`https://api.github.com/repos/${repo}`, fetchImpl, "github repo not found or unavailable");
	let meta = metaJson;
	const record = typeof meta === "object" && meta !== null ? meta : {};
	const defaultBranch = typeof record.default_branch === "string" && record.default_branch !== "" ? record.default_branch : "main";
	const treeRef = ref !== void 0 && ref !== "" ? ref : defaultBranch;
	const { json: payload } = await fetchJsonCached(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`, fetchImpl, "github tree not found");
	const treeRecord = typeof payload === "object" && payload !== null ? payload : {};
	const truncated = treeRecord.truncated === true;
	return {
		ref: treeRef,
		tree: Array.isArray(treeRecord.tree) ? treeRecord.tree : [],
		truncated
	};
}
/**
* The latest non-prerelease release tag of a repo, or undefined when the
* repo has no releases (GitHub's /releases/latest skips prereleases/drafts).
*/
async function getLatestReleaseTag(repo, fetchImpl = fetch) {
	let payload;
	try {
		({json: payload} = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, fetchImpl, "github release lookup failed"));
	} catch (error) {
		if (error instanceof RepoFetchError && error.status === 404) return void 0;
		throw error;
	}
	const tag = typeof payload === "object" && payload !== null ? payload.tag_name : void 0;
	return typeof tag === "string" && tag !== "" ? tag : void 0;
}
/** Stars + release-asset downloads of a repo (two GitHub API requests). */
async function getRepoStats(repo, fetchImpl = fetch) {
	const headers = apiHeaders();
	const { json: meta } = await fetchJson(`https://api.github.com/repos/${repo}`, fetchImpl, "github repo not found or unavailable", headers);
	const stars = typeof meta === "object" && meta !== null && typeof meta.stargazers_count === "number" ? meta.stargazers_count : 0;
	let downloads = 0;
	try {
		const relResponse = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=20`, { headers });
		if (relResponse.ok) {
			const releases = await relResponse.json();
			if (Array.isArray(releases)) for (const item of releases) {
				if (typeof item !== "object" || item === null) continue;
				const assets = item.assets;
				if (!Array.isArray(assets)) continue;
				for (const asset of assets) if (typeof asset === "object" && asset !== null && typeof asset.download_count === "number") downloads += asset.download_count;
			}
		}
	} catch {}
	return {
		stars,
		downloads
	};
}
/** Release tags of a repo, newest first (skips drafts, keeps prereleases). */
async function listRepoReleases(repo, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=20`, fetchImpl, "github releases lookup failed");
	if (!Array.isArray(payload)) return [];
	return payload.filter((item) => typeof item === "object" && item !== null && item.draft !== true).map((item) => item.tag_name).filter((tag) => typeof tag === "string" && tag !== "");
}
/** Branch names of a repo, default branch first (one GitHub API request). */
async function listRepoBranches(repo, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/branches?per_page=100`, fetchImpl, "github branches lookup failed");
	if (!Array.isArray(payload)) return [];
	return payload.map((item) => typeof item === "object" && item !== null ? item.name : void 0).filter((name) => typeof name === "string" && name !== "");
}
/**
* Fetch the latest commit of a repo (explicit ref or default branch) with
* its tree SHA. One GitHub API request; the tree SHA is used to diff the
* upstream tree on change (one extra request).
*/
async function getLatestCommit(repo, ref, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(ref !== void 0 && ref !== "" ? `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}` : `https://api.github.com/repos/${repo}/commits?per_page=1`, fetchImpl, "github commit lookup failed");
	const record = Array.isArray(payload) ? payload[0] ?? {} : typeof payload === "object" && payload !== null ? payload : {};
	const commitSha = typeof record.sha === "string" && record.sha !== "" ? record.sha : null;
	const tree = typeof record.commit === "object" && record.commit !== null ? record.commit.tree : void 0;
	const treeSha = typeof tree?.sha === "string" && tree.sha !== "" ? tree.sha : null;
	if (commitSha === null || treeSha === null) throw new RepoFetchError("github commit response has no sha/tree");
	return {
		commitSha,
		treeSha
	};
}
/** Load the recursive git tree at an explicit tree SHA (one API request). */
async function loadRepoTreeAt(repo, treeSha, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, fetchImpl, "github tree lookup failed");
	const record = typeof payload === "object" && payload !== null ? payload : {};
	if (record.truncated === true) throw new RepoFetchError("repo tree is too large to scan");
	return Array.isArray(record.tree) ? record.tree : [];
}
//#endregion
//#region src/concurrency.ts
/**
* 并发工具：有界并发的 map。原先 repo.ts 与 stats.ts 各有一份实现，
* 这里统一为一份（采用 stats 版本的 limit 夹取，调用点 limit≥1 行为不变）。
*/
/** Run an async worker over items with a bounded concurrency, preserving index order. */
async function mapConcurrent(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}
//#endregion
//#region src/repo/install.ts
/**
* 技能目录下载与落地：单文件下载（raw 优先、contents 兜底）、整目录
* 临时目录 + 原子 rename、启动时清理残留导入临时目录。
* 从 repo.ts 抽出。
*/
/**
* Download one GitHub file as a buffer. Tries raw.githubusercontent.com
* first (no API quota); on any failure falls back to the api.github.com
* contents endpoint with the raw media type (rate-limited, but reachable
* from networks that block the raw host).
*/
async function downloadGitHubFile(repo, ref, path, fetchImpl = fetch, signal) {
	if (signal?.aborted) throw new DOMException("aborted", "AbortError");
	const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
	const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${encodedPath}`;
	let firstError = null;
	let response = null;
	try {
		response = await fetchImpl(rawUrl, {
			headers: {
				...NO_COMPRESSION,
				...githubAuthHeaders()
			},
			...signal !== void 0 ? { signal } : {}
		});
	} catch (error) {
		if (isAbortError(error)) throw error;
		firstError = errorText(error);
	}
	if (response === null || !response.ok) {
		if (signal?.aborted) throw new DOMException("aborted", "AbortError");
		const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;
		try {
			response = await fetchImpl(apiUrl, {
				headers: {
					accept: "application/vnd.github.raw",
					...NO_COMPRESSION,
					...githubAuthHeaders()
				},
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (isAbortError(error)) throw error;
			throw new RepoFetchError("download failed: " + (firstError ?? errorText(error)));
		}
	}
	if (response === null || !response.ok) throw fetchError("download failed", response);
	try {
		return Buffer.from(await response.arrayBuffer());
	} catch (error) {
		if (isAbortError(error)) throw error;
		throw new RepoFetchError("download read failed: " + errorText(error));
	}
}
/**
* Download a full skill directory into a temporary dir, validate SKILL.md,
* then atomically rename it into place. The target root is created when missing.
* Callers pass a target root and a skill entry plus its collected files.
*/
async function downloadRepoSkill(repo, ref, entry, files, targetRoot, fetchImpl = fetch, signal, onProgress) {
	if (signal?.aborted) throw new DOMException("aborted", "AbortError");
	const targetDir = join(targetRoot, entry.name);
	await mkdir(targetRoot, { recursive: true });
	const tempDir = await mkdtemp(join(targetRoot, "." + entry.name + ".import-"));
	let renamed = false;
	try {
		await mapConcurrent(files, 6, async (file) => {
			if (signal?.aborted) throw new DOMException("aborted", "AbortError");
			const relative = relativeToSkillDir(entry.dir, file.path);
			if (relative === "" || relative.includes("..")) throw new RepoFetchError("unsafe repo path: " + file.path);
			const target = join(tempDir, relative);
			const buffer = await downloadGitHubFile(repo, ref, file.path, fetchImpl, signal);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, buffer);
			onProgress?.(buffer.length, relative);
		});
		if (signal?.aborted) throw new DOMException("aborted", "AbortError");
		let text;
		try {
			text = await readFile(join(tempDir, "SKILL.md"), "utf8");
		} catch {
			throw new RepoFetchError("downloaded skill has no SKILL.md");
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) throw new RepoFetchError("downloaded skill rejected: " + parsed.error, 422);
		if (parsed.value.name !== entry.name) throw new RepoFetchError("downloaded skill declares name \"" + parsed.value.name + "\", expected \"" + entry.name + "\"", 422);
		await rename(tempDir, targetDir);
		renamed = true;
		return {
			targetDir,
			skillPath: join(targetDir, "SKILL.md")
		};
	} finally {
		if (!renamed) try {
			await rm(tempDir, {
				recursive: true,
				force: true
			});
		} catch (firstError) {
			await new Promise((resolve) => setTimeout(resolve, 60));
			try {
				await rm(tempDir, {
					recursive: true,
					force: true
				});
			} catch (secondError) {
				console.warn(`[skill-hub] cleanup tempDir failed ${tempDir}:`, errorText(secondError), "first:", errorText(firstError));
			}
		}
	}
}
/**
* 启动时扫描并清理残留的 `.*.import-*` 临时目录（Issue #3 第4点）。
* 越积越多的点前缀目录不会显示为 skill，但会占空间，尽早回收。
*/
async function cleanupLeftoverImportDirs(targetRoot) {
	const { readdir, rm: rm2 } = await import("node:fs/promises");
	let names;
	try {
		names = await readdir(targetRoot);
	} catch {
		return 0;
	}
	let cleaned = 0;
	for (const name of names) {
		if (!/^\..*\.import-/.test(name)) continue;
		const full = join(targetRoot, name);
		try {
			await rm2(full, {
				recursive: true,
				force: true
			});
			cleaned += 1;
		} catch (error) {
			console.warn(`[skill-hub] startup cleanup failed ${full}:`, errorText(error));
		}
	}
	if (cleaned > 0) console.warn(`[skill-hub] startup cleaned ${cleaned} leftover import temp dir(s) in ${targetRoot}`);
	return cleaned;
}
//#endregion
//#region src/store/errors.ts
/**
* Business-rule failure the routes layer can map onto a 4xx status instead
* of a blanket 500: user input is invalid (validation → 400), the target
* does not exist (not-found → 404), or the operation conflicts with an
* invariant (conflict → 409).
*/
var StoreError = class extends Error {
	kind;
	constructor(kind, message) {
		super(message);
		this.name = "StoreError";
		this.kind = kind;
	}
};
/** Loopback literal check plus browser same-origin markers. */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL("http://" + host);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** One JSON error response. */
function writeError(res, status, error) {
	writeJson(res, status, { error: errorText(error) });
}
/** HTTP status per store business-rule kind (user error, not server fault). */
const STORE_ERROR_STATUS = {
	validation: 400,
	"not-found": 404,
	conflict: 409
};
/** Map known error types onto HTTP statuses: repo fetch + store business rules. */
function writeRouteError(res, error) {
	if (error instanceof RepoFetchError) {
		writeError(res, error.status, error);
		return;
	}
	if (error instanceof StoreError) {
		writeError(res, STORE_ERROR_STATUS[error.kind], error);
		return;
	}
	writeError(res, 500, error);
}
/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > 65536) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** URL query helper (first value, decoded). */
function queryParam(url, name) {
	const value = url.searchParams.get(name);
	return value === null ? void 0 : value;
}
/**
* 读取请求体里的字符串字段（缺失或类型不符返回 ''）。替代各 handler 里
* `body as unknown as XRequest` 的断言 + 手写 typeof 收窄。
*/
function readString(body, key) {
	const value = body[key];
	return typeof value === "string" ? value : "";
}
/**
* 读取请求体里的字符串数组：非数组返回 []，丢弃非字符串项；默认同时丢弃
* 空串（keepEmpty=true 时保留空串，由调用方决定语义）。
*/
function readStrings(body, key, options) {
	const value = body[key];
	if (!Array.isArray(value)) return [];
	const keepEmpty = options?.keepEmpty === true;
	return value.filter((item) => typeof item === "string" && (keepEmpty || item !== ""));
}
/** Async existence check (import/sync use it on the user root). */
async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/routes/deps.ts
/** Sources the hub may toggle (the user-level filesystem roots). */
function isWritableSource(source) {
	return source === "user-dsh" || source === "user-agents";
}
/**
* 解析破坏性操作的目标技能：名字必须还在目录里、来源必须是用户级可写根、磁盘
* 路径必须落在该根内。围栏在这里复核，不靠调用方自觉。
*/
async function resolveWritableSkill(deps, name) {
	const skill = await deps.skills.get(name);
	if (skill === void 0) return {
		ok: false,
		status: 404,
		error: "skill not found: " + name
	};
	if (!isWritableSource(skill.source)) return {
		ok: false,
		status: 409,
		error: "skill is not user-level (" + skill.source + "): " + name
	};
	const path = skill.path;
	if (path === void 0 || path === "") return {
		ok: false,
		status: 409,
		error: "skill has no file on disk: " + name
	};
	const root = rootOfPath(path, homeOf(deps));
	if (root === void 0) return {
		ok: false,
		status: 409,
		error: "skill file is outside the hub writable roots: " + name
	};
	return {
		ok: true,
		name,
		root,
		path
	};
}
/** The resolved hub config a route sees (the shared resolver fills defaults). */
function configOf(deps) {
	return resolveHubConfig({}, deps.config?.() ?? {});
}
/** The raw saved config layer a route reports (empty when the owner omits it). */
function savedOf(deps) {
	return deps.saved?.() ?? {};
}
/** Refuse business routes while the master switch is off (the config route stays up). */
function disabledGate(deps, res) {
	if (configOf(deps).enabled) return false;
	writeError(res, 503, "plugin disabled: enable it from the settings card");
	return true;
}
/** Resolve the home used for writable-root operations. */
function homeOf(deps) {
	return deps.home ?? dshHome();
}
//#endregion
//#region src/routes/collection.ts
/**
* 本地文件系统 provider 的名字：它发现的技能就是磁盘上的技能，成不成组由市场
* 来源记录（origin）决定，不按 provider 再建一个组。
*/
const FILESYSTEM_PROVIDER = "filesystem";
/**
* 由 origin 映射（skillName → 仓库）+ 集合顺序构建来源集合组。
*/
function marketCollections(origins, collectionOrder) {
	const byCollection = /* @__PURE__ */ new Map();
	for (const [skillName, origin] of Object.entries(origins)) {
		const list = byCollection.get(origin);
		if (list === void 0) byCollection.set(origin, [skillName]);
		else list.push(skillName);
	}
	const orderIndex = new Map(collectionOrder.map((name, i) => [name, i]));
	return [...byCollection.entries()].map(([name, skillNames]) => ({
		name,
		skillNames: [...skillNames].sort((a, b) => a.localeCompare(b))
	})).sort((a, b) => {
		const ai = orderIndex.has(a.name) ? orderIndex.get(a.name) : Infinity;
		const bi = orderIndex.has(b.name) ? orderIndex.get(b.name) : Infinity;
		if (ai !== bi) return ai - bi;
		return a.name.localeCompare(b.name);
	});
}
/**
* 插件技能集合：来源不是用户级可写根、又没有市场来源记录的技能，按 provider
* 聚合成一个组（组名即 provider 名，如 "reverse-skill"）。
*
* Why: 市场导入的技能靠 sidecar 的 origin 映射成组，而插件自带的技能集合
* （例如 dsh-reverse-skill 的 bundled 技能）没有任何来源记录，原先只能落进
* 「个人」卡——面板上看起来就是「插件提供的技能不会分组」。这些组没有上游，
* 只参与分组与开关（见 CollectionGroup.kind）。
*/
function providerCollections(origins, skills) {
	const byProvider = /* @__PURE__ */ new Map();
	for (const skill of skills) {
		if (origins[skill.name] !== void 0) continue;
		if (isWritableSource(skill.source)) continue;
		const provider = skill.provider.trim();
		if (provider === "" || provider === FILESYSTEM_PROVIDER) continue;
		const list = byProvider.get(provider);
		if (list === void 0) byProvider.set(provider, [skill.name]);
		else list.push(skill.name);
	}
	return [...byProvider.entries()].map(([name, skillNames]) => ({
		name,
		skillNames: [...skillNames].sort((a, b) => a.localeCompare(b))
	})).sort((a, b) => a.name.localeCompare(b.name));
}
/**
* 全部集合组：来源集合组在前（沿用 sidecar 的历史顺序），插件组按名字排在
* 后面；同名的插件组让位给来源组，避免两个组共用同一个 'col:xxx' 键。
*/
function buildCollections(origins, collectionOrder, skills = []) {
	const market = marketCollections(origins, collectionOrder);
	const taken = new Set(market.map((collection) => collection.name));
	const plugins = providerCollections(origins, skills).filter((collection) => !taken.has(collection.name));
	const memberships = { ...origins };
	for (const collection of plugins) for (const name of collection.skillNames) memberships[name] = collection.name;
	return {
		collections: [...market, ...plugins.map((collection) => ({
			...collection,
			kind: "provider"
		}))],
		memberships
	};
}
/** 系统集合组 + 用户 tag + 成员映射（groups 路由的数据源）。 */
async function buildGroups(deps) {
	const [tags, origins, collectionOrder, sourceGroupOrder, snapshot] = await Promise.all([
		deps.store.listTags(),
		deps.store.listOrigins(),
		deps.store.getCollectionOrder(),
		deps.store.getSourceGroupOrder(),
		deps.skills.snapshot()
	]);
	const { collections, memberships } = buildCollections(origins, collectionOrder, snapshot.skills);
	return {
		ok: true,
		tags,
		collections,
		origins: memberships,
		...sourceGroupOrder.length > 0 ? { sourceGroupOrder } : {},
		...collectionOrder.length > 0 ? { collectionOrder } : {}
	};
}
//#endregion
//#region src/scope-assembly.ts
/**
* 模式隔离的接线轮询间隔。只做一件很便宜的事：枚举当前活着的 preset
* standing mount 并补齐/清理闸门注入。首个注入之后它几乎总是无操作。
*/
const SCOPE_WIRING_TICK_MS = 5e3;
/** 空闲策略：主体从未配置过时不限制任何技能。 */
const OPEN_POLICY = {
	enabled: false,
	groups: [],
	skills: []
};
/**
* @param options.ctx - 宿主上下文（读技能目录、写日志）。
* @param options.store - 隔离策略的唯一来源。
* @param options.presets - `ctx.agentPresets`（软注入），缺失的部署只是没有模式可配。
* @param options.workspaces - `ctx.workspaceRegistry`（软注入），缺失的部署只是没有工作区可配。
*/
function assembleScopes(options) {
	const { ctx, store, presets, workspaces } = options;
	const view = new ScopeView({
		catalog: async () => {
			const meta = /* @__PURE__ */ new Map();
			let snapshot;
			try {
				snapshot = await ctx.skills.snapshot();
			} catch {
				return {
					names: [],
					meta
				};
			}
			for (const skill of snapshot.skills) {
				if (meta.has(skill.name)) continue;
				meta.set(skill.name, {
					description: skill.description,
					...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},
					source: skill.source,
					provider: skill.provider
				});
			}
			return {
				names: [...meta.keys()].sort((a, b) => a.localeCompare(b)),
				meta
			};
		},
		groups: async (snapshot) => {
			const members = /* @__PURE__ */ new Map();
			for (const tag of await store.listTags()) members.set(tagKey(tag.id), tag.skillNames);
			const skills = snapshot.names.map((name) => {
				const meta = snapshot.meta.get(name);
				return {
					name,
					provider: meta?.provider ?? "",
					source: meta?.source ?? ""
				};
			});
			const { collections } = buildCollections(await store.listOrigins(), await store.getCollectionOrder(), skills);
			for (const collection of collections) members.set(collectionKey(collection.name), collection.skillNames);
			const bySource = /* @__PURE__ */ new Map();
			for (const name of snapshot.names) {
				const source = snapshot.meta.get(name)?.source;
				if (source === void 0) continue;
				const list = bySource.get(source);
				if (list === void 0) bySource.set(source, [name]);
				else list.push(name);
			}
			for (const [source, names] of bySource) members.set(sourceKey(source), names);
			return members;
		},
		policyOf: (presetId) => store.getScope(presetId),
		closed: async () => new Set((await store.listDisabled()).map((entry) => entry.name))
	});
	/**
	* 会话工作目录 → 工作区 id，见 {@link resolveWorkspaceId}。
	*/
	async function workspaceIdAt(cwd) {
		const roster = await readWorkspaceRoster(workspaces());
		if (roster === void 0) return void 0;
		return resolveWorkspaceId(roster, cwd);
	}
	/** 该会话目录命中的工作区策略（没有命中或从未配置 → undefined，即不约束）。 */
	async function workspacePolicyAt(cwd) {
		const workspaceId = await workspaceIdAt(cwd);
		return workspaceId === void 0 ? void 0 : store.getWorkspacePolicy(workspaceId);
	}
	const wiring = new PresetWiring({
		ctx,
		runtime: () => loadScopeRuntime({ presets }),
		isEnforced: async (presetId) => {
			if ((await store.getScope(presetId))?.enabled === true) return true;
			if ((await store.listDisabled()).length > 0) return true;
			return (await store.listWorkspacePolicies()).some((policy) => policy.enabled);
		},
		hiddenOf: async (presetId, cwd) => {
			const [mode, workspace] = await Promise.all([store.getScope(presetId), workspacePolicyAt(cwd)]);
			return view.hiddenFor(overridePolicyEntries(mode, workspace));
		},
		log: (level, message) => {
			if (level === "warn") ctx.logger.warn("[skill-hub] " + message);
			else ctx.logger.info("[skill-hub] " + message);
		}
	});
	return {
		view,
		wiring,
		deps: {
			presets: async () => {
				wiring.sync();
				const status = await wiring.status();
				const roster = await readPresetRoster(presets());
				const unavailable = roster === void 0 ? "agent-presets service is not mounted in this deployment" : void 0;
				return {
					available: status.available && roster !== void 0,
					...status.reason !== void 0 ? { reason: status.reason } : unavailable !== void 0 ? { reason: unavailable } : {},
					entries: roster ?? [],
					active: status.active,
					mounted: status.mounted
				};
			},
			visibilityOf: (presetId) => view.visibilityOf(presetId),
			policyOf: (presetId) => store.getScope(presetId),
			savePolicy: async (presetId, patch) => {
				const policy = await store.saveScope(presetId, patch);
				view.invalidate();
				return policy;
			},
			deletePolicy: async (presetId) => {
				const removed = await store.deleteScope(presetId);
				view.invalidate();
				return removed;
			},
			notifyPolicyChanged: (presetId) => {
				wiring.invalidate(presetId);
				wiring.sync();
			}
		},
		workspaceDeps: {
			workspaces: async () => {
				wiring.sync();
				const status = await wiring.status();
				const roster = await readWorkspaceRoster(workspaces());
				const unavailable = roster === void 0 ? "workspace registry is not mounted in this deployment" : void 0;
				const enabled = (await store.listWorkspacePolicies()).filter((policy) => policy.enabled).length;
				return {
					available: status.available && roster !== void 0,
					...status.reason !== void 0 ? { reason: status.reason } : unavailable !== void 0 ? { reason: unavailable } : {},
					entries: roster ?? [],
					pendingCount: status.active.length > 0 ? 0 : enabled
				};
			},
			listPolicies: () => store.listWorkspacePolicies(),
			visibilityOf: async (workspaceId) => view.visibilityFor(await store.getWorkspacePolicy(workspaceId) ?? OPEN_POLICY),
			policyOf: (workspaceId) => store.getWorkspacePolicy(workspaceId),
			savePolicy: async (workspaceId, patch) => {
				const policy = await store.saveWorkspacePolicy(workspaceId, patch);
				view.invalidate();
				return policy;
			},
			deletePolicy: async (workspaceId) => {
				const removed = await store.deleteWorkspacePolicy(workspaceId);
				view.invalidate();
				return removed;
			},
			notifyPolicyChanged: () => {
				wiring.invalidateAll();
				wiring.sync();
			}
		}
	};
}
//#endregion
//#region src/stats/scan.ts
/** Fallback freeze horizon when no rolling window is configured (14 days). */
const STATS_FREEZE_AFTER_MS = 336 * 60 * 60 * 1e3;
const DAY_MS = 1440 * 60 * 1e3;
/** Collect per-skill invocation counts and last-used times from one session. */
function countSkillInvocations(events) {
	const stats = /* @__PURE__ */ new Map();
	const bump = (name, time) => {
		if (name === "") return;
		const current = stats.get(name);
		if (current === void 0) stats.set(name, {
			count: 1,
			lastUsed: time
		});
		else {
			current.count += 1;
			if (time > current.lastUsed) current.lastUsed = time;
		}
	};
	for (const event of events) if (event.type === "user/message") {
		const source = event.data.source;
		if (source.kind === "skill-invocation") bump(source.name, event.time);
	} else if (event.type === "tool/call") {
		const call = event.data;
		if (call.name === "skill") try {
			const parsed = JSON.parse(call.arguments);
			if (typeof parsed === "object" && parsed !== null) {
				const name = parsed.name;
				if (typeof name === "string") bump(name, event.time);
			}
		} catch {}
	}
	return stats;
}
function isFrozen(record, watermark) {
	const created = record.header.createdAt;
	return typeof created === "number" && created > 0 && created < watermark;
}
/** Max parallel session-log reads per scan. Reads on the query path restore +
* replay-validate a full Session each (structuredClone × 2 + deepFreeze), so
* this stays 1: at most one restored log is resident and a heavy corpus costs
* wall time, never a memory spike. The cold path reads sequentially anyway. */
const SCAN_READ_CONCURRENCY = 1;
function mergeInto(totals, counted) {
	for (const [name, stat] of counted) {
		const total = totals[name];
		if (total === void 0) totals[name] = { ...stat };
		else {
			total.count += stat.count;
			if (stat.lastUsed > total.lastUsed) total.lastUsed = stat.lastUsed;
		}
	}
}
function toSorted(totals) {
	return Object.entries(totals).map(([name, stat]) => ({
		name,
		count: stat.count,
		lastUsed: stat.lastUsed
	})).sort((x, y) => x.name.localeCompare(y.name));
}
/** Effective freeze watermark for the configured rolling window (0 = all history → freeze horizon). */
function watermarkFor(windowDays, nowMs) {
	return windowDays > 0 ? nowMs - windowDays * DAY_MS : nowMs - STATS_FREEZE_AFTER_MS;
}
/**
* Whether a session's usage counts toward the configured window. With no
* window (0) everything counts — full history; with a window, only sessions
* created inside it do. Distinct from the freeze watermark, which is purely a
* re-read optimization.
*/
function inWindow(createdAt, windowDays, nowMs) {
	if (windowDays <= 0) return true;
	return typeof createdAt === "number" && createdAt > 0 && createdAt >= nowMs - windowDays * DAY_MS;
}
/**
* One pass over the corpus. Runs either a full reconciliation (rebuilds the
* per-session cache and advances the watermark — mutates the checkpoint) or a
* cheap incremental scan (re-reads everything at or after the watermark and
* merges over the cached sessions — leaves the checkpoint untouched). Totals
* always apply the CURRENT window filter over the cached sessions, so a
* window shrink takes effect immediately even before the next reconciliation.
*/
async function scan(query, checkpoint, nowMs, windowDays) {
	const sessions = await query.listSessions();
	const cutoff = watermarkFor(windowDays, nowMs);
	if (nowMs - checkpoint.lastFullReconcile >= 864e5 || checkpoint.windowDays !== windowDays) {
		const cache = {};
		const totals = {};
		const countedList = await mapConcurrent(sessions, SCAN_READ_CONCURRENCY, async (record) => {
			try {
				return countSkillInvocations((await query.readSession(record.header.id)).events);
			} catch {
				return;
			}
		});
		sessions.forEach((record, index) => {
			const counted = countedList[index];
			if (counted === void 0) return;
			const created = record.header.createdAt;
			const id = record.header.id;
			if (counted.size > 0 && (isFrozen(record, cutoff) || !(typeof created === "number" && created > 0))) cache[id] = {
				createdAt: typeof created === "number" ? created : 0,
				counts: Object.fromEntries(counted)
			};
			if (inWindow(created, windowDays, nowMs)) mergeInto(totals, counted);
		});
		checkpoint.frozenSessions = cache;
		checkpoint.frozenBefore = cutoff;
		checkpoint.windowDays = windowDays;
		checkpoint.lastFullReconcile = nowMs;
		return {
			stats: toSorted(totals),
			mutated: true
		};
	}
	const recent = {};
	const frozenIds = checkpoint.frozenSessions;
	const unfrozen = sessions.filter((record) => !Object.prototype.hasOwnProperty.call(frozenIds, record.header.id) && !isFrozen(record, checkpoint.frozenBefore));
	const recentList = await mapConcurrent(unfrozen, SCAN_READ_CONCURRENCY, async (record) => {
		try {
			return countSkillInvocations((await query.readSession(record.header.id)).events);
		} catch {
			return;
		}
	});
	unfrozen.forEach((record, index) => {
		const counted = recentList[index];
		if (counted === void 0) return;
		if (inWindow(record.header.createdAt, windowDays, nowMs)) mergeInto(recent, counted);
	});
	const totals = {};
	for (const [id, entry] of Object.entries(checkpoint.frozenSessions)) {
		if (entry.createdAt > 0 && !inWindow(entry.createdAt, windowDays, nowMs)) {
			delete checkpoint.frozenSessions[id];
			continue;
		}
		mergeInto(totals, new Map(Object.entries(entry.counts)));
	}
	mergeInto(totals, new Map(Object.entries(recent)));
	return {
		stats: toSorted(totals),
		mutated: false
	};
}
/**
* One pass over the corpus through the persistence seam. Reads are strictly
* sequential and each handle is closed before the next opens, so at most one
* raw log is resident. A session is re-read only when its revision token
* changed since the checkpoint; the rolling window is applied from the
* listing headers, so out-of-window logs are never even opened. Live sessions
* (in-memory, possibly newer than their persisted revision) are read through
* `readLive` and never enter the revision cache.
*
* A `list()` failure rejects — the reader keeps the previous totals, and the
* next poll retries. Per-session failures are skipped, never fatal.
*/
async function scanCold(persistence, checkpoint, nowMs, windowDays, liveIds = /* @__PURE__ */ new Set(), readLive = async () => void 0) {
	const revisions = checkpoint.coldRevisions ?? (checkpoint.coldRevisions = {});
	const totals = {};
	const snapshots = await persistence.list();
	const seen = /* @__PURE__ */ new Set();
	for (const snapshot of snapshots) {
		const id = snapshot.header.id;
		seen.add(id);
		if (liveIds.has(id)) continue;
		const created = snapshot.header.createdAt;
		if (!inWindow(created, windowDays, nowMs)) {
			delete revisions[id];
			continue;
		}
		const rev = snapshot.revision;
		const cached = revisions[id];
		if (cached !== void 0 && cached.rev === rev) {
			mergeInto(totals, new Map(Object.entries(cached.counts)));
			continue;
		}
		let counted;
		try {
			const handle = await persistence.open(snapshot.header.id, "read");
			try {
				counted = countSkillInvocations((await handle.read()).events);
			} finally {
				await handle.close();
			}
		} catch {
			continue;
		}
		revisions[id] = {
			rev,
			createdAt: typeof created === "number" ? created : 0,
			counts: Object.fromEntries(counted)
		};
		mergeInto(totals, counted);
	}
	for (const id of Object.keys(revisions)) if (!seen.has(id)) delete revisions[id];
	for (const id of liveIds) {
		let events;
		try {
			events = await readLive(id);
		} catch {
			continue;
		}
		if (events === void 0) continue;
		mergeInto(totals, countSkillInvocations(events));
	}
	return toSorted(totals);
}
//#endregion
//#region src/stats/persistence.ts
/**
* Adapt a host persistence service to {@link SessionPersistenceLike}.
* Shape-checked only (no I/O): returns undefined when the value is not a
* usable seam, so callers fall back to the query path. The adapter re-resolves
* nothing and holds no state — a replaced host service surfaces as ordinary
* per-call failures, which scans already tolerate.
*/
function asPersistenceSeam(service) {
	if (service === null || typeof service !== "object") return void 0;
	const { list, open } = service;
	if (typeof list !== "function" || typeof open !== "function") return void 0;
	const listFn = list.bind(service);
	const openFn = open.bind(service);
	return {
		list: async () => {
			const rows = await listFn();
			if (!Array.isArray(rows)) throw new Error("persistence list shape mismatch");
			return rows.map((row) => {
				const record = row;
				const id = record.header?.id;
				if (typeof id !== "string" && typeof id !== "number") throw new Error("persistence snapshot shape mismatch");
				const created = record.header?.createdAt;
				return {
					header: {
						id,
						...typeof created === "number" ? { createdAt: created } : {}
					},
					revision: String(record.revision)
				};
			});
		},
		open: async (id, access) => {
			const raw = await openFn(id, access);
			if (raw === null || typeof raw !== "object") throw new Error("persistence handle shape mismatch");
			const { read, close } = raw;
			if (typeof read !== "function" || typeof close !== "function") throw new Error("persistence handle shape mismatch");
			const readFn = read.bind(raw);
			const closeFn = close.bind(raw);
			return {
				read: async () => {
					const events = (await readFn(0, void 0))?.events;
					if (!Array.isArray(events)) throw new Error("persistence read shape mismatch");
					return { events };
				},
				close: () => closeFn()
			};
		}
	};
}
//#endregion
//#region src/stats.ts
/**
* Wrap a query in a stale-while-revalidate cache: responses never wait for a
* full session-log scan. While the TTL is fresh the cached totals are
* returned; after expiry the stale totals are returned immediately and a
* single background rescan refreshes them — the panel's next poll picks the
* fresh numbers. A full scan decompresses every session log and can take
* seconds, so it must never sit on the request path.
*
* Two scaling mechanisms keep this sane as history grows:
*  - the rescan is incremental (per-session checkpoint, see module doc);
*  - the effective TTL adapts to the measured scan duration, so a heavier
*    corpus automatically lowers the rescan cadence instead of burning CPU
*    on every poll interval.
*/
function createSkillStatsReader(query, ttlMs = 3e5, options = {}) {
	const checkpoint = options.checkpoint ?? {
		windowDays: 0,
		frozenBefore: 0,
		frozenSessions: {},
		lastFullReconcile: 0
	};
	const now = options.now ?? (() => Date.now());
	let cached = checkpoint.lastTotals !== void 0 ? [...checkpoint.lastTotals] : void 0;
	let cachedAt = 0;
	let refreshing = null;
	let lastScanDurationMs = 0;
	const reader = async () => {
		const startedAt = now();
		const base = typeof ttlMs === "function" ? ttlMs() : ttlMs;
		const ttl = Math.max(base, lastScanDurationMs * 3);
		if (cached !== void 0 && startedAt - cachedAt < ttl) return cached;
		if (refreshing === null) {
			const windowDays = options.windowDays?.() ?? 0;
			refreshing = (options.persistence !== void 0 ? (async () => {
				let liveIds = /* @__PURE__ */ new Set();
				if (options.listLiveIds !== void 0) try {
					liveIds = new Set((await options.listLiveIds()).map((id) => String(id)));
				} catch {}
				return scanCold(options.persistence, checkpoint, startedAt, windowDays, liveIds, async (id) => {
					return (await options.readLiveSession?.(id))?.events;
				});
			})() : scan(query, checkpoint, startedAt, windowDays).then(({ stats }) => stats)).then((stats) => {
				cached = stats;
				cachedAt = now();
				lastScanDurationMs = Math.max(0, cachedAt - startedAt);
				checkpoint.lastTotals = stats;
				options.onCheckpoint?.({
					...checkpoint,
					frozenSessions: { ...checkpoint.frozenSessions },
					...checkpoint.coldRevisions !== void 0 ? { coldRevisions: { ...checkpoint.coldRevisions } } : {}
				});
			}).catch(() => {}).finally(() => {
				refreshing = null;
			});
		}
		return cached ?? [];
	};
	reader.source = options.persistence !== void 0 ? "cold" : "query";
	return reader;
}
//#endregion
//#region src/stats-wiring.ts
/** 软接线 sessionQuery / sessionPersistence；两个服务都不在时什么都不做。 */
function wireInvocationStats(options) {
	const { ctx, store, current, install } = options;
	let statsQuery;
	let statsPersistence;
	let statsGeneration = 0;
	const wireStats = () => {
		const query = statsQuery;
		if (query === void 0) return;
		const generation = ++statsGeneration;
		const cold = statsPersistence;
		(async () => {
			const checkpoint = await store.getSkillStatsState().catch(() => void 0);
			if (generation !== statsGeneration) return;
			const scanMinutes = () => {
				const value = current().statsScanMinutes;
				return typeof value === "number" && value >= 1 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsScanMinutes;
			};
			const windowDays = () => {
				const value = current().statsWindowDays;
				return typeof value === "number" && value >= 0 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsWindowDays;
			};
			const reader = createSkillStatsReader(query, () => scanMinutes() * 6e4, {
				checkpoint,
				windowDays,
				...cold === void 0 ? {} : {
					persistence: cold,
					listLiveIds: async () => {
						try {
							return (await query.listSessions()).filter((record) => record.live === true).map((record) => record.header.id);
						} catch {
							return [];
						}
					},
					readLiveSession: async (id) => {
						try {
							return { events: (await query.readSession(id)).events };
						} catch {
							return;
						}
					}
				},
				onCheckpoint: (next) => {
					store.saveSkillStatsState(next).catch((error) => {
						ctx.logger.warn("[skill-hub] persisting skill-stats checkpoint failed", error);
					});
				}
			});
			if (generation !== statsGeneration) return;
			if (ctx.fiber.uid === null) return;
			ctx.logger.info(`[skill-hub] stats seam: ${cold === void 0 ? "session-query (fallback)" : "session-persistence (cold)"}`);
			install(reader);
		})();
	};
	ctx.inject(["sessionQuery"], (sctx) => {
		statsQuery = sctx.sessionQuery;
		wireStats();
		sctx.inject(["sessionPersistence"], (pctx) => {
			(async () => {
				const raw = pctx.sessionPersistence;
				const seam = asPersistenceSeam(raw);
				if (seam === void 0) {
					ctx.logger.warn("[skill-hub] sessionPersistence shape mismatch, staying on query fallback");
					return;
				}
				try {
					await seam.list();
				} catch (error) {
					ctx.logger.warn("[skill-hub] persistence seam probe failed, staying on query fallback", error);
					return;
				}
				statsPersistence = seam;
				wireStats();
			})();
		});
	});
}
//#endregion
//#region src/startup.ts
/** 触发启动期清理、对账与旧 sidecar 配置迁移。全部异步、不阻塞装载。 */
function runStartupTasks(options) {
	const { ctx, store, settingsOf, saved } = options;
	(async () => {
		for (const root of WRITABLE_ROOTS.map((id) => rootPath(id))) try {
			const c = await cleanupLeftoverImportDirs(root);
			if (c > 0) ctx.logger.info(`[skill-hub] startup cleaned ${c} leftover import temp dir(s) in ${root}`);
		} catch (error) {
			ctx.logger.warn("[skill-hub] startup cleanup failed", error);
		}
	})();
	(async () => {
		try {
			const legacy = await store.getConfig();
			const settings = settingsOf();
			if (settings !== void 0 && Object.keys(legacy).length > 0 && Object.keys(saved()).length === 0) await settings.update(ENTRY_ID, legacy);
		} catch (error) {
			ctx.logger.warn("[skill-hub] sidecar config migration into the settings namespace failed", error);
		}
	})();
}
//#endregion
//#region src/provider.ts
/**
* 发现层 · 管理视图 provider —— 注册进官方 ctx.skills 注册表的 GLOBAL 层。
*
* 职责边界：它只回答"这台机器上现在有哪些技能、正文是什么"，不决定任何技能
* 该不该可见（那是策展层 store/ 与执行层 enforcement/ 的事），也不知道模式
* 的存在。GUI 的管理目录、路由目录装配、以及 ScopeView 的目录快照都读它。
*
* Why: in the dsh web app the base host skill-filesystem row is disabled on
* purpose — agent presets own local discovery by mounting their own
* skill-filesystem into their preset scope layers, so a host-plane query
* against the registry's empty global layer sees nothing. The hub needs a
* session-independent management view, so it contributes one itself: the two
* user roots (~/.dsh/skills and ~/.agents/skills).
*
* Agent views are unaffected: preset layers are nearer than the global
* layer, so a preset's own filesystem provider wins every duplicate name
* outright, and this provider only surfaces skills for presets that mount
* no filesystem row at all.
*/
/** Official root ranks (mirrors dsh-skill-filesystem). */
const USER_DSH_RANK = 400;
const USER_AGENTS_RANK = 500;
/**
* Canonical identity of one skill root directory: its real path when it exists
* (so a symlinked root counts as the same directory), else the resolved path —
* a root that does not exist yields no candidates anyway.
*/
async function rootIdentity(base) {
	try {
		return await realpath(base);
	} catch {
		return resolve(base);
	}
}
/**
* Global-layer skill provider for the hub's management catalog.
* Implements the official SkillProvider contract: list() returns
* invocation-neutral candidates; get() resolves the winning candidate's
* body. Both are readonly reads of the local skill roots.
*/
var SkillHubProvider = class {
	name = "skill-hub";
	home;
	control;
	watchTimer;
	rootStamp = "";
	/** 上一次 watch 失败的错误文案（同一错误只记一次，避免 5 秒定时器刷屏）。 */
	lastWatchError = "";
	constructor(control, home = dshHome()) {
		this.control = control;
		this.home = home;
		this.watchTimer = setInterval(() => {
			this.watch();
		}, 5e3);
		this.watchTimer.unref?.();
		control.signal.addEventListener("abort", () => {
			clearInterval(this.watchTimer);
		}, { once: true });
		this.watch();
	}
	/**
	* checkRoots 的守卫包装：某个根不可读（EACCES/ENOTDIR）时不能抛成未处理
	* 拒绝——构造时一次、之后每 5 秒一次。错误按文案去重，恢复后清零。
	*/
	watch() {
		this.checkRoots().then(() => {
			this.lastWatchError = "";
		}, (error) => {
			const text = errorText(error);
			if (text === this.lastWatchError) return;
			this.lastWatchError = text;
			console.warn("[skill-hub] skill root watch failed:", text);
		});
	}
	/**
	* Invalidate the registry cache when the discovered skill files changed.
	* The stamp covers the per-skill discovery file's mtime + size (plus the
	* entry set itself), so editing a SKILL.md body — not just adding or
	* renaming directories — refreshes the GUI catalog.
	*/
	async checkRoots() {
		let stamp = "";
		for (const root of await this.roots()) for (const entry of await scanRoot(root.base)) try {
			const info = await stat(entry.path);
			stamp += entry.path + ":" + info.mtimeMs + ":" + info.size + ";";
		} catch {
			stamp += entry.path + ":missing;";
		}
		if (this.rootStamp === "") {
			this.rootStamp = stamp;
			return;
		}
		if (stamp !== this.rootStamp) {
			this.rootStamp = stamp;
			this.control.invalidate();
		}
	}
	async list(_options = {}) {
		const candidates = [];
		for (const root of await this.roots()) for (const entry of await scanRoot(root.base)) {
			let text;
			try {
				text = await readFile(entry.path, "utf8");
			} catch {
				continue;
			}
			const parsed = parseFrontmatter(text);
			if ("error" in parsed) continue;
			const value = parsed.value;
			candidates.push({
				name: value.name,
				description: value.description,
				...value.whenToUse !== void 0 ? { whenToUse: value.whenToUse } : {},
				invocation: value.invocation,
				source: root.source,
				provider: this.name,
				rank: root.rank,
				locator: {
					path: entry.path,
					directory: entry.directory
				},
				path: entry.path
			});
		}
		return candidates;
	}
	async get(candidate) {
		const locator = candidate.locator;
		let text;
		try {
			text = await readFile(locator.path, "utf8");
		} catch {
			return;
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) return void 0;
		const value = parsed.value;
		return {
			name: value.name,
			description: value.description,
			...value.whenToUse !== void 0 ? { whenToUse: value.whenToUse } : {},
			invocation: value.invocation,
			source: candidate.source,
			provider: this.name,
			resourceBase: {
				kind: "directory",
				path: locator.directory
			},
			path: locator.path,
			content: value.content
		};
	}
	/**
	* The roots this provider lists: the two user roots.
	*
	* Roots resolving to the same directory collapse to one entry, keeping the
	* user identity: a `~/.agents/skills` symlinked onto `~/.dsh/skills` must
	* not report every user skill twice.
	*/
	async roots() {
		const roots = [{
			base: rootPath("user-dsh", this.home),
			source: "user-dsh",
			rank: USER_DSH_RANK
		}, {
			base: rootPath("user-agents", this.home),
			source: "user-agents",
			rank: USER_AGENTS_RANK
		}];
		const seen = /* @__PURE__ */ new Set();
		const unique = [];
		for (const root of roots) {
			const identity = await rootIdentity(root.base);
			if (seen.has(identity)) continue;
			seen.add(identity);
			unique.push(root);
		}
		return unique;
	}
	/** Public hook for the routes: invalidate after hub-driven mutations. */
	invalidate() {
		this.control.invalidate();
	}
};
//#endregion
//#region src/version.ts
/**
* 插件自身的版本号，从 package.json 读取一次。单独立文件是因为
* catalog / config 路由都要用它（面板标题旁的 vX.Y.Z），而它跟
* 「去 GitHub 查最新 release」那套更新检查已经没有关系了。
*/
const CURRENT_VERSION = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		"name": "dsh-skill-group",
		"version": "0.0.1",
		"packageManager": "pnpm@12.6.0",
		"description": "In-GUI skill hub for DeepSeek Harness (dsh): browse the full local skill catalog from the official ctx.skills registry (every root + third-party providers), toggle skills on/off, inspect bodies, surface frontmatter diagnostics, and scaffold new skills — plus a codex-style skill market (built-in catalog, upstream update checks, one-click update-all) with tracked source sync. The full manager beyond the read-only dsh-skill-manager browser.",
		"type": "module",
		"engines": { "node": "^22.19.0 || >=24.0.0" },
		"main": "lib/index.js",
		"types": "lib/types/index.d.ts",
		"exports": {
			".": {
				"types": "./lib/types/index.d.ts",
				"default": "./lib/index.js"
			},
			"./invariant": {
				"types": "./lib/types/invariant.d.ts",
				"default": "./lib/invariant.js"
			},
			"./client": {
				"types": "./lib/types/client/index.d.ts",
				"default": "./lib/client.js"
			},
			"./package.json": "./package.json"
		},
		"dsh": {
			"bundle": { "patch": "./cordis.patch.yml" },
			"client": {
				"inject": ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-settings"],
				"platform": "web"
			}
		},
		"dshWorkshop": {
			"schema": "omdsh-workshop-package/v1",
			"type": "plugin",
			"integration": {
				"protocol": "harness-cordis",
				"artifact": "cordis.patch.yml"
			},
			"install": {
				"mode": "guided",
				"adapter": "third-party",
				"failurePolicy": "manual",
				"touchesCurrentBeforeActivation": false
			},
			"lifecycle": {
				"activation": "hot-reload",
				"dispose": "supported"
			},
			"permissions": [
				"fs:read",
				"fs:write",
				"net:https",
				"net:loopback"
			],
			"compatibility": { "dshVersions": ["0.1.7-rc.1", "0.2.0-rc.2"] },
			"capability": {
				"id": "skill-hub-settings-panel",
				"kind": "ui",
				"invocation": "Open Settings → Skill Groups panel; GET /api/skill-hub/catalog",
				"expected": "The full local skill catalog (all roots) renders as groups and toggles persist an enabled/disabled row without a restart. Settings → Skill Groups → Modes binds groups/skills to agent presets; enabling isolation for a preset hides the rest from that preset's sessions within one turn, without editing any preset file."
			},
			"evidence": {
				"install": null,
				"failureIsolation": null,
				"hotReload": null,
				"remove": null
			}
		},
		"dependencies": { "js-yaml": "^4.1.0" },
		"peerDependencies": {
			"@deepseek-ai/cordis": "^4.0.1 || ^4.0.2",
			"@deepseek-ai/dsh-client-connection": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-client-locale": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-client-runtime": ">=0.1.1-rc.2 <0.3.0-0",
			"@deepseek-ai/dsh-client-store": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-client-ui-input-trigger": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-client-ui-settings": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-client-ui-slots": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-host-webserver": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-session": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-session-query": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-settings": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-skill": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/dsh-system-prompt": ">=0.1.7-rc.1 <0.3.0-0",
			"@deepseek-ai/schemastery": "^3.18.3",
			"react": "^18.2.0",
			"react-dom": "^18.2.0"
		},
		"peerDependenciesMeta": {
			"@deepseek-ai/dsh-client-runtime": { "optional": true },
			"@deepseek-ai/dsh-client-store": { "optional": true }
		},
		"devDependencies": {
			"@deepseek-ai/cordis": "^4.0.4",
			"@deepseek-ai/dsh-agent-preset-registry": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-connection": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-locale": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-store": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-ui-input-trigger": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-ui-plugin-manager": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-ui-settings": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-ui-settings-plugins": "0.1.7-rc.1",
			"@deepseek-ai/dsh-client-ui-slots": "0.1.7-rc.1",
			"@deepseek-ai/dsh-host-webserver": "0.1.7-rc.1",
			"@deepseek-ai/dsh-scope": "0.1.7-rc.1",
			"@deepseek-ai/dsh-session": "0.1.7-rc.1",
			"@deepseek-ai/dsh-session-query": "0.1.7-rc.1",
			"@deepseek-ai/dsh-settings": "0.1.7-rc.1",
			"@deepseek-ai/dsh-skill": "0.1.7-rc.1",
			"@deepseek-ai/dsh-system-prompt": "0.1.7-rc.1",
			"@deepseek-ai/schemastery": "^3.18.3",
			"@types/js-yaml": "^4.0.9",
			"@types/node": "^22.20.0",
			"@types/react": "~18.3.1",
			"@types/react-dom": "^18.3.5",
			"lightningcss": "1.32.0",
			"react": "^18.3.1",
			"react-dom": "^18.3.1",
			"tsdown": "0.22.2",
			"typescript": "~5.7.2",
			"vitest": "^3.0.0"
		},
		"files": [
			"lib/**/*.js",
			"lib/**/*.d.ts",
			"cordis.patch.yml",
			"README.md",
			"LICENSE"
		],
		"keywords": [
			"dsh-plugin",
			"dsh",
			"deepseek-harness",
			"skill",
			"skills",
			"skill-manager",
			"agent-skills",
			"skill-group"
		],
		"license": "MIT",
		"scripts": {
			"build": "tsc -p tsconfig.build.json && tsdown",
			"bundle": "tsdown",
			"watch": "tsdown --watch",
			"typecheck": "tsc --noEmit",
			"test": "vitest run",
			"test:watch": "vitest",
			"smoke": "node scripts/smoke-load.mjs",
			"prebuild": "node -e \"require('fs').rmSync('lib',{recursive:true,force:true})\""
		},
		"repository": {
			"type": "git",
			"url": "git+https://github.com/FlyDut/dsh-skill-group.git"
		},
		"bugs": { "url": "https://github.com/FlyDut/dsh-skill-group/issues" },
		"homepage": "https://github.com/FlyDut/dsh-skill-group"
	};
})))().version;
//#endregion
//#region src/routes/catalog-data.ts
/**
* routes 共享层 · 目录装配：完整目录响应（时间戳/interface 元数据/重名诊断）
* 与详情映射。目录只覆盖用户级根；技能是否处于「运行时关闭」由 sidecar 的
* 关闭名单标记成 `enabled: false`，文件与发现层完全不动。
*/
/** 目录中存在的技能名集合（tag 成员校验用）：目录名 ∪ 关闭名单，避免成员因关闭而丢失。 */
async function knownSkillNames(deps) {
	const snapshot = await deps.skills.snapshot();
	const names = new Set(snapshot.skills.map((skill) => skill.name));
	for (const disabled of await deps.store.listDisabled()) names.add(disabled.name);
	return names;
}
/**
* Build the full catalog response (shared by catalog/toggle/create handlers).
*
* 管理视图只覆盖用户级根（~/.dsh/skills、~/.agents/skills）。关闭的技能仍在
* 目录里，只是带上 `enabled: false`：文件没改名，发现层照常看到它，面板需要
* 那一行来把开关打开。
*/
async function buildCatalog(deps) {
	const home = homeOf(deps);
	const snapshot = await deps.skills.snapshot();
	const disabledNames = new Set((await deps.store.listDisabled()).map((entry) => entry.name));
	const identitiesByName = /* @__PURE__ */ new Map();
	const byName = /* @__PURE__ */ new Map();
	for (const skill of snapshot.skills) {
		let identities = identitiesByName.get(skill.name);
		if (identities === void 0) {
			identities = /* @__PURE__ */ new Set();
			identitiesByName.set(skill.name, identities);
		}
		identities.add(skill.source + "\0" + skill.provider);
		if (!byName.has(skill.name)) byName.set(skill.name, skill);
	}
	const duplicateNames = [...identitiesByName.entries()].filter(([, identities]) => identities.size > 1).map(([name]) => name).sort((a, b) => a.localeCompare(b));
	const timesByName = /* @__PURE__ */ new Map();
	await Promise.all([...byName.values()].map(async (skill) => {
		if (!isWritableSource(skill.source)) return;
		for (const candidate of skillLocationCandidates(skill.source, skill.name, home)) try {
			const times = await stat(candidate);
			timesByName.set(skill.name, {
				addedAt: times.birthtimeMs,
				updatedAt: times.mtimeMs
			});
			return;
		} catch {}
	}));
	const interfaceByName = /* @__PURE__ */ new Map();
	await Promise.all([...byName.values()].map(async (skill) => {
		if (!isWritableSource(skill.source)) return;
		const dir = skillDir(skill.source, skill.name, home);
		try {
			const iface = await readSkillInterface(dir);
			if (iface !== void 0) interfaceByName.set(skill.name, iface);
		} catch {}
	}));
	const skills = [...byName.values()].map((skill) => {
		const row = {
			name: skill.name,
			description: skill.description,
			...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},
			invocation: {
				modelInvocable: skill.invocation.modelInvocable,
				userInvocable: skill.invocation.userInvocable
			},
			provider: skill.provider,
			writable: isWritableSource(skill.source),
			source: skill.source,
			enabled: !disabledNames.has(skill.name)
		};
		const times = timesByName.get(skill.name);
		if (times !== void 0) {
			row.addedAt = times.addedAt;
			row.updatedAt = times.updatedAt;
		}
		const iface = interfaceByName.get(skill.name);
		if (iface !== void 0) applyInterface(row, iface);
		return row;
	});
	const diagnostics = [...await scanDiagnostics("user-dsh", home), ...await scanDiagnostics("user-agents", home)];
	return {
		ok: true,
		pluginVersion: CURRENT_VERSION,
		complete: snapshot.complete,
		skills,
		diagnostics,
		...duplicateNames.length > 0 ? { duplicateNames } : {}
	};
}
/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
function applyInterface(row, iface) {
	if (iface.displayName !== void 0) row.displayName = iface.displayName;
	if (iface.shortDescription !== void 0) row.shortDescription = iface.shortDescription;
	if (iface.brandColor !== void 0) row.brandColor = iface.brandColor;
	if (iface.iconSmall !== void 0) row.iconSmall = iface.iconSmall;
	if (iface.iconLarge !== void 0) row.iconLarge = iface.iconLarge;
	if (iface.defaultPrompt !== void 0) row.defaultPrompt = iface.defaultPrompt;
}
/** Map a loaded definition onto the wire shape. `enabled` mirrors the sidecar switch. */
function toDetail(skill, enabled = true) {
	return {
		name: skill.name,
		description: skill.description,
		...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},
		invocation: {
			modelInvocable: skill.invocation.modelInvocable,
			userInvocable: skill.invocation.userInvocable
		},
		provider: skill.provider,
		...skill.path !== void 0 ? { path: skill.path } : {},
		content: skill.content,
		enabled
	};
}
//#endregion
//#region src/routes/helpers.ts
/**
* Wrap one handler in the shared request fences. Order matches the
* original per-handler prologue: loopback trust → HTTP method → master
* switch → JSON body. The outer catch maps errors onto the JSON error
* body (preserving RepoFetchError status codes).
*/
function createRoute(deps, spec) {
	return {
		kind: spec.kind ?? "exact",
		path: spec.path,
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeError(res, 403, "forbidden: loopback-only");
				return;
			}
			if (!spec.methods.includes(req.method)) {
				writeError(res, 405, "method not allowed: " + (req.method ?? ""));
				return;
			}
			if (spec.skipGate !== true && disabledGate(deps, res)) return;
			const url = new URL(req.url ?? "/", "http://localhost");
			let body = {};
			if (spec.jsonBody === true && req.method === "POST") {
				const parsed = await readJsonBody(req);
				if (parsed === void 0) {
					writeError(res, 400, "invalid JSON body");
					return;
				}
				body = parsed;
			}
			try {
				await spec.handler({
					req,
					res,
					url,
					body
				});
			} catch (error) {
				writeRouteError(res, error);
			}
		}
	};
}
//#endregion
//#region src/routes/catalog.ts
/**
* 目录域路由：catalog / skill 详情 / toggle / toggle-batch / skill 删除 /
* create / stats。
*
* 开关是运行时的：toggle 只写 sidecar 的关闭名单，文件与发现层一律不动；
* 真正的遮蔽由执行层的 per-preset 闸门在下一轮接线时生效。删除是唯一的破坏性
* 操作，只在面板确认之后才落盘，且仅限用户级可写根。
*/
/**
* 文件创建/修改时间 → 详情行的 addedAt/updatedAt（读取失败时省略字段，
* 详情页不显示这两行）。
*/
async function applyFileTimes(row, path) {
	try {
		const times = await stat(path);
		row.addedAt = times.birthtimeMs;
		row.updatedAt = times.mtimeMs;
	} catch {}
}
/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function catalogRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.catalog,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, await buildCatalog(deps));
			}
		},
		{
			path: SKILL_HUB_API.skill,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const name = queryParam(url, "name");
				if (name === void 0 || name === "") {
					writeError(res, 400, "name query parameter is required");
					return;
				}
				const skill = await deps.skills.get(name);
				if (skill === void 0) {
					writeError(res, 404, "skill not found: " + name);
					return;
				}
				const detail = toDetail(skill, await deps.store.getDisabled(name) === void 0);
				if (skill.path !== void 0) {
					await applyFileTimes(detail, skill.path);
					try {
						const rb = skill.resourceBase;
						const dir = rb?.kind === "directory" && typeof rb.path === "string" ? rb.path : skill.path.endsWith("SKILL.md") ? dirname(skill.path) : void 0;
						if (dir !== void 0) {
							const iface = await readSkillInterface(dir);
							if (iface !== void 0) applyInterface(detail, iface);
						}
					} catch {}
				}
				writeJson(res, 200, {
					ok: true,
					skill: detail
				});
			}
		},
		{
			path: SKILL_HUB_API.toggle,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name");
				if (name === "") {
					writeError(res, 400, "name is required");
					return;
				}
				if (body.enabled === true) {
					if (await deps.store.getDisabled(name) === void 0) {
						writeError(res, 404, "skill is not switched off: " + name);
						return;
					}
					await deps.store.removeDisabled(name);
				} else {
					if (await deps.skills.get(name) === void 0) {
						writeError(res, 404, "skill not found: " + name);
						return;
					}
					if (await deps.store.getDisabled(name) === void 0) await deps.store.addDisabled({
						name,
						disabledAt: Date.now()
					});
				}
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					catalog: await buildCatalog(deps)
				});
			}
		},
		{
			path: SKILL_HUB_API.toggleBatch,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const names = readStrings(body, "names");
				if (names.length === 0) {
					writeError(res, 400, "names must be a non-empty array");
					return;
				}
				const enabled = body.enabled === true;
				const failures = [];
				for (const name of names) try {
					if (enabled) {
						if (await deps.store.getDisabled(name) === void 0) continue;
						await deps.store.removeDisabled(name);
					} else {
						if (await deps.store.getDisabled(name) !== void 0) continue;
						if (await deps.skills.get(name) === void 0) {
							failures.push({
								name,
								error: "skill not found: " + name
							});
							continue;
						}
						await deps.store.addDisabled({
							name,
							disabledAt: Date.now()
						});
					}
				} catch (error) {
					failures.push({
						name,
						error: errorText(error)
					});
				}
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					catalog: await buildCatalog(deps),
					failures
				});
			}
		},
		{
			path: SKILL_HUB_API.skillDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const names = readStrings(body, "names");
				if (names.length === 0) {
					writeError(res, 400, "names must be a non-empty array");
					return;
				}
				const deleted = [];
				const failures = [];
				for (const name of names) try {
					const target = await resolveWritableSkill(deps, name);
					if (!target.ok) {
						failures.push({
							name,
							error: target.error
						});
						continue;
					}
					await deleteSkillFiles(target.path, homeOf(deps));
					deleted.push(name);
				} catch (error) {
					failures.push({
						name,
						error: errorText(error)
					});
				}
				if (deleted.length > 0) {
					try {
						for (const name of deleted) {
							await deps.store.removeDisabled(name);
							await deps.store.removeSkillFromTags(name);
							await deps.store.removeSkillFromSources(name);
						}
					} catch {}
					deps.invalidate?.();
				}
				writeJson(res, 200, {
					ok: true,
					deleted,
					failures,
					catalog: await buildCatalog(deps)
				});
			}
		},
		{
			path: SKILL_HUB_API.create,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name").trim();
				if (!isSkillName(name)) {
					writeError(res, 400, "skill name must be kebab-case (lowercase letters, digits, dashes)");
					return;
				}
				const rootText = body.root === void 0 ? "user-dsh" : readString(body, "root");
				if (!isWritableSource(rootText)) {
					writeError(res, 400, "root must be user-dsh or user-agents");
					return;
				}
				const root = rootText;
				if (await deps.skills.get(name) !== void 0) {
					writeError(res, 409, "skill name already exists: " + name);
					return;
				}
				if (await pathExists(skillDir(root, name, homeOf(deps)))) {
					writeError(res, 409, "skill directory already exists on disk: " + name + " (check the discovery diagnostics)");
					return;
				}
				const path = await createSkill(root, name, readString(body, "description"), homeOf(deps), readString(body, "content"));
				await deps.store.removeDisabled(name);
				deps.invalidate?.();
				writeJson(res, 201, {
					ok: true,
					path,
					root
				});
			}
		},
		{
			path: SKILL_HUB_API.stats,
			methods: ["GET"],
			handler: async ({ res }) => {
				if (deps.stats === void 0) {
					writeJson(res, 200, {
						ok: true,
						available: false,
						stats: []
					});
					return;
				}
				const display = configOf(deps);
				if (display.showUseCount === false && display.showUseTime === false && display.showGroupSummary === false) {
					writeJson(res, 200, {
						ok: true,
						available: false,
						stats: []
					});
					return;
				}
				const stats = await deps.stats();
				writeJson(res, 200, {
					ok: true,
					available: true,
					...deps.stats.source !== void 0 ? { source: deps.stats.source } : {},
					stats
				});
			}
		}
	];
}
//#endregion
//#region src/routes/config.ts
/**
* 配置域路由：config（总开关开着也可用，设置卡自救入口）/ update 自身更新
* 检查 / diagnosticFix。从 routes.ts 原样搬出，handler 逻辑不变。
*/
/**
* Build a config payload for either method. The GitHub token never goes out:
* the effective config and the raw saved overrides are both stripped, and its
* presence is reported as a plain boolean instead.
*/
function configResponse(config, saved) {
	const token = config.githubToken;
	return {
		ok: true,
		pluginVersion: CURRENT_VERSION,
		config: redactGithubToken(config),
		saved: redactGithubToken(saved),
		githubTokenSet: token !== void 0 && token !== ""
	};
}
/** 配置域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function configRoutes(deps) {
	return [{
		path: SKILL_HUB_API.config,
		methods: ["GET", "POST"],
		jsonBody: true,
		skipGate: true,
		handler: async ({ req, res, body }) => {
			if (req.method === "GET") {
				writeJson(res, 200, configResponse(configOf(deps), savedOf(deps)));
				return;
			}
			const raw = body;
			const patch = {};
			if (raw.enabled !== void 0) if (raw.enabled === null) patch.enabled = void 0;
			else if (typeof raw.enabled !== "boolean") {
				writeError(res, 400, "enabled must be a boolean or null");
				return;
			} else patch.enabled = raw.enabled;
			if (raw.announceToAgent !== void 0) if (raw.announceToAgent === null) patch.announceToAgent = void 0;
			else if (typeof raw.announceToAgent !== "boolean") {
				writeError(res, 400, "announceToAgent must be a boolean or null");
				return;
			} else patch.announceToAgent = raw.announceToAgent;
			for (const key of [
				"showUseCount",
				"showUseTime",
				"showGroupSummary"
			]) {
				const value = raw[key];
				if (value === void 0) continue;
				if (value === null) {
					patch[key] = void 0;
					continue;
				}
				if (typeof value !== "boolean") {
					writeError(res, 400, key + " must be a boolean or null");
					return;
				}
				patch[key] = value;
			}
			for (const key of ["dotModelColor", "dotUserColor"]) {
				const value = raw[key];
				if (value === void 0) continue;
				if (value === null) {
					patch[key] = void 0;
					continue;
				}
				if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
					writeError(res, 400, key + " must be a #rrggbb color or null");
					return;
				}
				patch[key] = value;
			}
			if (raw.githubToken !== void 0) {
				const value = raw.githubToken;
				if (value === null) patch.githubToken = void 0;
				else if (typeof value !== "string" || value.trim() === "") patch.githubToken = void 0;
				else if (!GITHUB_TOKEN_RE.test(value.trim())) {
					writeError(res, 400, "githubToken looks invalid (expected a personal access token)");
					return;
				} else patch.githubToken = value.trim();
			}
			let config;
			if (deps.updateConfig === void 0) {
				const merged = { ...configOf(deps) };
				for (const [key, value] of Object.entries(patch)) if (value === void 0) delete merged[key];
				else merged[key] = value;
				config = merged;
			} else config = await deps.updateConfig(patch);
			writeJson(res, 200, configResponse(config, savedOf(deps)));
		}
	}, {
		path: SKILL_HUB_API.diagnosticFix,
		methods: ["POST"],
		jsonBody: true,
		handler: async ({ res, body }) => {
			const request = body;
			const rawPath = typeof request.path === "string" ? request.path.trim() : "";
			if (rawPath === "") {
				writeError(res, 400, "path is required");
				return;
			}
			try {
				await fixDiagnosticFile(rawPath, homeOf(deps));
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					path: rawPath
				});
			} catch (error) {
				if (error instanceof TypeError) {
					writeError(res, 400, error);
					return;
				}
				writeRouteError(res, error);
			}
		}
	}];
}
/** Last successful check time per repo (in-memory throttle for GitHub rate limits). */
const lastSourceCheck = /* @__PURE__ */ new Map();
/** Last successful market update check per repo (same throttle). */
const lastMarketCheck = /* @__PURE__ */ new Map();
/** Market stats (stars/downloads) throttle: hourly, plus a fallback cache. */
const lastMarketStats = /* @__PURE__ */ new Map();
const marketStatsCache = /* @__PURE__ */ new Map();
/** One-time seed of the in-memory stats cache from the sidecar (survives restarts). */
let marketStatsSeeded = false;
async function seedMarketStats(deps) {
	if (marketStatsSeeded) return;
	marketStatsSeeded = true;
	try {
		const saved = await deps.store.getMarketStatsState();
		if (saved === void 0) return;
		for (const [repo, stats] of Object.entries(saved.stats)) if (!marketStatsCache.has(repo)) {
			marketStatsCache.set(repo, stats);
			lastMarketStats.set(repo, saved.fetchedAt);
		}
	} catch {}
}
const importJobs = /* @__PURE__ */ new Map();
const IMPORT_JOB_TTL_MS = 5 * 6e4;
function gcImportJobs() {
	const now = Date.now();
	for (const [id, job] of importJobs) if (job.status !== "running" && now - job.createdAt > IMPORT_JOB_TTL_MS) importJobs.delete(id);
	if (importJobs.size > 100) {
		const finished = [...importJobs.entries()].filter(([, job]) => job.status !== "running").sort((a, b) => a[1].createdAt - b[1].createdAt);
		for (let i = 0; i < finished.length && importJobs.size > 100; i++) importJobs.delete(finished[i][0]);
	}
}
/** Replace one skill directory with a fresh download; restores the old dir on failure. */
async function replaceSkillDir(targetDir, download) {
	const backup = join(dirname(targetDir), "." + basename(targetDir) + ".sync-bak-" + Date.now());
	await rename(targetDir, backup);
	try {
		await download();
	} catch (error) {
		await rename(backup, targetDir).catch((rollbackError) => {
			console.warn("[skill-hub] restoring " + targetDir + " from " + backup + " failed:", errorText(rollbackError));
		});
		throw error;
	}
	await rm(backup, {
		recursive: true,
		force: true
	});
}
//#endregion
//#region src/routes/market.ts
/**
* 市场域路由：market 列表 / source 增删 / ref 锁定 / versions 选择器 /
* check 更新检查 / stats 星标统计 / sync 对齐版本。从 routes.ts 原样搬出，
* handler 逻辑不变。
*/
/** 市场域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function marketRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.market,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.listMarketSources()
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSource,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo").trim());
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const ref = parsed.ref;
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.addMarketSource(repoSlug(parsed), ref)
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo").trim());
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.removeMarketSource(repoSlug(parsed))
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceRef,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo"));
				const ref = readString(body, "ref").trim();
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				if (ref === "") {
					writeError(res, 400, "ref is required");
					return;
				}
				if (await deps.store.setMarketSourceRef(repoSlug(parsed), ref) === void 0) {
					writeError(res, 404, "market source not found: " + repoSlug(parsed));
					return;
				}
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.listMarketSources()
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceVersions,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const parsed = normalizeRepoInput(queryParam(url, "repo") ?? "");
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const source = await deps.store.getMarketSource(repo);
				if (source === void 0) {
					writeError(res, 404, "market source not found: " + repo);
					return;
				}
				const [releases, branches] = await Promise.all([listRepoReleases(repo), listRepoBranches(repo)]);
				writeJson(res, 200, {
					ok: true,
					repo,
					...source.ref !== void 0 && source.ref !== "" ? { current: source.ref } : {},
					releases,
					branches
				});
			}
		},
		{
			path: SKILL_HUB_API.marketCheck,
			methods: ["GET"],
			handler: async ({ res }) => {
				const sources = await deps.store.listMarketSources();
				if (lastMarketCheck.size > 500) lastMarketCheck.clear();
				const results = [];
				for (const source of sources) {
					const base = {
						repo: source.repo,
						...source.ref !== void 0 ? { ref: source.ref } : {}
					};
					const now = Date.now();
					if (now - (lastMarketCheck.get(source.repo) ?? 0) < 3e5) {
						results.push({
							...base,
							updateAvailable: false,
							commitSha: source.commitSha ?? "",
							throttled: true
						});
						continue;
					}
					try {
						const latestTag = await getLatestReleaseTag(source.repo);
						if (source.ref === void 0) {
							results.push({
								...base,
								updateAvailable: false,
								commitSha: source.commitSha ?? "",
								...latestTag !== void 0 ? { latestTag } : {}
							});
							continue;
						}
						const latest = await getLatestCommit(source.repo, source.ref);
						lastMarketCheck.set(source.repo, now);
						const commitMoved = source.commitSha !== void 0 && latest.commitSha !== source.commitSha;
						const newRelease = latestTag !== void 0 && latestTag !== source.ref;
						results.push({
							...base,
							updateAvailable: commitMoved || newRelease,
							commitSha: latest.commitSha,
							...newRelease ? { latestTag } : {}
						});
					} catch (error) {
						results.push({
							...base,
							updateAvailable: false,
							commitSha: source.commitSha ?? "",
							error: errorText(error)
						});
					}
				}
				writeJson(res, 200, {
					ok: true,
					results
				});
			}
		},
		{
			path: SKILL_HUB_API.marketStats,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const refresh = queryParam(url, "refresh") === "1";
				await seedMarketStats(deps);
				const sources = await deps.store.listMarketSources();
				if (lastMarketStats.size > 500) lastMarketStats.clear();
				const results = [];
				const now = Date.now();
				let fetchedAny = false;
				for (const source of sources) {
					const cached = marketStatsCache.get(source.repo);
					const age = now - (lastMarketStats.get(source.repo) ?? 0);
					if (cached !== void 0 && (!refresh || age < 36e5)) {
						results.push({
							repo: source.repo,
							stars: cached.stars,
							downloads: cached.downloads,
							...age >= 36e5 ? { stale: true } : refresh ? { throttled: true } : {}
						});
						continue;
					}
					try {
						const stats = await getRepoStats(source.repo);
						marketStatsCache.set(source.repo, stats);
						lastMarketStats.set(source.repo, now);
						fetchedAny = true;
						results.push({
							repo: source.repo,
							...stats
						});
					} catch (error) {
						if (cached !== void 0) results.push({
							repo: source.repo,
							stars: cached.stars,
							downloads: cached.downloads,
							stale: true
						});
						else results.push({
							repo: source.repo,
							stars: 0,
							downloads: 0,
							error: errorText(error)
						});
					}
				}
				if (fetchedAny) deps.store.saveMarketStatsState({
					fetchedAt: now,
					stats: Object.fromEntries(marketStatsCache)
				}).catch(() => {});
				writeJson(res, 200, {
					ok: true,
					results
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSync,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo"));
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const source = await deps.store.getMarketSource(repo);
				if (source === void 0) {
					writeError(res, 404, "market source not found: " + repo);
					return;
				}
				let ref = source.ref;
				if (ref === void 0 || ref === "") {
					const latestTag = await getLatestReleaseTag(repo);
					if (latestTag === void 0) {
						writeError(res, 409, "repo has no release — pick a branch first");
						return;
					}
					ref = latestTag;
					await deps.store.setMarketSourceRef(repo, ref);
				}
				const latest = await getLatestCommit(repo, ref);
				await deps.store.setMarketSourceCommit(repo, latest.commitSha);
				await deps.store.setSourceRef(repo, ref);
				const tracked = await deps.store.getSource(repo);
				writeJson(res, 200, {
					ok: true,
					repo,
					ref,
					commitSha: latest.commitSha,
					skills: tracked !== void 0 ? [...tracked.skills] : []
				});
			}
		}
	];
}
//#endregion
//#region src/routes/repo-import.ts
/**
* 仓库导入域路由：repo 发现 / repoImport 异步导入任务 / progress 轮询 /
* cancel 取消。从 routes.ts 原样搬出，handler 逻辑不变。
*/
/** 仓库导入域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function repoImportRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.repo,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const parsed = normalizeRepoInput(queryParam(url, "repo") ?? "");
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				let ref = parsed.ref;
				if (ref === void 0 || ref === "") {
					const pinned = await deps.store.getMarketSource(repo);
					if (pinned?.ref !== void 0 && pinned.ref !== "") ref = pinned.ref;
				}
				if (ref === void 0 || ref === "") {
					const releaseTag = await getLatestReleaseTag(repo);
					if (releaseTag !== void 0) {
						ref = releaseTag;
						const existing = await deps.store.getMarketSource(repo);
						if (existing !== void 0 && (existing.ref === void 0 || existing.ref === "")) await deps.store.setMarketSourceRef(repo, releaseTag);
					} else {
						const branches = await listRepoBranches(repo);
						if (branches.length === 0) {
							writeError(res, 404, "repo has no branches to scan");
							return;
						}
						writeJson(res, 200, {
							ok: true,
							repo,
							ref: null,
							branches,
							entries: []
						});
						return;
					}
				}
				const { ref: resolvedRef, tree, truncated } = await loadRepoTree(repo, ref);
				writeJson(res, 200, {
					ok: true,
					repo,
					ref: resolvedRef,
					entries: discoverRepoEntries(tree, repo, await knownSkillNames(deps)),
					...truncated ? { truncated: true } : {}
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImport,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const input = readString(body, "repo").trim();
				const paths = readStrings(body, "paths");
				if (paths.length === 0) {
					writeError(res, 400, "paths must be a non-empty array");
					return;
				}
				const parsed = normalizeRepoInput(input);
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const requestedRef = readString(body, "ref");
				const { ref: resolvedRef, tree } = await loadRepoTree(repo, requestedRef !== "" ? requestedRef : parsed.ref);
				const entries = discoverRepoEntries(tree, repo, await knownSkillNames(deps));
				const byPath = new Map(entries.map((entry) => [entry.path, entry]));
				const selected = paths.map((path) => byPath.get(path)).filter((entry) => entry !== void 0);
				if (selected.length === 0) {
					writeError(res, 400, "no matching skills for selected paths");
					return;
				}
				if (selected.length > 500) {
					writeError(res, 400, "select at most 500 skills per import");
					return;
				}
				const totalBytes = selected.reduce((sum, entry) => sum + entry.totalBytes, 0);
				if (totalBytes > 200 * 1024 * 1024) {
					writeError(res, 400, "selected skills exceed the 200MB import limit");
					return;
				}
				let commitSha = "";
				try {
					commitSha = (await getLatestCommit(repo, resolvedRef)).commitSha;
				} catch {}
				const jobId = "imp_" + randomUUID().slice(0, 8);
				const controller = new AbortController();
				const now = Date.now();
				const job = {
					jobId,
					total: selected.length,
					done: 0,
					totalBytes,
					downloadedBytes: 0,
					startTime: now,
					imported: [],
					skipped: [],
					failed: [],
					status: "running",
					controller,
					createdAt: now
				};
				gcImportJobs();
				importJobs.set(jobId, job);
				cleanupLeftoverImportDirs(rootPath("user-dsh", homeOf(deps))).catch(() => {});
				(async () => {
					const targetRoot = rootPath("user-dsh", homeOf(deps));
					await mkdir(targetRoot, { recursive: true });
					let needInvalidate = false;
					for (const entry of selected) {
						if (controller.signal.aborted) break;
						job.current = entry.name;
						job.currentFile = entry.path;
						if (entry.existing) {
							job.skipped.push({
								name: entry.name,
								reason: "exists"
							});
							job.downloadedBytes += entry.totalBytes;
							job.done += 1;
							continue;
						}
						if (await pathExists(join(targetRoot, entry.name))) {
							job.skipped.push({
								name: entry.name,
								reason: "exists"
							});
							job.downloadedBytes += entry.totalBytes;
							job.done += 1;
							continue;
						}
						if (controller.signal.aborted) break;
						const files = collectRepoSkillFiles(tree, entry.dir);
						try {
							const result = await downloadRepoSkill(repo, resolvedRef, entry, files, targetRoot, fetch, controller.signal, (bytes, file) => {
								job.downloadedBytes += bytes;
								job.currentFile = skillPathIn(entry.dir, file);
							});
							await deps.store.addSourceSkill(repo, entry.root, commitSha, resolvedRef, entry.name);
							await deps.store.mergeSourceManifest(repo, skillManifest(tree, entry.dir), entry.dir);
							job.imported.push({
								name: entry.name,
								origin: entry.origin,
								path: result.skillPath
							});
							needInvalidate = true;
						} catch (error) {
							if (isAbortError(error) || controller.signal.aborted) break;
							job.failed.push({
								name: entry.name,
								error: errorText(error)
							});
						} finally {
							job.done += 1;
						}
					}
					if (controller.signal.aborted) {
						job.status = "cancelled";
						job.current = void 0;
						job.currentFile = void 0;
					} else {
						job.status = "done";
						job.current = void 0;
						job.currentFile = void 0;
						job.downloadedBytes = job.totalBytes;
					}
					if (needInvalidate) deps.invalidate?.();
				})().catch((error) => {
					job.status = "error";
					job.error = errorText(error);
					job.current = void 0;
					job.currentFile = void 0;
				});
				writeJson(res, 200, {
					ok: true,
					jobId,
					total: selected.length,
					totalBytes
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImportProgress,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const jobId = queryParam(url, "jobId") ?? "";
				if (jobId === "") {
					writeError(res, 400, "jobId is required");
					return;
				}
				const job = importJobs.get(jobId);
				if (job === void 0) {
					writeError(res, 404, "import job not found: " + jobId);
					return;
				}
				const elapsedSec = Math.max(.5, (Date.now() - job.startTime) / 1e3);
				const bytesPerSecond = job.status === "running" ? Math.round(job.downloadedBytes / elapsedSec) : void 0;
				writeJson(res, 200, {
					ok: true,
					jobId: job.jobId,
					status: job.status,
					total: job.total,
					done: job.done,
					...job.current !== void 0 ? { current: job.current } : {},
					...job.currentFile !== void 0 ? { currentFile: job.currentFile } : {},
					totalBytes: job.totalBytes,
					downloadedBytes: job.downloadedBytes,
					...bytesPerSecond !== void 0 ? { bytesPerSecond } : {},
					imported: [...job.imported],
					skipped: [...job.skipped],
					failed: [...job.failed],
					...job.error !== void 0 ? { error: job.error } : {}
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImportCancel,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const jobId = readString(body, "jobId");
				if (jobId === "") {
					writeError(res, 400, "jobId is required");
					return;
				}
				const job = importJobs.get(jobId);
				if (job === void 0) {
					writeError(res, 404, "import job not found: " + jobId);
					return;
				}
				if (job.status === "running") {
					job.controller.abort();
					job.status = "cancelled";
				}
				writeJson(res, 200, {
					ok: true,
					jobId: job.jobId,
					status: job.status
				});
			}
		}
	];
}
//#endregion
//#region src/routes/groups.ts
/**
* 分组域路由：groups / tag 新建重命名 / tag 删除 / tag 成员。
* 从 routes.ts 原样搬出，handler 逻辑不变。
*/
/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function groupRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.groups,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, await buildGroups(deps));
			}
		},
		{
			path: SKILL_HUB_API.tag,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name").trim();
				if (name === "") {
					writeError(res, 400, "tag name is required");
					return;
				}
				const rawId = readString(body, "id");
				await deps.store.saveTag({
					...rawId !== "" ? { id: rawId } : {},
					name
				});
				writeJson(res, 200, {
					ok: true,
					tags: await deps.store.listTags()
				});
			}
		},
		{
			path: SKILL_HUB_API.tagDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const id = readString(body, "id");
				if (id === "") {
					writeError(res, 400, "tag id is required");
					return;
				}
				await deps.store.deleteTag(id);
				writeJson(res, 200, {
					ok: true,
					tags: await deps.store.listTags()
				});
			}
		},
		{
			path: SKILL_HUB_API.tagMembers,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const id = readString(body, "id");
				if (id === "") {
					writeError(res, 400, "tag id is required");
					return;
				}
				const names = readStrings(body, "skillNames", { keepEmpty: true });
				const known = await knownSkillNames(deps);
				if (await deps.store.setTagMembers(id, names.filter((n) => known.has(n))) === void 0) {
					writeError(res, 404, "tag not found: " + id);
					return;
				}
				writeJson(res, 200, {
					ok: true,
					tags: await deps.store.listTags()
				});
			}
		}
	];
}
//#endregion
//#region src/routes/scopes.ts
/**
* 模式域路由：preset 名单 + 每条的接线状态与策略（GET /presets）、可见性展开
* 明细（GET /scope/preview）、策略写入（POST /scope）。
*
* 这一层只做三件事：参数校验、把宿主接口的读数投影成契约形状、错误映射成
* 4xx。策略语义与运行时效果分别在 `domain/` 与 `enforcement/`，此处不复制。
*
* 能力缺席（部署里没有 agentPresets 服务）时不是错误：/presets 老实地
* 报告 `available: false` 与原因，写入口返回 503——面板据此把「模式」tab 降级
* 为只读，而插件其余功能毫无感知。
*/
/** 模式域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function scopeRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.presets,
			methods: ["GET"],
			handler: async ({ res }) => {
				const scopes = deps.scopes;
				if (scopes === void 0) {
					writeJson(res, 200, {
						ok: true,
						available: false,
						unavailableReason: "mode isolation is not wired in this deployment",
						presets: [],
						pendingCount: 0
					});
					return;
				}
				const snapshot = await scopes.presets();
				const presets = [];
				for (const entry of snapshot.entries) {
					const [policy, visibility] = await Promise.all([scopes.policyOf(entry.id), scopes.visibilityOf(entry.id)]);
					presets.push({
						id: entry.id,
						...entry.name !== void 0 ? { name: entry.name } : {},
						...entry.description !== void 0 ? { description: entry.description } : {},
						trust: entry.trust,
						isDefault: entry.isDefault,
						mounted: snapshot.mounted.includes(entry.id),
						gateActive: snapshot.active.includes(entry.id),
						policy: policy ?? {
							presetId: entry.id,
							enabled: false,
							groups: [],
							skills: []
						},
						visibleCount: visibility.visible.length,
						hiddenCount: visibility.hidden.length
					});
				}
				writeJson(res, 200, {
					ok: true,
					available: snapshot.available,
					...snapshot.reason !== void 0 ? { unavailableReason: snapshot.reason } : {},
					presets,
					pendingCount: presets.filter((row) => row.policy.enabled && !row.gateActive).length
				});
			}
		},
		{
			path: SKILL_HUB_API.scopePreview,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const scopes = deps.scopes;
				if (scopes === void 0) {
					writeError(res, 503, "mode isolation is not wired in this deployment");
					return;
				}
				const presetId = (url.searchParams.get("presetId") ?? "").trim();
				if (!PRESET_ID_RE.test(presetId)) {
					writeError(res, 400, "presetId is required and must be a valid preset id");
					return;
				}
				const [policy, visibility] = await Promise.all([scopes.policyOf(presetId), scopes.visibilityOf(presetId)]);
				writeJson(res, 200, {
					ok: true,
					presetId,
					enabled: policy?.enabled === true,
					visible: visibility.visible,
					hidden: visibility.hidden,
					dangling: visibility.dangling,
					resolved: visibility.resolved
				});
			}
		},
		{
			path: SKILL_HUB_API.scope,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const scopes = deps.scopes;
				if (scopes === void 0) {
					writeError(res, 503, "mode isolation is not wired in this deployment");
					return;
				}
				const presetId = readString(body, "presetId").trim();
				if (!PRESET_ID_RE.test(presetId)) {
					writeError(res, 400, "presetId is required and must be a valid preset id");
					return;
				}
				if (body.reset === true) {
					await scopes.deletePolicy(presetId);
					scopes.notifyPolicyChanged(presetId);
					writeJson(res, 200, {
						ok: true,
						policy: null
					});
					return;
				}
				let enabled;
				if (body.enabled !== void 0) {
					if (typeof body.enabled !== "boolean") {
						writeError(res, 400, "enabled must be a boolean");
						return;
					}
					enabled = body.enabled;
				}
				let groups;
				if (body.groups !== void 0) {
					if (!Array.isArray(body.groups)) {
						writeError(res, 400, "groups must be an array of strings");
						return;
					}
					groups = cleanKeys(body.groups);
				}
				let skills;
				if (body.skills !== void 0) {
					if (!Array.isArray(body.skills)) {
						writeError(res, 400, "skills must be an array of strings");
						return;
					}
					skills = cleanNames(body.skills);
				}
				if (enabled === void 0 && groups === void 0 && skills === void 0) {
					writeError(res, 400, "nothing to update: provide enabled, groups, or skills");
					return;
				}
				if (enabled === true && body.confirmEmpty !== true) {
					const current = await scopes.policyOf(presetId);
					const nextGroups = groups ?? current?.groups ?? [];
					const nextSkills = skills ?? current?.skills ?? [];
					if (nextGroups.length === 0 && nextSkills.length === 0) {
						writeError(res, 409, "an empty whitelist hides every skill in this preset; resend with confirmEmpty: true to confirm");
						return;
					}
				}
				try {
					const policy = await scopes.savePolicy(presetId, {
						...enabled !== void 0 ? { enabled } : {},
						...groups !== void 0 ? { groups } : {},
						...skills !== void 0 ? { skills } : {}
					});
					scopes.notifyPolicyChanged(presetId);
					writeJson(res, 200, {
						ok: true,
						policy
					});
				} catch (error) {
					writeRouteError(res, error);
				}
			}
		}
	];
}
//#endregion
//#region src/routes/workspaces.ts
/**
* 工作区域路由：工作区名单 + 每条的策略与展开计数（GET /workspaces）、
* 策略写入（POST /workspace）。
*
* 与 `./scopes.ts`（模式域）结构完全对称：这一层只做三件事——参数校验、把宿主
* 接口的读数投影成契约形状、错误映射成 4xx。策略语义在 `domain/`，运行时效果在
* `enforcement/`，此处不复制。
*
* 两处刻意的差异：
*  1. 工作区策略没有"接线状态"可对齐（闸门按 preset 注入、隐藏集合按 cwd 现算），
*     所以行里不报 `mounted/gateActive`，只有 `pendingCount` 表达"还没生效"。
*  2. 工作区可能先被删、策略还在。这类**孤儿行**如实列出（`present: false`），
*     允许用户清掉，但绝不自动清理。
*
* 能力缺席（部署里没有 workspaceRegistry / agentPresets）时不是错误：/workspaces
* 老实报告 `available: false` 与原因，写入口返回 503——面板据此把「工作区」tab
* 降级为只读，而插件其余功能毫无感知。
*/
/** 工作区域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function workspaceRoutes(deps) {
	return [{
		path: SKILL_HUB_API.workspaces,
		methods: ["GET"],
		handler: async ({ res }) => {
			const workspaces = deps.workspaces;
			if (workspaces === void 0) {
				writeJson(res, 200, {
					ok: true,
					available: false,
					unavailableReason: "workspace isolation is not wired in this deployment",
					workspaces: [],
					pendingCount: 0
				});
				return;
			}
			const snapshot = await workspaces.workspaces();
			const policies = await workspaces.listPolicies();
			const byId = new Map(policies.map((policy) => [policy.workspaceId, policy]));
			const rows = [];
			for (const entry of snapshot.entries) {
				const [policy, visibility] = await Promise.all([workspaces.policyOf(entry.id), workspaces.visibilityOf(entry.id)]);
				byId.delete(entry.id);
				rows.push({
					id: entry.id,
					...entry.title !== void 0 ? { title: entry.title } : {},
					path: entry.path,
					sessionCount: entry.sessionCount,
					present: true,
					policy: policy ?? {
						workspaceId: entry.id,
						enabled: false,
						groups: [],
						skills: []
					},
					visibleCount: visibility.visible.length,
					hiddenCount: visibility.hidden.length
				});
			}
			for (const policy of [...byId.values()]) {
				const visibility = await workspaces.visibilityOf(policy.workspaceId);
				rows.push({
					id: policy.workspaceId,
					sessionCount: 0,
					present: false,
					policy,
					visibleCount: visibility.visible.length,
					hiddenCount: visibility.hidden.length
				});
			}
			writeJson(res, 200, {
				ok: true,
				available: snapshot.available,
				...snapshot.reason !== void 0 ? { unavailableReason: snapshot.reason } : {},
				workspaces: rows,
				pendingCount: snapshot.pendingCount
			});
		}
	}, {
		path: SKILL_HUB_API.workspace,
		methods: ["POST"],
		jsonBody: true,
		handler: async ({ res, body }) => {
			const workspaces = deps.workspaces;
			if (workspaces === void 0) {
				writeError(res, 503, "workspace isolation is not wired in this deployment");
				return;
			}
			const workspaceId = readString(body, "workspaceId").trim();
			if (!WORKSPACE_ID_RE.test(workspaceId)) {
				writeError(res, 400, "workspaceId is required and must be a valid workspace id");
				return;
			}
			if (body.reset === true) {
				await workspaces.deletePolicy(workspaceId);
				workspaces.notifyPolicyChanged();
				writeJson(res, 200, {
					ok: true,
					policy: null
				});
				return;
			}
			let enabled;
			if (body.enabled !== void 0) {
				if (typeof body.enabled !== "boolean") {
					writeError(res, 400, "enabled must be a boolean");
					return;
				}
				enabled = body.enabled;
			}
			let groups;
			if (body.groups !== void 0) {
				if (!Array.isArray(body.groups)) {
					writeError(res, 400, "groups must be an array of strings");
					return;
				}
				groups = cleanKeys(body.groups);
			}
			let skills;
			if (body.skills !== void 0) {
				if (!Array.isArray(body.skills)) {
					writeError(res, 400, "skills must be an array of strings");
					return;
				}
				skills = cleanNames(body.skills);
			}
			if (enabled === void 0 && groups === void 0 && skills === void 0) {
				writeError(res, 400, "nothing to update: provide enabled, groups, or skills");
				return;
			}
			if (enabled === true && body.confirmEmpty !== true) {
				const current = await workspaces.policyOf(workspaceId);
				const nextGroups = groups ?? current?.groups ?? [];
				const nextSkills = skills ?? current?.skills ?? [];
				if (nextGroups.length === 0 && nextSkills.length === 0) {
					writeError(res, 409, "an empty whitelist hides every skill in this workspace; resend with confirmEmpty: true to confirm");
					return;
				}
			}
			try {
				const policy = await workspaces.savePolicy(workspaceId, {
					...enabled !== void 0 ? { enabled } : {},
					...groups !== void 0 ? { groups } : {},
					...skills !== void 0 ? { skills } : {}
				});
				workspaces.notifyPolicyChanged();
				writeJson(res, 200, {
					ok: true,
					policy
				});
			} catch (error) {
				writeRouteError(res, error);
			}
		}
	}];
}
//#endregion
//#region src/routes/sources.ts
/**
* 来源跟踪域路由：sources 列表 / check 上游更新 / sync 同步。上游删除只做
* 报告，本插件不再替用户删本地文件（删除是用户的决定，插件不碰文件）。
*/
/** 来源跟踪域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function sourceRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.sources,
			methods: ["GET"],
			handler: async ({ res }) => {
				const [sources, origins, collectionOrder, snapshot] = await Promise.all([
					deps.store.listSources(),
					deps.store.listOrigins(),
					deps.store.getCollectionOrder(),
					deps.skills.snapshot()
				]);
				const { collections, memberships } = buildCollections(origins, collectionOrder, snapshot.skills);
				writeJson(res, 200, {
					ok: true,
					sources,
					origins: memberships,
					collections
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceCheck,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const rawRepo = readString(body, "repo");
				let only;
				if (rawRepo !== "") {
					const parsedOnly = normalizeRepoInput(rawRepo);
					only = parsedOnly !== null ? repoSlug(parsedOnly) : void 0;
				}
				const source = only !== void 0 ? await deps.store.getSource(only) : void 0;
				if (only !== void 0 && source === void 0) {
					writeError(res, 404, "source not found: " + only);
					return;
				}
				const sources = source !== void 0 ? [source] : await deps.store.listSources();
				if (lastSourceCheck.size > 500) lastSourceCheck.clear();
				const results = [];
				for (const item of sources) {
					const base = {
						repo: item.repo,
						...item.ref !== void 0 ? { ref: item.ref } : {}
					};
					const now = Date.now();
					if (now - (lastSourceCheck.get(item.repo) ?? 0) < 3e5) {
						results.push({
							...base,
							changed: false,
							updated: [],
							deleted: [],
							throttled: true
						});
						continue;
					}
					try {
						const latest = await getLatestCommit(item.repo, item.ref);
						lastSourceCheck.set(item.repo, now);
						if (item.commitSha === "") {
							await deps.store.setSourceCommit(item.repo, latest.commitSha);
							results.push({
								...base,
								changed: false,
								updated: [],
								deleted: [],
								unverified: true,
								commitSha: latest.commitSha
							});
							continue;
						}
						if (latest.commitSha === item.commitSha) {
							results.push({
								...base,
								changed: false,
								updated: [],
								deleted: []
							});
							continue;
						}
						const diff = diffRemoteSkills(await loadRepoTreeAt(item.repo, latest.treeSha), item);
						results.push({
							...base,
							changed: true,
							commitSha: latest.commitSha,
							updated: diff.updated,
							deleted: diff.deleted
						});
					} catch (error) {
						results.push({
							...base,
							changed: false,
							updated: [],
							deleted: [],
							error: errorText(error)
						});
					}
				}
				writeJson(res, 200, {
					ok: true,
					results
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceSync,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const repo = readString(body, "repo").trim();
				if (repo === "") {
					writeError(res, 400, "repo is required");
					return;
				}
				const selected = Array.isArray(body.skills) ? readStrings(body, "skills") : void 0;
				const source = await deps.store.getSource(repo);
				if (source === void 0) {
					writeError(res, 404, "source not found: " + repo);
					return;
				}
				const targets = selected !== void 0 ? selected : source.skills;
				const latest = await getLatestCommit(repo, source.ref);
				const tree = await loadRepoTreeAt(repo, latest.treeSha);
				const targetRoot = rootPath("user-dsh", homeOf(deps));
				await mkdir(targetRoot, { recursive: true });
				const synced = [];
				const failed = [];
				for (const name of targets) {
					if (!isSkillName(name) || !source.skills.includes(name)) {
						failed.push({
							name,
							error: "skill is not tracked by this source"
						});
						continue;
					}
					try {
						const entry = repoSkillEntry(name, source.root, repo);
						entry.dir = skillDirOf(source, name, tree.map((item) => item.path));
						entry.path = skillFileAt(entry.dir);
						const files = collectRepoSkillFiles(tree, entry.dir);
						if (files.length === 0) {
							failed.push({
								name,
								error: "skill missing upstream"
							});
							continue;
						}
						const targetDir = join(targetRoot, name);
						if (await pathExists(targetDir)) await replaceSkillDir(targetDir, async () => {
							await downloadRepoSkill(repo, latest.commitSha, entry, files, targetRoot);
						});
						else await downloadRepoSkill(repo, latest.commitSha, entry, files, targetRoot);
						await deps.store.mergeSourceManifest(repo, skillManifest(tree, entry.dir), entry.dir);
						synced.push(name);
					} catch (error) {
						failed.push({
							name,
							error: errorText(error)
						});
					}
				}
				if (failed.length === 0) await deps.store.setSourceCommit(repo, latest.commitSha);
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					repo,
					commitSha: latest.commitSha,
					synced,
					failed
				});
			}
		}
	];
}
//#endregion
//#region src/routes.ts
/**
* Build every /api/skill-hub route.
* @param deps - skill registry view + sidecar store.
* @returns the exact-path routes plus the family's 404 catch-all.
*/
function makeRoutes(deps) {
	return [...[
		...catalogRoutes(deps),
		...configRoutes(deps),
		...marketRoutes(deps),
		...repoImportRoutes(deps),
		...groupRoutes(deps),
		...scopeRoutes(deps),
		...workspaceRoutes(deps),
		...sourceRoutes(deps)
	].map((spec) => createRoute(deps, spec)), createRoute(deps, {
		kind: "prefix",
		path: SKILL_HUB_API_ROOT,
		methods: ["GET", "POST"],
		skipGate: true,
		handler: async ({ res, url }) => {
			writeError(res, 404, "unknown skill-hub route: " + url.pathname + " (see SKILL_HUB_API in src/protocol/api.ts)");
		}
	})];
}
//#endregion
//#region src/store/paths.ts
/** Resolve the sidecar state path (injectable in tests). */
function statePath(home = dshHome()) {
	return join(home, "dsh-skill-group.json");
}
//#endregion
//#region src/store/migrate.ts
/**
* Normalize an arbitrary parsed sidecar document to the current schema.
* v1 to v2: scenes are dropped (the one-click role merged into group
* switches), and origins are migrated into source records (repo = origin
* value, commit snapshot empty — the first update check backfills it).
* v2 to v3: market sources become records ({ repo, ref?, commitSha? })
* instead of bare repo slugs, so a source can pin a release/branch version.
* v4 to v5: mode-level scope policies are a pure addition — older files lack
* the field, and the loader validates each row, so it passes through untouched.
* v5 to v6: `disabled` becomes a runtime switch list ({ name, disabledAt }) —
* the old file-based fields (path/root/addedAt/updatedAt) are dropped on load —
* and the `trash` bucket is discarded (the hub no longer deletes skills).
* v6 to v7: workspace-level policies are a pure addition, same pattern as v5.
* Returns null when the file claims a newer schema than this plugin
* understands, so the caller starts empty instead of risking data loss.
*/
function migrateStore(parsed) {
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed;
	const version = typeof record.version === "number" ? record.version : 0;
	if (version > 7) return null;
	const disabled = Array.isArray(record.disabled) ? record.disabled : [];
	const config = typeof record.config === "object" && record.config !== null && !Array.isArray(record.config) ? record.config : void 0;
	const tags = Array.isArray(record.tags) ? record.tags : void 0;
	const marketSources = Array.isArray(record.marketSources) ? record.marketSources.map((entry) => typeof entry === "string" ? { repo: entry } : entry) : void 0;
	let sources;
	if (Array.isArray(record.sources)) sources = record.sources;
	else if (version < 2 && typeof record.origins === "object" && record.origins !== null && !Array.isArray(record.origins)) {
		const byOrigin = /* @__PURE__ */ new Map();
		for (const [name, origin] of Object.entries(record.origins)) {
			if (typeof origin !== "string" || origin === "") continue;
			const list = byOrigin.get(origin);
			if (list === void 0) byOrigin.set(origin, [name]);
			else list.push(name);
		}
		sources = [...byOrigin.entries()].map(([repo, skillNames]) => ({
			repo,
			root: "skills",
			commitSha: "",
			skills: skillNames.sort((a, b) => a.localeCompare(b))
		}));
	}
	return {
		version: 7,
		disabled,
		...config !== void 0 ? { config } : {},
		...tags !== void 0 ? { tags } : {},
		...sources !== void 0 ? { sources } : {},
		...marketSources !== void 0 ? { marketSources } : {},
		...record.skillStats !== void 0 ? { skillStats: record.skillStats } : {},
		...record.marketStats !== void 0 ? { marketStats: record.marketStats } : {},
		...Array.isArray(record.collectionOrder) ? { collectionOrder: record.collectionOrder } : {},
		...Array.isArray(record.sourceGroupOrder) ? { sourceGroupOrder: record.sourceGroupOrder } : {},
		...record.scopes !== void 0 ? { scopes: record.scopes } : {},
		...record.workspaces !== void 0 ? { workspaces: record.workspaces } : {}
	};
}
/** 小优化：统一的非空字符串数组清洗（去空、去重可选由调用方处理）。 */
function cleanStringList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((n) => typeof n === "string" && n !== "");
}
/**
* 把迁移后的原始文档校验为内存状态：坏条目丢弃、坏桶降级为空，
* 绝不因一条脏数据丢掉整个 sidecar（与原 ensureLoaded 内联逻辑一致）。
*/
function hydrateMigratedState(migrated) {
	const entries = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.disabled)) {
		for (const entry of migrated.disabled) if (typeof entry?.name === "string" && entry.name !== "") entries.set(entry.name, {
			name: entry.name,
			disabledAt: typeof entry.disabledAt === "number" ? entry.disabledAt : 0
		});
	}
	const config = {};
	const saved = migrated.config;
	if (typeof saved === "object" && saved !== null) {
		if (typeof saved.enabled === "boolean") config.enabled = saved.enabled;
		if (typeof saved.announceToAgent === "boolean") config.announceToAgent = saved.announceToAgent;
		if (typeof saved.dotModelColor === "string" && saved.dotModelColor !== "") config.dotModelColor = saved.dotModelColor;
		if (typeof saved.dotUserColor === "string" && saved.dotUserColor !== "") config.dotUserColor = saved.dotUserColor;
		if (typeof saved.showUseCount === "boolean") config.showUseCount = saved.showUseCount;
		if (typeof saved.showUseTime === "boolean") config.showUseTime = saved.showUseTime;
		if (typeof saved.showGroupSummary === "boolean") config.showGroupSummary = saved.showGroupSummary;
	}
	const tagsById = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.tags)) for (const entry of migrated.tags) {
		const tag = entry;
		if (tag !== null && typeof tag === "object" && typeof tag.id === "string" && typeof tag.name === "string" && Array.isArray(tag.skillNames)) tagsById.set(tag.id, {
			id: tag.id,
			name: tag.name,
			skillNames: tag.skillNames.filter((n) => typeof n === "string")
		});
	}
	const sourcesByRepo = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.sources)) for (const entry of migrated.sources) {
		const source = entry;
		if (source !== null && typeof source === "object" && typeof source.repo === "string" && source.repo !== "" && Array.isArray(source.skills)) {
			const manifest = source.manifest;
			const rawRoot = isValidRepoRoot(source.root) ? source.root : "skills";
			sourcesByRepo.set(source.repo, {
				repo: source.repo,
				...typeof source.ref === "string" && source.ref !== "" ? { ref: source.ref } : {},
				root: rawRoot,
				commitSha: typeof source.commitSha === "string" ? source.commitSha : "",
				skills: source.skills.filter((n) => typeof n === "string"),
				...manifest !== null && typeof manifest === "object" && !Array.isArray(manifest) ? { manifest: Object.fromEntries(Object.entries(manifest).filter(([, size]) => typeof size === "number")) } : {}
			});
		}
	}
	const marketSources = [];
	if (Array.isArray(migrated.marketSources)) for (const entry of migrated.marketSources) {
		const item = entry;
		if (item !== null && typeof item === "object" && typeof item.repo === "string" && item.repo !== "" && !marketSources.some((s) => s.repo === item.repo)) marketSources.push({
			repo: item.repo,
			...typeof item.ref === "string" && item.ref !== "" ? { ref: item.ref } : {},
			...typeof item.commitSha === "string" && item.commitSha !== "" ? { commitSha: item.commitSha } : {}
		});
	}
	/**
	* Validate the cold-path revision bucket: corrupt entries degrade to a
	* re-read (the revision simply misses), never to bad counts.
	*/
	function cleanColdRevisions(raw) {
		if (raw === null || typeof raw !== "object") return {};
		const revisions = {};
		for (const [id, entry] of Object.entries(raw)) {
			if (entry === null || typeof entry !== "object") continue;
			const { rev, createdAt, counts } = entry;
			if (typeof rev !== "string" || typeof createdAt !== "number" || counts === null || typeof counts !== "object") continue;
			const clean = {};
			for (const [name, stat] of Object.entries(counts)) if (stat !== null && typeof stat === "object" && typeof stat.count === "number" && typeof stat.lastUsed === "number") clean[name] = {
				count: stat.count,
				lastUsed: stat.lastUsed
			};
			revisions[id] = {
				rev,
				createdAt,
				counts: clean
			};
		}
		return { coldRevisions: revisions };
	}
	let skillStats = void 0;
	const savedStats = migrated.skillStats;
	if (savedStats !== null && typeof savedStats === "object" && typeof savedStats.frozenBefore === "number" && typeof savedStats.lastFullReconcile === "number" && typeof savedStats.windowDays === "number" && typeof savedStats.frozenSessions === "object" && savedStats.frozenSessions !== null) {
		const sessions = {};
		for (const [id, entry] of Object.entries(savedStats.frozenSessions)) {
			if (entry === null || typeof entry !== "object" || typeof entry.createdAt !== "number" || typeof entry.counts !== "object" || entry.counts === null) continue;
			const counts = {};
			for (const [name, stat] of Object.entries(entry.counts)) if (stat !== null && typeof stat === "object" && typeof stat.count === "number" && typeof stat.lastUsed === "number") counts[name] = {
				count: stat.count,
				lastUsed: stat.lastUsed
			};
			sessions[id] = {
				createdAt: entry.createdAt,
				counts
			};
		}
		const rawTotals = savedStats.lastTotals;
		const lastTotals = Array.isArray(rawTotals) ? rawTotals.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.name === "string" && typeof entry.count === "number").map((entry) => ({
			name: entry.name,
			count: entry.count,
			...typeof entry.lastUsed === "number" ? { lastUsed: entry.lastUsed } : {}
		})) : void 0;
		skillStats = {
			windowDays: savedStats.windowDays,
			frozenBefore: savedStats.frozenBefore,
			frozenSessions: sessions,
			lastFullReconcile: savedStats.lastFullReconcile,
			...lastTotals !== void 0 ? { lastTotals } : {},
			...cleanColdRevisions(savedStats.coldRevisions)
		};
	}
	let marketStats = void 0;
	const savedMarketStats = migrated.marketStats;
	if (savedMarketStats !== null && typeof savedMarketStats === "object" && typeof savedMarketStats.fetchedAt === "number" && typeof savedMarketStats.stats === "object" && savedMarketStats.stats !== null) {
		const stats = {};
		for (const [repo, entry] of Object.entries(savedMarketStats.stats)) if (entry !== null && typeof entry === "object" && typeof entry.stars === "number" && typeof entry.downloads === "number") stats[repo] = {
			stars: entry.stars,
			downloads: entry.downloads
		};
		marketStats = {
			fetchedAt: savedMarketStats.fetchedAt,
			stats
		};
	}
	const collectionOrder = cleanStringList(migrated.collectionOrder);
	const sourceGroupOrder = cleanStringList(migrated.sourceGroupOrder);
	const scopeByPreset = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.scopes)) for (const entry of migrated.scopes) {
		const policy = normalizeScopePolicy(entry);
		if (policy !== void 0) scopeByPreset.set(policy.presetId, policy);
	}
	const workspaceById = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.workspaces)) for (const entry of migrated.workspaces) {
		const policy = normalizeWorkspacePolicy(entry);
		if (policy !== void 0) workspaceById.set(policy.workspaceId, policy);
	}
	return {
		entries,
		config,
		tagsById,
		sourcesByRepo,
		marketSources,
		skillStats,
		marketStats,
		collectionOrder,
		sourceGroupOrder,
		scopes: [...scopeByPreset.values()],
		workspaces: [...workspaceById.values()]
	};
}
//#endregion
//#region src/store/domains/market.ts
/** One market source by repo (undefined when absent). */
function findMarketSource(entries, repo) {
	return entries.find((entry) => entry.repo === repo);
}
/** Add a repo (deduplicated), optionally pinning a ref. */
function addMarketSource(entries, repo, ref) {
	const existing = findMarketSource(entries, repo);
	if (existing === void 0) entries.push(ref !== void 0 && ref !== "" ? {
		repo,
		ref
	} : { repo });
	else if (ref !== void 0 && ref !== "" && existing.ref !== ref) existing.ref = ref;
}
/** Remove a repo. Returns whether a record was removed. */
function removeMarketSource(entries, repo) {
	const index = entries.findIndex((entry) => entry.repo === repo);
	if (index === -1) return false;
	entries.splice(index, 1);
	return true;
}
/** Pin a market source to an explicit ref (branch/tag), clearing the recorded commit. */
function setMarketSourceRef(entries, repo, ref) {
	const entry = findMarketSource(entries, repo);
	if (entry === void 0 || ref.trim() === "") return {
		entry,
		changed: false
	};
	entry.ref = ref.trim();
	delete entry.commitSha;
	return {
		entry,
		changed: true
	};
}
/** Record the commit a market source's pinned ref resolved to (update baseline). */
function setMarketSourceCommit(entries, repo, commitSha) {
	const entry = findMarketSource(entries, repo);
	if (entry === void 0 || commitSha === "") return false;
	entry.commitSha = commitSha;
	return true;
}
//#endregion
//#region src/store/domains/scopes.ts
/**
* Visibility-policy mutations over the sidecar's maps: 模式隔离 keyed by preset
* id, 工作区隔离 keyed by workspace id. The two share the same whitelist shape
* and the same partial-update semantics, so they share the code below.
*
* I/O-free by design: the store owns loading and persistence. Reads return
* copies so callers cannot mutate the cached policy arrays.
*/
/** Copy a policy so callers cannot mutate the cached arrays. */
function copyScope(policy) {
	return {
		...policy,
		groups: [...policy.groups],
		skills: [...policy.skills]
	};
}
/**
* Save one preset's policy with partial-update semantics: absent fields keep
* their current value.
*
* A new policy defaults to `enabled: false` — saving a policy that only feeds
* the preview must not change what any session sees; enabling is an explicit
* user action. When provided, `groups`/`skills` replace the previous list
* wholesale (the panel sends its complete selection).
*
* @throws StoreError when the preset id is not a legal shape.
*/
function saveScope(scopes, presetId, patch) {
	const normalized = normalizeScopePolicy({
		presetId,
		enabled: patch.enabled,
		groups: patch.groups,
		skills: patch.skills
	});
	if (normalized === void 0) throw new StoreError("validation", "invalid preset id: " + presetId);
	const previous = scopes.get(presetId);
	const next = {
		presetId,
		enabled: patch.enabled ?? previous?.enabled ?? false,
		groups: patch.groups !== void 0 ? normalized.groups : previous?.groups ?? [],
		skills: patch.skills !== void 0 ? normalized.skills : previous?.skills ?? []
	};
	scopes.set(presetId, next);
	return next;
}
/** Copy a workspace policy so callers cannot mutate the cached arrays. */
function copyWorkspacePolicy(policy) {
	return {
		...policy,
		groups: [...policy.groups],
		skills: [...policy.skills]
	};
}
/**
* Save one workspace's policy with partial-update semantics: absent fields keep
* their current value. Same rules as {@link saveScope}: a brand-new policy stays
* disabled until the user turns it on, and provided lists replace wholesale.
*
* @throws StoreError when the workspace id is not a legal shape.
*/
function saveWorkspacePolicy(workspaces, workspaceId, patch) {
	const normalized = normalizeWorkspacePolicy({
		workspaceId,
		enabled: patch.enabled,
		groups: patch.groups,
		skills: patch.skills
	});
	if (normalized === void 0) throw new StoreError("validation", "invalid workspace id: " + workspaceId);
	const previous = workspaces.get(workspaceId);
	const next = {
		workspaceId,
		enabled: patch.enabled ?? previous?.enabled ?? false,
		groups: patch.groups !== void 0 ? normalized.groups : previous?.groups ?? [],
		skills: patch.skills !== void 0 ? normalized.skills : previous?.skills ?? []
	};
	workspaces.set(workspaceId, next);
	return next;
}
//#endregion
//#region src/store/domains/sources.ts
/**
* Source-tracking (上游仓库) mutations over the sidecar's source map.
*
* I/O-free by design: the store owns loading and persistence, so each function
* only touches the in-memory map and reports whether anything changed.
*/
/** The source record that tracks a skill name (undefined when untracked). */
function findSourceForSkill(sources, name) {
	for (const source of sources.values()) if (source.skills.includes(name)) return source;
}
/**
* Upsert one skill into a source record. When the repo has no record yet a new
* one is created from the caller's root/commit snapshot.
*/
function addSourceSkill(sources, repo, root, commitSha, ref, skillName) {
	const existing = sources.get(repo);
	if (existing === void 0) {
		sources.set(repo, {
			repo,
			...ref !== void 0 && ref !== "" ? { ref } : {},
			root,
			commitSha,
			skills: [skillName]
		});
		return;
	}
	const skills = existing.skills.includes(skillName) ? existing.skills : [...existing.skills, skillName].sort((a, b) => a.localeCompare(b));
	sources.set(repo, {
		...existing,
		skills
	});
}
/**
* Replace a source's skill list (used after sync / confirm-delete). An empty
* list drops the record entirely; undefined means the repo was not tracked.
*/
function setSourceSkills(sources, repo, skills) {
	const existing = sources.get(repo);
	if (existing === void 0) return void 0;
	const names = [...new Set(skills.filter((n) => n.trim() !== ""))].sort((a, b) => a.localeCompare(b));
	if (names.length === 0) {
		sources.delete(repo);
		return;
	}
	const next = {
		...existing,
		skills: names
	};
	sources.set(repo, next);
	return next;
}
/** Drop one skill from every source record; records left empty are removed. */
function removeSkillFromSources(sources, name) {
	let changed = false;
	for (const [repo, source] of sources) {
		if (!source.skills.includes(name)) continue;
		const skills = source.skills.filter((n) => n !== name);
		if (skills.length === 0) sources.delete(repo);
		else sources.set(repo, {
			...source,
			skills
		});
		changed = true;
	}
	return changed;
}
/** Update a source's commit snapshot. Returns whether a record was updated. */
function setSourceCommit(sources, repo, commitSha) {
	const existing = sources.get(repo);
	if (existing === void 0) return false;
	sources.set(repo, {
		...existing,
		commitSha
	});
	return true;
}
/** Update a source's pinned ref (release tag / branch). Blank refs are ignored. */
function setSourceRef(sources, repo, ref) {
	const existing = sources.get(repo);
	if (existing === void 0 || ref.trim() === "") return false;
	sources.set(repo, {
		...existing,
		ref: ref.trim()
	});
	return true;
}
/**
* Merge per-path manifest entries into a source (incremental imports). When
* `dir` is given, every baseline path under that skill directory is dropped
* first, so files the upstream removed never linger and skew later diffs.
*
* `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix is
* empty, so the whole baseline is replaced: that skill owns the tree, and
* keeping stale paths would make every later diff report "changed" forever.
*/
function mergeSourceManifest(sources, repo, manifest, dir) {
	const existing = sources.get(repo);
	if (existing === void 0 || Object.keys(manifest).length === 0) return false;
	const base = { ...existing.manifest ?? {} };
	if (dir !== void 0) {
		const prefix = skillDirPrefix(dir);
		for (const path of Object.keys(base)) if (path.startsWith(prefix)) delete base[path];
	}
	sources.set(repo, {
		...existing,
		manifest: {
			...base,
			...manifest
		}
	});
	return true;
}
/** skillName → repo for every recorded origin. */
function listOrigins(sources) {
	const origins = {};
	for (const source of sources.values()) for (const name of source.skills) origins[name] = source.repo;
	return origins;
}
//#endregion
//#region src/store/domains/tags.ts
/**
* Tag-group (场景分组) mutations over the sidecar's tag map.
*
* These are deliberately I/O-free: the store owns loading and persistence, so
* every function here only reads/writes the in-memory map and reports whether
* anything changed. That keeps the rules unit-testable without a state file.
*/
/**
* Create (no id) or rename (with id) a tag and return the saved record.
* Creating assigns a fresh UUID; renaming keeps members.
*/
function saveTag(tags, input) {
	const name = input.name.trim();
	if (name === "") throw new StoreError("validation", "tag name must not be empty");
	let tag;
	if (input.id !== void 0) {
		const existing = tags.get(input.id);
		if (existing === void 0) throw new StoreError("not-found", "tag not found: " + input.id);
		tag = {
			...existing,
			name
		};
	} else tag = {
		id: crypto.randomUUID(),
		name,
		skillNames: []
	};
	tags.set(tag.id, tag);
	return tag;
}
/** Delete a tag by id. Returns whether one was removed. */
function deleteTag(tags, id) {
	return tags.delete(id);
}
/** Append one skill name (deduplicated; no-op when already a member). */
function addSkillToTag(tags, id, name) {
	const existing = tags.get(id);
	if (existing === void 0 || name.trim() === "" || existing.skillNames.includes(name)) return {
		tag: existing,
		changed: false
	};
	const tag = {
		...existing,
		skillNames: [...existing.skillNames, name]
	};
	tags.set(id, tag);
	return {
		tag,
		changed: true
	};
}
/**
* Replace a tag's member list wholesale (idempotent). Deduplicates and drops
* blank names; unknown skill names are kept (they may arrive later) — the
* routes layer filters against the live catalog before persisting.
*/
function setTagMembers(tags, id, skillNames) {
	const existing = tags.get(id);
	if (existing === void 0) return {
		tag: void 0,
		changed: false
	};
	const names = [...new Set(skillNames.filter((n) => n.trim() !== ""))];
	tags.set(id, {
		...existing,
		skillNames: names
	});
	return {
		tag: tags.get(id),
		changed: true
	};
}
/** Remove one skill from every tag group. Returns whether anything changed. */
function removeSkillFromTags(tags, name) {
	let changed = false;
	for (const tag of tags.values()) {
		if (!tag.skillNames.includes(name)) continue;
		tags.set(tag.id, {
			...tag,
			skillNames: tag.skillNames.filter((n) => n !== name)
		});
		changed = true;
	}
	return changed;
}
//#endregion
//#region src/store/store.ts
/** Sidecar state owner. */
var SkillHubStore = class {
	file;
	entries = /* @__PURE__ */ new Map();
	config = {};
	tagsById = /* @__PURE__ */ new Map();
	sourcesByRepo = /* @__PURE__ */ new Map();
	marketSources = [];
	skillStats = void 0;
	marketStats = void 0;
	collectionOrder = [];
	sourceGroupOrder = [];
	/** v5: 模式（preset）→ 技能可见性策略；缺席的 preset 不做隔离。 */
	scopesByPreset = /* @__PURE__ */ new Map();
	/** v7: 工作区 id → 技能可见性策略；启用后覆盖同一会话的模式策略。 */
	workspacesById = /* @__PURE__ */ new Map();
	loaded = false;
	/** Serializes persist runs: concurrent mutators must not let an earlier
	*  snapshot overwrite a later one (rename is atomic, ordering is not). */
	writeChain = Promise.resolve();
	constructor(file = statePath()) {
		this.file = file;
	}
	async ensureLoaded() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const raw = await readFile(this.file, "utf8");
			const migrated = migrateStore(JSON.parse(raw));
			if (migrated === null) console.warn("[skill-hub] sidecar state uses a newer schema than this plugin supports; starting empty");
			else {
				const state = hydrateMigratedState(migrated);
				this.entries = state.entries;
				this.config = state.config;
				this.tagsById = state.tagsById;
				this.sourcesByRepo = state.sourcesByRepo;
				this.marketSources = state.marketSources;
				this.skillStats = state.skillStats;
				this.marketStats = state.marketStats;
				this.collectionOrder = state.collectionOrder;
				this.sourceGroupOrder = state.sourceGroupOrder;
				this.scopesByPreset = new Map(state.scopes.map((policy) => [policy.presetId, policy]));
				this.workspacesById = new Map(state.workspaces.map((policy) => [policy.workspaceId, policy]));
			}
		} catch (error) {
			if (error.code !== "ENOENT") console.warn("[skill-hub] sidecar state unreadable, starting empty:", error instanceof Error ? error.message : error);
		}
	}
	async listDisabled() {
		await this.ensureLoaded();
		return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
	}
	async getDisabled(name) {
		await this.ensureLoaded();
		return this.entries.get(name);
	}
	async addDisabled(entry) {
		await this.ensureLoaded();
		this.entries.set(entry.name, entry);
		await this.persist();
	}
	async removeDisabled(name) {
		await this.ensureLoaded();
		if (!this.entries.delete(name)) return;
		await this.persist();
	}
	/** The hub's saved runtime configuration (fields absent here mean "not overridden"). */
	async getConfig() {
		await this.ensureLoaded();
		return { ...this.config };
	}
	/**
	* Persist a runtime-config patch, merged over the saved values. A field
	* whose patch value is undefined is removed from the saved layer, so the
	* setting re-inherits its default (the web card's "reset" path).
	*/
	async setConfig(config) {
		await this.ensureLoaded();
		const next = { ...this.config };
		for (const [key, value] of Object.entries(config)) if (value === void 0) delete next[key];
		else next[key] = value;
		this.config = next;
		await this.persist();
	}
	/** All user-defined tag groups, in creation order. */
	async listTags() {
		await this.ensureLoaded();
		return [...this.tagsById.values()];
	}
	/** One tag by id (undefined when absent). */
	async getTag(id) {
		await this.ensureLoaded();
		return this.tagsById.get(id);
	}
	/**
	* Create (no id) or rename (with id) a tag. Returns the saved tag.
	* Creating assigns a fresh UUID; renaming keeps members.
	*/
	async saveTag(input) {
		await this.ensureLoaded();
		const tag = saveTag(this.tagsById, input);
		await this.persist();
		return tag;
	}
	/** Delete a tag by id (no-op when absent). */
	async deleteTag(id) {
		await this.ensureLoaded();
		if (!deleteTag(this.tagsById, id)) return;
		await this.persist();
	}
	/** Append one skill name to a tag (deduplicated; no-op when already a member). */
	async addSkillToTag(id, name) {
		await this.ensureLoaded();
		const { tag, changed } = addSkillToTag(this.tagsById, id, name);
		if (changed) await this.persist();
		return tag;
	}
	/**
	* Replace a tag's member list wholesale (idempotent). Deduplicates and
	* drops blank names; unknown skill names are kept (they may arrive later),
	* the routes layer filters against the live catalog before persisting.
	*/
	async setTagMembers(id, skillNames) {
		await this.ensureLoaded();
		const { tag, changed } = setTagMembers(this.tagsById, id, skillNames);
		if (changed) await this.persist();
		return tag;
	}
	/** Remove one skill from every tag group (used when the skill is deleted). */
	async removeSkillFromTags(name) {
		await this.ensureLoaded();
		if (removeSkillFromTags(this.tagsById, name)) await this.persist();
	}
	/**
	* 来源集合（collection）的排序键。
	*
	* 遗留字段：当前 UI 没有分组排序入口，因此这里**没有写入端**——方法保留
	* 只为读取旧数据文件里已有的顺序（`buildCollections` 用它排 collection
	* 分组）。
	*/
	async getCollectionOrder() {
		await this.ensureLoaded();
		return [...this.collectionOrder];
	}
	/**
	* 来源顶层分组顺序（project / col:xxx / personal）。
	*
	* 遗留字段：UI 已经没有排序入口，这里**没有写入端**——方法保留只为读取
	* 旧数据文件里已有的顺序（SourcesView 用它排顶层卡片）。
	*/
	async getSourceGroupOrder() {
		await this.ensureLoaded();
		return [...this.sourceGroupOrder];
	}
	/** 全部模式策略，按 presetId 排序。 */
	async listScopes() {
		await this.ensureLoaded();
		return [...this.scopesByPreset.values()].sort((a, b) => a.presetId.localeCompare(b.presetId));
	}
	/** 一个模式的策略；没有保存过时返回 undefined（= 不隔离）。 */
	async getScope(presetId) {
		await this.ensureLoaded();
		const found = this.scopesByPreset.get(presetId);
		return found === void 0 ? void 0 : copyScope(found);
	}
	/**
	* 保存一个模式的策略（部分更新；缺席字段保持现值）。
	*
	* 新建时 `enabled` 默认 false —— 保存一条"预览用"的策略不该立刻改变任何
	* 会话能看到的东西，执行必须是用户的显式动作。`groups`/`skills` 提供时
	* **整体替换**（面板送的是完整勾选状态）。
	* @param presetId - 目标 preset；形状非法时抛 StoreError。
	* @param patch - 要落地的字段。
	* @returns 保存后的策略快照。
	*/
	async saveScope(presetId, patch) {
		await this.ensureLoaded();
		const next = saveScope(this.scopesByPreset, presetId, patch);
		await this.persist();
		return copyScope(next);
	}
	/**
	* 删除一个模式的策略（回到"不限制"）。
	* @param presetId - 目标 preset。
	* @returns 是否确实删掉了一条。
	*/
	async deleteScope(presetId) {
		await this.ensureLoaded();
		if (!this.scopesByPreset.delete(presetId)) return false;
		await this.persist();
		return true;
	}
	/** 全部工作区策略，按 workspaceId 排序。 */
	async listWorkspacePolicies() {
		await this.ensureLoaded();
		return [...this.workspacesById.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
	}
	/** 一个工作区的策略；没有保存过时返回 undefined（= 不隔离）。 */
	async getWorkspacePolicy(workspaceId) {
		await this.ensureLoaded();
		const found = this.workspacesById.get(workspaceId);
		return found === void 0 ? void 0 : copyWorkspacePolicy(found);
	}
	/**
	* 保存一个工作区的策略（部分更新；缺席字段保持现值）。规则与
	* {@link saveScope} 完全一致：新建默认不启用，提供的清单整体替换。
	* @param workspaceId - 目标工作区；形状非法时抛 StoreError。
	* @param patch - 要落地的字段。
	* @returns 保存后的策略快照。
	*/
	async saveWorkspacePolicy(workspaceId, patch) {
		await this.ensureLoaded();
		const next = saveWorkspacePolicy(this.workspacesById, workspaceId, patch);
		await this.persist();
		return copyWorkspacePolicy(next);
	}
	/**
	* 删除一个工作区的策略（回到"不限制"）。
	* @param workspaceId - 目标工作区。
	* @returns 是否确实删掉了一条。
	*/
	async deleteWorkspacePolicy(workspaceId) {
		await this.ensureLoaded();
		if (!this.workspacesById.delete(workspaceId)) return false;
		await this.persist();
		return true;
	}
	/** All source records, sorted by repo. */
	async listSources() {
		await this.ensureLoaded();
		return [...this.sourcesByRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo));
	}
	/** One source record by repo (undefined when absent). */
	async getSource(repo) {
		await this.ensureLoaded();
		return this.sourcesByRepo.get(repo);
	}
	/** The source record that tracks a skill name (undefined when untracked). */
	async getSourceForSkill(name) {
		await this.ensureLoaded();
		return findSourceForSkill(this.sourcesByRepo, name);
	}
	/** Remove a source record entirely (no-op when absent). */
	async deleteSource(repo) {
		await this.ensureLoaded();
		if (!this.sourcesByRepo.delete(repo)) return;
		await this.persist();
	}
	/**
	* Upsert one skill into a source record. When the repo has no record yet a
	* new one is created (root + commit snapshot from the caller).
	*/
	async addSourceSkill(repo, root, commitSha, ref, skillName) {
		await this.ensureLoaded();
		addSourceSkill(this.sourcesByRepo, repo, root, commitSha, ref, skillName);
		await this.persist();
	}
	/** Replace a source's skill list (used after sync/confirm-delete). */
	async setSourceSkills(repo, skills) {
		await this.ensureLoaded();
		const existed = this.sourcesByRepo.has(repo);
		const next = setSourceSkills(this.sourcesByRepo, repo, skills);
		if (existed) await this.persist();
		return next;
	}
	/** Remove one skill from every source record (used when the skill is deleted). */
	async removeSkillFromSources(name) {
		await this.ensureLoaded();
		if (removeSkillFromSources(this.sourcesByRepo, name)) await this.persist();
	}
	/** Update a source's commit snapshot. */
	async setSourceCommit(repo, commitSha) {
		await this.ensureLoaded();
		if (setSourceCommit(this.sourcesByRepo, repo, commitSha)) await this.persist();
	}
	/** Update a source's pinned ref (release tag / branch) when the market syncs. */
	async setSourceRef(repo, ref) {
		await this.ensureLoaded();
		if (setSourceRef(this.sourcesByRepo, repo, ref)) await this.persist();
	}
	/**
	* Merge per-path manifest entries into a source (incremental imports).
	* When `dir` is given, every baseline path under that skill directory is
	* dropped first, so files the upstream removed never linger in the
	* baseline and skew later update diffs.
	*
	* `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix
	* is empty, so the whole baseline is replaced: that skill owns the tree, and
	* keeping stale paths would make every later diff report "changed" forever.
	*/
	async mergeSourceManifest(repo, manifest, dir) {
		await this.ensureLoaded();
		if (mergeSourceManifest(this.sourcesByRepo, repo, manifest, dir)) await this.persist();
	}
	/** skillName → collection name for every recorded origin (derived from sources). */
	async listOrigins() {
		await this.ensureLoaded();
		return listOrigins(this.sourcesByRepo);
	}
	/** The user's market sources, in addition order. */
	async listMarketSources() {
		await this.ensureLoaded();
		return [...this.marketSources];
	}
	/** One market source by repo (undefined when absent). */
	async getMarketSource(repo) {
		await this.ensureLoaded();
		return findMarketSource(this.marketSources, repo);
	}
	/** Add a repo (deduplicated), optionally with a pinned ref. Returns the fresh list. */
	async addMarketSource(repo, ref) {
		await this.ensureLoaded();
		addMarketSource(this.marketSources, repo, ref);
		await this.persist();
		return [...this.marketSources];
	}
	/** Remove a repo (no-op when absent). Returns the fresh list. */
	async removeMarketSource(repo) {
		await this.ensureLoaded();
		if (removeMarketSource(this.marketSources, repo)) await this.persist();
		return [...this.marketSources];
	}
	/** Pin a market source to an explicit ref (branch/tag). Returns the record. */
	async setMarketSourceRef(repo, ref) {
		await this.ensureLoaded();
		const { entry, changed } = setMarketSourceRef(this.marketSources, repo, ref);
		if (changed) await this.persist();
		return entry;
	}
	/** Record the commit a market source's pinned ref resolved to (update baseline). */
	async setMarketSourceCommit(repo, commitSha) {
		await this.ensureLoaded();
		if (setMarketSourceCommit(this.marketSources, repo, commitSha)) await this.persist();
	}
	/** The persisted usage-statistics checkpoint (undefined until first saved). */
	async getSkillStatsState() {
		await this.ensureLoaded();
		return this.skillStats !== void 0 ? {
			...this.skillStats,
			frozenSessions: { ...this.skillStats.frozenSessions },
			...this.skillStats.lastTotals !== void 0 ? { lastTotals: [...this.skillStats.lastTotals] } : {},
			...this.skillStats.coldRevisions !== void 0 ? { coldRevisions: { ...this.skillStats.coldRevisions } } : {}
		} : void 0;
	}
	/** Persist a usage-statistics checkpoint (after every completed scan; cadence follows the scan TTL). */
	async saveSkillStatsState(state) {
		await this.ensureLoaded();
		this.skillStats = {
			windowDays: state.windowDays,
			frozenBefore: state.frozenBefore,
			frozenSessions: { ...state.frozenSessions },
			lastFullReconcile: state.lastFullReconcile,
			...state.lastTotals !== void 0 ? { lastTotals: [...state.lastTotals] } : {},
			...state.coldRevisions !== void 0 ? { coldRevisions: { ...state.coldRevisions } } : {}
		};
		await this.persist();
	}
	/** The persisted market-stats snapshot (undefined until first saved). */
	async getMarketStatsState() {
		await this.ensureLoaded();
		return this.marketStats !== void 0 ? {
			fetchedAt: this.marketStats.fetchedAt,
			stats: { ...this.marketStats.stats }
		} : void 0;
	}
	/** Persist a market-stats snapshot (written when a refresh fetched anything new). */
	async saveMarketStatsState(state) {
		await this.ensureLoaded();
		this.marketStats = {
			fetchedAt: state.fetchedAt,
			stats: { ...state.stats }
		};
		await this.persist();
	}
	persist() {
		const run = this.writeChain.then(async () => {
			const payload = {
				version: 7,
				disabled: [...this.entries.values()],
				config: this.config,
				...this.tagsById.size > 0 ? { tags: [...this.tagsById.values()] } : {},
				...this.sourcesByRepo.size > 0 ? { sources: [...this.sourcesByRepo.values()] } : {},
				...this.marketSources.length > 0 ? { marketSources: [...this.marketSources] } : {},
				...this.skillStats !== void 0 ? { skillStats: this.skillStats } : {},
				...this.marketStats !== void 0 ? { marketStats: this.marketStats } : {},
				...this.collectionOrder.length > 0 ? { collectionOrder: [...this.collectionOrder] } : {},
				...this.sourceGroupOrder.length > 0 ? { sourceGroupOrder: [...this.sourceGroupOrder] } : {},
				...this.scopesByPreset.size > 0 ? { scopes: [...this.scopesByPreset.values()] } : {},
				...this.workspacesById.size > 0 ? { workspaces: [...this.workspacesById.values()] } : {}
			};
			const tmp = this.file + ".tmp";
			await mkdir(dirname(this.file), { recursive: true });
			await writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
			await rename(tmp, this.file);
		});
		this.writeChain = run.catch(() => {});
		return run;
	}
};
//#endregion
//#region src/index.ts
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "skill-hub";
/**
* Services required before the skill-hub surfaces can mount. `settings` 刻意
* **不在这里**：0.1.7 的配置读数走插件自己的 volatile 引用，只有真要读写设置
* 服务时才软取（`ctx.get('settings')`）——部署没有该服务时插件照常运行。
*/
const inject = [
	"webServer",
	"skills",
	"systemPrompt"
];
/**
* Mount the skill hub routes and announcement.
* @param ctx - host plugin context carrying webServer/skills/systemPrompt.
* @param config - the Loader entry's volatile config refs (dsh 0.1.7 settings model).
*/
function apply(ctx, config) {
	/**
	* 从插件自己的 volatile 配置引用读运行时配置。
	*
	* 这正是 `volatile()` 的意义：Loader 就地更新这些值
	* （`ConfigEditor.edit` → `resolveConfig(fiber.runtime, next)` → `updateVolatile`），
	* 不重建 fiber，所以长期持有的引用 `.get()` 永远答最新值。由此：
	*   - 每个请求不再走 `settings.describe()`（那要遍历 profile 的每个入口）；
	*   - 读值不需要订阅或 watcher；
	*   - Settings 服务缺席时插件照常工作（issue #11：业务逻辑不依赖 Settings）。
	*/
	const readConfig = () => {
		const out = {};
		for (const field of CONFIG_FIELDS) {
			const ref = config?.[field];
			const value = ref !== void 0 && typeof ref.get === "function" ? ref.get() : ref;
			if (value !== void 0) out[field] = value;
		}
		return out;
	};
	const current = () => resolveHubConfig({}, readConfig());
	/** Settings 服务（部署挂了才有）；缺席 ⇒ 没有用户层可读可写，插件照常运行。 */
	const settingsOf = () => ctx.get("settings");
	const store = new SkillHubStore();
	let disposeRoutes;
	let disposeSection;
	let disposeProvider;
	let providerControl;
	let stats;
	let agentPresets;
	let workspaceRegistry;
	const scopes = assembleScopes({
		ctx,
		store,
		presets: () => agentPresets,
		workspaces: () => workspaceRegistry
	});
	const saved = () => {
		return (settingsOf()?.describe().find((entry) => entry.ns === ENTRY_ID))?.user ?? {};
	};
	const updateConfig = async (patch) => {
		const ops = [];
		for (const [field, value] of Object.entries(patch)) if (value === void 0) ops.push({
			op: "unset",
			path: [field]
		});
		else ops.push({
			op: "set",
			path: [field],
			value
		});
		const settings = settingsOf();
		if (settings === void 0) throw new Error("this deployment does not mount the settings service; config is read-only");
		if (ops.length > 0) {
			await settings.mutate(ENTRY_ID, ops);
			sync();
		}
		return current();
	};
	const sync = () => {
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeProvider !== void 0) {
			disposeProvider();
			disposeProvider = void 0;
		}
		const value = current();
		setGithubToken(value.githubToken);
		if (value.announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:skill-hub",
			order: 152,
			text: SKILL_HUB_GUIDANCE
		});
		if (value.enabled) {
			providerControl = void 0;
			disposeProvider = ctx.effect(() => ctx.skills.registerProvider((control) => {
				providerControl = control;
				return new SkillHubProvider(control);
			}), "skill-hub: provider");
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		disposeRoutes = ctx.effect(() => {
			const disposers = makeRoutes({
				skills: ctx.skills,
				store,
				invalidate: () => {
					providerControl?.invalidate();
					scopes.view.invalidate();
					scopes.wiring.invalidateAll();
					scopes.wiring.sync();
				},
				stats,
				config: current,
				saved,
				updateConfig,
				scopes: scopes.deps,
				workspaces: scopes.workspaceDeps
			}).map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "skill-hub: routes");
		if (value.enabled) scopes.wiring.sync();
	};
	sync();
	const wiringTick = setInterval(() => {
		scopes.wiring.sync();
	}, SCOPE_WIRING_TICK_MS);
	wiringTick.unref?.();
	ctx.effect(() => () => {
		clearInterval(wiringTick);
		scopes.wiring.dispose();
	}, "skill-hub: scope wiring");
	ctx.inject(["agentPresets"], (pctx) => {
		agentPresets = pctx.agentPresets;
		sync();
	});
	ctx.inject(["workspaceRegistry"], (pctx) => {
		workspaceRegistry = pctx.workspaceRegistry;
		sync();
	});
	runStartupTasks({
		ctx,
		store,
		settingsOf,
		saved
	});
	wireInvocationStats({
		ctx,
		store,
		current,
		install: (reader) => {
			stats = reader;
			sync();
		}
	});
}
//#endregion
export { Config, ENTRY_ID, SKILL_HUB_GUIDANCE, apply, inject, name };
