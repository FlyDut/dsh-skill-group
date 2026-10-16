/**
 * Root path of the skill-hub API family. The host also registers this as its
 * 404 catch-all prefix, so a mistyped path answers with a plain 404 naming the
 * path instead of falling through to the SPA fallback (which answers 401 and
 * reads like an auth problem).
 */
export declare const SKILL_HUB_API_ROOT = "/api/skill-hub";
/** Browser-facing base paths of the skill-hub API family. */
export declare const SKILL_HUB_API: {
    readonly catalog: "/api/skill-hub/catalog";
    readonly skill: "/api/skill-hub/skill";
    readonly toggle: "/api/skill-hub/toggle";
    readonly toggleBatch: "/api/skill-hub/toggle-batch";
    readonly create: "/api/skill-hub/create";
    /** 删除磁盘上的技能本体（仅限用户级可写根，用户确认后才会调用）。 */
    readonly skillDelete: "/api/skill-hub/skill/delete";
    readonly stats: "/api/skill-hub/stats";
    readonly config: "/api/skill-hub/config";
    readonly market: "/api/skill-hub/market";
    readonly marketSource: "/api/skill-hub/market/source";
    readonly marketSourceDelete: "/api/skill-hub/market/source/delete";
    readonly marketSourceRef: "/api/skill-hub/market/source/ref";
    readonly marketCheck: "/api/skill-hub/market/check";
    readonly marketSync: "/api/skill-hub/market/source/sync";
    readonly repo: "/api/skill-hub/repo";
    readonly repoImport: "/api/skill-hub/repo/import";
    readonly repoImportProgress: "/api/skill-hub/repo/import/progress";
    readonly repoImportCancel: "/api/skill-hub/repo/import/cancel";
    readonly groups: "/api/skill-hub/groups";
    readonly tag: "/api/skill-hub/tag";
    readonly tagDelete: "/api/skill-hub/tag/delete";
    readonly tagMembers: "/api/skill-hub/tag/members";
    readonly sources: "/api/skill-hub/sources";
    readonly sourceCheck: "/api/skill-hub/sources/check";
    readonly sourceSync: "/api/skill-hub/sources/sync";
    readonly diagnosticFix: "/api/skill-hub/diagnostic/fix";
    readonly marketSourceVersions: "/api/skill-hub/market/source/versions";
    readonly marketStats: "/api/skill-hub/market/stats";
    /** 模式级技能隔离：preset 名单 + 每条的接线状态与策略。 */
    readonly presets: "/api/skill-hub/presets";
    /** 写入某个模式的策略（部分更新；`reset: true` 删除策略）。 */
    readonly scope: "/api/skill-hub/scope";
    /** 读取某个模式的可见性展开明细（面板预览）。 */
    readonly scopePreview: "/api/skill-hub/scope/preview";
    /** 工作区名单 + 每个工作区的策略与展开计数。 */
    readonly workspaces: "/api/skill-hub/workspaces";
    /** 写入某个工作区的策略（部分更新；`reset: true` 删除策略）。 */
    readonly workspace: "/api/skill-hub/workspace";
};
