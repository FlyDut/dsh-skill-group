/**
 * 分组域路由：groups / tag 新建重命名 / tag 删除 / tag 成员。
 * 从 routes.ts 原样搬出，handler 逻辑不变。
 */

import {
  SKILL_HUB_API,
  type TagDeleteResponse,
  type TagMembersResponse,
  type TagSaveResponse,
} from '../protocol.ts'
import {
  buildGroups,
  knownSkillNames,
  readString,
  readStrings,
  writeError,
  writeJson,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function groupRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // -------------------------------------------------------------- groups
    // 用户 tag 分组 + 系统集合组 + origin 映射（前端分组栏的数据源）。
    {
      path: SKILL_HUB_API.groups,
      methods: ['GET'],
      handler: async ({ res }) => {
        writeJson(res, 200, await buildGroups(deps))
      },
    },
    // ----------------------------------------------------------------- tag
    // 新建（缺省 id）或重命名（带 id）一个用户 tag 分组。
    {
      path: SKILL_HUB_API.tag,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name').trim()
        if (name === '') { writeError(res, 400, 'tag name is required'); return }
        const rawId = readString(body, 'id')
        await deps.store.saveTag({ ...(rawId !== '' ? { id: rawId } : {}), name })
        writeJson(res, 200, { ok: true, tags: await deps.store.listTags() } satisfies TagSaveResponse)
      },
    },
    // ----------------------------------------------------------- tag/delete
    {
      path: SKILL_HUB_API.tagDelete,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const id = readString(body, 'id')
        if (id === '') { writeError(res, 400, 'tag id is required'); return }
        await deps.store.deleteTag(id)
        writeJson(res, 200, { ok: true, tags: await deps.store.listTags() } satisfies TagDeleteResponse)
      },
    },
    // ---------------------------------------------------------- tag/members
    // 直接设置某 tag 的完整成员列表；后端只保留目录中实际存在的技能名。
    {
      path: SKILL_HUB_API.tagMembers,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const id = readString(body, 'id')
        if (id === '') { writeError(res, 400, 'tag id is required'); return }
        // 空串保留：store 侧统一去重并丢弃空白项（语义与原实现一致）。
        const names = readStrings(body, 'skillNames', { keepEmpty: true })
        const known = await knownSkillNames(deps)
        const saved = await deps.store.setTagMembers(id, names.filter((n) => known.has(n)))
        if (saved === undefined) { writeError(res, 404, 'tag not found: ' + id); return }
        writeJson(res, 200, { ok: true, tags: await deps.store.listTags() } satisfies TagMembersResponse)
      },
    },
  ]
}
