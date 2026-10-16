import type { SourceRecord } from '../../protocol.ts';
/** The source record that tracks a skill name (undefined when untracked). */
export declare function findSourceForSkill(sources: Map<string, SourceRecord>, name: string): SourceRecord | undefined;
/**
 * Upsert one skill into a source record. When the repo has no record yet a new
 * one is created from the caller's root/commit snapshot.
 */
export declare function addSourceSkill(sources: Map<string, SourceRecord>, repo: string, root: string, commitSha: string, ref: string | undefined, skillName: string): void;
/**
 * Replace a source's skill list (used after sync / confirm-delete). An empty
 * list drops the record entirely; undefined means the repo was not tracked.
 */
export declare function setSourceSkills(sources: Map<string, SourceRecord>, repo: string, skills: readonly string[]): SourceRecord | undefined;
/** Drop one skill from every source record; records left empty are removed. */
export declare function removeSkillFromSources(sources: Map<string, SourceRecord>, name: string): boolean;
/** Update a source's commit snapshot. Returns whether a record was updated. */
export declare function setSourceCommit(sources: Map<string, SourceRecord>, repo: string, commitSha: string): boolean;
/** Update a source's pinned ref (release tag / branch). Blank refs are ignored. */
export declare function setSourceRef(sources: Map<string, SourceRecord>, repo: string, ref: string): boolean;
/**
 * Merge per-path manifest entries into a source (incremental imports). When
 * `dir` is given, every baseline path under that skill directory is dropped
 * first, so files the upstream removed never linger and skew later diffs.
 *
 * `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix is
 * empty, so the whole baseline is replaced: that skill owns the tree, and
 * keeping stale paths would make every later diff report "changed" forever.
 */
export declare function mergeSourceManifest(sources: Map<string, SourceRecord>, repo: string, manifest: Record<string, number>, dir?: string): boolean;
/** skillName → repo for every recorded origin. */
export declare function listOrigins(sources: Map<string, SourceRecord>): Record<string, string>;
