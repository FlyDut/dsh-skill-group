/**
 * 插件对外的配置面：volatile 字段、settings 表单 schema 与入口常量。
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
  /** Master switch for the plugin (routes and skill provider). */
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
  enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled).description('关闭后技能分组的路由、入口与技能 provider 全部下线。'),
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
  'dotModelColor',
  'dotUserColor',
  'showUseCount',
  'showUseTime',
  'showGroupSummary',
  'statsWindowDays',
  'statsScanMinutes',
  'githubToken',
] as const

