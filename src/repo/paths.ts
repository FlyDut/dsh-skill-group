/**
 * 仓库树的路径语义：技能目录在 GitHub 仓库树里的位置表示。
 *
 * 从 discovery.ts 抽出单独成文件：这是 repo 域的**路径契约**（REPO_ROOT 哨兵
 * + 前缀算术），策展层的 store 清理 source baseline 也要用同一套规则，单独放
 * 这里它就不必依赖 288 行的发现算法模块。
 *
 * 纯字符串运算：无副作用，也不依赖 node:path（这些是 GitHub 树里的
 * '/'-joined 路径，不是宿主文件系统路径）。
 */

import type { RepoRoot } from '../protocol.ts'

/**
 * Sentinel root for a skill whose SKILL.md sits directly at the repository
 * root instead of under a top-level directory. That layout is legal and used
 * upstream (a Claude Code plugin manifest may declare `"skills": ["./"]`),
 * and the empty string is the representation that composes with plain prefix
 * arithmetic: an empty prefix *is* the repo root. Every path helper below
 * special-cases it, because `'' + '/' + name` would produce a bogus absolute
 * `/name` that matches no tree path.
 */
export const REPO_ROOT: RepoRoot = ''

/** True when a root denotes the repo root itself (the repo is the skill dir). */
export function isRepoRoot(root: string): boolean {
  return root === REPO_ROOT
}

/**
 * The tree prefix delimiting a skill directory: empty for the repo-root skill
 * (it owns the whole tree), otherwise `<dir>/`. Single source for collect,
 * manifest, diff and the store's baseline cleanup, so they can never disagree.
 */
export function skillDirPrefix(dir: string): string {
  return isRepoRoot(dir) ? '' : dir + '/'
}

/**
 * A path inside a skill directory, as it appears in the repo tree. Both
 * directions of this mapping matter: repo paths are always '/'-joined (never
 * node:path's OS separator, these are GitHub paths shown in the UI), and the
 * repo-root case must not grow a leading slash.
 */
export function skillPathIn(dir: string, relative: string): string {
  return skillDirPrefix(dir) + relative
}

/** The SKILL.md path inside a skill directory. */
export function skillFileAt(dir: string): string {
  return skillPathIn(dir, 'SKILL.md')
}
