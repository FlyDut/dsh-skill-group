/**
 * 插件对外的配置面：volatile 字段、settings 表单 schema、入口常量与公告文案。
 *
 * 拆出来是为了让入口文件（index.ts）只负责组装：这张表要同时与
 * cordis.patch.yml 的 insert id、浏览器半边的 settings 契约对照阅读。
 */
import type { Volatile } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
// dsh 自己的 scoped fork，不是 plain `schemastery`：`.volatile()`（以及 Loader 的
// `fiber.runtime.Config` 处理）只有它有。官方插件一律用这个名字导入。混用会让模块
// 顶层直接抛 `… .volatile is not a function`，而 dsh 只打印一行 failed to import。
import z from '@deepseek-ai/schemastery'
import { HUB_CONFIG_DEFAULTS, HUB_ENTRY_ID, HEX_COLOR_RE } from './protocol.ts'

/**
 * Plugin config, validated by the same-named schemastery schema.
 *
 * dsh 0.1.7 把「插件注册 settings 命名空间」换成了「Loader 入口的 Config 就是
 * settings 命名空间」：这一份 schema 同时是组合层配置与设置页表单。每个字段都是
 * volatile —— Loader 就地重解析 volatile 值并重新进入 apply()，不重建 fiber；
 * 也只有 volatile 字段能经 settings 传输写入。
 */
export interface Config {
  /** When true (default), a system-prompt section announces the hub to every agent. */
  announceToAgent: Volatile<boolean>
  /** Master switch for the plugin (routes, prompt section). */
  enabled: Volatile<boolean>
  /** Show per-skill invocation count chip. Default true. */
  showUseCount: Volatile<boolean>
  /** Show per-skill last-used relative time. Default true. */
  showUseTime: Volatile<boolean>
  /** Show group-header usage summaries (count + last used). Default true. */
  showGroupSummary: Volatile<boolean>
  /** 模型可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
  dotModelColor: Volatile<string | undefined>
  /** 用户可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
  dotUserColor: Volatile<string | undefined>
  /** GitHub token；`role('secret')` 让 settings 层统一脱敏，缺省为匿名。 */
  githubToken: Volatile<string | undefined>
  /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。 */
  statsWindowDays: Volatile<number>
  /** 自动统计扫描间隔（分钟，最小 1）。 */
  statsScanMinutes: Volatile<number>
}

/**
 * 持久字段 schema（plain、非 volatile）：同一份定义既喂下面的 live 视图，也喂
 * 设置页渲染的 wire 表单（`.toJSON()`）。`description` 是设置页每行显示的说明；
 * `role('secret')` 让 settings 层在每次 wire 读时脱敏。
 */
const ConfigFields = {
  enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled).description('关闭后技能中枢的路由、入口与公告全部下线。'),
  announceToAgent: z.boolean().default(HUB_CONFIG_DEFAULTS.announceToAgent).description('在系统提示中加入本插件说明，用户提到技能管理时 Agent 知道如何协作。'),
  dotModelColor: z.string().pattern(HEX_COLOR_RE).description('技能行与聊天「/」菜单中「模型可调」圆点的颜色（#rrggbb）。'),
  dotUserColor: z.string().pattern(HEX_COLOR_RE).description('技能行与聊天「/」菜单中「仅用户可调」圆点的颜色（#rrggbb）。'),
  showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount).description('在技能名旁显示调用次数。'),
  showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime).description('在技能名行显示最近调用时间。'),
  showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary).description('在分组标题后汇总调用次数与最近调用时间。'),
  statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays).description('只统计最近 N 天的使用次数；0 = 全部历史。'),
  statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes).description('后台扫描会话日志的间隔（分钟，最小 1）。'),
  githubToken: z.string().role('secret').description('市场/来源走 GitHub API：匿名每小时 60 次，填 token 后 5000 次。留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。'),
}

/** 设置页编辑的 live 配置；字段顺序即设置页渲染的行顺序。 */
export const Config = z.object({
  enabled: ConfigFields.enabled.volatile(),
  announceToAgent: ConfigFields.announceToAgent.volatile(),
  dotModelColor: ConfigFields.dotModelColor.volatile(),
  dotUserColor: ConfigFields.dotUserColor.volatile(),
  showUseCount: ConfigFields.showUseCount.volatile(),
  showUseTime: ConfigFields.showUseTime.volatile(),
  showGroupSummary: ConfigFields.showGroupSummary.volatile(),
  statsWindowDays: ConfigFields.statsWindowDays.volatile(),
  statsScanMinutes: ConfigFields.statsScanMinutes.volatile(),
  githubToken: ConfigFields.githubToken.volatile(),
})

/**
 * 本插件的配置命名空间 —— 0.1.7 起就是 Loader 入口 id（`cordis.patch.yml` 的
 * insert id），不是包名。浏览器半边用同一个契约常量经
 * `ctx.configForms.get(HUB_ENTRY_ID)` 解析同一张表单。
 */
export const ENTRY_ID = HUB_ENTRY_ID as SettingsNamespace

/** 全部配置字段，顺序与设置页渲染顺序一致（用于遍历 volatile 引用）。 */
export const CONFIG_FIELDS = [
  'enabled',
  'announceToAgent',
  'dotModelColor',
  'dotUserColor',
  'showUseCount',
  'showUseTime',
  'showGroupSummary',
  'statsWindowDays',
  'statsScanMinutes',
  'githubToken',
] as const

/** Order of the announcement section within the tool-guidance band. */
export const SECTION_ORDER = 152

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const SKILL_HUB_GUIDANCE = [
  '本机已安装 dsh-skill-hub 插件（DSH Web GUI Skill管理）：设置 →「Skill」分区为管理主页；本插件的配置卡片（启用/公告开关）在插件管理页——侧边栏「插件」→ 本插件。能力：完整本地技能目录（项目/自定义/用户/内置全部来源，走官方 ctx.skills 注册表，含第三方 provider）；按来源与自定义分组浏览，分组/来源头部的滑动开关可一键启用/禁用整组（跨组冲突时询问）；市场：内置市场目录（精选仓库一键添加）加自定义仓库源，扫描后勾选安装，每个市场源行显示已装/可更新/上游已删数量，支持「检查全部」与「全部更新」；来源跟踪：从 GitHub 仓库（市场源或直接地址）导入的技能记录上游 repo/commit 快照，可检查更新、选择同步、上游删除时跟进删除（移入回收站可恢复，恢复后保留来源与场景归属）；个人技能（无来源记录）不跟踪；调用次数与最近使用时间统计；查看技能正文；发现诊断；新建技能向导（写入 ~/.dsh/skills 或 ~/.agents/skills）。模式级技能隔离：设置 →「技能」→「模式」把场景/来源分组或单个技能绑到某个 agent preset 上；该模式启用隔离后，只有勾选的技能对它的会话可见（模型目录与显式调用同时失效），其他模式完全不受影响；实现方式是把一个遮蔽 provider 接进该 preset 的作用域，不改任何 preset 文件，也不动技能文件。全局禁用与模式隔离正交：前者让技能在所有模式消失，后者只在指定模式消失。限制：仅用户级技能（user-dsh/user-agents 根目录）可写，项目/内置/运行时技能只读展示；路由仅回环可访问。用户提到「技能管理 / 技能列表 / 技能开关 / 技能同步 / 技能市场 / 更新技能 / 新建技能」时即指本插件，请据此协作。',
  'The dsh-skill-hub plugin is installed (the DSH Web GUI skill hub): Settings → "Skills" is the management page; the plugin\'s configuration card (enable / announcement toggles) lives on its own page in the Plugins manager (sidebar → 插件 → the plugin). Capabilities: full local skill catalog (project / custom / user / bundled roots via the official ctx.skills registry, including third-party providers); browsing by source and custom groups, each group header carrying a sliding switch to enable/disable the whole group in one click (cross-group conflicts prompt the user); market: a built-in catalog of curated repos (one-click add) plus custom repo sources, scan-and-install import, per-source installed / updatable / deleted-upstream badges with "check all" and "update all" actions; upstream source tracking: skills imported from GitHub repos (market sources or direct URLs) record the repo/commit snapshot, support update checks, selective sync, and follow-up deletion when the upstream removes a skill (moves it into a restorable trash; restoring keeps the source and scene membership); personal skills (no source record) are never tracked; invocation counts and last-used times; skill body inspection; discovery diagnostics; new-skill wizard (writes to ~/.dsh/skills or ~/.agents/skills). Mode-level skill isolation: Settings → Skills → Modes binds scenes, source collections, or individual skills to an agent preset; once a mode enables isolation, only the checked skills stay visible to its sessions (both the model catalog and explicit loads stop working for the rest) while every other mode is untouched. It works by attaching a shadowing provider to that preset scope — no preset file is edited and no skill file is touched. Global disabling and mode isolation are orthogonal: the former hides a skill everywhere, the latter only in the named modes. Limits: only user-level skills (user-dsh/user-agents roots) are writable; project/bundled/runtime skills are read-only; routes are loopback-only. When the user mentions "skill management / skill list / skill toggle / skill sync / skill market / update skills / new skill", this plugin is what they mean — collaborate accordingly.'
].join('\n\n')
