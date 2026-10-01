/**
 * useScopeFlow — 模式域：preset 名单加载 + 某个模式的可见性策略编辑。
 *
 * 草稿状态机（勾选/预览/保存/重置/确认框）由 `usePolicyDraft` 提供，这里只补
 * 模式域独有的三件事：拉 `PresetsResponse`、把保存/重置打到 `/scope` 接口、
 * 以及"哪些分组被哪些已启用的模式当白名单用"（场景/来源卡片上的徽章）。
 */

import { useCallback, useMemo, useState } from 'react'
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
  scopeModesByKey: ReadonlyMap<string, readonly string[]>
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

  /**
   * 分组键 → 引用了它的模式显示名（只统计**已启用**隔离的模式）。
   * 场景/来源卡片据此打一枚只读徽章，让"这个分组被哪些模式当白名单用"可见。
   */
  const scopeModesByKey = useMemo((): ReadonlyMap<string, readonly string[]> => {
    const map = new Map<string, string[]>()
    for (const row of scopeState?.presets ?? []) {
      if (!row.policy.enabled) continue
      const label = row.name ?? row.id
      for (const key of row.policy.groups) {
        const list = map.get(key)
        if (list === undefined) map.set(key, [label])
        else if (!list.includes(label)) list.push(label)
      }
    }
    return map
  }, [scopeState])

  return {
    scopeState,
    scopeBusy: draft.busy,
    editingPreset: draft.editing,
    scopeModesByKey,
    loadScopes,
    beginScopeEdit: draft.beginEdit,
    cancelScopeEdit: draft.cancelEdit,
    draft,
  }
}
