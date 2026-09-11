/**
 * 策展层 · 模式可见性的宿主视图：把 sidecar 里的策略、侧栏的分组成员、以及
 * 注册表的目录快照拼成"某个模式此刻可见/隐藏哪些技能"。
 *
 * 它是 `enforcement` 与 `routes` 共用的**唯一数据入口**：gate 从这里取遮蔽
 * 名单，面板从这里取预览。所有 IO 都通过注入的函数发生（`catalog` / `groups`
 * / `policyOf`），因此本模块可以在测试里用内存替身完整驱动。
 *
 * 缓存分两级：目录与分组按 `invalidate()` 全清（目录变更、分组变更、策略变更
 * 都调它），每个模式的判定按"策略内容 + 目录内容"的键缓存——所以一次目录
 * 变更不会让未受影响的模式重算。
 */

import type { ScopePolicy } from '../protocol/scopes.ts'
import { resolveScopeVisibility, scopeCacheKey, type ScopeVisibility } from './scope-policy.ts'

/** gate 构造遮蔽候选所需的元数据。 */
export interface ScopeSkillMeta {
  /** 原技能的描述（遮蔽候选沿用真实描述，任何消费者看到的都不是假数据）。 */
  description: string
  /** 原技能的 whenToUse（有则沿用）。 */
  whenToUse?: string
  /** 原技能的 source 桶（面板与 UI 徽标据此显示来源）。 */
  source: string
}

/** 目录快照：当前真实可用的技能及其元数据（已排除全局硬禁用）。 */
export interface ScopeCatalogSnapshot {
  /** 技能名，升序。 */
  names: string[]
  /** 技能名 → 元数据。 */
  meta: Map<string, ScopeSkillMeta>
}

/** 宿主注入的依赖：全部 IO 都在这里。 */
export interface ScopeViewDeps {
  /** 读取目录快照。 */
  catalog: () => Promise<ScopeCatalogSnapshot>
  /**
   * 读取分组成员表：分组键 → 成员技能名。
   * 应包含**所有现存**的分组（含空分组）；缺席的键被判定为悬空。
   * 需要整份快照而不是只有名字，因为 `src:` 类的分组要按技能的 source 归并。
   */
  groups: (snapshot: ScopeCatalogSnapshot) => Promise<Map<string, readonly string[]>>
  /** 某模式的策略；undefined 表示从未配置（= 不隔离）。 */
  policyOf: (presetId: string) => Promise<ScopePolicy | undefined>
}

/** 目录快照的稳定摘要：名字与各自来源任一变化，分组都必须重新展开。 */
function snapshotKey(snapshot: ScopeCatalogSnapshot): string {
  return snapshot.names.map((name) => name + '\u0001' + (snapshot.meta.get(name)?.source ?? '')).join('\u0000')
}

/** 未配置的模式按"不隔离"参与判定。 */
function unrestricted(presetId: string): ScopePolicy {
  return { presetId, enabled: false, groups: [], skills: [] }
}

/**
 * 模式可见性视图。生命周期与 hub 的宿主半边一致：`invalidate()` 由目录变更、
 * 分组变更、策略变更与设置同步触发。
 */
export class ScopeView {
  /**
   * 目录快照 + 它的读取时刻。**必须带 TTL**：技能文件也可能在 hub 之外被
   * 增删（手工放进 `~/.dsh/skills`、别的工具写入），那条路径不会经过
   * `invalidate()`；没有 TTL 的话，新出现的技能既不进可见集也不进隐藏集，
   * 于是在"该隔离它的模式"里漏网。判定本身另有内容键缓存，所以 TTL 到期只
   * 重读一次目录，不会重算没变化的模式。
   */
  private catalog?: { at: number; value: Promise<ScopeCatalogSnapshot> }
  /** 分组成员表的 promise，附它对应的快照摘要。 */
  private groups?: { key: string; value: Promise<Map<string, readonly string[]>> }
  /** 每个模式的判定缓存，键为策略+目录的内容摘要。 */
  private readonly visibility = new Map<string, { key: string; value: ScopeVisibility }>()


  /**
   * @param deps - 宿主注入的 IO。
   * @param catalogTtlMs - 目录快照的最长存活时间；默认与面板轮询同周期。
   */
  constructor(private readonly deps: ScopeViewDeps, private readonly catalogTtlMs = 5000) {}

  /** 丢弃全部缓存。目录、分组或策略任一变化后调用。 */
  invalidate(): void {
    this.catalog = undefined
    this.groups = undefined
    this.visibility.clear()
  }

  /** 当前目录快照（invalidate 或 TTL 到期后重读）。 */
  snapshot(): Promise<ScopeCatalogSnapshot> {
    const now = Date.now()
    if (this.catalog === undefined || now - this.catalog.at >= this.catalogTtlMs) {
      this.catalog = { at: now, value: this.deps.catalog() }
    }
    return this.catalog.value
  }

  /**
   * 一个模式此刻的可见性判定。
   * @param presetId - preset id；未配置时按"不隔离"返回，仍带展开预览。
   * @returns 判定结果（可见名单、隐藏名单、逐键明细、悬空键）。
   */
  async visibilityOf(presetId: string): Promise<ScopeVisibility> {
    const snapshot = await this.snapshot()
    const policy = (await this.deps.policyOf(presetId)) ?? unrestricted(presetId)
    const key = scopeCacheKey(policy, snapshot.names)
    const cached = this.visibility.get(presetId)
    if (cached !== undefined && cached.key === key) return cached.value

    const members = await this.groupIndex(snapshot)
    const value = resolveScopeVisibility(policy, { members, known: new Set(snapshot.names) }, snapshot.names)
    this.visibility.set(presetId, { key, value })
    return value
  }

  /**
   * 一个模式需要被 gate 遮蔽的技能及其元数据。
   * 未启用隔离时返回空表——gate 因此完全不干预该模式。
   * @param presetId - preset id。
   * @returns 技能名 → 元数据；空表表示该模式不需要遮蔽。
   */
  async hiddenOf(presetId: string): Promise<Map<string, ScopeSkillMeta>> {
    const result = new Map<string, ScopeSkillMeta>()
    const visibility = await this.visibilityOf(presetId)
    if (!visibility.enabled || visibility.hidden.length === 0) return result
    const snapshot = await this.snapshot()
    for (const name of visibility.hidden) {
      const meta = snapshot.meta.get(name)
      // 元数据缺失（目录与判定之间发生了删除）时不做无据遮蔽。
      if (meta !== undefined) result.set(name, meta)
    }
    return result
  }

  /** 按目录快照摘要复用分组成员表。 */
  private groupIndex(snapshot: ScopeCatalogSnapshot): Promise<Map<string, readonly string[]>> {
    const key = snapshotKey(snapshot)
    if (this.groups !== undefined && this.groups.key === key) return this.groups.value
    const value = this.deps.groups(snapshot)
    this.groups = { key, value }
    return value
  }
}
