/**
 * Shared API contract for skill-hub: the route paths and payload shapes
 * both the host half and the browser half import. The browser half must never
 * depend on host SDK packages, so registry types are re-spelled here as
 * plain JSON-safe interfaces.
 *
 * 按域拆分后的重导出入口：老 `from './protocol.ts'` 写法保持可用，
 * 新代码可按需直引 `from './protocol/<domain>.ts'`。
 */

export { SKILL_HUB_API, SKILL_HUB_API_ROOT } from './protocol/api.ts'
export type {
  WritableRoot,
  HubInvocation,
  CatalogSkill,
  DisabledSkill,
  DiagnosticEntry,
  DiagnosticFixRequest,
  DiagnosticFixResponse,
  CatalogResponse,
  SkillDetail,
  SkillDetailResponse,
  ToggleRequest,
  ToggleResponse,
  ToggleBatchRequest,
  ToggleBatchResponse,
  SkillDeleteRequest,
  SkillDeleteResponse,
  CreateRequest,
  CreateResponse,
} from './protocol/catalog.ts'
export type { SkillStat, StatsResponse, SkillStatsCheckpoint } from './protocol/stats.ts'
export type { ErrorResponse, HubConfig, HubSettingsValue, RedactedHubConfig, ConfigResponse } from './protocol/config.ts'
export { HUB_CONFIG_DEFAULTS, HUB_ENTRY_ID, HEX_COLOR_RE, GITHUB_TOKEN_RE, resolveHubConfig, redactGithubToken } from './protocol/config.ts'
export type {
  MarketSourceRecord,
  MarketSourcesResponse,
  MarketSourceRequest,
  MarketSourceResponse,
  MarketSourceRefRequest,
  MarketSourceVersionsResponse,
  MarketStatsSnapshot,
  MarketStatsResponse,
  MarketCheckResponse,
  MarketSyncResponse,
} from './protocol/market.ts'
export type {
  RepoSkillEntry,
  RepoRoot,
  RepoDiscoverResponse,
  RepoImportRequest,
  RepoImportResponse,
  RepoImportProgressResponse,
  RepoImportCancelResponse,
} from './protocol/repo.ts'
export type {
  SkillTag,
  CollectionGroup,
  GroupsResponse,
  TagSaveRequest,
  TagSaveResponse,
  TagDeleteRequest,
  TagDeleteResponse,
  TagMembersRequest,
  TagMembersResponse,
} from './protocol/groups.ts'
export type {
  PolicyEntries,
  ScopePolicy,
  WorkspacePolicy,
  PresetScopeRow,
  PresetsResponse,
  ScopeSaveRequest,
  ScopeSaveResponse,
  ScopePreviewResponse,
  WorkspaceScopeRow,
  WorkspacesResponse,
  WorkspaceSaveRequest,
  WorkspaceSaveResponse,
} from './protocol/scopes.ts'
export {
  SCOPE_ENTRY_PREFIX,
  MAX_SCOPE_ENTRIES,
  PRESET_ID_RE,
  WORKSPACE_ID_RE,
  tagKey,
  collectionKey,
  sourceKey,
  skillKey,
  parseScopeEntry,
  normalizeScopePolicy,
  normalizeWorkspacePolicy,
  cleanKeys,
  cleanNames,
} from './protocol/scopes.ts'
export type {
  SourceRecord,
  SourcesResponse,
  SourceCheckRequest,
  SourceCheckResult,
  SourceCheckResponse,
  SourceSyncRequest,
  SourceSyncResponse,
} from './protocol/sources.ts'
