/**
 * Pure grouping helpers for the skill-hub panel (no React/DOM deps, so the
 * merge/classify/filter logic stays unit-testable).
 *
 * The "分组" view unifies two ways a skill can belong to a group:
 *  - user tags (sidecar SkillTag)
 *  - origin collections (sidecar sources → backend-aggregated CollectionGroup)
 *
 * Switch semantics: a skill's enabled state is global (one runtime switch in
 * the sidecar), so a group switch is derived from its members' actual states:
 * all members enabled → 'on', all disabled → 'off', otherwise 'mixed'.
 * Closing a group whose member is enabled in another group is a conflict the
 * GUI resolves with a dialog; the helpers below compute both sides.
 */

import type { CatalogResponse, CatalogSkill, CollectionGroup, SkillTag } from '../protocol.ts'

/**
 * Rows of a catalog that are currently switched off at runtime. The catalog
 * carries every known skill exactly once, so "disabled" is a filter over
 * `catalog.skills` (by `enabled`) rather than a second list.
 */
export function disabledSkills(catalog: CatalogResponse | null): CatalogSkill[] {
  return (catalog?.skills ?? []).filter((skill) => !skill.enabled)
}

/** Grouped switch state derived from member enablement. */
export type GroupSwitchState = 'on' | 'off' | 'mixed'

/** The derived switch view of one group. */
export interface GroupSwitchView {
  state: GroupSwitchState
  /** Members currently switched on. */
  enabled: string[]
  /** Members currently switched off. */
  disabled: string[]
}

/**
 * Derive a group switch view from its member names and the set of currently
 * enabled skill names (catalog.skills). Members outside that set count as
 * switched off.
 */
export function groupSwitchView(members: readonly string[], enabledNames: ReadonlySet<string>): GroupSwitchView {
  const enabled: string[] = []
  const disabled: string[] = []
  for (const name of members) {
    if (enabledNames.has(name)) enabled.push(name)
    else disabled.push(name)
  }
  const state: GroupSwitchState = disabled.length === 0 ? 'on' : enabled.length === 0 ? 'off' : 'mixed'
  return { state, enabled, disabled }
}

/** Names of every group a skill belongs to (tags + collections). */
export function groupNamesOf(name: string, tags: readonly SkillTag[], collections: readonly CollectionGroup[]): string[] {
  const names: string[] = []
  for (const tag of tags) if (tag.skillNames.includes(name)) names.push(tag.name)
  for (const collection of collections) if (collection.skillNames.includes(name)) names.push(collection.name)
  return names
}

/**
 * Members of a group that are currently enabled AND also belong to at least
 * one other group — the set a "close" action must ask about.
 */
export function conflictsOnClose(
  members: readonly string[],
  enabledNames: ReadonlySet<string>,
  otherGroups: ReadonlyArray<{ members: readonly string[] }>,
): string[] {
  return members.filter((name) => {
    if (!enabledNames.has(name)) return false
    return otherGroups.some((group) => group.members.includes(name))
  })
}

/** Origin-repo filter value: skills with no source record (private skills). */
export const PRIVATE_SOURCE = 'private'

/**
 * Apply the origin filter ('all' or a specific origin repo; skills without a
 * source record count as PRIVATE_SOURCE). The origins map is the store's
 * skillName → repo derivation, so filtering follows the tracked source
 * records instead of the filesystem root a skill happens to live under.
 */
export function filterBySource(skills: readonly CatalogSkill[], source: string, origins: Readonly<Record<string, string>>): CatalogSkill[] {
  if (source === 'all') return [...skills]
  return skills.filter((skill) => (origins[skill.name] ?? PRIVATE_SOURCE) === source)
}

/**
 * Apply the search box and the origin filter to the switched-off skills.
 *
 * Every view that can flip a skill's switch off needs a way back to it — the
 * disabled row is that way back — so the flat list and the grouped personal
 * card share this filter instead of each re-deriving it (the flat list used to
 * drop disabled skills entirely, which made them unreachable outside a scene).
 * The rows are ordinary catalog skills with `enabled === false`, so name and
 * description filtering works exactly as it does for the enabled list.
 */
export function filterDisabled(
  records: readonly CatalogSkill[],
  normalized: string,
  source: string,
  origins: Readonly<Record<string, string>>,
): CatalogSkill[] {
  return records.filter((record) =>
    (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
    && (source === 'all' || (origins[record.name] ?? PRIVATE_SOURCE) === source))
}

/** One origin collection with the members visible under the current filters. */
interface VisibleCollection {
  collection: CollectionGroup
  /** Enabled, currently visible members. */
  skills: CatalogSkill[]
  /** Switched-off members passing the current name/description filter. */
  disabledMembers: CatalogSkill[]
}

/**
 * Match origin collections against the currently visible enabled skills and
 * switched-off skills, dropping collections with no visible member. Without
 * this, a stale origin (skill gone from disk) renders a group header with
 * zero rows — an empty shell the sources tab otherwise never shows.
 */
export function visibleCollections(
  collections: readonly CollectionGroup[],
  visibleSkills: readonly CatalogSkill[],
  disabledRecords: readonly CatalogSkill[],
  normalized: string,
  sourceFilter: string,
  origins: Readonly<Record<string, string>>,
): VisibleCollection[] {
  const visible: VisibleCollection[] = []
  for (const collection of collections) {
    const skills = visibleSkills.filter((skill) => collection.skillNames.includes(skill.name))
    const disabledMembers = disabledRecords.filter((record) =>
      collection.skillNames.includes(record.name)
      && (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
      && (sourceFilter === 'all' || (origins[record.name] ?? PRIVATE_SOURCE) === sourceFilter))
    if (skills.length > 0 || disabledMembers.length > 0) visible.push({ collection, skills, disabledMembers })
  }
  return visible
}

/** Catalog sort keys offered by the filter bar. */
export type SortKey = 'name' | 'added' | 'uses'

/**
 * Sort a skill list in place-safe copy order: name ascending, added
 * descending (newest first, unknown addedAt last), or uses descending
 * (most-called first). Unknown values always trail.
 */
export function sortSkills<T extends { name: string; addedAt?: number }>(skills: readonly T[], key: SortKey, getUses?: (name: string) => number | undefined): T[] {
  const list = [...skills]
  if (key === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else if (key === 'added') {
    list.sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity))
  } else if (key === 'uses') {
    list.sort((a, b) => (getUses?.(b.name) ?? 0) - (getUses?.(a.name) ?? 0))
  }
  return list
}

/** 组内一行：启用中的技能，或已被运行时关闭的技能（同一份 CatalogSkill 数据）。 */
export type GroupRow =
  | { kind: 'skill'; skill: CatalogSkill }
  | { kind: 'disabled'; record: CatalogSkill }

/**
 * 把一个来源/场景组里的启用技能与已关闭技能合并成一条按当前排序键排好的
 * 列表。开关只是把一行换个样式，行不该跳到组尾：所以两类条目一起排序，
 * 关闭行带着技能自己的 addedAt，「按添加时间」也不会乱。
 */
export function mergeGroupRows(
  skills: readonly CatalogSkill[],
  records: readonly CatalogSkill[],
  key: SortKey,
  getUses?: (name: string) => number | undefined,
): GroupRow[] {
  const entries: Array<{ name: string; addedAt?: number; row: GroupRow }> = []
  for (const skill of skills) {
    entries.push({ name: skill.name, ...(skill.addedAt !== undefined ? { addedAt: skill.addedAt } : {}), row: { kind: 'skill', skill } })
  }
  for (const record of records) {
    entries.push({ name: record.name, ...(record.addedAt !== undefined ? { addedAt: record.addedAt } : {}), row: { kind: 'disabled', record } })
  }
  return sortSkills(entries, key, getUses).map((entry) => entry.row)
}

/** Localized relative-time tuple; the caller resolves it via tt(). */
interface RelativeTime {
  key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo' | 'time.weeksAgo'
  value?: number
}

/** Format an epoch-ms timestamp as a short relative time bucket. */
export function formatRelativeTime(ms: number, now = Date.now()): RelativeTime {
  const diff = Math.max(0, now - ms)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return { key: 'time.justNow' }
  if (minutes < 60) return { key: 'time.minutesAgo', value: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'time.hoursAgo', value: hours }
  const days = Math.floor(hours / 24)
  if (days < 7) return { key: 'time.daysAgo', value: days }
  return { key: 'time.weeksAgo', value: Math.floor(days / 7) }
}
