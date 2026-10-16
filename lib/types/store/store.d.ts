import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, ScopePolicy, SkillStatsCheckpoint, SkillTag, SourceRecord, WorkspacePolicy } from '../protocol.ts';
/** Sidecar state owner. */
export declare class SkillHubStore {
    private readonly file;
    private entries;
    private config;
    private tagsById;
    private sourcesByRepo;
    private marketSources;
    private skillStats;
    private marketStats;
    private collectionOrder;
    private sourceGroupOrder;
    /** v5: 模式（preset）→ 技能可见性策略；缺席的 preset 不做隔离。 */
    private scopesByPreset;
    /** v7: 工作区 id → 技能可见性策略；启用后覆盖同一会话的模式策略。 */
    private workspacesById;
    private loaded;
    /** Serializes persist runs: concurrent mutators must not let an earlier
     *  snapshot overwrite a later one (rename is atomic, ordering is not). */
    private writeChain;
    constructor(file?: string);
    private ensureLoaded;
    listDisabled(): Promise<DisabledSkill[]>;
    getDisabled(name: string): Promise<DisabledSkill | undefined>;
    addDisabled(entry: DisabledSkill): Promise<void>;
    removeDisabled(name: string): Promise<void>;
    /** The hub's saved runtime configuration (fields absent here mean "not overridden"). */
    getConfig(): Promise<Partial<HubConfig>>;
    /**
     * Persist a runtime-config patch, merged over the saved values. A field
     * whose patch value is undefined is removed from the saved layer, so the
     * setting re-inherits its default (the web card's "reset" path).
     */
    setConfig(config: Partial<HubConfig>): Promise<void>;
    /** All user-defined tag groups, in creation order. */
    listTags(): Promise<SkillTag[]>;
    /** One tag by id (undefined when absent). */
    getTag(id: string): Promise<SkillTag | undefined>;
    /**
     * Create (no id) or rename (with id) a tag. Returns the saved tag.
     * Creating assigns a fresh UUID; renaming keeps members.
     */
    saveTag(input: {
        id?: string;
        name: string;
    }): Promise<SkillTag>;
    /** Delete a tag by id (no-op when absent). */
    deleteTag(id: string): Promise<void>;
    /** Append one skill name to a tag (deduplicated; no-op when already a member). */
    addSkillToTag(id: string, name: string): Promise<SkillTag | undefined>;
    /**
     * Replace a tag's member list wholesale (idempotent). Deduplicates and
     * drops blank names; unknown skill names are kept (they may arrive later),
     * the routes layer filters against the live catalog before persisting.
     */
    setTagMembers(id: string, skillNames: readonly string[]): Promise<SkillTag | undefined>;
    /** Remove one skill from every tag group (used when the skill is deleted). */
    removeSkillFromTags(name: string): Promise<void>;
    /**
     * 来源集合（collection）的排序键。
     *
     * 遗留字段：当前 UI 没有分组排序入口，因此这里**没有写入端**——方法保留
     * 只为读取旧数据文件里已有的顺序（`buildCollections` 用它排 collection
     * 分组）。
     */
    getCollectionOrder(): Promise<string[]>;
    /**
     * 来源顶层分组顺序（project / col:xxx / personal）。
     *
     * 遗留字段：UI 已经没有排序入口，这里**没有写入端**——方法保留只为读取
     * 旧数据文件里已有的顺序（SourcesView 用它排顶层卡片）。
     */
    getSourceGroupOrder(): Promise<string[]>;
    /** 全部模式策略，按 presetId 排序。 */
    listScopes(): Promise<ScopePolicy[]>;
    /** 一个模式的策略；没有保存过时返回 undefined（= 不隔离）。 */
    getScope(presetId: string): Promise<ScopePolicy | undefined>;
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
    saveScope(presetId: string, patch: {
        enabled?: boolean;
        groups?: string[];
        skills?: string[];
    }): Promise<ScopePolicy>;
    /**
     * 删除一个模式的策略（回到"不限制"）。
     * @param presetId - 目标 preset。
     * @returns 是否确实删掉了一条。
     */
    deleteScope(presetId: string): Promise<boolean>;
    /** 全部工作区策略，按 workspaceId 排序。 */
    listWorkspacePolicies(): Promise<WorkspacePolicy[]>;
    /** 一个工作区的策略；没有保存过时返回 undefined（= 不隔离）。 */
    getWorkspacePolicy(workspaceId: string): Promise<WorkspacePolicy | undefined>;
    /**
     * 保存一个工作区的策略（部分更新；缺席字段保持现值）。规则与
     * {@link saveScope} 完全一致：新建默认不启用，提供的清单整体替换。
     * @param workspaceId - 目标工作区；形状非法时抛 StoreError。
     * @param patch - 要落地的字段。
     * @returns 保存后的策略快照。
     */
    saveWorkspacePolicy(workspaceId: string, patch: {
        enabled?: boolean;
        groups?: string[];
        skills?: string[];
    }): Promise<WorkspacePolicy>;
    /**
     * 删除一个工作区的策略（回到"不限制"）。
     * @param workspaceId - 目标工作区。
     * @returns 是否确实删掉了一条。
     */
    deleteWorkspacePolicy(workspaceId: string): Promise<boolean>;
    /** All source records, sorted by repo. */
    listSources(): Promise<SourceRecord[]>;
    /** One source record by repo (undefined when absent). */
    getSource(repo: string): Promise<SourceRecord | undefined>;
    /** The source record that tracks a skill name (undefined when untracked). */
    getSourceForSkill(name: string): Promise<SourceRecord | undefined>;
    /** Remove a source record entirely (no-op when absent). */
    deleteSource(repo: string): Promise<void>;
    /**
     * Upsert one skill into a source record. When the repo has no record yet a
     * new one is created (root + commit snapshot from the caller).
     */
    addSourceSkill(repo: string, root: string, commitSha: string, ref: string | undefined, skillName: string): Promise<void>;
    /** Replace a source's skill list (used after sync/confirm-delete). */
    setSourceSkills(repo: string, skills: readonly string[]): Promise<SourceRecord | undefined>;
    /** Remove one skill from every source record (used when the skill is deleted). */
    removeSkillFromSources(name: string): Promise<void>;
    /** Update a source's commit snapshot. */
    setSourceCommit(repo: string, commitSha: string): Promise<void>;
    /** Update a source's pinned ref (release tag / branch) when the market syncs. */
    setSourceRef(repo: string, ref: string): Promise<void>;
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
    mergeSourceManifest(repo: string, manifest: Record<string, number>, dir?: string): Promise<void>;
    /** skillName → collection name for every recorded origin (derived from sources). */
    listOrigins(): Promise<Record<string, string>>;
    /** The user's market sources, in addition order. */
    listMarketSources(): Promise<MarketSourceRecord[]>;
    /** One market source by repo (undefined when absent). */
    getMarketSource(repo: string): Promise<MarketSourceRecord | undefined>;
    /** Add a repo (deduplicated), optionally with a pinned ref. Returns the fresh list. */
    addMarketSource(repo: string, ref?: string): Promise<MarketSourceRecord[]>;
    /** Remove a repo (no-op when absent). Returns the fresh list. */
    removeMarketSource(repo: string): Promise<MarketSourceRecord[]>;
    /** Pin a market source to an explicit ref (branch/tag). Returns the record. */
    setMarketSourceRef(repo: string, ref: string): Promise<MarketSourceRecord | undefined>;
    /** Record the commit a market source's pinned ref resolved to (update baseline). */
    setMarketSourceCommit(repo: string, commitSha: string): Promise<void>;
    /** The persisted usage-statistics checkpoint (undefined until first saved). */
    getSkillStatsState(): Promise<SkillStatsCheckpoint | undefined>;
    /** Persist a usage-statistics checkpoint (after every completed scan; cadence follows the scan TTL). */
    saveSkillStatsState(state: SkillStatsCheckpoint): Promise<void>;
    /** The persisted market-stats snapshot (undefined until first saved). */
    getMarketStatsState(): Promise<MarketStatsSnapshot | undefined>;
    /** Persist a market-stats snapshot (written when a refresh fetched anything new). */
    saveMarketStatsState(state: MarketStatsSnapshot): Promise<void>;
    private persist;
}
