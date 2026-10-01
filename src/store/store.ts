import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, ScopePolicy, SkillStatsCheckpoint, SkillTag, SourceRecord, TrashEntry } from '../protocol.ts'
import * as marketOps from './domains/market.ts'
import * as scopeOps from './domains/scopes.ts'
import * as sourceOps from './domains/sources.ts'
import * as tagOps from './domains/tags.ts'
import { hydrateMigratedState, migrateStore } from './migrate.ts'
import { DEFAULT_SCENE_NAME, STORE_VERSION, statePath, type StoreFile } from './paths.ts'

/** Sidecar state owner. */
export class SkillHubStore {
  private entries = new Map<string, DisabledSkill>()
  private config: Partial<HubConfig> = {}
  private tagsById = new Map<string, SkillTag>()
  private sourcesByRepo = new Map<string, SourceRecord>()
  private marketSources: MarketSourceRecord[] = []
  private trashByName = new Map<string, TrashEntry>()
  private skillStats: SkillStatsCheckpoint | undefined = undefined
  private marketStats: MarketStatsSnapshot | undefined = undefined
  private collectionOrder: string[] = []
  private sourceGroupOrder: string[] = []
  /** v5: 模式（preset）→ 技能可见性策略；缺席的 preset 不做隔离。 */
  private scopesByPreset = new Map<string, ScopePolicy>()
  private loaded = false
  /** Serializes persist runs: concurrent mutators must not let an earlier
   *  snapshot overwrite a later one (rename is atomic, ordering is not). */
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly file: string = statePath()) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      const migrated = migrateStore(parsed)
      if (migrated === null) {
        console.warn('[skill-hub] sidecar state uses a newer schema than this plugin supports; starting empty')
      } else {
        const state = hydrateMigratedState(migrated)
        this.entries = state.entries
        this.config = state.config
        this.tagsById = state.tagsById
        this.sourcesByRepo = state.sourcesByRepo
        this.marketSources = state.marketSources
        this.trashByName = state.trashByName
        this.skillStats = state.skillStats
        this.marketStats = state.marketStats
        this.collectionOrder = state.collectionOrder
        this.sourceGroupOrder = state.sourceGroupOrder
        this.scopesByPreset = new Map(state.scopes.map((policy) => [policy.presetId, policy] as const))
      }
    } catch (error) {
      // Missing or unreadable state starts empty; never crash the plugin.
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn('[skill-hub] sidecar state unreadable, starting empty:', error instanceof Error ? error.message : error)
      }
    }
    await this.ensureDefaultTag()
  }

  /**
   * 保证存在默认场景：没有任何 default 标记的 tag 时创建「通用」。
   * 新技能创建后自动归入它；用户可改名，但默认场景不可删除。
   */
  private async ensureDefaultTag(): Promise<void> {
    if ([...this.tagsById.values()].some((tag) => tag.default === true)) return
    const tag: SkillTag = { id: crypto.randomUUID(), name: DEFAULT_SCENE_NAME, skillNames: [], default: true }
    this.tagsById.set(tag.id, tag)
    await this.persist()
  }

  async listDisabled(): Promise<DisabledSkill[]> {
    await this.ensureLoaded()
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async getDisabled(name: string): Promise<DisabledSkill | undefined> {
    await this.ensureLoaded()
    return this.entries.get(name)
  }

  async addDisabled(entry: DisabledSkill): Promise<void> {
    await this.ensureLoaded()
    this.entries.set(entry.name, entry)
    await this.persist()
  }

  async removeDisabled(name: string): Promise<void> {
    await this.ensureLoaded()
    if (!this.entries.delete(name)) return
    await this.persist()
  }

  /** The hub's saved runtime configuration (fields absent here mean "not overridden"). */
  async getConfig(): Promise<Partial<HubConfig>> {
    await this.ensureLoaded()
    return { ...this.config }
  }

  /**
   * Persist a runtime-config patch, merged over the saved values. A field
   * whose patch value is undefined is removed from the saved layer, so the
   * setting re-inherits its default (the web card's "reset" path).
   */
  async setConfig(config: Partial<HubConfig>): Promise<void> {
    await this.ensureLoaded()
    const next: Partial<HubConfig> = { ...this.config }
    for (const [key, value] of Object.entries(config) as Array<[keyof HubConfig, boolean | string | undefined]>) {
      if (value === undefined) delete next[key]
      else (next as unknown as Record<string, unknown>)[key] = value
    }
    this.config = next
    await this.persist()
  }

  /** All user-defined tag groups, in creation order. */
  async listTags(): Promise<SkillTag[]> {
    await this.ensureLoaded()
    return [...this.tagsById.values()]
  }

  /** One tag by id (undefined when absent). */
  async getTag(id: string): Promise<SkillTag | undefined> {
    await this.ensureLoaded()
    return this.tagsById.get(id)
  }

  /**
   * Create (no id) or rename (with id) a tag. Returns the saved tag.
   * Creating assigns a fresh UUID; renaming keeps members.
   */
  async saveTag(input: { id?: string; name: string }): Promise<SkillTag> {
    await this.ensureLoaded()
    const tag = tagOps.saveTag(this.tagsById, input)
    await this.persist()
    return tag
  }

  /** Delete a tag by id (no-op when absent). The default scene cannot be deleted. */
  async deleteTag(id: string): Promise<void> {
    await this.ensureLoaded()
    if (!tagOps.deleteTag(this.tagsById, id)) return
    await this.persist()
  }

  /** The default scene (「通用」), guaranteed to exist after ensureLoaded. */
  async getDefaultTag(): Promise<SkillTag | undefined> {
    await this.ensureLoaded()
    return tagOps.findDefaultTag(this.tagsById)
  }

  /** Append one skill name to a tag (deduplicated; no-op when already a member). */
  async addSkillToTag(id: string, name: string): Promise<SkillTag | undefined> {
    await this.ensureLoaded()
    const { tag, changed } = tagOps.addSkillToTag(this.tagsById, id, name)
    if (changed) await this.persist()
    return tag
  }

  /**
   * Replace a tag's member list wholesale (idempotent). Deduplicates and
   * drops blank names; unknown skill names are kept (they may arrive later),
   * the routes layer filters against the live catalog before persisting.
   */
  async setTagMembers(id: string, skillNames: readonly string[]): Promise<SkillTag | undefined> {
    await this.ensureLoaded()
    const { tag, changed } = tagOps.setTagMembers(this.tagsById, id, skillNames)
    if (changed) await this.persist()
    return tag
  }

  /** Remove one skill from every tag group (used when the skill is deleted). */
  async removeSkillFromTags(name: string): Promise<void> {
    await this.ensureLoaded()
    if (tagOps.removeSkillFromTags(this.tagsById, name)) await this.persist()
  }

  /** Reorder tag groups by orderedIds (编辑态的 ↑↓ 按钮). */
  async reorderTags(orderedIds: string[]): Promise<SkillTag[]> {
    await this.ensureLoaded()
    this.tagsById = tagOps.reorderTags(this.tagsById, orderedIds)
    await this.persist()
    return [...this.tagsById.values()]
  }

  /**
   * 来源集合（collection）的排序键。
   *
   * 遗留字段：当前 UI 的拖拽顺序统一走 `sourceGroupOrder`（顶层键含
   * `col:<name>`），因此这里**没有写入端**——方法保留只为读取旧数据文件里
   * 已有的顺序（`buildCollections` 用它排 collection 分组）。
   */
  async getCollectionOrder(): Promise<string[]> {
    await this.ensureLoaded()
    return [...this.collectionOrder]
  }

  /** Source top-level group order for 来源分组（project / col:xxx / personal） */
  async getSourceGroupOrder(): Promise<string[]> {
    await this.ensureLoaded()
    return [...this.sourceGroupOrder]
  }

  /** Reorder source top-level groups by orderedKeys */
  async reorderSourceGroups(orderedKeys: string[]): Promise<string[]> {
    await this.ensureLoaded()
    const uniq = [...new Set(orderedKeys.filter((k): k is string => typeof k === 'string' && k !== ''))]
    this.sourceGroupOrder = uniq
    await this.persist()
    return [...this.sourceGroupOrder]
  }

  // ------------------------------------------------------------- scopes

  /** 全部模式策略，按 presetId 排序。 */
  async listScopes(): Promise<ScopePolicy[]> {
    await this.ensureLoaded()
    return [...this.scopesByPreset.values()].sort((a, b) => a.presetId.localeCompare(b.presetId))
  }

  /** 一个模式的策略；没有保存过时返回 undefined（= 不隔离）。 */
  async getScope(presetId: string): Promise<ScopePolicy | undefined> {
    await this.ensureLoaded()
    const found = this.scopesByPreset.get(presetId)
    return found === undefined ? undefined : scopeOps.copyScope(found)
  }

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
  async saveScope(presetId: string, patch: { enabled?: boolean; groups?: string[]; skills?: string[] }): Promise<ScopePolicy> {
    await this.ensureLoaded()
    const next = scopeOps.saveScope(this.scopesByPreset, presetId, patch)
    await this.persist()
    return scopeOps.copyScope(next)
  }

  /**
   * 删除一个模式的策略（回到"不限制"）。
   * @param presetId - 目标 preset。
   * @returns 是否确实删掉了一条。
   */
  async deleteScope(presetId: string): Promise<boolean> {
    await this.ensureLoaded()
    if (!this.scopesByPreset.delete(presetId)) return false
    await this.persist()
    return true
  }

  // ------------------------------------------------------------ sources

  /** All source records, sorted by repo. */
  async listSources(): Promise<SourceRecord[]> {
    await this.ensureLoaded()
    return [...this.sourcesByRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo))
  }

  /** One source record by repo (undefined when absent). */
  async getSource(repo: string): Promise<SourceRecord | undefined> {
    await this.ensureLoaded()
    return this.sourcesByRepo.get(repo)
  }

  /** The source record that tracks a skill name (undefined when untracked). */
  async getSourceForSkill(name: string): Promise<SourceRecord | undefined> {
    await this.ensureLoaded()
    return sourceOps.findSourceForSkill(this.sourcesByRepo, name)
  }

  /** Remove a source record entirely (no-op when absent). */
  async deleteSource(repo: string): Promise<void> {
    await this.ensureLoaded()
    if (!this.sourcesByRepo.delete(repo)) return
    await this.persist()
  }

  /**
   * Upsert one skill into a source record. When the repo has no record yet a
   * new one is created (root + commit snapshot from the caller).
   */
  async addSourceSkill(repo: string, root: string, commitSha: string, ref: string | undefined, skillName: string): Promise<void> {
    await this.ensureLoaded()
    sourceOps.addSourceSkill(this.sourcesByRepo, repo, root, commitSha, ref, skillName)
    await this.persist()
  }

  /** Replace a source's skill list (used after sync/confirm-delete). */
  async setSourceSkills(repo: string, skills: readonly string[]): Promise<SourceRecord | undefined> {
    await this.ensureLoaded()
    const existed = this.sourcesByRepo.has(repo)
    const next = sourceOps.setSourceSkills(this.sourcesByRepo, repo, skills)
    if (existed) await this.persist()
    return next
  }

  /** Remove one skill from every source record (used when the skill is deleted). */
  async removeSkillFromSources(name: string): Promise<void> {
    await this.ensureLoaded()
    if (sourceOps.removeSkillFromSources(this.sourcesByRepo, name)) await this.persist()
  }

  /** Update a source's commit snapshot. */
  async setSourceCommit(repo: string, commitSha: string): Promise<void> {
    await this.ensureLoaded()
    if (sourceOps.setSourceCommit(this.sourcesByRepo, repo, commitSha)) await this.persist()
  }

  /** Update a source's pinned ref (release tag / branch) when the market syncs. */
  async setSourceRef(repo: string, ref: string): Promise<void> {
    await this.ensureLoaded()
    if (sourceOps.setSourceRef(this.sourcesByRepo, repo, ref)) await this.persist()
  }

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
  async mergeSourceManifest(repo: string, manifest: Record<string, number>, dir?: string): Promise<void> {
    await this.ensureLoaded()
    if (sourceOps.mergeSourceManifest(this.sourcesByRepo, repo, manifest, dir)) await this.persist()
  }

  /** skillName → collection name for every recorded origin (derived from sources). */
  async listOrigins(): Promise<Record<string, string>> {
    await this.ensureLoaded()
    return sourceOps.listOrigins(this.sourcesByRepo)
  }

  // ------------------------------------------------------ market sources

  /** The user's market sources, in addition order. */
  async listMarketSources(): Promise<MarketSourceRecord[]> {
    await this.ensureLoaded()
    return [...this.marketSources]
  }

  /** One market source by repo (undefined when absent). */
  async getMarketSource(repo: string): Promise<MarketSourceRecord | undefined> {
    await this.ensureLoaded()
    return marketOps.findMarketSource(this.marketSources, repo)
  }

  /** Add a repo (deduplicated), optionally with a pinned ref. Returns the fresh list. */
  async addMarketSource(repo: string, ref?: string): Promise<MarketSourceRecord[]> {
    await this.ensureLoaded()
    marketOps.addMarketSource(this.marketSources, repo, ref)
    await this.persist()
    return [...this.marketSources]
  }

  /** Remove a repo (no-op when absent). Returns the fresh list. */
  async removeMarketSource(repo: string): Promise<MarketSourceRecord[]> {
    await this.ensureLoaded()
    if (marketOps.removeMarketSource(this.marketSources, repo)) await this.persist()
    return [...this.marketSources]
  }

  /** Pin a market source to an explicit ref (branch/tag). Returns the record. */
  async setMarketSourceRef(repo: string, ref: string): Promise<MarketSourceRecord | undefined> {
    await this.ensureLoaded()
    const { entry, changed } = marketOps.setMarketSourceRef(this.marketSources, repo, ref)
    if (changed) await this.persist()
    return entry
  }

  /** Record the commit a market source's pinned ref resolved to (update baseline). */
  async setMarketSourceCommit(repo: string, commitSha: string): Promise<void> {
    await this.ensureLoaded()
    if (marketOps.setMarketSourceCommit(this.marketSources, repo, commitSha)) await this.persist()
  }

  // ---------------------------------------------------------------- trash

  /** All trashed skills, newest first. */
  async listTrash(): Promise<TrashEntry[]> {
    await this.ensureLoaded()
    return [...this.trashByName.values()].sort((a, b) => b.movedAt - a.movedAt)
  }

  /** One trash entry by skill name (undefined when absent). */
  async getTrash(name: string): Promise<TrashEntry | undefined> {
    await this.ensureLoaded()
    return this.trashByName.get(name)
  }

  /** Record a trashed skill. */
  async addTrash(entry: TrashEntry): Promise<void> {
    await this.ensureLoaded()
    this.trashByName.set(entry.name, entry)
    await this.persist()
  }

  /** Remove a trash record (after restore). */
  async removeTrash(name: string): Promise<void> {
    await this.ensureLoaded()
    if (!this.trashByName.delete(name)) return
    await this.persist()
  }

  /** The persisted usage-statistics checkpoint (undefined until first saved). */
  async getSkillStatsState(): Promise<SkillStatsCheckpoint | undefined> {
    await this.ensureLoaded()
    return this.skillStats !== undefined
      ? {
          ...this.skillStats,
          frozenSessions: { ...this.skillStats.frozenSessions },
          ...(this.skillStats.lastTotals !== undefined ? { lastTotals: [...this.skillStats.lastTotals] } : {}),
          ...(this.skillStats.coldRevisions !== undefined ? { coldRevisions: { ...this.skillStats.coldRevisions } } : {}),
        }
      : undefined
  }

  /** Persist a usage-statistics checkpoint (after every completed scan; cadence follows the scan TTL). */
  async saveSkillStatsState(state: SkillStatsCheckpoint): Promise<void> {
    await this.ensureLoaded()
    this.skillStats = {
      windowDays: state.windowDays,
      frozenBefore: state.frozenBefore,
      frozenSessions: { ...state.frozenSessions },
      lastFullReconcile: state.lastFullReconcile,
      ...(state.lastTotals !== undefined ? { lastTotals: [...state.lastTotals] } : {}),
      ...(state.coldRevisions !== undefined ? { coldRevisions: { ...state.coldRevisions } } : {}),
    }
    await this.persist()
  }

  /** The persisted market-stats snapshot (undefined until first saved). */
  async getMarketStatsState(): Promise<MarketStatsSnapshot | undefined> {
    await this.ensureLoaded()
    return this.marketStats !== undefined
      ? { fetchedAt: this.marketStats.fetchedAt, stats: { ...this.marketStats.stats } }
      : undefined
  }

  /** Persist a market-stats snapshot (written when a refresh fetched anything new). */
  async saveMarketStatsState(state: MarketStatsSnapshot): Promise<void> {
    await this.ensureLoaded()
    this.marketStats = { fetchedAt: state.fetchedAt, stats: { ...state.stats } }
    await this.persist()
  }

  private persist(): Promise<void> {
    // The payload is built inside the queued step (not here), so every
    // concurrent mutation made before a write actually lands is included in
    // the final file instead of being rolled back by an older snapshot.
    const run = this.writeChain.then(async () => {
      const payload: StoreFile = {
        version: STORE_VERSION,
        disabled: [...this.entries.values()],
        config: this.config,
        ...(this.tagsById.size > 0 ? { tags: [...this.tagsById.values()] } : {}),
        ...(this.sourcesByRepo.size > 0 ? { sources: [...this.sourcesByRepo.values()] } : {}),
        ...(this.marketSources.length > 0 ? { marketSources: [...this.marketSources] } : {}),
        ...(this.trashByName.size > 0 ? { trash: [...this.trashByName.values()] } : {}),
        ...(this.skillStats !== undefined ? { skillStats: this.skillStats } : {}),
        ...(this.marketStats !== undefined ? { marketStats: this.marketStats } : {}),
        ...(this.collectionOrder.length > 0 ? { collectionOrder: [...this.collectionOrder] } : {}),
        ...(this.sourceGroupOrder.length > 0 ? { sourceGroupOrder: [...this.sourceGroupOrder] } : {}),
        ...(this.scopesByPreset.size > 0 ? { scopes: [...this.scopesByPreset.values()] } : {}),
      }
      const tmp = this.file + '.tmp'
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8')
      await rename(tmp, this.file)
    })
    // Keep the chain alive on failure; callers still observe the rejection.
    this.writeChain = run.catch(() => {})
    return run
  }
}
