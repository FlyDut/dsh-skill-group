/**
 * 模式域路由：preset 名单 + 每条的接线状态与策略（GET /presets）、可见性展开
 * 明细（GET /scope/preview）、策略写入（POST /scope）。
 *
 * 这一层只做三件事：参数校验、把宿主接口的读数投影成契约形状、错误映射成
 * 4xx。策略语义与运行时效果分别在 `domain/` 与 `enforcement/`，此处不复制。
 *
 * 能力缺席（部署里没有 agent-presets / dsh-scope）时不是错误：/presets 老实地
 * 报告 `available: false` 与原因，写入口返回 503——面板据此把「模式」tab 降级
 * 为只读，而插件其余功能毫无感知。
 */

import {
  PRESET_ID_RE,
  SKILL_HUB_API,
  cleanKeys,
  cleanNames,
  type PresetsResponse,
  type PresetScopeRow,
  type ScopePreviewResponse,
  type ScopeSaveResponse,
} from '../protocol.ts'
import {
  readString,
  writeError,
  writeJson,
  writeRouteError,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

/** 模式域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function scopeRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // -------------------------------------------------------------- presets
    // preset 名单 + 每个模式的策略、展开计数与接线状态（面板「模式」tab 的数据源）。
    {
      path: SKILL_HUB_API.presets,
      methods: ['GET'],
      handler: async ({ res }) => {
        const scopes = deps.scopes
        if (scopes === undefined) {
          writeJson(res, 200, { ok: true, available: false, unavailableReason: 'mode isolation is not wired in this deployment', presets: [], pendingCount: 0 } satisfies PresetsResponse)
          return
        }
        const snapshot = await scopes.presets()
        const presets: PresetScopeRow[] = []
        for (const entry of snapshot.entries) {
          const [policy, visibility] = await Promise.all([scopes.policyOf(entry.id), scopes.visibilityOf(entry.id)])
          presets.push({
            id: entry.id,
            ...(entry.name !== undefined ? { name: entry.name } : {}),
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            trust: entry.trust,
            isDefault: entry.isDefault,
            mounted: snapshot.mounted.includes(entry.id),
            gateActive: snapshot.active.includes(entry.id),
            policy: policy ?? { presetId: entry.id, enabled: false, groups: [], skills: [] },
            visibleCount: visibility.visible.length,
            hiddenCount: visibility.hidden.length,
          })
        }
        writeJson(res, 200, {
          ok: true,
          available: snapshot.available,
          ...(snapshot.reason !== undefined ? { unavailableReason: snapshot.reason } : {}),
          presets,
          // 已启用隔离但还没接上闸门的模式数——面板据此提示"需要一次会话激活"。
          pendingCount: presets.filter((row) => row.policy.enabled && !row.gateActive).length,
        } satisfies PresetsResponse)
      },
    },
    // -------------------------------------------------------- scope/preview
    // 单个模式的可见性展开明细：面板解释"哪些技能会被隐藏、每个分组贡献了什么"。
    {
      path: SKILL_HUB_API.scopePreview,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const scopes = deps.scopes
        if (scopes === undefined) { writeError(res, 503, 'mode isolation is not wired in this deployment'); return }
        const presetId = (url.searchParams.get('presetId') ?? '').trim()
        if (!PRESET_ID_RE.test(presetId)) { writeError(res, 400, 'presetId is required and must be a valid preset id'); return }
        const [policy, visibility] = await Promise.all([scopes.policyOf(presetId), scopes.visibilityOf(presetId)])
        writeJson(res, 200, {
          ok: true,
          presetId,
          enabled: policy?.enabled === true,
          visible: visibility.visible,
          hidden: visibility.hidden,
          dangling: visibility.dangling,
          resolved: visibility.resolved,
        } satisfies ScopePreviewResponse)
      },
    },
    // ---------------------------------------------------------------- scope
    // 写入策略。这是唯一会让某个模式"真的开始少看见技能"的入口，因此
    // enabled 与清单必须一起被显式表达，缺省一律保持现值（不做隐式开启）。
    {
      path: SKILL_HUB_API.scope,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const scopes = deps.scopes
        if (scopes === undefined) { writeError(res, 503, 'mode isolation is not wired in this deployment'); return }
        const presetId = readString(body, 'presetId').trim()
        if (!PRESET_ID_RE.test(presetId)) { writeError(res, 400, 'presetId is required and must be a valid preset id'); return }

        if (body.reset === true) {
          await scopes.deletePolicy(presetId)
          scopes.notifyPolicyChanged(presetId)
          writeJson(res, 200, { ok: true, policy: null } satisfies ScopeSaveResponse)
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

        // 白名单为空 + 启用 = 该模式看不到任何技能。合法，但极容易误操作，故要求
        // 调用方显式确认；面板在弹确认框后带上这个标记。
        if (enabled === true && body.confirmEmpty !== true) {
          const current = await scopes.policyOf(presetId)
          const nextGroups = groups ?? current?.groups ?? []
          const nextSkills = skills ?? current?.skills ?? []
          if (nextGroups.length === 0 && nextSkills.length === 0) {
            writeError(res, 409, 'an empty whitelist hides every skill in this preset; resend with confirmEmpty: true to confirm')
            return
          }
        }

        try {
          const policy = await scopes.savePolicy(presetId, {
            ...(enabled !== undefined ? { enabled } : {}),
            ...(groups !== undefined ? { groups } : {}),
            ...(skills !== undefined ? { skills } : {}),
          })
          scopes.notifyPolicyChanged(presetId)
          writeJson(res, 200, { ok: true, policy } satisfies ScopeSaveResponse)
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },
  ]
}
