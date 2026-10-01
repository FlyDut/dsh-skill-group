/**
 * 目录域路由：catalog / skill 详情 / toggle / toggle-batch / skill 删除 /
 * create / stats。
 *
 * 开关是运行时的：toggle 只写 sidecar 的关闭名单，文件与发现层一律不动；
 * 真正的遮蔽由执行层的 per-preset 闸门在下一轮接线时生效。删除是唯一的破坏性
 * 操作，只在面板确认之后才落盘，且仅限用户级可写根。
 */

import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import {
  SKILL_HUB_API,
  type CreateResponse,
  type SkillDeleteResponse,
  type SkillDetailResponse,
  type StatsResponse,
  type ToggleBatchResponse,
  type ToggleResponse,
  type WritableRoot,
} from '../protocol.ts'
import { createSkill, deleteSkillFiles, readSkillInterface, skillDir } from '../skillfs.ts'
import { errorText } from '../error-text.ts'
import {
  applyInterface,
  buildCatalog,
  configOf,
  homeOf,
  isWritableSource,
  pathExists,
  queryParam,
  readString,
  readStrings,
  resolveWritableSkill,
  toDetail,
  writeError,
  writeJson,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

/**
 * 文件创建/修改时间 → 详情行的 addedAt/updatedAt（读取失败时省略字段，
 * 详情页不显示这两行）。
 */
async function applyFileTimes(row: { addedAt?: number; updatedAt?: number }, path: string): Promise<void> {
  try {
    const times = await stat(path)
    row.addedAt = times.birthtimeMs
    row.updatedAt = times.mtimeMs
  } catch {
    // 文件不可读时省略时间字段。
  }
}

/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function catalogRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // ------------------------------------------------------------ catalog
    {
      path: SKILL_HUB_API.catalog,
      methods: ['GET'],
      handler: async ({ res }) => {
        writeJson(res, 200, await buildCatalog(deps))
      },
    },
    // -------------------------------------------------------------- detail
    {
      path: SKILL_HUB_API.skill,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const name = queryParam(url, 'name')
        if (name === undefined || name === '') { writeError(res, 400, 'name query parameter is required'); return }
        const skill = await deps.skills.get(name)
        if (skill === undefined) { writeError(res, 404, 'skill not found: ' + name); return }
        const detail = toDetail(skill, (await deps.store.getDisabled(name)) === undefined)
        if (skill.path !== undefined) {
          await applyFileTimes(detail, skill.path)
          // UI metadata from agents/openai.yaml beside the skill directory (codex).
          try {
            const rb = skill.resourceBase as { kind?: string; path?: string } | undefined
            const dir = rb?.kind === 'directory' && typeof rb.path === 'string' ? rb.path : (skill.path.endsWith('SKILL.md') ? dirname(skill.path) : undefined)
            if (dir !== undefined) {
              const iface = await readSkillInterface(dir)
              if (iface !== undefined) applyInterface(detail, iface)
            }
          } catch {
            // best-effort
          }
        }
        writeJson(res, 200, { ok: true, skill: detail } satisfies SkillDetailResponse)
      },
    },
    // -------------------------------------------------------------- toggle
    // 运行时开关：关闭 = 在 sidecar 记一条 { name, disabledAt }；文件不动。
    {
      path: SKILL_HUB_API.toggle,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name')
        if (name === '') { writeError(res, 400, 'name is required'); return }
        if (body.enabled === true) {
          if (await deps.store.getDisabled(name) === undefined) { writeError(res, 404, 'skill is not switched off: ' + name); return }
          await deps.store.removeDisabled(name)
        } else {
          if (await deps.skills.get(name) === undefined) { writeError(res, 404, 'skill not found: ' + name); return }
          if (await deps.store.getDisabled(name) === undefined) {
            await deps.store.addDisabled({ name, disabledAt: Date.now() })
          }
        }
        deps.invalidate?.()
        writeJson(res, 200, { ok: true, catalog: await buildCatalog(deps) } satisfies ToggleResponse)
      },
    },
    // -------------------------------------------------------- toggle-batch
    // One write for a whole group: switches every named skill on or off.
    // Already-target states are no-ops; per-name failures are reported,
    // never fatal.
    {
      path: SKILL_HUB_API.toggleBatch,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const names = readStrings(body, 'names')
        if (names.length === 0) { writeError(res, 400, 'names must be a non-empty array'); return }
        const enabled = body.enabled === true
        const failures: Array<{ name: string; error: string }> = []
        for (const name of names) {
          try {
            if (enabled) {
              if (await deps.store.getDisabled(name) === undefined) continue // already on: no-op
              await deps.store.removeDisabled(name)
            } else {
              if (await deps.store.getDisabled(name) !== undefined) continue // already off: no-op
              if (await deps.skills.get(name) === undefined) { failures.push({ name, error: 'skill not found: ' + name }); continue }
              await deps.store.addDisabled({ name, disabledAt: Date.now() })
            }
          } catch (error) {
            failures.push({ name, error: errorText(error) })
          }
        }
        deps.invalidate?.()
        writeJson(res, 200, { ok: true, catalog: await buildCatalog(deps), failures } satisfies ToggleBatchResponse)
      },
    },
    // --------------------------------------------------------- skill/delete
    // 破坏性操作，只在这里落盘：面板编辑态先把行移出显示列表，点「完成」并确认
    // 之后才发过来。逐名独立成败，越出用户级可写根的一律拒绝。
    {
      path: SKILL_HUB_API.skillDelete,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const names = readStrings(body, 'names')
        if (names.length === 0) { writeError(res, 400, 'names must be a non-empty array'); return }
        const deleted: string[] = []
        const failures: Array<{ name: string; error: string }> = []
        for (const name of names) {
          try {
            const target = await resolveWritableSkill(deps, name)
            if (!target.ok) { failures.push({ name, error: target.error }); continue }
            await deleteSkillFiles(target.path, homeOf(deps))
            deleted.push(name)
          } catch (error) {
            failures.push({ name, error: errorText(error) })
          }
        }
        if (deleted.length > 0) {
          // 磁盘上已经没了，sidecar 里不该再留痕：关闭记录与分组/来源跟踪一并清掉。
          // 清理失败不算删除失败（磁盘才是事实来源），残留记录顶多在分组里多留一个
          // 「已不在目录中」的名字，所以这里吞掉异常、只保证闸门重算。
          try {
            for (const name of deleted) {
              await deps.store.removeDisabled(name)
              await deps.store.removeSkillFromTags(name)
              await deps.store.removeSkillFromSources(name)
            }
          } catch {
            // 见上：记录清理是尽力而为。
          }
          deps.invalidate?.()
        }
        writeJson(res, 200, { ok: true, deleted, failures, catalog: await buildCatalog(deps) } satisfies SkillDeleteResponse)
      },
    },
    // -------------------------------------------------------------- create
    {
      path: SKILL_HUB_API.create,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name').trim()
        if (!isSkillName(name)) { writeError(res, 400, 'skill name must be kebab-case (lowercase letters, digits, dashes)'); return }
        // 缺省根 = user-dsh；给了但类型/取值不合法时保持原样交给下面的校验拒绝。
        const rootText = body.root === undefined ? 'user-dsh' : readString(body, 'root')
        if (!isWritableSource(rootText)) { writeError(res, 400, 'root must be user-dsh or user-agents'); return }
        const root: WritableRoot = rootText
        const existing = await deps.skills.get(name)
        if (existing !== undefined) { writeError(res, 409, 'skill name already exists: ' + name); return }
        // A directory may exist without producing a registry entry (invalid
        // frontmatter — exactly what the diagnostics section reports).
        // Refuse to overwrite it instead of silently truncating its SKILL.md.
        const target = skillDir(root, name, homeOf(deps))
        if (await pathExists(target)) {
          writeError(res, 409, 'skill directory already exists on disk: ' + name + ' (check the discovery diagnostics)')
          return
        }
        const path = await createSkill(root, name, readString(body, 'description'), homeOf(deps), readString(body, 'content'))
        // 清掉可能残留的同名关闭记录：名字在磁盘上曾经存在、被关闭后又被手工删掉时，
        // 新技能不该一出生就顶着「已关闭」。记录只是状态，不是占用锁。
        await deps.store.removeDisabled(name)
        // 新技能自动归入默认场景（「通用」）。
        const defaultTag = await deps.store.getDefaultTag()
        if (defaultTag !== undefined) await deps.store.addSkillToTag(defaultTag.id, name)
        deps.invalidate?.()
        writeJson(res, 201, { ok: true, path, root } satisfies CreateResponse)
      },
    },
    // ---------------------------------------------------------------- stats
    {
      path: SKILL_HUB_API.stats,
      methods: ['GET'],
      handler: async ({ res }) => {
        if (deps.stats === undefined) {
          writeJson(res, 200, { ok: true, available: false, stats: [] } satisfies StatsResponse)
          return
        }
        // All usage displays off means nobody reads statistics: answer
        // unavailable without invoking the reader, so no scan is triggered.
        const display = configOf(deps)
        if (display.showUseCount === false && display.showUseTime === false && display.showGroupSummary === false) {
          writeJson(res, 200, { ok: true, available: false, stats: [] } satisfies StatsResponse)
          return
        }
        const stats = await deps.stats()
        writeJson(res, 200, { ok: true, available: true, ...(deps.stats.source !== undefined ? { source: deps.stats.source } : {}), stats } satisfies StatsResponse)
      },
    },
  ]
}
