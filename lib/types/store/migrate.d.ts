import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, ScopePolicy, SkillStatsCheckpoint, SkillTag, SourceRecord, WorkspacePolicy } from '../protocol.ts';
/** Normalized raw sidecar document after schema migration (fields still unvalidated). */
export interface MigratedStore {
    version: number;
    disabled: unknown;
    config?: unknown;
    tags?: unknown;
    sources?: unknown;
    marketSources?: unknown;
    skillStats?: unknown;
    marketStats?: unknown;
    collectionOrder?: unknown;
    sourceGroupOrder?: unknown;
    scopes?: unknown;
    workspaces?: unknown;
}
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
export declare function migrateStore(parsed: unknown): MigratedStore | null;
/** Validated in-memory state hydrated from a migrated document. */
export interface HydratedState {
    entries: Map<string, DisabledSkill>;
    config: Partial<HubConfig>;
    tagsById: Map<string, SkillTag>;
    sourcesByRepo: Map<string, SourceRecord>;
    marketSources: MarketSourceRecord[];
    skillStats: SkillStatsCheckpoint | undefined;
    marketStats: MarketStatsSnapshot | undefined;
    collectionOrder: string[];
    sourceGroupOrder: string[];
    scopes: ScopePolicy[];
    workspaces: WorkspacePolicy[];
}
/**
 * 把迁移后的原始文档校验为内存状态：坏条目丢弃、坏桶降级为空，
 * 绝不因一条脏数据丢掉整个 sidecar（与原 ensureLoaded 内联逻辑一致）。
 */
export declare function hydrateMigratedState(migrated: MigratedStore): HydratedState;
