/**
 * useGroupFlow — 分组域：groups 加载、tag 新建/删除/成员、
 * 组开关与冲突解决。目录侧只消费 batchToggleNames +
 * actionNames（聚合根传入），不碰目录 state。
 */

import { useCallback, useState, type FormEvent } from 'react'
import type { GroupsResponse, SkillTag } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { conflictsOnClose, type GroupSwitchState } from '../../grouping.ts'
import { runFlow, type FlowNotices } from './shared.ts'
import type { ConflictDialogState } from '../dialogs.tsx'

export function useGroupFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 整组开关的执行器（目录域提供，stable）。 */
  batchToggleNames: (names: string[], enabled: boolean) => Promise<void>,
  /** 目录里存在的技能名：组开关能作用的范围（目录域派生）。 */
  actionNames: ReadonlySet<string>,
  /** 当前开启的技能名：判断「关闭会牵连别的组」时只看真正开着的成员。 */
  enabledNames: ReadonlySet<string>,
) {
  const [groupsState, setGroupsState] = useState<GroupsResponse | null>(null)
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null)
  const [editingTag, setEditingTag] = useState<SkillTag | null>(null)
  const [editName, setEditName] = useState('')
  const [membersDraft, setMembersDraft] = useState<ReadonlySet<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')
  const [editSearch, setEditSearch] = useState('')

  /** 加载用户 tag 分组 + 系统集合组 + origin 映射。 */
  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      setGroupsState(await api.groups())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  /** 把最新的 tag 列表合并进 groups 状态（tags 以外的字段保持原样）。 */
  const applyTags = useCallback((tags: SkillTag[]): void => {
    setGroupsState((previous) => previous === null
      ? { ok: true, tags, collections: [], origins: {} }
      : { ...previous, tags })
  }, [])

  /** 所有分组：key → 成员名（tag 与来源集合）。 */
  const groupMap = useCallback((): Map<string, string[]> => {
    const map = new Map<string, string[]>()
    for (const tag of groupsState?.tags ?? []) map.set('tag:' + tag.id, tag.skillNames)
    for (const collection of groupsState?.collections ?? []) map.set('col:' + collection.name, collection.skillNames)
    return map
  }, [groupsState])

  /**
   * Toggle a whole group via its tri-state switch. Closing with members that
   * are enabled in other groups opens the conflict dialog instead.
   */
  const toggleGroup = useCallback((key: string, name: string, view: GroupSwitchState): void => {
    const members = groupMap().get(key) ?? []
    const known = members.filter((member) => actionNames.has(member))
    if (known.length === 0) return
    if (view === 'off') {
      void batchToggleNames(known, true)
      return
    }
    const others = [...groupMap().entries()].filter(([otherKey]) => otherKey !== key).map(([, memberNames]) => ({ members: memberNames }))
    const conflicts = conflictsOnClose(known, enabledNames, others)
    if (conflicts.length > 0) {
      setConflictDialog({ key, name, conflicts })
    } else {
      void batchToggleNames(known, false)
    }
  }, [groupMap, actionNames, enabledNames, batchToggleNames])

  /** Resolve the open conflict dialog. */
  const resolveConflict = useCallback(async (closeAll: boolean): Promise<void> => {
    const dialog = conflictDialog
    if (dialog === null) return
    setConflictDialog(null)
    const members = groupMap().get(dialog.key) ?? []
    if (closeAll) {
      await batchToggleNames(members.filter((member) => actionNames.has(member)), false)
    } else {
      await batchToggleNames(
        members.filter((member) => actionNames.has(member) && !dialog.conflicts.includes(member)),
        false,
      )
    }
  }, [conflictDialog, groupMap, actionNames, batchToggleNames])

  /** 新建一个空 tag 分组。 */
  const createTag = useCallback(async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const name = newTagName.trim()
    if (name === '') return
    shared.setTagBusy(true)
    await runFlow(shared, async () => {
      applyTags(await api.saveTag({ name }))
      setNewTagName('')
    }, () => shared.setTagBusy(false))
  }, [api, applyTags, newTagName, shared])

  /** 删除一个 tag 分组（不影响技能文件）。 */
  const deleteTag = useCallback(async (id: string): Promise<void> => {
    shared.setTagBusy(true)
    await runFlow(shared, async () => {
      applyTags(await api.deleteTag(id))
      setEditingTag(null)
    }, () => shared.setTagBusy(false))
  }, [api, applyTags, shared])

  /** 重命名 tag，或保存成员勾选后回到列表。 */
  const saveTag = useCallback(async (id: string, name: string, memberNames: string[] | null): Promise<void> => {
    shared.setTagBusy(true)
    await runFlow(shared, async () => {
      const safeName = name.trim()
      let tags: SkillTag[] | null = null
      if (safeName !== '') tags = await api.saveTag({ id, name: safeName })
      if (memberNames !== null) tags = await api.setTagMembers(id, memberNames)
      if (tags === null) return
      applyTags(tags)
      setEditingTag(null)
    }, () => shared.setTagBusy(false))
  }, [api, applyTags, shared])

  return {
    groupsState, conflictDialog, editingTag, editName, membersDraft, newTagName, editSearch,
    setConflictDialog, setEditingTag, setEditName, setMembersDraft, setNewTagName, setEditSearch,
    loadGroups, applyTags, groupMap, toggleGroup, resolveConflict,
    createTag, deleteTag, saveTag,
  }
}
