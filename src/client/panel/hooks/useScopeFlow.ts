/**
 * useScopeFlow — 模式域：preset 名单加载、某个模式的可见性草稿、保存与重置。
 *
 * 草稿的可见性预览是**本地纯计算**（复用 `domain/scope-policy` 的展开函数），
 * 所以勾选时立即有反馈，不需要往返服务端；服务端返回的计数用于列表行，
 * 两侧共用同一份判定语义，不会出现"预览说 3 个、实际隐藏 2 个"。
 */

import { useCallback, useMemo, useState } from 'react'
import type { CatalogResponse, GroupsResponse, PresetsResponse, PresetScopeRow } from '../../../protocol.ts'
import { collectionKey, sourceKey, tagKey } from '../../../protocol.ts'
import { expandScopePolicy, type ScopeGroupIndex } from '../../../domain/scope-policy.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { runFlow, type FlowNotices } from './shared.ts'

/** 编辑器底部需要用户拍板的两种情况。 */
export type ScopeConfirm = 'empty' | 'reset'

export function useScopeFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 分组数据（场景 tag + 来源集合），由分组域提供。 */
  groupsState: GroupsResponse | null,
  /** 目录（技能清单与来源），由目录域提供。 */
  catalog: CatalogResponse | null,
) {
  const [scopeState, setScopeState] = useState<PresetsResponse | null>(null)
  const [scopeBusy, setScopeBusy] = useState(false)
  /** 正在配置的模式；null = 列表态。 */
  const [editingPreset, setEditingPreset] = useState<PresetScopeRow | null>(null)
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [draftGroups, setDraftGroups] = useState<ReadonlySet<string>>(new Set())
  const [draftSkills, setDraftSkills] = useState<ReadonlySet<string>>(new Set())
  const [draftSearch, setDraftSearch] = useState('')
  const [scopeConfirm, setScopeConfirm] = useState<ScopeConfirm | null>(null)
  const [scopeSaved, setScopeSaved] = useState(false)

  /** 加载模式名单与每个模式的策略/计数。 */
  const loadScopes = useCallback(async (): Promise<void> => {
    try {
      setScopeState(await api.presets())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  /** 打开某个模式的编辑器，并把已保存的策略灌进草稿。 */
  const beginScopeEdit = useCallback((row: PresetScopeRow): void => {
    setEditingPreset(row)
    setDraftEnabled(row.policy.enabled)
    setDraftGroups(new Set(row.policy.groups))
    setDraftSkills(new Set(row.policy.skills))
    setDraftSearch('')
    setScopeSaved(false)
    shared.clearFail()
  }, [shared])

  /** 离开编辑器（不保存草稿）。 */
  const cancelScopeEdit = useCallback((): void => {
    setEditingPreset(null)
    setScopeConfirm(null)
    setDraftSearch('')
  }, [])

  /** 分组键 → 成员：场景、来源集合、来源根三类，与宿主侧同一份口径。 */
  const scopeGroupIndex = useMemo((): ScopeGroupIndex => {
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
  }, [groupsState, catalog])

  /** 草稿策略展开后的可见性（编辑器预览的唯一数据源）。 */
  const scopePreview = useMemo(() => {
    if (editingPreset === null) return null
    const policy = { presetId: editingPreset.id, enabled: draftEnabled, groups: [...draftGroups], skills: [...draftSkills] }
    return expandScopePolicy(policy, scopeGroupIndex)
  }, [editingPreset, draftEnabled, draftGroups, draftSkills, scopeGroupIndex])

  /** 目录中的全部技能名（升序），用于算隐藏集合。 */
  const scopeAllNames = useMemo(
    () => [...scopeGroupIndex.known].sort((a, b) => a.localeCompare(b)),
    [scopeGroupIndex],
  )

  /** 草稿开启隔离后会隐藏的技能名。 */
  const scopeHiddenNames = useMemo(() => {
    if (scopePreview === null || !draftEnabled) return []
    return scopeAllNames.filter((name) => !scopePreview.visibleSet.has(name))
  }, [scopePreview, draftEnabled, scopeAllNames])

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

  /** 勾选/取消一个分组键。 */
  const toggleScopeGroup = useCallback((key: string, checked: boolean): void => {
    setScopeSaved(false)
    setDraftGroups((previous) => {
      const next = new Set(previous)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  /** 勾选/取消一个技能名。 */
  const toggleScopeSkill = useCallback((name: string, checked: boolean): void => {
    setScopeSaved(false)
    setDraftSkills((previous) => {
      const next = new Set(previous)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }, [])

  /** 整批勾选（分组或技能列表的全选/清空）。 */
  const setScopeSelection = useCallback((kind: 'groups' | 'skills', keys: readonly string[], checked: boolean): void => {
    setScopeSaved(false)
    const apply = (previous: ReadonlySet<string>): ReadonlySet<string> => {
      const next = new Set(previous)
      for (const key of keys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return next
    }
    if (kind === 'groups') setDraftGroups(apply)
    else setDraftSkills(apply)
  }, [])

  /** 启用开关：草稿态，保存才落地。 */
  const setScopeEnabled = useCallback((enabled: boolean): void => {
    setScopeSaved(false)
    setDraftEnabled(enabled)
  }, [])

  /**
   * 保存草稿。
   * @param confirmEmpty - 用户已在确认框里同意"空白名单 = 该模式看不到任何技能"。
   */
  const saveScope = useCallback(async (confirmEmpty = false): Promise<void> => {
    if (editingPreset === null) return
    setScopeConfirm(null)
    setScopeBusy(true)
    // 悬空的分组键原样送出、不替用户删数据：面板已经把它们标出来了，
    // 而且一个分组可能只是"暂时没有成员"（例如它的技能都被临时禁用）。
    await runFlow(shared, async () => {
      await api.saveScope({
        presetId: editingPreset.id,
        enabled: draftEnabled,
        groups: [...draftGroups],
        skills: [...draftSkills],
        ...(confirmEmpty ? { confirmEmpty: true } : {}),
      })
      await loadScopes()
      setScopeSaved(true)
    }, () => { setScopeBusy(false) })
  }, [api, editingPreset, draftEnabled, draftGroups, draftSkills, loadScopes, shared])

  /** 重置该模式：删除策略，回到不限制。 */
  const resetScope = useCallback(async (): Promise<void> => {
    if (editingPreset === null) return
    setScopeConfirm(null)
    setScopeBusy(true)
    await runFlow(shared, async () => {
      await api.saveScope({ presetId: editingPreset.id, reset: true })
      await loadScopes()
      setDraftEnabled(false)
      setDraftGroups(new Set())
      setDraftSkills(new Set())
      setScopeSaved(false)
    }, () => { setScopeBusy(false) })
  }, [api, editingPreset, loadScopes, shared])

  /**
   * 保存入口：空白名单是一个"看不到任何技能"的强隔离，必须先确认。
   * @param confirmEmpty - 已经确认过就跳过二次确认。
   */
  const requestSaveScope = useCallback((confirmEmpty = false): void => {
    if (draftEnabled && draftGroups.size === 0 && draftSkills.size === 0 && !confirmEmpty) {
      setScopeConfirm('empty')
      return
    }
    void saveScope(confirmEmpty)
  }, [draftEnabled, draftGroups, draftSkills, saveScope])

  const requestResetScope = useCallback((): void => { setScopeConfirm('reset') }, [])

  return {
    scopeState,
    scopeBusy,
    editingPreset,
    draftEnabled,
    draftGroups,
    draftSkills,
    draftSearch,
    scopeConfirm,
    scopeSaved,
    scopePreview,
    scopeAllNames,
    scopeHiddenNames,
    scopeModesByKey,
    loadScopes,
    beginScopeEdit,
    cancelScopeEdit,
    toggleScopeGroup,
    toggleScopeSkill,
    setScopeSelection,
    setScopeEnabled,
    setDraftSearch,
    setScopeConfirm,
    requestSaveScope,
    requestResetScope,
    resetScope,
  }
}

/** 编辑器里的分组勾选项：键、显示名、成员数与所属类别。 */
export interface ScopeGroupOption {
  key: string
  label: string
  kind: 'tag' | 'col' | 'src'
  count: number
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
