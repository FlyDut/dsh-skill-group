/**
 * 策展层 · 可见性策略的纯语义：把一个**白名单策略**（分组键 + 技能名）展开成
 * "该主体可见 / 隐藏哪些技能"。模式策略与工作区策略共用这一份判定，会话上的
 * 实际效果是**工作区覆盖模式**，见 {@link overridePolicyEntries}。
 *
 * 本模块**零 IO、零副作用**：输入是策略、分组索引与目录全集，输出是名字集合。
 * 一切副作用（读写 sidecar、扫描目录、注入 provider）都在调用方。这样
 * `enforcement` 与 `routes` 两侧共用同一份判定，且判定本身可以被穷举测试。
 */

import { parseScopeEntry, type PolicyEntries } from '../protocol/scopes.ts'

/** 分组成员的当前快照：分组键 → 成员技能名。 */
export interface ScopeGroupIndex {
  /**
   * 分组键 → 该分组当前的成员。
   * 键**不存在**表示该分组已删除（或来源根已消失）——面板据此标注"悬空"。
   * 键存在但值为空数组表示分组还在、只是暂时没有成员，不算悬空。
   */
  members: ReadonlyMap<string, readonly string[]>
  /** 目录中当前真实存在的技能名（硬禁用者不在其中）。 */
  known: ReadonlySet<string>
}

/** 一个策略展开后的结果。 */
export interface ExpandedScope {
  /** 白名单展开出的可见技能名（已裁剪到目录中存在的，升序）。 */
  visible: string[]
  /** 可见集合（供 O(1) 判定）。 */
  visibleSet: Set<string>
  /** 每个条目键 → 它贡献的（已裁剪的）技能名；裸技能名以 `skill:<name>` 归键。 */
  resolved: Record<string, string[]>
  /** 指向已不存在分组的键（保持原样，不自动清理用户数据）。 */
  dangling: string[]
}

/**
 * 把白名单展开成技能名集合。**不解释 `enabled`**——那属于调用方的策略语义，
 * 见 {@link resolveScopeVisibility}。
 *
 * 展开按 `groups` 在前、`skills` 在后依次累加，保证同一输入下结果稳定；
 * 所有结果都裁剪到 `index.known`，因此指向已删除技能的分组不会凭空"复活"它。
 * @param policy - 待展开的策略。
 * @param index - 分组成员与目录快照。
 * @returns 可见集合、逐键明细与悬空键。
 */
export function expandScopePolicy(policy: PolicyEntries, index: ScopeGroupIndex): ExpandedScope {
  const visibleSet = new Set<string>()
  const resolved: Record<string, string[]> = {}
  const dangling: string[] = []

  for (const key of policy.groups) {
    const parsed = parseScopeEntry(key)
    if (parsed === undefined) {
      // 形状都不对的键：既不能算悬空分组，也不能贡献成员，只在明细里留一条空记录。
      resolved[key] = []
      dangling.push(key)
      continue
    }
    if (parsed.kind === 'skill') {
      // 允许把 `skill:<name>` 写在 groups 里：与裸名等价，方便面板统一处理。
      const hit = index.known.has(parsed.value) ? [parsed.value] : []
      resolved[key] = [...new Set([...(resolved[key] ?? []), ...hit])]
      for (const name of hit) visibleSet.add(name)
      continue
    }
    const members = index.members.get(key)
    if (members === undefined) {
      resolved[key] = []
      dangling.push(key)
      continue
    }
    const kept = [...new Set(members.filter((name) => index.known.has(name)))].sort((a, b) => a.localeCompare(b))
    resolved[key] = kept
    for (const name of kept) visibleSet.add(name)
  }

  for (const name of policy.skills) {
    if (!index.known.has(name)) continue
    const key = `skill:${name}`
    resolved[key] = [...new Set([...(resolved[key] ?? []), name])]
    visibleSet.add(name)
  }

  return {
    visible: [...visibleSet].sort((a, b) => a.localeCompare(b)),
    visibleSet,
    resolved,
    dangling: [...new Set(dangling)],
  }
}

/** 一个主体最终生效的可见性判定。 */
export interface ScopeVisibility {
  /** 该主体是否启用了隔离。 */
  enabled: boolean
  /** 该主体下模型与用户可见的技能名（升序）；未启用时即全集。 */
  visible: string[]
  /** 该主体下被屏蔽的技能名（升序）；未启用时为空。 */
  hidden: string[]
  /** 逐键展开明细（未启用时仍给出，供面板预览）。 */
  resolved: Record<string, string[]>
  /** 悬空的分组键。 */
  dangling: string[]
}

/**
 * 解析一个策略最终生效的可见性。这是 host、gate 与面板**唯一**的判定入口。
 *
 * `enabled === false`（默认）时不做任何限制：`visible` 为全集、`hidden` 为空
 * ——策略仍然被展开并返回，面板可以预览"如果打开会隐藏什么"。
 * @param policy - 待判定的策略（可以是合并后的策略）。
 * @param index - 分组成员与目录快照。
 * @param all - 目录中全部技能名（升序不必保证，本函数会排序）。
 * @returns 判定结果。
 */
export function resolveScopeVisibility(policy: PolicyEntries, index: ScopeGroupIndex, all: Iterable<string>): ScopeVisibility {
  const expanded = expandScopePolicy(policy, index)
  const sorted = [...all].sort((a, b) => a.localeCompare(b))
  if (!policy.enabled) {
    return { enabled: false, visible: sorted, hidden: [], resolved: expanded.resolved, dangling: expanded.dangling }
  }
  return {
    enabled: true,
    visible: sorted.filter((name) => expanded.visibleSet.has(name)),
    hidden: sorted.filter((name) => !expanded.visibleSet.has(name)),
    resolved: expanded.resolved,
    dangling: expanded.dangling,
  }
}

/**
 * 缓存键：策略内容 + 目录内容都变了才算失效。用于 host 侧避免每次 gate
 * 询问都重算展开（gate 由注册表的收集缓存间接节流，但仍可能被连打）。
 * @param policy - 待缓存的策略（可以是合并后的策略）。
 * @param all - 目录全集的当前快照。
 * @returns 稳定的字符串键。
 */
export function scopeCacheKey(policy: PolicyEntries, all: readonly string[]): string {
  return JSON.stringify({
    e: policy.enabled,
    g: [...policy.groups].sort(),
    s: [...policy.skills].sort(),
    a: [...all].sort(),
  })
}

/**
 * 取一个会话"谁说了算"的生效策略：**工作区覆盖模式**。
 *
 * 工作区一旦启用隔离，它的白名单就是该工作区目录下所有会话的全部约束，模式策略
 * 不再参与；工作区没启用（没有这条策略，或开关关着）时才回落到模式策略。
 * 两边都没启用时不约束任何技能（`enabled: false`），与
 * {@link resolveScopeVisibility} 对未启用的定义一致。
 *
 * 覆盖的是**整份策略**而不是逐键取舍：工作区没勾的键不会被模式补上——这正是
 * "工作区说了算"的含义，也让判定保持可穷举。
 * @param base - 落回用的策略（模式）。
 * @param override - 优先的策略（工作区）；只有 `enabled` 为真时才接管。
 * @returns 生效策略：`override` 启用时就是它，否则就是 `base`（可能未配置）。
 */
export function overridePolicyEntries(base: PolicyEntries | undefined, override: PolicyEntries | undefined): PolicyEntries {
  const winner = override?.enabled === true ? override : base
  if (winner === undefined) return { enabled: false, groups: [], skills: [] }
  return { enabled: winner.enabled === true, groups: [...winner.groups], skills: [...winner.skills] }
}
