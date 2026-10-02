/**
 * usePolicyDraft — 「可见性策略编辑器」的共用草稿机。
 *
 * 模式（`useScopeFlow`）与工作区（`useWorkspaceFlow`）编辑的是同一种东西：
 * 一份 `{ enabled, groups, skills }` 白名单，勾选 → 本地预览 → 保存落盘。
 * 差异只有三处，全部由调用方以 `PolicyDraftAdapter` 注入：
 *   · 保存/重置打到哪个接口（presetId vs workspaceId）；
 *   · 保存成功后重新拉哪份名单；
 *   · 行上的文案与状态（列表态，不在这里）。
 * 于是草稿状态机、纯本地预览、空白名单确认这一整套只写一遍。
 *
 * 预览是**本地纯计算**（复用 `domain/scope-policy` 的展开函数），所以勾选时立即
 * 有反馈、不需要往返服务端；服务端返回的计数用于列表行，两侧共用同一份判定语义，
 * 不会出现"预览说 3 个、实际隐藏 2 个"。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { CatalogResponse, GroupsResponse, PolicyEntries } from '../../../protocol.ts'
import { collectionKey, sourceKey, tagKey } from '../../../protocol.ts'
import { expandScopePolicy, type ExpandedScope, type ScopeGroupIndex } from '../../../domain/scope-policy.ts'
import { runFlow, type FlowNotices } from './shared.ts'

/** 可被编辑的主体：一个 id + 一份已保存的策略（`PresetScopeRow` / `WorkspaceScopeRow` 都满足）。 */
export interface PolicySubjectRow {
  id: string
  policy: PolicyEntries
}

/** 主题相关的三个动作：草稿机只负责"何时调"，不关心"打到哪"。 */
export interface PolicyDraftAdapter {
  /** 保存草稿；`confirmEmpty` 表示用户已在确认框里同意"空白名单"。 */
  save(subjectId: string, body: { enabled: boolean; groups: string[]; skills: string[]; confirmEmpty: boolean }): Promise<void>
  /** 删除策略，回到不限制。 */
  reset(subjectId: string): Promise<void>
  /** 保存/重置成功后重新拉列表。 */
  reload(): Promise<void>
}

/** 编辑器底部需要用户拍板的两种情况。 */
export type PolicyConfirm = 'empty' | 'reset'

/** 编辑器需要的一切（`PolicyEditorView` 只认这个形状，不认它来自模式还是工作区）。 */
export interface PolicyDraftApi {
  /** 正在编辑的主体；null = 列表态。 */
  editing: PolicySubjectRow | null
  /** 保存/重置进行中。 */
  busy: boolean
  enabled: boolean
  groups: ReadonlySet<string>
  skills: ReadonlySet<string>
  confirm: PolicyConfirm | null
  saved: boolean
  /** 草稿展开后的可见性（分组选项与悬空键提示的数据源）。 */
  preview: ExpandedScope | null
  /** 目录中的全部技能名（升序）。 */
  allNames: string[]
  beginEdit(row: PolicySubjectRow): void
  cancelEdit(): void
  toggleGroup(key: string, checked: boolean): void
  toggleSkill(name: string, checked: boolean): void
  setSelection(kind: 'groups' | 'skills', keys: readonly string[], checked: boolean): void
  setEnabled(enabled: boolean): void
  setConfirm(confirm: PolicyConfirm | null): void
  /** 保存入口：空白名单是一个"看不到任何技能"的强隔离，必须先确认。 */
  requestSave(confirmEmpty?: boolean): void
  /** 重置入口：先弹确认框。 */
  requestReset(): void
  /** 已确认过的重置。 */
  resetNow(): Promise<void>
}

/** 编辑器里的分组勾选项：键、显示名、成员数与所属类别。 */
export interface ScopeGroupOption {
  key: string
  label: string
  kind: 'tag' | 'col' | 'src'
  count: number
}

/**
 * 分组键 → 成员：场景、来源集合、来源根三类，与宿主侧同一份口径。
 * @param groupsState - 分组数据（场景 tag + 来源集合）。
 * @param catalog - 目录（来源根与已知技能名都从这里推）。
 */
export function buildPolicyGroupIndex(groupsState: GroupsResponse | null, catalog: CatalogResponse | null): ScopeGroupIndex {
  const members = new Map<string, readonly string[]>()
  for (const tag of groupsState?.tags ?? []) members.set(tagKey(tag.id), tag.skillNames)
  for (const collection of groupsState?.collections ?? []) members.set(collectionKey(collection.name), collection.skillNames)
  const bySource = new Map<string, string[]>()
  const known = new Set<string>()
  for (const skill of catalog?.skills ?? []) {
    known.add(skill.name)
    const list = bySource.get(skill.source)
    if (list === undefined) bySource.set(skill.source, [skill.name])
    else list.push(skill.name)
  }
  for (const [source, names] of bySource) members.set(sourceKey(source), names)
  return { members, known }
}

/**
 * 把分组数据摊平成勾选列表（场景 → 集合 → 来源根，与侧栏顺序一致）。
 * @param groupsState - 分组数据。
 * @param catalog - 目录（来源根的成员数与名称都从这里推）。
 * @param preview - 当前草稿的展开结果（用来显示每个分组贡献了几个技能）。
 * @returns 勾选项列表。
 */
export function scopeGroupOptions(
  groupsState: GroupsResponse | null,
  catalog: CatalogResponse | null,
  preview: { resolved: Record<string, string[]> } | null,
): ScopeGroupOption[] {
  const options: ScopeGroupOption[] = []
  for (const tag of groupsState?.tags ?? []) {
    options.push({ key: tagKey(tag.id), label: tag.name, kind: 'tag', count: (preview?.resolved[tagKey(tag.id)] ?? tag.skillNames).length })
  }
  for (const collection of groupsState?.collections ?? []) {
    options.push({ key: collectionKey(collection.name), label: collection.name, kind: 'col', count: (preview?.resolved[collectionKey(collection.name)] ?? collection.skillNames).length })
  }
  const bySource = new Map<string, number>()
  for (const skill of catalog?.skills ?? []) bySource.set(skill.source, (bySource.get(skill.source) ?? 0) + 1)
  for (const [source, count] of [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    options.push({ key: sourceKey(source), label: source, kind: 'src', count })
  }
  return options
}

/**
 * 管理一份可见性草稿：加载由调用方负责，这里只管"编辑中的那一个主体"。
 * @param adapter - 主题相关的保存/重置/重载动作（对象每次渲染重建没关系，内部按 ref 取最新的）。
 * @param shared - 跨域通知原语。
 * @param groupsState - 分组数据。
 * @param catalog - 目录。
 */
export function usePolicyDraft<Row extends PolicySubjectRow>(
  adapter: PolicyDraftAdapter,
  shared: FlowNotices,
  groupsState: GroupsResponse | null,
  catalog: CatalogResponse | null,
): PolicyDraftApi & { editing: Row | null } {
  // 动作对象与当前主体都走 ref：回调不必随它们重建，也不会读到过期的行。
  const adapterRef = useRef(adapter)
  adapterRef.current = adapter
  const editingRef = useRef<Row | null>(null)

  const [editing, setEditing] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabledState] = useState(false)
  const [groups, setGroups] = useState<ReadonlySet<string>>(new Set())
  const [skills, setSkills] = useState<ReadonlySet<string>>(new Set())
  const [confirm, setConfirm] = useState<PolicyConfirm | null>(null)
  const [saved, setSaved] = useState(false)

  /** 打开编辑器，并把已保存的策略灌进草稿。 */
  const beginEdit = useCallback((row: Row): void => {
    editingRef.current = row
    setEditing(row)
    setEnabledState(row.policy.enabled)
    setGroups(new Set(row.policy.groups))
    setSkills(new Set(row.policy.skills))
    setConfirm(null)
    setSaved(false)
    shared.clearFail()
  }, [shared])

  /** 离开编辑器（不保存草稿）。 */
  const cancelEdit = useCallback((): void => {
    editingRef.current = null
    setEditing(null)
    setConfirm(null)
  }, [])

  const groupIndex = useMemo(() => buildPolicyGroupIndex(groupsState, catalog), [groupsState, catalog])

  /** 草稿策略展开后的可见性（编辑器预览的唯一数据源）。 */
  const preview = useMemo(() => {
    if (editing === null) return null
    return expandScopePolicy({ enabled, groups: [...groups], skills: [...skills] }, groupIndex)
  }, [editing, enabled, groups, skills, groupIndex])

  /** 目录中的全部技能名（升序），供单技能勾选列表使用。 */
  const allNames = useMemo(() => [...groupIndex.known].sort((a, b) => a.localeCompare(b)), [groupIndex])

  const toggleGroup = useCallback((key: string, checked: boolean): void => {
    setSaved(false)
    setGroups((previous) => {
      const next = new Set(previous)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const toggleSkill = useCallback((name: string, checked: boolean): void => {
    setSaved(false)
    setSkills((previous) => {
      const next = new Set(previous)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }, [])

  const setSelection = useCallback((kind: 'groups' | 'skills', keys: readonly string[], checked: boolean): void => {
    setSaved(false)
    const apply = (previous: ReadonlySet<string>): ReadonlySet<string> => {
      const next = new Set(previous)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    }
    if (kind === 'groups') setGroups(apply)
    else setSkills(apply)
  }, [])

  /** 启用开关：草稿态，保存才落地。 */
  const setEnabled = useCallback((next: boolean): void => {
    setSaved(false)
    setEnabledState(next)
  }, [])

  /** 落盘草稿：保存 → 重载列表 → 标记"已保存"（留在编辑器里）。 */
  const save = useCallback(async (confirmEmpty = false): Promise<void> => {
    const row = editingRef.current
    if (row === null) return
    setConfirm(null)
    setBusy(true)
    // 悬空的分组键原样送出、不替用户删数据：面板已经把它们标出来了，
    // 而且一个分组可能只是"暂时没有成员"（例如它的技能都被临时禁用）。
    await runFlow(shared, async () => {
      await adapterRef.current.save(row.id, { enabled, groups: [...groups], skills: [...skills], confirmEmpty })
      await adapterRef.current.reload()
      setSaved(true)
    }, () => { setBusy(false) })
  }, [enabled, groups, skills, shared])

  /** 重置：删除策略，回到不限制。 */
  const resetNow = useCallback(async (): Promise<void> => {
    const row = editingRef.current
    if (row === null) return
    setConfirm(null)
    setBusy(true)
    await runFlow(shared, async () => {
      await adapterRef.current.reset(row.id)
      await adapterRef.current.reload()
      setEnabledState(false)
      setGroups(new Set())
      setSkills(new Set())
      setSaved(false)
    }, () => { setBusy(false) })
  }, [shared])

  const requestSave = useCallback((confirmEmpty = false): void => {
    if (enabled && groups.size === 0 && skills.size === 0 && !confirmEmpty) {
      setConfirm('empty')
      return
    }
    void save(confirmEmpty)
  }, [enabled, groups, skills, save])

  const requestReset = useCallback((): void => { setConfirm('reset') }, [])

  return {
    editing,
    busy,
    enabled,
    groups,
    skills,
    confirm,
    saved,
    preview,
    allNames,
    beginEdit,
    cancelEdit,
    toggleGroup,
    toggleSkill,
    setSelection,
    setEnabled,
    setConfirm,
    requestSave,
    requestReset,
    resetNow,
  }
}
