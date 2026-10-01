/**
 * Source-tracking (上游仓库) mutations over the sidecar's source map.
 *
 * I/O-free by design: the store owns loading and persistence, so each function
 * only touches the in-memory map and reports whether anything changed.
 */
import { skillDirPrefix } from '../../repo/paths.ts'
import type { SourceRecord } from '../../protocol.ts'

/** The source record that tracks a skill name (undefined when untracked). */
export function findSourceForSkill(sources: Map<string, SourceRecord>, name: string): SourceRecord | undefined {
  for (const source of sources.values()) {
    if (source.skills.includes(name)) return source
  }
  return undefined
}

/**
 * Upsert one skill into a source record. When the repo has no record yet a new
 * one is created from the caller's root/commit snapshot.
 */
export function addSourceSkill(sources: Map<string, SourceRecord>, repo: string, root: string, commitSha: string, ref: string | undefined, skillName: string): void {
  const existing = sources.get(repo)
  if (existing === undefined) {
    sources.set(repo, {
      repo,
      ...(ref !== undefined && ref !== '' ? { ref } : {}),
      root,
      commitSha,
      skills: [skillName],
    })
    return
  }
  const skills = existing.skills.includes(skillName) ? existing.skills : [...existing.skills, skillName].sort((a, b) => a.localeCompare(b))
  sources.set(repo, { ...existing, skills })
}

/**
 * Replace a source's skill list (used after sync / confirm-delete). An empty
 * list drops the record entirely; undefined means the repo was not tracked.
 */
export function setSourceSkills(sources: Map<string, SourceRecord>, repo: string, skills: readonly string[]): SourceRecord | undefined {
  const existing = sources.get(repo)
  if (existing === undefined) return undefined
  const names = [...new Set(skills.filter((n) => n.trim() !== ''))].sort((a, b) => a.localeCompare(b))
  if (names.length === 0) {
    sources.delete(repo)
    return undefined
  }
  const next: SourceRecord = { ...existing, skills: names }
  sources.set(repo, next)
  return next
}

/** Drop one skill from every source record; records left empty are removed. */
export function removeSkillFromSources(sources: Map<string, SourceRecord>, name: string): boolean {
  let changed = false
  for (const [repo, source] of sources) {
    if (!source.skills.includes(name)) continue
    const skills = source.skills.filter((n) => n !== name)
    if (skills.length === 0) sources.delete(repo)
    else sources.set(repo, { ...source, skills })
    changed = true
  }
  return changed
}

/** Update a source's commit snapshot. Returns whether a record was updated. */
export function setSourceCommit(sources: Map<string, SourceRecord>, repo: string, commitSha: string): boolean {
  const existing = sources.get(repo)
  if (existing === undefined) return false
  sources.set(repo, { ...existing, commitSha })
  return true
}

/** Update a source's pinned ref (release tag / branch). Blank refs are ignored. */
export function setSourceRef(sources: Map<string, SourceRecord>, repo: string, ref: string): boolean {
  const existing = sources.get(repo)
  if (existing === undefined || ref.trim() === '') return false
  sources.set(repo, { ...existing, ref: ref.trim() })
  return true
}

/**
 * Merge per-path manifest entries into a source (incremental imports). When
 * `dir` is given, every baseline path under that skill directory is dropped
 * first, so files the upstream removed never linger and skew later diffs.
 *
 * `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix is
 * empty, so the whole baseline is replaced: that skill owns the tree, and
 * keeping stale paths would make every later diff report "changed" forever.
 */
export function mergeSourceManifest(sources: Map<string, SourceRecord>, repo: string, manifest: Record<string, number>, dir?: string): boolean {
  const existing = sources.get(repo)
  if (existing === undefined || Object.keys(manifest).length === 0) return false
  const base: Record<string, number> = { ...(existing.manifest ?? {}) }
  if (dir !== undefined) {
    const prefix = skillDirPrefix(dir)
    for (const path of Object.keys(base)) {
      if (path.startsWith(prefix)) delete base[path]
    }
  }
  sources.set(repo, { ...existing, manifest: { ...base, ...manifest } })
  return true
}

/** skillName → repo for every recorded origin. */
export function listOrigins(sources: Map<string, SourceRecord>): Record<string, string> {
  const origins: Record<string, string> = {}
  for (const source of sources.values()) {
    for (const name of source.skills) origins[name] = source.repo
  }
  return origins
}
