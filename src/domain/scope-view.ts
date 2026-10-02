/**
 * 策展层 · 可见性判定的宿主视图：把 sidecar 里的策略、侧栏的分组成员、以及
 * 注册表的目录快照拼成"某个主体此刻可见/隐藏哪些技能"。主体可以是模式，也可以
 * 是工作区，更可以是两者合并后的策略——判定只看策略的内容，不看它挂在谁身上。
 *
 * 它是 `enforcement` 与 `routes` 共用的**唯一数据入口**：gate 从这里取遮蔽
 * 名单，面板从这里取预览。所有 IO 都通过注入的函数发生（`catalog` / `groups`
 * / `policyOf`），因此本模块可以在测试里用内存替身完整驱动。
 *
 * 缓存分两级：目录与分组按 `invalidate()` 全清（目录变更、分组变更、策略变更
 * 都调它），每份策略的判定按"策略内容 + 目录内容"的键缓存——所以一次目录
 * 变更不会让未受影响的策略重算，模式与工作区合并出来的新策略也能直接命中。
 */

import type { PolicyEntries, ScopePolicy } from '../protocol/scopes.ts'
import { resolveScopeVisibility, scopeCacheKey, type ScopeVisibility } from './scope-policy.ts'

/** gate 构造遮蔽候选所需的元数据。 */
export interface ScopeSkillMeta {
  /** 原技能的描述（遮蔽候选沿用真实描述，任何消费者看到的都不是假数据）。 */
  description: string
  /** 原技能的 whenToUse（有则沿用）。 */
  whenToUse?: string
  /** 原技能的 source 桶（面板与 UI 徽标据此显示来源）。 */
  source: string
  /** 原技能的 provider（插件技能集合按键聚合时用它）。 */
  provider: string
}

/** 目录快照：当前真实可用的技能及其元数据（含被运行时关闭的技能）。 */
export interface ScopeCatalogSnapshot {
  /** 技能名，升序。 */
  names: string[]
  /** 技能名 → 元数据。 */
  meta: Map<string, ScopeSkillMeta>
}

/** 宿主注入的依赖：全部 IO 都在这里。 */
interface ScopeViewDeps {
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
  /**
   * 全局关闭名单（sidecar 里的运行时开关，只有技能名）。
   * 它对**每个**模式都生效，与模式自己的隔离策略叠加。
   */
  closed: () => Promise<ReadonlySet<string>>
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
 * 叠加上"全局运行时关闭"：关闭的技能对**所有**模式都不可见，与模式自己的
 * 白名单隔离正交。关闭名单里的名字必须真实存在于目录快照里，否则跳过——
 * 一条指向已消失技能的记录不该凭空制造遮蔽候选。
 */
function withClosed(visibility: ScopeVisibility, closed: ReadonlySet<string>, known: ReadonlySet<string>): ScopeVisibility {
  if (closed.size === 0) return visibility
  const hiddenSet = new Set(visibility.hidden)
  for (const name of closed) if (known.has(name)) hiddenSet.add(name)
  const hidden = [...hiddenSet].sort((a, b) => a.localeCompare(b))
  const visible = visibility.visible.filter((name) => !hiddenSet.has(name))
  return { ...visibility, enabled: visibility.enabled || hidden.length > 0, visible, hidden }
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
  /** 判定缓存，键为策略内容 + 目录内容 + 关闭名单的摘要（与主体身份无关）。 */
  private readonly visibility = new Map<string, ScopeVisibility>()


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
   * 一个模式自己那份策略的可见性判定（面板列表用；不含工作区维度）。
   * @param presetId - preset id；未配置时按"不隔离"返回，仍带展开预览。
   * @returns 判定结果（可见名单、隐藏名单、逐键明细、悬空键）。
   */
  async visibilityOf(presetId: string): Promise<ScopeVisibility> {
    return this.visibilityFor((await this.deps.policyOf(presetId)) ?? unrestricted(presetId))
  }

  /**
   * 任意一份策略的可见性判定（覆盖后的生效策略也走这里）。这是唯一的计算入口：
   * 判定与主体身份无关，只与策略内容、分组成员、目录与全局关闭名单有关。
   * @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
   * @returns 判定结果。
   */
  async visibilityFor(policy: PolicyEntries): Promise<ScopeVisibility> {
    const snapshot = await this.snapshot()
    const closed = await this.deps.closed()
    const key = scopeCacheKey(policy, snapshot.names) + '\u0002' + [...closed].sort().join('\u0000')
    const cached = this.visibility.get(key)
    if (cached !== undefined) return cached

    const members = await this.groupIndex(snapshot)
    const resolved = resolveScopeVisibility(policy, { members, known: new Set(snapshot.names) }, snapshot.names)
    const value = withClosed(resolved, closed, new Set(snapshot.names))
    // 键里含策略与目录内容，因此条目数受"不同内容组合"限制；仍给一个上限
    // 兜底，避免长时间运行下被大量一次性策略撑大。
    if (this.visibility.size >= 128) this.visibility.clear()
    this.visibility.set(key, value)
    return value
  }

  /**
   * 一份策略需要被 gate 遮蔽的技能及其元数据（隔离 ∪ 全局运行时关闭）。
   * 没有任何需要遮蔽的技能时返回空表——gate 因此完全不干预该作用域。
   * @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
   * @returns 技能名 → 元数据；空表表示不需要遮蔽。
   */
  async hiddenFor(policy: PolicyEntries): Promise<Map<string, ScopeSkillMeta>> {
    const result = new Map<string, ScopeSkillMeta>()
    const visibility = await this.visibilityFor(policy)
    if (visibility.hidden.length === 0) return result
    const snapshot = await this.snapshot()
    for (const name of visibility.hidden) {
      const meta = snapshot.meta.get(name)
      // 元数据缺失（目录与判定之间发生了删除）时不做无据遮蔽。
      if (meta !== undefined) result.set(name, meta)
    }
    return result
  }

  /**
   * 一个模式自己那份策略需要被遮蔽的技能（不含工作区维度）。合并语义由
   * 装配层（scope-assembly）负责，它拿到两侧策略后走 {@link hiddenFor}。
   * @param presetId - preset id。
   * @returns 技能名 → 元数据。
   */
  async hiddenOf(presetId: string): Promise<Map<string, ScopeSkillMeta>> {
    return this.hiddenFor((await this.deps.policyOf(presetId)) ?? unrestricted(presetId))
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
