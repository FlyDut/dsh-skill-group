/**
 * routes 共享层 · 集合装配：origin 映射 + 集合顺序 → 来源集合组，再补上插件
 * provider 提供的技能集合，以及 groups 路由的数据源。来源映射的排序语义从
 * helpers.ts 原样搬出，行为不变。
 */

import type { CollectionGroup, GroupsResponse } from '../protocol.ts'
import { isWritableSource, type SkillHubRouteDeps } from './deps.ts'

/**
 * 本地文件系统 provider 的名字：它发现的技能就是磁盘上的技能，成不成组由市场
 * 来源记录（origin）决定，不按 provider 再建一个组。
 */
const FILESYSTEM_PROVIDER = 'filesystem'

/** 目录里与分组相关的字段（SkillSummary 的最小投影）。 */
export interface GroupableSkill {
  name: string
  provider: string
  source: string
}

/** 装配结果：集合组 + skillName → 组名 的并集映射。 */
export interface BuiltCollections {
  collections: CollectionGroup[]
  /** 市场 origin 优先；没有来源记录、又来自插件 provider 的技能归入 provider 组。 */
  memberships: Record<string, string>
}

/**
 * 由 origin 映射（skillName → 仓库）+ 集合顺序构建来源集合组。
 */
export function marketCollections(origins: Readonly<Record<string, string>>, collectionOrder: readonly string[]): CollectionGroup[] {
  const byCollection = new Map<string, string[]>()
  for (const [skillName, origin] of Object.entries(origins)) {
    const list = byCollection.get(origin)
    if (list === undefined) byCollection.set(origin, [skillName])
    else list.push(skillName)
  }
  const orderIndex = new Map(collectionOrder.map((name, i) => [name, i] as const))
  return [...byCollection.entries()]
    .map(([name, skillNames]) => ({ name, skillNames: [...skillNames].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => {
      const ai = orderIndex.has(a.name) ? orderIndex.get(a.name)! : Infinity
      const bi = orderIndex.has(b.name) ? orderIndex.get(b.name)! : Infinity
      if (ai !== bi) return ai - bi
      return a.name.localeCompare(b.name)
    })
}

/**
 * 插件技能集合：来源不是用户级可写根、又没有市场来源记录的技能，按 provider
 * 聚合成一个组（组名即 provider 名，如 "reverse-skill"）。
 *
 * Why: 市场导入的技能靠 sidecar 的 origin 映射成组，而插件自带的技能集合
 * （例如 dsh-reverse-skill 的 bundled 技能）没有任何来源记录，原先只能落进
 * 「个人」卡——面板上看起来就是「插件提供的技能不会分组」。这些组没有上游，
 * 只参与分组与开关（见 CollectionGroup.kind）。
 */
export function providerCollections(origins: Readonly<Record<string, string>>, skills: readonly GroupableSkill[]): Array<{ name: string; skillNames: string[] }> {
  const byProvider = new Map<string, string[]>()
  for (const skill of skills) {
    if (origins[skill.name] !== undefined) continue
    if (isWritableSource(skill.source)) continue
    const provider = skill.provider.trim()
    if (provider === '' || provider === FILESYSTEM_PROVIDER) continue
    const list = byProvider.get(provider)
    if (list === undefined) byProvider.set(provider, [skill.name])
    else list.push(skill.name)
  }
  return [...byProvider.entries()]
    .map(([name, skillNames]) => ({ name, skillNames: [...skillNames].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 全部集合组：来源集合组在前（沿用 sidecar 的历史顺序），插件组按名字排在
 * 后面；同名的插件组让位给来源组，避免两个组共用同一个 'col:xxx' 键。
 */
export function buildCollections(
  origins: Readonly<Record<string, string>>,
  collectionOrder: readonly string[],
  skills: readonly GroupableSkill[] = [],
): BuiltCollections {
  const market = marketCollections(origins, collectionOrder)
  const taken = new Set(market.map((collection) => collection.name))
  const plugins = providerCollections(origins, skills).filter((collection) => !taken.has(collection.name))
  const memberships: Record<string, string> = { ...origins }
  for (const collection of plugins) {
    for (const name of collection.skillNames) memberships[name] = collection.name
  }
  return {
    collections: [...market, ...plugins.map((collection) => ({ ...collection, kind: 'provider' as const }))],
    memberships,
  }
}

/** 系统集合组 + 用户 tag + 成员映射（groups 路由的数据源）。 */
export async function buildGroups(deps: SkillHubRouteDeps): Promise<GroupsResponse> {
  const [tags, origins, collectionOrder, sourceGroupOrder, snapshot] = await Promise.all([
    deps.store.listTags(),
    deps.store.listOrigins(),
    deps.store.getCollectionOrder(),
    deps.store.getSourceGroupOrder(),
    deps.skills.snapshot(),
  ])
  const { collections, memberships } = buildCollections(origins, collectionOrder, snapshot.skills)
  return { ok: true, tags, collections, origins: memberships, ...(sourceGroupOrder.length > 0 ? { sourceGroupOrder } : {}), ...(collectionOrder.length > 0 ? { collectionOrder } : {}) }
}
