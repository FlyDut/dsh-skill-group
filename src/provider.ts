/**
 * 发现层 · 管理视图 provider —— 注册进官方 ctx.skills 注册表的 GLOBAL 层。
 *
 * 职责边界：它只回答"这台机器上现在有哪些技能、正文是什么"，不决定任何技能
 * 该不该可见（那是策展层 store/ 与执行层 enforcement/ 的事），也不知道模式
 * 的存在。GUI 的管理目录、路由目录装配、以及 ScopeView 的目录快照都读它。
 *
 * Why: in the dsh web app the base host skill-filesystem row is disabled on
 * purpose — agent presets own local discovery by mounting their own
 * skill-filesystem into their preset scope layers, so a host-plane query
 * against the registry's empty global layer sees nothing. The hub needs a
 * session-independent management view, so it contributes one itself: the
 * user roots always, plus the project roots when the caller names a cwd.
 *
 * Agent views are unaffected: preset layers are nearer than the global
 * layer, so a preset's own filesystem provider wins every duplicate name
 * outright, and this provider only surfaces skills for presets that mount
 * no filesystem row at all.
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { SkillCandidate, SkillDefinition, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { errorText } from './error-text.ts'
import { dshHome } from './env.ts'
import { findProjectRoot, parseFrontmatter, rootPath, scanRoot } from './skillfs.ts'

/** Official root ranks (mirrors dsh-skill-filesystem). */
const PROJECT_DSH_RANK = 100
const PROJECT_AGENTS_RANK = 200
const USER_DSH_RANK = 400
const USER_AGENTS_RANK = 500

/** One scanned root the provider lists. */
interface ProviderRoot {
  /** Skills directory to scan. */
  base: string
  /** SkillSource value for candidates from this root. */
  source: string
  /** Official precedence rank. */
  rank: number
}

/**
 * Canonical identity of one skill root directory: its real path when it exists
 * (so a symlinked root counts as the same directory), else the resolved path —
 * a root that does not exist yields no candidates anyway.
 */
async function rootIdentity(base: string): Promise<string> {
  try {
    return await realpath(base)
  } catch {
    return resolve(base)
  }
}

/**
 * Global-layer skill provider for the hub's management catalog.
 * Implements the official SkillProvider contract: list() returns
 * invocation-neutral candidates; get() resolves the winning candidate's
 * body. Both are readonly reads of the local skill roots.
 */
export class SkillHubProvider implements SkillProvider {
  readonly name = 'skill-hub'
  private readonly home: string
  private readonly control: SkillProviderControl
  private readonly watchTimer: ReturnType<typeof setInterval>
  private rootStamp = ''
  /** 上一次 watch 失败的错误文案（同一错误只记一次，避免 5 秒定时器刷屏）。 */
  private lastWatchError = ''

  constructor(control: SkillProviderControl, home = dshHome()) {
    this.control = control
    this.home = home
    // The registry caches completed catalogs until something invalidates.
    // The hub invalidates explicitly after its own mutations (see routes),
    // and this cheap mtime poll catches external top-level changes (manual
    // adds/removes/renames of skill dirs) so the GUI stays live.
    this.watchTimer = setInterval(() => { this.watch() }, 5000)
    this.watchTimer.unref?.()
    control.signal.addEventListener('abort', () => { clearInterval(this.watchTimer) }, { once: true })
    this.watch()
  }

  /**
   * checkRoots 的守卫包装：某个根不可读（EACCES/ENOTDIR）时不能抛成未处理
   * 拒绝——构造时一次、之后每 5 秒一次。错误按文案去重，恢复后清零。
   */
  private watch(): void {
    void this.checkRoots().then(
      () => { this.lastWatchError = '' },
      (error: unknown) => {
        const text = errorText(error)
        if (text === this.lastWatchError) return
        this.lastWatchError = text
        console.warn('[dsh-skill-hub] skill root watch failed:', text)
      },
    )
  }

  /**
   * Invalidate the registry cache when the discovered skill files changed.
   * The stamp covers the per-skill discovery file's mtime + size (plus the
   * entry set itself), so editing a SKILL.md body — not just adding or
   * renaming directories — refreshes the GUI catalog.
   */
  private async checkRoots(): Promise<void> {
    let stamp = ''
    for (const root of await this.roots(undefined)) {
      for (const entry of await scanRoot(root.base)) {
        try {
          const info = await stat(entry.path)
          stamp += entry.path + ':' + info.mtimeMs + ':' + info.size + ';'
        } catch {
          stamp += entry.path + ':missing;'
        }
      }
    }
    if (this.rootStamp === '') {
      this.rootStamp = stamp
      return
    }
    if (stamp !== this.rootStamp) {
      this.rootStamp = stamp
      this.control.invalidate()
    }
  }

  async list(options: { cwd?: string; signal?: AbortSignal }): Promise<readonly SkillCandidate[]> {
    const candidates: SkillCandidate[] = []
    for (const root of await this.roots(options.cwd)) {
      for (const entry of await scanRoot(root.base)) {
        let text: string
        try {
          text = await readFile(entry.path, 'utf8')
        } catch {
          continue // unreadable files surface in the diagnostics scan instead
        }
        const parsed = parseFrontmatter(text)
        if ('error' in parsed) continue // skip-level failures surface in diagnostics
        const value = parsed.value
        candidates.push({
          name: value.name,
          description: value.description,
          ...(value.whenToUse !== undefined ? { whenToUse: value.whenToUse } : {}),
          invocation: value.invocation,
          source: root.source,
          provider: this.name,
          rank: root.rank,
          locator: { path: entry.path, directory: entry.directory },
          path: entry.path,
        })
      }
    }
    return candidates
  }

  async get(candidate: SkillCandidate): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as { path: string; directory: string }
    let text: string
    try {
      text = await readFile(locator.path, 'utf8')
    } catch {
      return undefined
    }
    const parsed = parseFrontmatter(text)
    if ('error' in parsed) return undefined
    const value = parsed.value
    return {
      name: value.name,
      description: value.description,
      ...(value.whenToUse !== undefined ? { whenToUse: value.whenToUse } : {}),
      invocation: value.invocation,
      source: candidate.source,
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      content: value.content,
    }
  }

  /**
   * The roots this provider lists: user roots always, project roots with cwd.
   *
   * Roots resolving to the same directory collapse to one entry, keeping the
   * user identity. Why this matters: `findProjectRoot` walks up to the first
   * `.dsh`/`.git`, so a workspace with neither marker (e.g. `~/公共`) resolves
   * its project root to `$HOME` — and `$HOME/.dsh/skills` *is* the user root
   * whenever `DSH_HOME` is `~/.dsh`. Scanning that one directory under both
   * `user-dsh` and `project-dsh` reported every user skill twice, and the
   * management panel keys project rows per workspace, so every such workspace
   * added another row. The project copy also came back `writable: false`, so the
   * panel showed a read-only clone of the user's own skill.
   */
  private async roots(cwd?: string): Promise<ProviderRoot[]> {
    // 用户根排在前面：同一目录冲突时保留用户身份（可写、归到用户来源）。
    const roots: ProviderRoot[] = [
      { base: rootPath('user-dsh', this.home), source: 'user-dsh', rank: USER_DSH_RANK },
      { base: rootPath('user-agents', this.home), source: 'user-agents', rank: USER_AGENTS_RANK },
    ]
    if (cwd !== undefined && cwd !== '') {
      const project = await findProjectRoot(cwd)
      roots.push(
        { base: join(project, '.dsh', 'skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK },
        { base: join(project, '.agents', 'skills'), source: 'project-agents', rank: PROJECT_AGENTS_RANK },
      )
    }
    const seen = new Set<string>()
    const unique: ProviderRoot[] = []
    for (const root of roots) {
      const identity = await rootIdentity(root.base)
      if (seen.has(identity)) continue
      seen.add(identity)
      unique.push(root)
    }
    return unique
  }

  /** Public hook for the routes: invalidate after hub-driven mutations. */
  invalidate(): void {
    this.control.invalidate()
  }
}

