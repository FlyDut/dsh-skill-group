/**
 * useWorkspaceFlow — 工作区域：DSH 工作区名单加载 + 某个工作区的可见性策略编辑。
 *
 * 与 `useScopeFlow` 完全对称：草稿状态机共用 `usePolicyDraft`，这里只补工作区域
 * 独有的部分——拉 `WorkspacesResponse`、把保存/重置打到 `/workspace` 接口。
 *
 * 与模式的一处语义差异：工作区隔离**没有接线等待**。闸门按 preset 作用域注入，
 * 隐藏集合在每次技能查找时按会话的 cwd 现算，所以只要策略启用、下一次查找即生效。
 */

import { useCallback, useState } from 'react'
import type { CatalogResponse, GroupsResponse, WorkspacesResponse, WorkspaceScopeRow } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { usePolicyDraft, type PolicyDraftApi } from './usePolicyDraft.ts'
import type { FlowNotices } from './shared.ts'

export function useWorkspaceFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 分组数据（场景 tag + 来源集合），由分组域提供。 */
  groupsState: GroupsResponse | null,
  /** 目录（技能清单与来源），由目录域提供。 */
  catalog: CatalogResponse | null,
): {
  workspaceState: WorkspacesResponse | null
  workspaceBusy: boolean
  editingWorkspace: WorkspaceScopeRow | null
  loadWorkspaces: () => Promise<void>
  beginWorkspaceEdit: (row: WorkspaceScopeRow) => void
  cancelWorkspaceEdit: () => void
  draft: PolicyDraftApi
} {
  const [workspaceState, setWorkspaceState] = useState<WorkspacesResponse | null>(null)

  /** 加载工作区名单与每个工作区的策略/计数。 */
  const loadWorkspaces = useCallback(async (): Promise<void> => {
    try {
      setWorkspaceState(await api.workspaces())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  // 适配器只做"翻译"：草稿机给主体 id 与白名单，这里换成 /workspace 的请求体。
  const draft = usePolicyDraft<WorkspaceScopeRow>({
    save: async (workspaceId, body) => {
      await api.saveWorkspace({
        workspaceId,
        enabled: body.enabled,
        groups: body.groups,
        skills: body.skills,
        ...(body.confirmEmpty ? { confirmEmpty: true } : {}),
      })
    },
    reset: async (workspaceId) => { await api.saveWorkspace({ workspaceId, reset: true }) },
    reload: loadWorkspaces,
  }, shared, groupsState, catalog)

  return {
    workspaceState,
    workspaceBusy: draft.busy,
    editingWorkspace: draft.editing,
    loadWorkspaces,
    beginWorkspaceEdit: draft.beginEdit,
    cancelWorkspaceEdit: draft.cancelEdit,
    draft,
  }
}
