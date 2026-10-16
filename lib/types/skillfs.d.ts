/**
 * Skill filesystem operations for the writable roots: scaffolding a new skill
 * bundle, deleting one the user asked for, and repairing discovery diagnostics
 * in place.
 *
 * Switching a skill off is a runtime decision persisted in the sidecar and
 * enforced by the per-preset gate, so it never touches discovery state. The one
 * destructive operation here, {@link deleteSkillFiles}, runs only after the
 * user confirms a staged deletion in the panel.
 *
 * Frontmatter parsing mirrors @deepseek-ai/dsh-skill-filesystem semantics:
 * required name (kebab-case) + description, optional whenToUse, invocation
 * booleans with the same defaults (modelInvocable defaults true,
 * userInvocable defaults true), legacy keys rejected, and the returned
 * content is the body after the frontmatter block, trimmed.
 */
import type { WritableRoot } from './protocol.ts';
export * from './skillfs/frontmatter.ts';
export * from './skillfs/paths.ts';
export * from './skillfs/scan.ts';
/**
 * Scaffold a directory-bundle skill: <root>/<name>/SKILL.md with a frontmatter
 * template. Refuses non-kebab-case names.
 * @param content Markdown body written after the frontmatter; when blank the
 * scaffold placeholder paragraph is used instead.
 * @returns the created SKILL.md path.
 */
export declare function createSkill(root: WritableRoot, name: string, description: string, home?: string, content?: string): Promise<string>;
/**
 * Delete a skill from disk. A directory bundle (`<root>/<name>/SKILL.md`) goes
 * away whole, a flat `<root>/<name>.md` file on its own.
 *
 * The fence is re-checked here rather than trusted from the caller: a path
 * outside the writable roots is refused. `rm` does not follow symlinks, so a
 * bundle that is a link to a checkout elsewhere loses the link, not the source.
 *
 * @returns the removed path (bundle directory or flat file).
 */
export declare function deleteSkillFiles(filePath: string, home?: string): Promise<string>;
/** Repair one file on disk when its frontmatter is auto-fixable. Returns the new text. */
export declare function fixDiagnosticFile(path: string, home?: string): Promise<string>;
