/**
 * Tag-group (场景分组) mutations over the sidecar's tag map.
 *
 * These are deliberately I/O-free: the store owns loading and persistence, so
 * every function here only reads/writes the in-memory map and reports whether
 * anything changed. That keeps the rules unit-testable without a state file.
 */
import { StoreError } from '../errors.ts'
import type { SkillTag } from '../../protocol.ts'

/** The default scene (「通用」), if one exists. */
export function findDefaultTag(tags: Map<string, SkillTag>): SkillTag | undefined {
  return [...tags.values()].find((tag) => tag.default === true)
}

/**
 * Create (no id) or rename (with id) a tag and return the saved record.
 * Creating assigns a fresh UUID; renaming keeps members.
 */
export function saveTag(tags: Map<string, SkillTag>, input: { id?: string; name: string }): SkillTag {
  const name = input.name.trim()
  if (name === '') throw new StoreError('validation', 'tag name must not be empty')
  let tag: SkillTag
  if (input.id !== undefined) {
    const existing = tags.get(input.id)
    if (existing === undefined) throw new StoreError('not-found', 'tag not found: ' + input.id)
    tag = { ...existing, name }
  } else {
    tag = { id: crypto.randomUUID(), name, skillNames: [] }
  }
  tags.set(tag.id, tag)
  return tag
}

/** Delete a tag by id; the default scene is protected. Returns whether one was removed. */
export function deleteTag(tags: Map<string, SkillTag>, id: string): boolean {
  const tag = tags.get(id)
  if (tag?.default === true) throw new StoreError('conflict', 'the default scene cannot be deleted')
  return tags.delete(id)
}

/** Append one skill name (deduplicated; no-op when already a member). */
export function addSkillToTag(tags: Map<string, SkillTag>, id: string, name: string): { tag: SkillTag | undefined; changed: boolean } {
  const existing = tags.get(id)
  if (existing === undefined || name.trim() === '' || existing.skillNames.includes(name)) return { tag: existing, changed: false }
  const tag: SkillTag = { ...existing, skillNames: [...existing.skillNames, name] }
  tags.set(id, tag)
  return { tag, changed: true }
}

/**
 * Replace a tag's member list wholesale (idempotent). Deduplicates and drops
 * blank names; unknown skill names are kept (they may arrive later) — the
 * routes layer filters against the live catalog before persisting.
 */
export function setTagMembers(tags: Map<string, SkillTag>, id: string, skillNames: readonly string[]): { tag: SkillTag | undefined; changed: boolean } {
  const existing = tags.get(id)
  if (existing === undefined) return { tag: undefined, changed: false }
  const names = [...new Set(skillNames.filter((n) => n.trim() !== ''))]
  tags.set(id, { ...existing, skillNames: names })
  return { tag: tags.get(id), changed: true }
}

/** Remove one skill from every tag group. Returns whether anything changed. */
export function removeSkillFromTags(tags: Map<string, SkillTag>, name: string): boolean {
  let changed = false
  for (const tag of tags.values()) {
    if (!tag.skillNames.includes(name)) continue
    tags.set(tag.id, { ...tag, skillNames: tag.skillNames.filter((n) => n !== name) })
    changed = true
  }
  return changed
}

/** Reorder tag groups by orderedIds, which must be a permutation of the current ids. */
export function reorderTags(tags: Map<string, SkillTag>, orderedIds: string[]): Map<string, SkillTag> {
  if (orderedIds.length !== tags.size) throw new StoreError('validation', 'orderedIds length mismatch')
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (typeof id !== 'string' || id === '') throw new StoreError('validation', 'invalid tag id')
    if (seen.has(id)) throw new StoreError('validation', 'duplicate tag id: ' + id)
    if (!tags.has(id)) throw new StoreError('not-found', 'tag not found: ' + id)
    seen.add(id)
  }
  const next = new Map<string, SkillTag>()
  for (const id of orderedIds) next.set(id, tags.get(id)!)
  return next
}
