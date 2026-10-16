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
 * every known member enabled → 'on', none → 'off', otherwise 'mixed'. Members
 * the catalog no longer contains are ignored for the state (see
 * `groupSwitchView`) and only reported as missing.
 * Closing a group whose member is enabled in another group is a conflict the
 * GUI resolves with a dialog; the helpers below compute both sides.
 */
import type { CatalogResponse, CatalogSkill, CollectionGroup, SkillTag } from '../protocol.ts';
/**
 * Rows of a catalog that are currently switched off at runtime. The catalog
 * carries every known skill exactly once, so "disabled" is a filter over
 * `catalog.skills` (by `enabled`) rather than a second list.
 */
export declare function disabledSkills(catalog: CatalogResponse | null): CatalogSkill[];
/** Grouped switch state derived from member enablement. */
export type GroupSwitchState = 'on' | 'off' | 'mixed';
/** The derived switch view of one group. */
export interface GroupSwitchView {
    state: GroupSwitchState;
    /** Members currently switched on. */
    enabled: string[];
    /** Members currently switched off. */
    disabled: string[];
    /** Members the catalog does not know at all (deleted or renamed upstream). */
    missing: string[];
}
/**
 * Derive a group switch view from its member names, the set of currently
 * enabled skill names and the set of names the catalog actually knows
 * (catalog.skills).
 *
 * Members the catalog does not know cannot be switched either way, so they
 * must never decide the state: counting them as "off" would leave any group
 * with a deleted or renamed member stuck in 'mixed' forever, and no click
 * could clear it (batch toggles only ever send known names). They are reported
 * in `missing` so the header can say so instead. A group with no known member
 * is 'off' with its switch disabled.
 */
export declare function groupSwitchView(members: readonly string[], enabledNames: ReadonlySet<string>, knownNames: ReadonlySet<string>): GroupSwitchView;
/** Names of every group a skill belongs to (tags + collections). */
export declare function groupNamesOf(name: string, tags: readonly SkillTag[], collections: readonly CollectionGroup[]): string[];
/**
 * Members of a group that are currently enabled AND also belong to at least
 * one other group — the set a "close" action must ask about.
 */
export declare function conflictsOnClose(members: readonly string[], enabledNames: ReadonlySet<string>, otherGroups: ReadonlyArray<{
    members: readonly string[];
}>): string[];
/** Origin-repo filter value: skills with no source record (private skills). */
export declare const PRIVATE_SOURCE = "private";
/**
 * Apply the origin filter ('all' or a specific origin repo; skills without a
 * source record count as PRIVATE_SOURCE). The origins map is the store's
 * skillName → repo derivation, so filtering follows the tracked source
 * records instead of the filesystem root a skill happens to live under.
 */
export declare function filterBySource(skills: readonly CatalogSkill[], source: string, origins: Readonly<Record<string, string>>): CatalogSkill[];
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
export declare function filterDisabled(records: readonly CatalogSkill[], normalized: string, source: string, origins: Readonly<Record<string, string>>): CatalogSkill[];
/** One origin collection with the members visible under the current filters. */
interface VisibleCollection {
    collection: CollectionGroup;
    /** Enabled, currently visible members. */
    skills: CatalogSkill[];
    /** Switched-off members passing the current name/description filter. */
    disabledMembers: CatalogSkill[];
}
/**
 * Match origin collections against the currently visible enabled skills and
 * switched-off skills, dropping collections with no visible member. Without
 * this, a stale origin (skill gone from disk) renders a group header with
 * zero rows — an empty shell the sources tab otherwise never shows.
 */
export declare function visibleCollections(collections: readonly CollectionGroup[], visibleSkills: readonly CatalogSkill[], disabledRecords: readonly CatalogSkill[], normalized: string, sourceFilter: string, origins: Readonly<Record<string, string>>): VisibleCollection[];
/** Catalog sort keys offered by the filter bar. */
export type SortKey = 'name' | 'added' | 'uses';
/**
 * Sort a skill list in place-safe copy order: name ascending, added
 * descending (newest first, unknown addedAt last), or uses descending
 * (most-called first). Unknown values always trail.
 */
export declare function sortSkills<T extends {
    name: string;
    addedAt?: number;
}>(skills: readonly T[], key: SortKey, getUses?: (name: string) => number | undefined): T[];
/** 组内一行：启用中的技能，或已被运行时关闭的技能（同一份 CatalogSkill 数据）。 */
export type GroupRow = {
    kind: 'skill';
    skill: CatalogSkill;
} | {
    kind: 'disabled';
    record: CatalogSkill;
};
/**
 * 把一个来源/场景组里的启用技能与已关闭技能合并成一条按当前排序键排好的
 * 列表。开关只是把一行换个样式，行不该跳到组尾：所以两类条目一起排序，
 * 关闭行带着技能自己的 addedAt，「按添加时间」也不会乱。
 */
export declare function mergeGroupRows(skills: readonly CatalogSkill[], records: readonly CatalogSkill[], key: SortKey, getUses?: (name: string) => number | undefined): GroupRow[];
/** Localized relative-time tuple; the caller resolves it via tt(). */
interface RelativeTime {
    key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo' | 'time.weeksAgo';
    value?: number;
}
/** Format an epoch-ms timestamp as a short relative time bucket. */
export declare function formatRelativeTime(ms: number, now?: number): RelativeTime;
export {};
