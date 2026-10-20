/** JSON error body shared by every route. */
export interface ErrorResponse {
    error: string;
}
/** The skill hub's own runtime configuration, edited from the settings card. */
export interface HubConfig {
    /** Master switch: routes and the skill provider go live with this. */
    enabled: boolean;
    /** Model-invocable dot color (#rrggbb); absent means the panel default. */
    dotModelColor?: string;
    /** User-invocable dot color (#rrggbb); absent means the panel default. */
    dotUserColor?: string;
    /** Show per-skill invocation count chip. Default true. */
    showUseCount?: boolean;
    /** Show per-skill last-used relative time. Default true. */
    showUseTime?: boolean;
    /** Show group-header usage summaries (count + last used). Default true. */
    showGroupSummary?: boolean;
    /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。默认 0。 */
    statsWindowDays?: number;
    /** 自动统计扫描间隔（分钟，最小 1）。默认 5。 */
    statsScanMinutes?: number;
    /**
     * GitHub personal access token for market/source API calls (anonymous quota
     * is 60 req/h, authed 5000/hr). Stored in the local settings doc; absent
     * means anonymous. Never logged.
     */
    githubToken?: string;
}
/**
 * HubConfig minus the GitHub token: the shape of every config payload that
 * leaves the host over HTTP. The token is write-only there — a response
 * pasted into an issue or a screenshot would otherwise hand the credential
 * over, so callers read `ConfigResponse.githubTokenSet` when they only need
 * to know whether one is in effect.
 */
export type RedactedHubConfig = Omit<HubConfig, 'githubToken'>;
/**
 * The resolved shape of the hub's settings namespace (schema defaults, then
 * the composition base, then the user layer). Kept as a type alias so the
 * browser-side settings scope snapshot is index-compatible with the card
 * form's record shape.
 */
export type HubSettingsValue = {
    enabled: boolean;
    showUseCount: boolean;
    showUseTime: boolean;
    showGroupSummary: boolean;
    /** Model-invocable dot color (#rrggbb); absent means the panel default. */
    dotModelColor?: string;
    /** User-invocable dot color (#rrggbb); absent means the panel default. */
    dotUserColor?: string;
    /** 统计滚动窗口天数（0 = 全部历史）。 */
    statsWindowDays?: number;
    /** 自动统计扫描间隔（分钟）。 */
    statsScanMinutes?: number;
    /** GitHub token（明文存本地设置文档，仅回环可读；缺省为匿名）。 */
    githubToken?: string;
};
/**
 * 本插件的 Loader 入口 id —— dsh 0.1.7 起 settings 的命名空间就是它（不是包名）。
 * 它是 cordis.patch.yml 的 insert id，宿主与浏览器半边共用这份契约：宿主经
 * `settings.mutate(HUB_ENTRY_ID, …)` 写入，浏览器半边经
 * `ctx.configForms.get(HUB_ENTRY_ID)` 读到同一份表单。
 */
export declare const HUB_ENTRY_ID = "skill-hub";
/**
 * Hub config defaults — the single source every layer reads: the cordis
 * schema (index.ts), the host's saved-override merge, and the routes'
 * fallback view. Changing a default here changes all three.
 */
export declare const HUB_CONFIG_DEFAULTS: {
    readonly enabled: true;
    readonly showUseCount: true;
    readonly showUseTime: true;
    readonly showGroupSummary: true;
    readonly statsWindowDays: 14;
    readonly statsScanMinutes: 5;
};
/**
 * Resolve the effective hub config: saved sidecar overrides win over the
 * cordis composition entry (the web card owns runtime config), missing
 * booleans fall back to HUB_CONFIG_DEFAULTS, and dot colors pass through
 * (saved first, then base) only when set. Numeric stats knobs are clamped to
 * their sane ranges (window ≥ 0, scan interval ≥ 1 minute).
 */
export declare function resolveHubConfig(saved: Partial<HubConfig>, base?: Partial<HubConfig>): HubConfig;
/**
 * Drop the GitHub token from a config-shaped object. Returns a copy, so the
 * caller's own config layer keeps the token. Shared by the config route's GET
 * and POST responses — neither may echo it back.
 */
export declare function redactGithubToken<T extends {
    githubToken?: string;
}>(value: T): Omit<T, 'githubToken'>;
/** HEX color validation shared by host routes and the settings card. */
export declare const HEX_COLOR_RE: RegExp;
/** GET /api/skill-hub/config */
export interface ConfigResponse {
    ok: true;
    /** 已安装插件自身的版本号（package.json version），设置卡标题旁显示。 */
    pluginVersion: string;
    /** Effective configuration (saved overrides merged over the defaults), token stripped. */
    config: RedactedHubConfig;
    /** Raw user overrides persisted in the sidecar (absent fields inherit defaults), token stripped. */
    saved: Partial<RedactedHubConfig>;
    /** True when a GitHub token is in effect (saved override or the base/env layer). */
    githubTokenSet: boolean;
}
/** GitHub token validation shared by host routes and the settings card. */
export declare const GITHUB_TOKEN_RE: RegExp;
