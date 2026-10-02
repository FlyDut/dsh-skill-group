/**
 * useScopeFlow — 模式域：preset 名单加载 + 某个模式的可见性策略编辑。
 *
 * 草稿状态机（勾选/预览/保存/重置/确认框）由 `usePolicyDraft` 提供，这里只补
 * 模式域独有的两件事：拉 `PresetsResponse`、把保存/重置打到 `/scope` 接口。
 */

import { useCallback, useState } from 'react'
import type { CatalogResponse, GroupsResponse, PresetsResponse, PresetScopeRow } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { usePolicyDraft, type PolicyDraftApi } from './usePolicyDraft.ts'
import type { FlowNotices } from './shared.ts'

export function useScopeFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 分组数据（场景 tag + 来源集合），由分组域提供。 */
  groupsState: GroupsResponse | null,
  /** 目录（技能清单与来源），由目录域提供。 */
  catalog: CatalogResponse | null,
): {
  scopeState: PresetsResponse | null
  scopeBusy: boolean
  editingPreset: PresetScopeRow | null
  loadScopes: () => Promise<void>
  beginScopeEdit: (row: PresetScopeRow) => void
  cancelScopeEdit: () => void
  draft: PolicyDraftApi
} {
  const [scopeState, setScopeState] = useState<PresetsResponse | null>(null)

  /** 加载模式名单与每个模式的策略/计数。 */
  const loadScopes = useCallback(async (): Promise<void> => {
    try {
      setScopeState(await api.presets())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  // 适配器只做"翻译"：草稿机给主体 id 与白名单，这里换成 /scope 的请求体。
  const draft = usePolicyDraft<PresetScopeRow>({
    save: async (presetId, body) => {
      await api.saveScope({
        presetId,
        enabled: body.enabled,
        groups: body.groups,
        skills: body.skills,
        ...(body.confirmEmpty ? { confirmEmpty: true } : {}),
      })
    },
    reset: async (presetId) => { await api.saveScope({ presetId, reset: true }) },
    reload: loadScopes,
  }, shared, groupsState, catalog)

  return {
    scopeState,
    scopeBusy: draft.busy,
    editingPreset: draft.editing,
    loadScopes,
    beginScopeEdit: draft.beginEdit,
    cancelScopeEdit: draft.cancelEdit,
    draft,
  }
}
