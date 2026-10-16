import type { SkillTag } from '../../protocol.ts';
/**
 * Create (no id) or rename (with id) a tag and return the saved record.
 * Creating assigns a fresh UUID; renaming keeps members.
 */
export declare function saveTag(tags: Map<string, SkillTag>, input: {
    id?: string;
    name: string;
}): SkillTag;
/** Delete a tag by id. Returns whether one was removed. */
export declare function deleteTag(tags: Map<string, SkillTag>, id: string): boolean;
/** Append one skill name (deduplicated; no-op when already a member). */
export declare function addSkillToTag(tags: Map<string, SkillTag>, id: string, name: string): {
    tag: SkillTag | undefined;
    changed: boolean;
};
/**
 * Replace a tag's member list wholesale (idempotent). Deduplicates and drops
 * blank names; unknown skill names are kept (they may arrive later) — the
 * routes layer filters against the live catalog before persisting.
 */
export declare function setTagMembers(tags: Map<string, SkillTag>, id: string, skillNames: readonly string[]): {
    tag: SkillTag | undefined;
    changed: boolean;
};
/** Remove one skill from every tag group. Returns whether anything changed. */
export declare function removeSkillFromTags(tags: Map<string, SkillTag>, name: string): boolean;
