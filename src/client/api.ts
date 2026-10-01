/**
 * Browser-side API client for the /api/skill-hub route family. The only
 * data access path the panel uses — plain fetch, same origin.
 */
import {
  SKILL_HUB_API,
  type CatalogResponse,
  type ConfigResponse,
  type CreateRequest,
  type CreateResponse,
  type DiagnosticFixRequest,
  type DiagnosticFixResponse,
  type GroupsResponse,
  type MarketCheckResponse,
  type MarketSourceRefRequest,
  type MarketSourceRequest,
  type MarketSourceResponse,
  type MarketSourcesResponse,
  type MarketSourceVersionsResponse,
  type MarketStatsResponse,
  type MarketSyncResponse,
  type RepoDiscoverResponse,
  type RepoImportCancelResponse,
  type RepoImportProgressResponse,
  type RepoImportRequest,
  type RepoImportResponse,
  type PresetsResponse,
  type ScopeSaveRequest,
  type ScopeSaveResponse,
  type SkillDetail,
  type SkillDetailResponse,
  type SkillDeleteRequest,
  type SkillDeleteResponse,
  type SkillTag,
  type SourceCheckRequest,
  type SourceCheckResponse,
  type SourceGroupReorderRequest,
  type SourceGroupReorderResponse,
  type SourcesResponse,
  type SourceSyncRequest,
  type SourceSyncResponse,
  type StatsResponse,
  type TagDeleteRequest,
  type TagDeleteResponse,
  type TagMembersRequest,
  type TagMembersResponse,
  type TagReorderRequest,
  type TagReorderResponse,
  type TagSaveRequest,
  type TagSaveResponse,
  type ToggleBatchRequest,
  type ToggleBatchResponse,
  type ToggleRequest,
  type ToggleResponse,
} from '../protocol.ts'

/**
 * Error carrying the route's JSON error message and its HTTP status. The
 * status is part of the contract so callers can branch on "this host is too
 * old to know that route" (404) without string-sniffing the message text.
 */
export class SkillHubApiError extends Error {
  /** HTTP status of the failed response (0 when the request never completed). */
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'SkillHubApiError'
    this.status = status
  }
}

/**
 * True when the host has no such route at all (an older host). Callers use it
 * to degrade gracefully — reorder locally, skip an optional probe — instead of
 * sniffing "404"/"not found" out of the human-readable message.
 */
export function isMissingRoute(error: unknown): boolean {
  return error instanceof SkillHubApiError && error.status === 404
}

/** Parse a JSON response or throw a SkillHubApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SkillHubApiError('HTTP ' + response.status + ': invalid JSON response', response.status)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'HTTP ' + response.status
    throw new SkillHubApiError(message, response.status)
  }
  return body as T
}

/**
 * Fetch with a hard timeout: a hung connection (proxy, stalled keep-alive,
 * host wedged) must never leave the panel stuck on "loading" forever — it
 * fails fast and surfaces the error banner instead.
 */
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, ms = 10_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** The browser half's only data entry point. */
export class SkillHubApi {  /** One GET round trip (query already encoded by the caller). */
  private async get<T>(path: string, query = '', ms?: number): Promise<T> {
    const response = await fetchWithTimeout(path + query, undefined, ms)
    return readJson<T>(response)
  }

  /** One POST round trip (body omitted for routes that take none). */
  private async post<T>(path: string, body?: unknown, ms?: number): Promise<T> {
    const response = await fetchWithTimeout(path, body !== undefined
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' }, ms)
    return readJson<T>(response)
  }

  /** The full local catalog (runtime switch state + discovery diagnostics). */
  catalog(): Promise<CatalogResponse> {
    return this.get<CatalogResponse>(SKILL_HUB_API.catalog)
  }

  /** One skill's detail. */
  async skill(name: string): Promise<SkillDetail> {
    const body = await this.get<SkillDetailResponse>(SKILL_HUB_API.skill, '?name=' + encodeURIComponent(name))
    return body.skill
  }

  /**
   * Switch one skill on or off; resolves with the fresh catalog from the
   * route. The switch lives in the hub's sidecar and is enforced at runtime —
   * no skill file is renamed or removed.
   */
  async toggle(name: string, enabled: boolean): Promise<CatalogResponse> {
    const body = await this.post<ToggleResponse>(SKILL_HUB_API.toggle, { name, enabled } satisfies ToggleRequest)
    return body.catalog
  }

  create(payload: CreateRequest): Promise<CreateResponse> {
    return this.post<CreateResponse>(SKILL_HUB_API.create, payload)
  }

  /**
   * Delete skills from disk. Destructive and irreversible: the panel only calls
   * this after the user confirms a staged deletion. Unknown/read-only names come
   * back in `failures`; the fresh catalog is returned either way.
   */
  deleteSkills(names: string[]): Promise<SkillDeleteResponse> {
    const payload: SkillDeleteRequest = { names }
    return this.post<SkillDeleteResponse>(SKILL_HUB_API.skillDelete, payload)
  }

  stats(): Promise<StatsResponse> {
    return this.get<StatsResponse>(SKILL_HUB_API.stats)
  }

  /** Toggle a whole group in one write; resolves with the fresh catalog + failures. */
  toggleBatch(names: string[], enabled: boolean): Promise<ToggleBatchResponse> {
    const payload: ToggleBatchRequest = { names, enabled }
    return this.post<ToggleBatchResponse>(SKILL_HUB_API.toggleBatch, payload)
  }

  /** The user's added market sources. */
  market(): Promise<MarketSourcesResponse> {
    return this.get<MarketSourcesResponse>(SKILL_HUB_API.market)
  }

  /** Add a market source repo; resolves with the fresh list. */
  addMarketSource(repo: string): Promise<MarketSourcesResponse> {
    return this.post<MarketSourceResponse>(SKILL_HUB_API.marketSource, { repo } satisfies MarketSourceRequest)
  }

  /** Remove a market source repo; resolves with the fresh list. */
  removeMarketSource(repo: string): Promise<MarketSourcesResponse> {
    return this.post<MarketSourceResponse>(SKILL_HUB_API.marketSourceDelete, { repo } satisfies MarketSourceRequest)
  }

  /** Stars + downloads per market source (hourly server-side cache; refresh=1 refetches stale entries). */
  marketStats(refresh = false): Promise<MarketStatsResponse> {
    const query = refresh ? '?refresh=1' : ''
    return this.get<MarketStatsResponse>(SKILL_HUB_API.marketStats, query, refresh ? 60_000 : undefined)
  }

  /** Check every market source for updates (throttled server-side). */
  marketCheck(): Promise<MarketCheckResponse> {
    return this.get<MarketCheckResponse>(SKILL_HUB_API.marketCheck)
  }

  /** Align a market source to its pinned ref; resolves with tracked skills. */
  marketSync(repo: string): Promise<MarketSyncResponse> {
    return this.post<MarketSyncResponse>(SKILL_HUB_API.marketSync, { repo })
  }

  /** Releases + branches of a market source for the version picker. */
  marketSourceVersions(repo: string): Promise<MarketSourceVersionsResponse> {
    return this.get<MarketSourceVersionsResponse>(SKILL_HUB_API.marketSourceVersions, '?repo=' + encodeURIComponent(repo))
  }

  /** Pin a market source to an explicit ref (branch picker). */
  setMarketSourceRef(repo: string, ref: string): Promise<MarketSourcesResponse> {
    return this.post<MarketSourceResponse>(SKILL_HUB_API.marketSourceRef, { repo, ref } satisfies MarketSourceRefRequest)
  }

  /** Discover importable skills in a GitHub repo. */
  repoDiscover(repo: string): Promise<RepoDiscoverResponse> {
    return this.get<RepoDiscoverResponse>(SKILL_HUB_API.repo, '?repo=' + encodeURIComponent(repo))
  }

  /** Install selected repo skills into the user-dsh root (records the source). Returns jobId for polling. */
  repoImport(repo: string, paths: string[], ref?: string): Promise<RepoImportResponse> {
    const payload: RepoImportRequest = { repo, paths, ...(ref !== undefined && ref !== '' ? { ref } : {}) }
    return this.post<RepoImportResponse>(SKILL_HUB_API.repoImport, payload)
  }

  /** Poll import job progress (B方案轮询) */
  repoImportProgress(jobId: string): Promise<RepoImportProgressResponse> {
    return this.get<RepoImportProgressResponse>(SKILL_HUB_API.repoImportProgress, '?jobId=' + encodeURIComponent(jobId))
  }

  /** Cancel a running import job (选项2：唯有取消才停) */
  repoImportCancel(jobId: string): Promise<RepoImportCancelResponse> {
    return this.post<RepoImportCancelResponse>(SKILL_HUB_API.repoImportCancel, { jobId })
  }

  /** Read the hub's runtime config (effective values + saved overrides). */
  config(): Promise<ConfigResponse> {
    return this.get<ConfigResponse>(SKILL_HUB_API.config)
  }

  /** 用户 tag 分组 + 系统集合组 + origin 映射。 */
  groups(): Promise<GroupsResponse> {
    return this.get<GroupsResponse>(SKILL_HUB_API.groups)
  }

  /** 新建（无 id）或重命名（带 id）一个 tag 分组；返回全部 tag。 */
  async saveTag(payload: TagSaveRequest): Promise<SkillTag[]> {
    const body = await this.post<TagSaveResponse>(SKILL_HUB_API.tag, payload)
    return body.tags
  }

  /** 删除一个 tag 分组；返回全部 tag。 */
  async deleteTag(id: string): Promise<SkillTag[]> {
    const body = await this.post<TagDeleteResponse>(SKILL_HUB_API.tagDelete, { id } satisfies TagDeleteRequest)
    return body.tags
  }

  /** 直接设置某 tag 的完整成员列表；返回全部 tag。 */
  async setTagMembers(id: string, skillNames: string[]): Promise<SkillTag[]> {
    const body = await this.post<TagMembersResponse>(SKILL_HUB_API.tagMembers, { id, skillNames } satisfies TagMembersRequest)
    return body.tags
  }

  /** 拖拽重排场景分组 */
  async reorderTags(orderedIds: string[]): Promise<SkillTag[]> {
    const body = await this.post<TagReorderResponse>(SKILL_HUB_API.tagReorder, { orderedIds } satisfies TagReorderRequest)
    return body.tags
  }

  /** 拖拽重排来源顶层分组（project / collections / personal） */
  async reorderSourceGroups(orderedKeys: string[]): Promise<string[]> {
    const body = await this.post<SourceGroupReorderResponse>(SKILL_HUB_API.sourceGroupReorder, { orderedKeys } satisfies SourceGroupReorderRequest)
    return body.order
  }

  /** 来源列表 + 派生 origin 映射 + 集合组。 */
  sources(): Promise<SourcesResponse> {
    return this.get<SourcesResponse>(SKILL_HUB_API.sources)
  }

  /** 检查指定（或全部）来源的上游更新。 */
  checkSources(repo?: string): Promise<SourceCheckResponse> {
    const payload: SourceCheckRequest = repo !== undefined ? { repo } : {}
    return this.post<SourceCheckResponse>(SKILL_HUB_API.sourceCheck, payload)
  }

  /** 同步一个来源的所选（或全部）技能到上游最新版本。 */
  syncSource(repo: string, skills?: string[]): Promise<SourceSyncResponse> {
    const payload: SourceSyncRequest = skills !== undefined ? { repo, skills } : { repo }
    return this.post<SourceSyncResponse>(SKILL_HUB_API.sourceSync, payload)
  }

  /** Auto-fix a fixable diagnostic (e.g. unquoted colon). */
  fixDiagnostic(path: string): Promise<DiagnosticFixResponse> {
    return this.post<DiagnosticFixResponse>(SKILL_HUB_API.diagnosticFix, { path } satisfies DiagnosticFixRequest)
  }

  /** 模式名单 + 每个模式的策略、可见/隐藏计数与接线状态。 */
  presets(): Promise<PresetsResponse> {
    return this.get<PresetsResponse>(SKILL_HUB_API.presets)
  }

  /** 写入某个模式的策略（部分更新；reset 删除策略）。 */
  saveScope(payload: ScopeSaveRequest): Promise<ScopeSaveResponse> {
    return this.post<ScopeSaveResponse>(SKILL_HUB_API.scope, payload)
  }
}
