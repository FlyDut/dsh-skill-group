import type { WritableRoot } from '../protocol.ts';
/** Root ids this module may write to. */
export declare const WRITABLE_ROOTS: readonly WritableRoot[];
/** Resolve the absolute directory of one writable root. */
export declare function rootPath(root: WritableRoot, home?: string): string;
/** Root of an absolute skill file path, or undefined when not user-owned. */
export declare function rootOfPath(path: string, home?: string): WritableRoot | undefined;
/** Absolute directory of one skill under a writable root: <root>/<name>. */
export declare function skillDir(root: WritableRoot, name: string, home?: string): string;
/**
 * The on-disk shapes of one skill under a writable root, in probe order: the
 * directory bundle's SKILL.md, the bare directory (for directory-level
 * metadata), then the flat <name>.md. Callers stat the list in order and stop
 * at the first hit.
 */
export declare function skillLocationCandidates(root: WritableRoot, name: string, home?: string): string[];
