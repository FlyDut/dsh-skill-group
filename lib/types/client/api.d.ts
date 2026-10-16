/**
 * Browser-side API client for the /api/skill-hub route family. The only
 * data access path the panel uses — plain fetch, same origin.
 */
import { type CatalogResponse, type ConfigResponse, type CreateRequest, type CreateResponse, type DiagnosticFixResponse, type GroupsResponse, type MarketCheckResponse, type MarketSourcesResponse, type MarketSourceVersionsResponse, type MarketStatsResponse, type MarketSyncResponse, type RepoDiscoverResponse, type RepoImportCancelResponse, type RepoImportProgressResponse, type RepoImportResponse, type PresetsResponse, type ScopeSaveRequest, type ScopeSaveResponse, type SkillDetail, type SkillDeleteResponse, type SkillTag, type SourceCheckResponse, type SourcesResponse, type SourceSyncResponse, type StatsResponse, type TagSaveRequest, type ToggleBatchResponse, type WorkspaceSaveRequest, type WorkspaceSaveResponse, type WorkspacesResponse } from '../protocol.ts';
/**
 * Error carrying the route's JSON error message and its HTTP status. The
 * status is part of the contract so callers can branch on "this host is too
 * old to know that route" (404) without string-sniffing the message text.
 */
export declare class SkillHubApiError extends Error {
    /** HTTP status of the failed response (0 when the request never completed). */
    readonly status: number;
    constructor(message: string, status?: number);
}
/**
 * True when the host has no such route at all (an older host). Callers use it
 * to degrade gracefully — skip an optional probe — instead of sniffing
 * "404"/"not found" out of the human-readable message.
 */
export declare function isMissingRoute(error: unknown): boolean;
/** The browser half's only data entry point. */
export declare class SkillHubApi {
    private get;
    /** One POST round trip (body omitted for routes that take none). */
    private post;
    /** The full local catalog (runtime switch state + discovery diagnostics). */
    catalog(): Promise<CatalogResponse>;
    /** One skill's detail. */
    skill(name: string): Promise<SkillDetail>;
    /**
     * Switch one skill on or off; resolves with the fresh catalog from the
     * route. The switch lives in the hub's sidecar and is enforced at runtime —
     * no skill file is renamed or removed.
     */
    toggle(name: string, enabled: boolean): Promise<CatalogResponse>;
    create(payload: CreateRequest): Promise<CreateResponse>;
    /**
     * Delete skills from disk. Destructive and irreversible: the panel only calls
     * this after the user confirms a staged deletion. Unknown/read-only names come
     * back in `failures`; the fresh catalog is returned either way.
     */
    deleteSkills(names: string[]): Promise<SkillDeleteResponse>;
    stats(): Promise<StatsResponse>;
    /** Toggle a whole group in one write; resolves with the fresh catalog + failures. */
    toggleBatch(names: string[], enabled: boolean): Promise<ToggleBatchResponse>;
    /** The user's added market sources. */
    market(): Promise<MarketSourcesResponse>;
    /** Add a market source repo; resolves with the fresh list. */
    addMarketSource(repo: string): Promise<MarketSourcesResponse>;
    /** Remove a market source repo; resolves with the fresh list. */
    removeMarketSource(repo: string): Promise<MarketSourcesResponse>;
    /** Stars + downloads per market source (hourly server-side cache; refresh=1 refetches stale entries). */
    marketStats(refresh?: boolean): Promise<MarketStatsResponse>;
    /** Check every market source for updates (throttled server-side). */
    marketCheck(): Promise<MarketCheckResponse>;
    /** Align a market source to its pinned ref; resolves with tracked skills. */
    marketSync(repo: string): Promise<MarketSyncResponse>;
    /** Releases + branches of a market source for the version picker. */
    marketSourceVersions(repo: string): Promise<MarketSourceVersionsResponse>;
    /** Pin a market source to an explicit ref (branch picker). */
    setMarketSourceRef(repo: string, ref: string): Promise<MarketSourcesResponse>;
    /** Discover importable skills in a GitHub repo. */
    repoDiscover(repo: string): Promise<RepoDiscoverResponse>;
    /** Install selected repo skills into the user-dsh root (records the source). Returns jobId for polling. */
    repoImport(repo: string, paths: string[], ref?: string): Promise<RepoImportResponse>;
    /** Poll import job progress (B方案轮询) */
    repoImportProgress(jobId: string): Promise<RepoImportProgressResponse>;
    /** Cancel a running import job (选项2：唯有取消才停) */
    repoImportCancel(jobId: string): Promise<RepoImportCancelResponse>;
    /** Read the hub's runtime config (effective values + saved overrides). */
    config(): Promise<ConfigResponse>;
    /** 用户 tag 分组 + 系统集合组 + origin 映射。 */
    groups(): Promise<GroupsResponse>;
    /** 新建（无 id）或重命名（带 id）一个 tag 分组；返回全部 tag。 */
    saveTag(payload: TagSaveRequest): Promise<SkillTag[]>;
    /** 删除一个 tag 分组；返回全部 tag。 */
    deleteTag(id: string): Promise<SkillTag[]>;
    /** 直接设置某 tag 的完整成员列表；返回全部 tag。 */
    setTagMembers(id: string, skillNames: string[]): Promise<SkillTag[]>;
    /** 来源列表 + 派生 origin 映射 + 集合组。 */
    sources(): Promise<SourcesResponse>;
    /** 检查指定（或全部）来源的上游更新。 */
    checkSources(repo?: string): Promise<SourceCheckResponse>;
    /** 同步一个来源的所选（或全部）技能到上游最新版本。 */
    syncSource(repo: string, skills?: string[]): Promise<SourceSyncResponse>;
    /** Auto-fix a fixable diagnostic (e.g. unquoted colon). */
    fixDiagnostic(path: string): Promise<DiagnosticFixResponse>;
    /** 模式名单 + 每个模式的策略、可见/隐藏计数与接线状态。 */
    presets(): Promise<PresetsResponse>;
    /** 写入某个模式的策略（部分更新；reset 删除策略）。 */
    saveScope(payload: ScopeSaveRequest): Promise<ScopeSaveResponse>;
    /** DSH 工作区名单 + 每个工作区的策略、可见/隐藏计数。 */
    workspaces(): Promise<WorkspacesResponse>;
    /** 写入某个工作区的策略（部分更新；reset 删除策略）。 */
    saveWorkspace(payload: WorkspaceSaveRequest): Promise<WorkspaceSaveResponse>;
}
