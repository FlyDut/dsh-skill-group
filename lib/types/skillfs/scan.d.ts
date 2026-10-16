import type { DiagnosticEntry, WritableRoot } from '../protocol.ts';
/** One discoverable skill file in a scanned root. */
interface SkillEntry {
    /** Absolute path of the discovery file (SKILL.md or the flat .md). */
    path: string;
    /** Directory serving as the resource base (bundle dir or the root itself). */
    directory: string;
    kind: 'directory' | 'flat';
}
/**
 * Scan one skills root for discovery files: directory bundles (SKILL.md)
 * and flat <name>.md files. Legacy `.disabled` renames (an older hub version
 * switched skills off by renaming their files) are ignored, as are
 * dot-prefixed entries (including .trash and .system).
 */
export declare function scanRoot(base: string): Promise<SkillEntry[]>;
/** UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
export interface SkillInterface {
    displayName?: string;
    shortDescription?: string;
    brandColor?: string;
    iconSmall?: string;
    iconLarge?: string;
    defaultPrompt?: string;
}
/** Read UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
export declare function readSkillInterface(directory: string): Promise<SkillInterface | undefined>;
/**
 * Scan one writable root for files the provider ignores, so the GUI can
 * show why a skill never appears — a missing or broken frontmatter must be
 * visible, not silent.
 */
export declare function scanDiagnostics(root: WritableRoot, home?: string): Promise<DiagnosticEntry[]>;
export {};
