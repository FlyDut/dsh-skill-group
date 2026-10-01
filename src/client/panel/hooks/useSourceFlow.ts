/**
 * useSourceFlow — 来源域：来源列表、上游更新检查、同步确认。目录与分组的
 * 刷新经聚合根传入的 reload 回调，不直接碰其他域的 state。
 *
 * 本插件不替用户删除任何技能文件：上游删除只在「检查」结果里报告出来，
 * 本地清理由用户自己在文件系统里完成。
 */

import { useCallback, useState } from 'react'
import type {
  SourceCheckResult,
  SourcesResponse,
} from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { runFlow, type FlowNotices } from './shared.ts'
import type { ConfirmDialogState } from '../dialogs.tsx'

export function useSourceFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 目录重载（同步覆盖技能后刷新列表，目录域提供）。 */
  reloadCatalog: () => Promise<void>,
  /** 分组重载（来源/成员变化后刷新，分组域提供）。 */
  reloadGroups: () => Promise<void>,
) {
  const [sourcesState, setSourcesState] = useState<SourcesResponse | null>(null)
  const [sourceCheck, setSourceCheck] = useState<Readonly<Record<string, SourceCheckResult>>>({})
  const [checkingSource, setCheckingSource] = useState<string | null>(null)
  const [syncingSource, setSyncingSource] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  /** 加载来源记录 + 派生 origin 映射。 */
  const loadSources = useCallback(async (): Promise<void> => {
    try {
      setSourcesState(await api.sources())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  /**
   * 检查全部来源（或单个 repo）的上游更新（服务端 5 分钟节流）。
   *
   * 结果用函数式更新合并：并发检查（例如同时点两个来源的「检查」）若各自
   * 基于进来时的快照合并，后写的那次会抹掉前一次的结果；同时也去掉了对
   * `sourceCheck` 的依赖，让回调引用保持稳定。
   */
  const checkSources = useCallback(async (repo?: string): Promise<void> => {
    setCheckingSource(repo ?? 'all')
    await runFlow(shared, async () => {
      const result = await api.checkSources(repo)
      setSourceCheck((previous) => {
        const next: Record<string, SourceCheckResult> = { ...previous }
        for (const item of result.results) next[item.repo] = item
        return next
      })
    }, () => setCheckingSource(null))
  }, [api, shared])

  /** 请求同步某个来源的所选技能（弹确认，因为会覆盖本地修改）。 */
  const requestSync = useCallback((repo: string, skills: string[]): void => {
    setConfirmDialog({ repo, skills })
  }, [])

  /** Dismiss the confirm dialog and run the pending sync. */
  const runConfirmed = useCallback(async (): Promise<void> => {
    const dialog = confirmDialog
    if (dialog === null) return
    setConfirmDialog(null)
    setSyncingSource(dialog.repo)
    await runFlow(shared, async () => {
      const result = await api.syncSource(dialog.repo, dialog.skills)
      await Promise.all([reloadCatalog(), reloadGroups(), loadSources()])
      if (result.failed.length > 0) {
        shared.fail('sync: ' + result.failed.map((failure) => failure.name + ': ' + failure.error).join('; '))
      }
    }, () => setSyncingSource(null))
  }, [confirmDialog, api, reloadCatalog, reloadGroups, loadSources, shared])

  return {
    sourcesState, sourceCheck, checkingSource, syncingSource, confirmDialog,
    setConfirmDialog, loadSources, checkSources, requestSync, runConfirmed,
  }
}
