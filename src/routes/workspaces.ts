/**
 * 工作区域路由：工作区名单 + 每条的策略与展开计数（GET /workspaces）、
 * 策略写入（POST /workspace）。
 *
 * 与 `./scopes.ts`（模式域）结构完全对称：这一层只做三件事——参数校验、把宿主
 * 接口的读数投影成契约形状、错误映射成 4xx。策略语义在 `domain/`，运行时效果在
 * `enforcement/`，此处不复制。
 *
 * 两处刻意的差异：
 *  1. 工作区策略没有"接线状态"可对齐（闸门按 preset 注入、隐藏集合按 cwd 现算），
 *     所以行里不报 `mounted/gateActive`，只有 `pendingCount` 表达"还没生效"。
 *  2. 工作区可能先被删、策略还在。这类**孤儿行**如实列出（`present: false`），
 *     允许用户清掉，但绝不自动清理。
 *
 * 能力缺席（部署里没有 workspaceRegistry / dsh-scope）时不是错误：/workspaces
 * 老实报告 `available: false` 与原因，写入口返回 503——面板据此把「工作区」tab
 * 降级为只读，而插件其余功能毫无感知。
 */

import {
  SKILL_HUB_API,
  WORKSPACE_ID_RE,
  cleanKeys,
  cleanNames,
  type WorkspaceSaveResponse,
  type WorkspaceScopeRow,
  type WorkspacesResponse,
} from '../protocol.ts'
import {
  readString,
  writeError,
  writeJson,
  writeRouteError,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

/** 工作区域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function workspaceRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // ----------------------------------------------------------- workspaces
    // 工作区名单 + 每个工作区的策略、展开计数（面板「工作区」tab 的数据源）。
    {
      path: SKILL_HUB_API.workspaces,
      methods: ['GET'],
      handler: async ({ res }) => {
        const workspaces = deps.workspaces
        if (workspaces === undefined) {
          writeJson(res, 200, { ok: true, available: false, unavailableReason: 'workspace isolation is not wired in this deployment', workspaces: [], pendingCount: 0 } satisfies WorkspacesResponse)
          return
        }
        const snapshot = await workspaces.workspaces()
        const policies = await workspaces.listPolicies()
        const byId = new Map(policies.map((policy) => [policy.workspaceId, policy] as const))
        const rows: WorkspaceScopeRow[] = []
        for (const entry of snapshot.entries) {
          const [policy, visibility] = await Promise.all([workspaces.policyOf(entry.id), workspaces.visibilityOf(entry.id)])
          byId.delete(entry.id)
          rows.push({
            id: entry.id,
            ...(entry.title !== undefined ? { title: entry.title } : {}),
            path: entry.path,
            sessionCount: entry.sessionCount,
            present: true,
            policy: policy ?? { workspaceId: entry.id, enabled: false, groups: [], skills: [] },
            visibleCount: visibility.visible.length,
            hiddenCount: visibility.hidden.length,
          })
        }
        // 工作区已从注册表消失、策略还留着的行：列在末尾，present: false。
        for (const policy of [...byId.values()]) {
          const visibility = await workspaces.visibilityOf(policy.workspaceId)
          rows.push({
            id: policy.workspaceId,
            sessionCount: 0,
            present: false,
            policy,
            visibleCount: visibility.visible.length,
            hiddenCount: visibility.hidden.length,
          })
        }
        writeJson(res, 200, {
          ok: true,
          available: snapshot.available,
          ...(snapshot.reason !== undefined ? { unavailableReason: snapshot.reason } : {}),
          workspaces: rows,
          // 已启用隔离但还没接上闸门的工作区数——面板据此提示"需要一次会话激活"。
          pendingCount: snapshot.pendingCount,
        } satisfies WorkspacesResponse)
      },
    },
    // ------------------------------------------------------------ workspace
    // 写入策略。这是唯一会让某个工作区"真的开始少看见技能"的入口，因此
    // enabled 与清单必须一起被显式表达，缺省一律保持现值（不做隐式开启）。
    {
      path: SKILL_HUB_API.workspace,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const workspaces = deps.workspaces
        if (workspaces === undefined) { writeError(res, 503, 'workspace isolation is not wired in this deployment'); return }
        const workspaceId = readString(body, 'workspaceId').trim()
        if (!WORKSPACE_ID_RE.test(workspaceId)) { writeError(res, 400, 'workspaceId is required and must be a valid workspace id'); return }

        if (body.reset === true) {
          await workspaces.deletePolicy(workspaceId)
          workspaces.notifyPolicyChanged()
          writeJson(res, 200, { ok: true, policy: null } satisfies WorkspaceSaveResponse)
          return
        }

        let enabled: boolean | undefined
        if (body.enabled !== undefined) {
          if (typeof body.enabled !== 'boolean') { writeError(res, 400, 'enabled must be a boolean'); return }
          enabled = body.enabled
        }
        // 清单提供时整体替换；裸技能名由 cleanKeys/cleanNames 归一化（脏值丢弃）。
        let groups: string[] | undefined
        if (body.groups !== undefined) {
          if (!Array.isArray(body.groups)) { writeError(res, 400, 'groups must be an array of strings'); return }
          groups = cleanKeys(body.groups)
        }
        let skills: string[] | undefined
        if (body.skills !== undefined) {
          if (!Array.isArray(body.skills)) { writeError(res, 400, 'skills must be an array of strings'); return }
          skills = cleanNames(body.skills)
        }
        if (enabled === undefined && groups === undefined && skills === undefined) {
          writeError(res, 400, 'nothing to update: provide enabled, groups, or skills')
          return
        }

        // 白名单为空 + 启用 = 该工作区看不到任何技能。合法，但极容易误操作，故要求
        // 调用方显式确认；面板在弹确认框后带上这个标记。
        if (enabled === true && body.confirmEmpty !== true) {
          const current = await workspaces.policyOf(workspaceId)
          const nextGroups = groups ?? current?.groups ?? []
          const nextSkills = skills ?? current?.skills ?? []
          if (nextGroups.length === 0 && nextSkills.length === 0) {
            writeError(res, 409, 'an empty whitelist hides every skill in this workspace; resend with confirmEmpty: true to confirm')
            return
          }
        }

        try {
          const policy = await workspaces.savePolicy(workspaceId, {
            ...(enabled !== undefined ? { enabled } : {}),
            ...(groups !== undefined ? { groups } : {}),
            ...(skills !== undefined ? { skills } : {}),
          })
          workspaces.notifyPolicyChanged()
          writeJson(res, 200, { ok: true, policy } satisfies WorkspaceSaveResponse)
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },
  ]
}
