/**
 * 仓库技能发现：从 GitHub 仓库树推断技能根目录、列出可导入技能、
 * 生成目录清单并做上游差异比对。纯函数为主，便于单测。
 * 从 repo.ts 抽出。
 *
 * 路径语义集中在几个内部函数上：`skillDirPrefix`（技能目录在树里的前缀）、
 * `isRepoTooling`（永不属于技能的仓库基建）、`skillFileAt`（目录内的
 * SKILL.md 路径）。collect / manifest / diff 三处必须共用它们，否则差异
 * 比对会永远报「有更新」。
 */
import type { RepoSkillEntry } from '../protocol.ts';
import type { RepoFile, RepoRef, RepoTreeItem } from './types.ts';
export { REPO_ROOT, isRepoRoot, skillDirPrefix, skillPathIn, skillFileAt } from './paths.ts';
/**
 * A repo file's path relative to its skill directory — the path it is written
 * to under the skill's own directory. `dir === ''` means the repo file path
 * *is* the relative path; slicing `dir.length + 1` would eat its first
 * character.
 */
export declare function relativeToSkillDir(dir: string, path: string): string;
/** `owner/repo` slug for a parsed reference. */
export declare function repoSlug(ref: RepoRef): string;
/**
 * Normalize a GitHub URL or `owner/repo`/`owner/repo@ref` input.
 * Only github.com URLs are accepted in v1.
 */
export declare function normalizeRepoInput(input: string): RepoRef | null;
/** Collect every file inside a skill directory, including SKILL.md itself. */
export declare function collectRepoSkillFiles(tree: readonly RepoTreeItem[], dir: string): RepoFile[];
/**
 * Compute an origin collection name. Multiple roots split by root, one root
 * keeps the repo slug. The repo-root skill's name *is* the repo slug, so it
 * never gets a trailing-slash suffix (`owner/repo/`).
 */
export declare function originForRoot(repo: string, rootsPresent: ReadonlySet<string>, root: string): string;
/** Discover importable skills from a repo tree. Invalid names are ignored. Roots are auto-derived from the top-level directory of each SKILL.md. */
export declare function discoverRepoEntries(tree: readonly RepoTreeItem[], repo: string, existingNames?: ReadonlySet<string>): RepoSkillEntry[];
/**
 * Build a path→size manifest for one skill directory from a repo tree.
 * Shares `skillTreeFiles` with collectRepoSkillFiles: a manifest that
 * disagreed with the collected file set would make every update diff report
 * "changed" forever.
 */
export declare function skillManifest(tree: readonly RepoTreeItem[], dir: string): Record<string, number>;
/**
 * The real upstream directory of one tracked skill. Source records keep only
 * the short name and top-level root (e.g. root "skills", name "ask-matt"),
 * but upstream repos may nest skills under category directories
 * (skills/engineering/ask-matt/) or move them between categories. Resolution
 * order: exact match under the top-level root in the upstream tree, then the
 * manifest's recorded blob path, then any same-name skill in the tree, then
 * the flat root/name fallback. Passing the tree paths makes the lookup
 * resilient to incomplete manifests and upstream moves.
 *
 * A repo-root record (root '') has no directory to resolve: its SKILL.md is a
 * bare top-level path, so every nested lookup below would miss and the final
 * fallback would hand back a bogus '/name'. Answer before them — including
 * when the upstream SKILL.md is gone, so diffRemoteSkills reports a deletion
 * instead of hunting for a skill that was never nested.
 */
export declare function skillDirOf(source: {
    root: string;
    manifest?: Record<string, number>;
}, name: string, treePaths?: readonly string[]): string;
/**
 * Diff one source record against an upstream tree at treeSha: which tracked
 * skills disappeared (no SKILL.md blob) and which changed (manifest baseline
 * differs, or no baseline exists — treated as changed). Pure over the tree.
 * The remote side is read through skillManifest, so the diff compares like
 * with like against the baseline recorded at import time.
 */
export declare function diffRemoteSkills(tree: readonly RepoTreeItem[], source: {
    root: string;
    skills: readonly string[];
    manifest?: Record<string, number>;
}): {
    updated: string[];
    deleted: string[];
};
/** Minimal RepoSkillEntry for a tracked skill name (sync re-downloads by name). */
export declare function repoSkillEntry(name: string, root: string, repo: string): RepoSkillEntry;
