/**
 * 插件对外的配置面：volatile 字段、settings 表单 schema、入口常量与公告文案。
 *
 * 拆出来是为了让入口文件（index.ts）只负责组装：这张表要同时与
 * cordis.patch.yml 的 insert id、浏览器半边的 settings 契约对照阅读。
 */
import type { Volatile } from '@deepseek-ai/cordis';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
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
    announceToAgent: Volatile<boolean>;
    /** Master switch for the plugin (routes, prompt section). */
    enabled: Volatile<boolean>;
    /** Show per-skill invocation count chip. Default true. */
    showUseCount: Volatile<boolean>;
    /** Show per-skill last-used relative time. Default true. */
    showUseTime: Volatile<boolean>;
    /** Show group-header usage summaries (count + last used). Default true. */
    showGroupSummary: Volatile<boolean>;
    /** 模型可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
    dotModelColor: Volatile<string | undefined>;
    /** 用户可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
    dotUserColor: Volatile<string | undefined>;
    /** GitHub token；`role('secret')` 让 settings 层统一脱敏，缺省为匿名。 */
    githubToken: Volatile<string | undefined>;
    /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。 */
    statsWindowDays: Volatile<number>;
    /** 自动统计扫描间隔（分钟，最小 1）。 */
    statsScanMinutes: Volatile<number>;
}
/** 设置页编辑的 live 配置；字段顺序即设置页渲染的行顺序。 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    dotModelColor: z<string, string, "volatile">;
    dotUserColor: z<string, string, "volatile">;
    showUseCount: z<boolean, boolean, "volatile-defined">;
    showUseTime: z<boolean, boolean, "volatile-defined">;
    showGroupSummary: z<boolean, boolean, "volatile-defined">;
    statsWindowDays: z<number, number, "volatile-defined">;
    statsScanMinutes: z<number, number, "volatile-defined">;
    githubToken: z<string, string, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    announceToAgent: z<boolean, boolean, "volatile-defined">;
    dotModelColor: z<string, string, "volatile">;
    dotUserColor: z<string, string, "volatile">;
    showUseCount: z<boolean, boolean, "volatile-defined">;
    showUseTime: z<boolean, boolean, "volatile-defined">;
    showGroupSummary: z<boolean, boolean, "volatile-defined">;
    statsWindowDays: z<number, number, "volatile-defined">;
    statsScanMinutes: z<number, number, "volatile-defined">;
    githubToken: z<string, string, "volatile">;
}>>, "plain">;
/**
 * 本插件的配置命名空间 —— 0.1.7 起就是 Loader 入口 id（`cordis.patch.yml` 的
 * insert id），不是包名。浏览器半边用同一个契约常量经
 * `ctx.configForms.get(HUB_ENTRY_ID)` 解析同一张表单。
 */
export declare const ENTRY_ID: SettingsNamespace;
/** 全部配置字段，顺序与设置页渲染顺序一致（用于遍历 volatile 引用）。 */
export declare const CONFIG_FIELDS: readonly ["enabled", "announceToAgent", "dotModelColor", "dotUserColor", "showUseCount", "showUseTime", "showGroupSummary", "statsWindowDays", "statsScanMinutes", "githubToken"];
/** Order of the announcement section within the tool-guidance band. */
export declare const SECTION_ORDER = 152;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const SKILL_HUB_GUIDANCE: string;
