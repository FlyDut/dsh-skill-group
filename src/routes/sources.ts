/**
 * 来源跟踪域路由：sources 列表 / check 上游更新 / sync 同步。上游删除只做
 * 报告，本插件不再替用户删本地文件（删除是用户的决定，插件不碰文件）。
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import {
  SKILL_HUB_API,
  type SourceCheckResponse,
  type SourceCheckResult,
  type SourceSyncResponse,
  type SourcesResponse,
} from '../protocol.ts'
import {
  collectRepoSkillFiles,
  diffRemoteSkills,
  downloadRepoSkill,
  getLatestCommit,
  loadRepoTreeAt,
  normalizeRepoInput,
  repoSkillEntry,
  repoSlug,
  skillDirOf,
  skillFileAt,
  skillManifest,
} from '../repo.ts'
import { rootPath } from '../skillfs.ts'
import { errorText } from '../error-text.ts'
import {
  buildCollections,
  homeOf,
  pathExists,
  readString,
  readStrings,
  writeError,
  writeJson,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'
import { MIN_CHECK_INTERVAL_MS, lastSourceCheck, replaceSkillDir } from './route-state.ts'

/** 来源跟踪域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function sourceRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // ------------------------------------------------------------- sources
    // 来源列表 + 派生 origin 映射 + 集合组。
    {
      path: SKILL_HUB_API.sources,
      methods: ['GET'],
      handler: async ({ res }) => {
        const [sources, origins, collectionOrder] = await Promise.all([deps.store.listSources(), deps.store.listOrigins(), deps.store.getCollectionOrder()])
        writeJson(res, 200, { ok: true, sources, origins, collections: buildCollections(origins, collectionOrder) } satisfies SourcesResponse)
      },
    },
    // -------------------------------------------------------- sources/check
    // 检查指定（或全部）来源的上游更新。每个来源最多 1 次 commit 请求；
    // 仅当 commit 变化时再拉一次 tree 做逐技能差异。5 分钟节流。
    {
      path: SKILL_HUB_API.sourceCheck,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const rawRepo = readString(body, 'repo')
        let only: string | undefined
        if (rawRepo !== '') {
          // Normalize URLs/slugs the same way every other route does, so a
          // check for "https://github.com/a/b" finds the "a/b" record.
          const parsedOnly = normalizeRepoInput(rawRepo)
          only = parsedOnly !== null ? repoSlug(parsedOnly) : undefined
        }
        const source = only !== undefined ? await deps.store.getSource(only) : undefined
        if (only !== undefined && source === undefined) { writeError(res, 404, 'source not found: ' + only); return }
        const sources = source !== undefined ? [source] : await deps.store.listSources()
        if (lastSourceCheck.size > 500) lastSourceCheck.clear()
        const results: SourceCheckResult[] = []
        for (const item of sources) {
          const base = { repo: item.repo, ...(item.ref !== undefined ? { ref: item.ref } : {}) }
          const now = Date.now()
          const last = lastSourceCheck.get(item.repo) ?? 0
          if (now - last < MIN_CHECK_INTERVAL_MS) {
            results.push({ ...base, changed: false, updated: [], deleted: [], throttled: true })
            continue
          }
          try {
            const latest = await getLatestCommit(item.repo, item.ref)
            lastSourceCheck.set(item.repo, now)
            if (item.commitSha === '') {
              // Migrated/legacy record without a snapshot: backfill the
              // commit now and report "unverified" instead of claiming every
              // skill is updated (there is no baseline to diff against yet).
              await deps.store.setSourceCommit(item.repo, latest.commitSha)
              results.push({ ...base, changed: false, updated: [], deleted: [], unverified: true, commitSha: latest.commitSha })
              continue
            }
            if (latest.commitSha === item.commitSha) {
              results.push({ ...base, changed: false, updated: [], deleted: [] })
              continue
            }
            const tree = await loadRepoTreeAt(item.repo, latest.treeSha)
            const diff = diffRemoteSkills(tree, item)
            // 上游删除只报不删：本地文件由用户自己收拾。
            results.push({ ...base, changed: true, commitSha: latest.commitSha, updated: diff.updated, deleted: diff.deleted })
          } catch (error) {
            results.push({ ...base, changed: false, updated: [], deleted: [], error: errorText(error) })
          }
        }
        writeJson(res, 200, { ok: true, results } satisfies SourceCheckResponse)
      },
    },
    // --------------------------------------------------------- sources/sync
    // 按上游重新下载所选（或全部）技能并更新 commit 快照与 manifest。
    {
      path: SKILL_HUB_API.sourceSync,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const repo = readString(body, 'repo').trim()
        if (repo === '') { writeError(res, 400, 'repo is required'); return }
        // 未传 skills（不是数组）表示"全部"，空数组表示"一个都不选"。
        const selected = Array.isArray(body.skills) ? readStrings(body, 'skills') : undefined
        const source = await deps.store.getSource(repo)
        if (source === undefined) { writeError(res, 404, 'source not found: ' + repo); return }
        const targets = selected !== undefined ? selected : source.skills
        const latest = await getLatestCommit(repo, source.ref)
        const tree = await loadRepoTreeAt(repo, latest.treeSha)
        const targetRoot = rootPath('user-dsh', homeOf(deps))
        await mkdir(targetRoot, { recursive: true })
        const synced: string[] = []
        const failed: Array<{ name: string; error: string }> = []
        for (const name of targets) {
          // Sync writes under the user root: only accept real skill names
          // this source actually tracks (a bare join would otherwise fold
          // `..` segments out of the writable root).
          if (!isSkillName(name) || !source.skills.includes(name)) {
            failed.push({ name, error: 'skill is not tracked by this source' })
            continue
          }
          try {
            const entry = repoSkillEntry(name, source.root, repo)
            // 上游可能用分类子目录（skills/engineering/<name>/）且目录会移动：
            // 先在上游 tree 里搜真实位置，manifest 兜底，否则嵌套技能会 404。
            entry.dir = skillDirOf(source, name, tree.map((item) => item.path))
            entry.path = skillFileAt(entry.dir)
            const files = collectRepoSkillFiles(tree, entry.dir)
            if (files.length === 0) { failed.push({ name, error: 'skill missing upstream' }); continue }
            const targetDir = join(targetRoot, name)
            if (await pathExists(targetDir)) {
              await replaceSkillDir(targetDir, async () => {
                await downloadRepoSkill(repo, latest.commitSha, entry, files, targetRoot)
              })
            } else {
              await downloadRepoSkill(repo, latest.commitSha, entry, files, targetRoot)
            }
            // 关闭是 sidecar 里的运行时状态，与磁盘无关：同步完自然保持。
            await deps.store.mergeSourceManifest(repo, skillManifest(tree, entry.dir), entry.dir)
            synced.push(name)
          } catch (error) {
            failed.push({ name, error: errorText(error) })
          }
        }
        // Only advance the commit snapshot when every skill landed: a failed
        // sync keeps the old commit, so the next check still diffs the tree
        // and re-reports the missing skills instead of silently hiding them.
        if (failed.length === 0) {
          await deps.store.setSourceCommit(repo, latest.commitSha)
        }
        deps.invalidate?.()
        writeJson(res, 200, { ok: true, repo, commitSha: latest.commitSha, synced, failed } satisfies SourceSyncResponse)
      },
    },
  ]
}
