/**
 * useSkillHub — 面板的状态聚合根：只持有跨域共享的通知状态与纯视图状态，
 * 各域状态与动作分散在 ./hooks/*，这里按依赖顺序组装（meta → 目录 →
 * 分组 → 来源 → 市场），轮询与派生组装在此。All hooks run unconditionally
 * at the top, so the panel may early-return for the detail and tag-editor
 * views without violating the rules of hooks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillHubApi } from '../api.ts'
import { PRIVATE_SOURCE } from '../grouping.ts'
import { useMetaFlow } from './hooks/useMetaFlow.ts'
import { useCatalogFlow } from './hooks/useCatalogFlow.ts'
import { useGroupFlow } from './hooks/useGroupFlow.ts'
import { useSourceFlow } from './hooks/useSourceFlow.ts'
import { useMarketFlow } from './hooks/useMarketFlow.ts'
import { useScopeFlow } from './hooks/useScopeFlow.ts'
import { useWorkspaceFlow } from './hooks/useWorkspaceFlow.ts'
import { markAutoChecked, POLL_MS, shouldAutoCheck, SLOW_POLL_MS, type FlowNotices } from './hooks/shared.ts'

/** The hook's result: the panel's complete state + action surface. */
export type SkillHubState = ReturnType<typeof useSkillHub>

export function useSkillHub(api: SkillHubApi) {
  // ------------------------------------------------------- shared notices
  // 多域共用的报错/成功条幅与忙碌开关：setter 本身引用稳定，memo 常驻后
  // 各域回调依赖它不会失稳。
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Green success banner (create finished); shown outside the closing form. */
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  /**
   * 忙碌标志用计数器而非布尔：`setTagBusy` 被分组、市场、来源三个域共用（批量
   * 开关同理），两个操作重叠时先结束的那个会把布尔置回 false，让仍在跑的
   * 操作瞬间失去禁用态。
   */
  const [batchBusyCount, setBatchBusyCount] = useState(0)
  const [tagBusyCount, setTagBusyCount] = useState(0)
  const bumpTagBusy = useCallback((busy: boolean): void => {
    setTagBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)))
  }, [])
  const bumpBatchBusy = useCallback((busy: boolean): void => {
    setBatchBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)))
  }, [])
  const shared = useMemo<FlowNotices>(() => ({
    fail: (message: string) => setLoadError(message),
    clearFail: () => setLoadError(null),
    succeed: (message: string | null) => setSuccessBanner(message),
    setTagBusy: bumpTagBusy,
    setBatchBusy: bumpBatchBusy,
  }), [bumpTagBusy, bumpBatchBusy])
  const batchBusy = batchBusyCount > 0
  const tagBusy = tagBusyCount > 0

  // ------------------------------------------------------------ view state
  // 纯视图状态：不触发数据加载，只影响渲染。
  const [tab, setTab] = useState<'sources' | 'scenes' | 'market' | 'scopes' | 'workspaces'>('sources')
  const [skillView, setSkillView] = useState<'flat' | 'groups'>('groups')
  const [sourceFilter, setSourceFilter] = useState('all')
  /** 分组视图里收起的分组（key 为 tag:<id> 或 col:<name>）。技能总数 >80 时首次加载自动折叠 personal。 */
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set())
  const [showLegend, setShowLegend] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const toggleGroupCollapse = useCallback((key: string): void => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /** 整组折叠/展开：传 null 全部展开，传键列表全部折叠（视图侧自己算键）。 */
  const setAllGroupsCollapsed = useCallback((keys: readonly string[] | null): void => {
    setCollapsedGroups(keys === null ? new Set() : new Set(keys))
  }, [])

  const collapsePersonal = useCallback((): void => {
    setCollapsedGroups((previous) => new Set(previous).add('uncategorized-source'))
  }, [])

  const clearSourceFilter = useCallback((): void => {
    setSourceFilter('all')
  }, [])

  // ------------------------------------------------------------ meta first
  // 更新检查/统计/配置只依赖 api，最先组装。
  const meta = useMetaFlow(api)

  // ---------------------------------------------------------------- catalog
  const catalogFlow = useCatalogFlow(api, meta.uses, shared, collapsePersonal, clearSourceFilter)

  // ----------------------------------------------------------------- groups
  const groupFlow = useGroupFlow(api, shared, catalogFlow.batchToggleNames, catalogFlow.actionNames, catalogFlow.viewNames)

  // ----------------------------------------------------------------- sources
  const sourceFlow = useSourceFlow(api, shared, catalogFlow.load, groupFlow.loadGroups)

  // ------------------------------------------------------------------ market
  const marketFlow = useMarketFlow(
    api,
    shared,
    catalogFlow.load,
    groupFlow.loadGroups,
    sourceFlow.loadSources,
    sourceFlow.checkSources,
    sourceFlow.sourceCheck,
  )

  // --------------------------------------------------- modes + workspaces
  // 两个可见性域消费同一份分组（勾选项）与目录（技能清单），所以排在它们之后。
  // 它们各自编辑一份策略；会话实际看到的是两边取并集（宿主侧合成），面板只展示。
  const scopeFlow = useScopeFlow(api, shared, groupFlow.groupsState, catalogFlow.catalog)
  const workspaceFlow = useWorkspaceFlow(api, shared, groupFlow.groupsState, catalogFlow.catalog)

  // ------------------------------------------------------------- derived
  /** skillName → origin repo（无来源记录的技能不在此映射中，筛选中视为 private）。 */
  const origins = groupFlow.groupsState?.origins ?? {}
  /** 来源筛选选项：来源记录中的仓库（排序）+ 末尾的「个人」；没有技能的仓库不列。 */
  const sourceOptions = useMemo(() => {
    const skills = catalogFlow.catalog?.skills ?? []
    const repos = [...new Set(skills.map((skill) => origins[skill.name]).filter((repo): repo is string => repo !== undefined))].sort()
    const hasPrivate = skills.some((skill) => origins[skill.name] === undefined)
    return [...repos, ...(hasPrivate ? [PRIVATE_SOURCE] : [])]
  }, [catalogFlow.catalog, origins])

  // 初始全量加载 + 双速轮询：目录是「活视图」（文件变化要 5 秒内可见），
  // 统计/分组/来源/配置变化慢，60 秒一次足够；写操作本身会触发即时刷新。
  // 更新检查、来源检查、市场检查全部改为手动按钮触发，打开面板不再自动
  // 打三路 GitHub 请求。
  useEffect(() => {
    void catalogFlow.load()
    void meta.loadUses()
    void groupFlow.loadGroups()
    void sourceFlow.loadSources()
    void meta.loadConfig()
    void scopeFlow.loadScopes()
    void workspaceFlow.loadWorkspaces()
    const fast = window.setInterval(() => { void catalogFlow.load() }, POLL_MS)
    const slow = window.setInterval(() => { void meta.loadUses(); void groupFlow.loadGroups(); void sourceFlow.loadSources(); void meta.loadConfig(); void scopeFlow.loadScopes(); void workspaceFlow.loadWorkspaces() }, SLOW_POLL_MS)
    return () => { window.clearInterval(fast); window.clearInterval(slow) }
  }, [catalogFlow.load, meta.loadUses, groupFlow.loadGroups, sourceFlow.loadSources, meta.loadConfig, scopeFlow.loadScopes, workspaceFlow.loadWorkspaces])

  // ------------------------------------------------- daily auto-check
  // 打开面板时每天最多自动检查一次（全部来源 + 全部市场源），
  // 时间戳存 localStorage 跨会话生效；手动按钮随时可用，不受节流限制。
  useEffect(() => {
    if (!shouldAutoCheck()) return
    markAutoChecked()
    void sourceFlow.checkSources()
    void marketFlow.checkMarket()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    // state
    catalog: catalogFlow.catalog, loading: catalogFlow.loading, loadError, successBanner,
    repoDiscoverState: marketFlow.repoDiscoverState, scanningRepo: marketFlow.scanningRepo,
    repoSelected: marketFlow.repoSelected, repoImporting: marketFlow.repoImporting,
    repoResult: marketFlow.repoResult,
    search: catalogFlow.search,
    detail: catalogFlow.detail, detailLoading: catalogFlow.detailLoading,
    busyNames: catalogFlow.busyNames, batchBusy,
    showForm: catalogFlow.showForm, formName: catalogFlow.formName, formDesc: catalogFlow.formDesc,
    formContent: catalogFlow.formContent,
    formRoot: catalogFlow.formRoot, formBusy: catalogFlow.formBusy, formMessage: catalogFlow.formMessage,
    uses: meta.uses, hubConfig: meta.hubConfig, tab, skillView, sourceFilter,
    invocationFilter: catalogFlow.invocationFilter, sortKey: catalogFlow.sortKey,
    marketState: marketFlow.marketState, marketCheck: marketFlow.marketCheck,
    marketStats: marketFlow.marketStats, branchChoice: marketFlow.branchChoice, branchBusy: marketFlow.branchBusy,
    marketSyncDialog: marketFlow.marketSyncDialog, syncingMarket: marketFlow.syncingMarket,
    syncBusy: marketFlow.syncBusy, newSourceName: marketFlow.newSourceName,
    groupsState: groupFlow.groupsState, sourcesState: sourceFlow.sourcesState,
    sourceCheck: sourceFlow.sourceCheck, checkingSource: sourceFlow.checkingSource,
    syncingSource: sourceFlow.syncingSource,
    conflictDialog: groupFlow.conflictDialog, confirmDialog: sourceFlow.confirmDialog,
    updateAllDialog: marketFlow.updateAllDialog,
    editingTag: groupFlow.editingTag, editName: groupFlow.editName, membersDraft: groupFlow.membersDraft,
    newTagName: groupFlow.newTagName, tagBusy,
    editSearch: groupFlow.editSearch, collapsedGroups, showLegend, editMode,
    versionDialog: marketFlow.versionDialog, versionBusy: marketFlow.versionBusy,
    pendingDeletes: catalogFlow.pendingDeletes, deleteDialog: catalogFlow.deleteDialog,
    // derived
    actionNames: catalogFlow.actionNames, viewNames: catalogFlow.viewNames,
    offSkills: catalogFlow.offSkills,
    normalized: catalogFlow.normalized, origins, sourceOptions,
    filtered: catalogFlow.filtered, sorted: catalogFlow.sorted,
    shortenedCount: catalogFlow.shortenedCount,
    // actions + setters
    setLoadError, setSuccessBanner, setSearch: catalogFlow.setSearch,
    setDetail: catalogFlow.setDetail, setShowForm: catalogFlow.setShowForm, setFormName: catalogFlow.setFormName,
    setFormDesc: catalogFlow.setFormDesc, setFormContent: catalogFlow.setFormContent, setFormRoot: catalogFlow.setFormRoot,
    setFormMessage: catalogFlow.setFormMessage,
    setRepoSelected: marketFlow.setRepoSelected, setTab, setSkillView,
    setSourceFilter, setInvocationFilter: catalogFlow.setInvocationFilter, setSortKey: catalogFlow.setSortKey,
    setBranchChoice: marketFlow.setBranchChoice, setMarketSyncDialog: marketFlow.setMarketSyncDialog,
    setNewSourceName: marketFlow.setNewSourceName, setConflictDialog: groupFlow.setConflictDialog,
    setConfirmDialog: sourceFlow.setConfirmDialog,
    setDeleteDialog: catalogFlow.setDeleteDialog,
    setUpdateAllDialog: marketFlow.setUpdateAllDialog,
    setEditingTag: groupFlow.setEditingTag, setEditName: groupFlow.setEditName,
    setMembersDraft: groupFlow.setMembersDraft, setNewTagName: groupFlow.setNewTagName,
    setEditSearch: groupFlow.setEditSearch, setShowLegend, setEditMode,
    setVersionDialog: marketFlow.setVersionDialog,
    scopeFlow, workspaceFlow,
    toggleGroupCollapse, setAllGroupsCollapsed, loadMarket: marketFlow.loadMarket,
    openDetail: catalogFlow.openDetail, toggle: catalogFlow.toggle,
    toggleGroup: groupFlow.toggleGroup,
    resolveConflict: groupFlow.resolveConflict,
    runConfirmed: sourceFlow.runConfirmed, checkSources: sourceFlow.checkSources,
    requestSync: sourceFlow.requestSync,
    fixingPaths: catalogFlow.fixingPaths, fixDiagnostic: catalogFlow.fixDiagnostic,
    clearListFilters: catalogFlow.clearListFilters, openVersionDialog: marketFlow.openVersionDialog,
    confirmVersionDialog: marketFlow.confirmVersionDialog, createTag: groupFlow.createTag,
    deleteTag: groupFlow.deleteTag, saveTag: groupFlow.saveTag,
    addSource: marketFlow.addSource, addMarketSource: marketFlow.addMarketSource,
    removeMarketSource: marketFlow.removeMarketSource, scanRepo: marketFlow.scanRepo,
    confirmBranchChoice: marketFlow.confirmBranchChoice, toggleRepoSelected: marketFlow.toggleRepoSelected,
    importRepo: marketFlow.importRepo, cancelImport: marketFlow.cancelImport,
    clearScan: marketFlow.clearScan,
    checkMarket: marketFlow.checkMarket, loadMarketStats: marketFlow.loadMarketStats,
    syncMarketSource: marketFlow.syncMarketSource, confirmMarketSync: marketFlow.confirmMarketSync,
    updateAll: marketFlow.updateAll, create: catalogFlow.create,
    stageDelete: catalogFlow.stageDelete, unstageDelete: catalogFlow.unstageDelete,
    confirmDeletes: catalogFlow.confirmDeletes,
  }
}
