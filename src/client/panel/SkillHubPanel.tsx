/**
 * The skill hub panel: catalog grouped by tags + source collections, search
 * and filter in one row, per-group tri-state switches with conflict dialogs,
 * upstream source tracking (check / sync; upstream deletions are only
 * reported), market sources, switched-off skills with a one-click re-enable,
 * detail inspection, and the new-skill scaffold dialog — opened from the
 * header row, in the same action cluster as the edit toggle.
 *
 * Thin shell: state and flows live in useSkillHub, the tab contents live in
 * SourcesView / ScenesView / MarketView, the dialog family lives in
 * dialogs.tsx, and their wiring lives in PanelDialogs.tsx. This component
 * owns only the shared chrome (header, banners, filter bar, shared sections)
 * and the view routing. It keeps a single piece of local state (the
 * filter-panel toggle); every flow hook runs unconditionally at the top of
 * useSkillHub, so the detail / tag-editor / scope-editor early returns below
 * stay inside the rules of hooks.
 */

import { useState } from 'react'
import { IconSkillOutline16 } from '../icons.tsx'
import type { SkillHubApi } from '../api.ts'
import { tt } from '../helpers.ts'
import { PRIVATE_SOURCE, type SortKey } from '../grouping.ts'
import { dotStyle } from './format.ts'
import { SkillDetailView } from './SkillDetailView.tsx'
import { TagEditorView } from './TagEditorView.tsx'
import { SourcesView } from './SourcesView.tsx'
import { ScenesView } from './ScenesView.tsx'
import { MarketView } from './MarketView.tsx'
import { ScopesView } from './ScopesView.tsx'
import { PanelDialogs } from './PanelDialogs.tsx'
import { useSkillHub } from './useSkillHub.ts'
import css from './panel.module.css'

export interface SkillHubPanelProps {
  api: SkillHubApi
}

export function SkillHubPanel(props: SkillHubPanelProps): React.JSX.Element {
  const hub = useSkillHub(props.api)
  /** 「筛选」面板开合（来源 + 调用方式收进这里；搜索/排序/视图切换始终可见）。 */
  const [filtersOpen, setFiltersOpen] = useState(false)
  const {
    catalog, loading, loadError, successBanner, detail, detailLoading, showForm, formName, formDesc,
    formContent, formRoot, formBusy, formMessage, hubConfig, tab, skillView, sourceFilter, sortKey, search,
    tagBusy, batchBusy, sourceOptions, filtered,
    conflictDialog, confirmDialog, branchChoice, branchBusy, marketSyncDialog,
    syncBusy, editingTag, editName, membersDraft, editSearch, uses, groupsState, sourceCheck, checkingSource, syncingSource,
    showLegend, editMode,
    setLoadError, setSuccessBanner, setDetail, setShowForm, setFormName, setFormDesc, setFormContent, setFormRoot, setFormMessage, setTab,
    setSkillView, setSourceFilter, setSortKey, setSearch, setConflictDialog, setConfirmDialog,
    setBranchChoice, setMarketSyncDialog, setEditingTag, setEditName, setMembersDraft, setEditSearch,
    setShowLegend, setEditMode,
    loadMarket, checkSources, requestSync,
    runConfirmed, resolveConflict, confirmBranchChoice, confirmMarketSync, create, saveTag, deleteTag,
  } = hub
  const { shortenedCount, fixingPaths, clearListFilters } = hub

  // 三个整页子视图（详情 / 场景编辑 / 模式编辑）会在这个组件里提前返回，它们
  // 不经过主视图的骨架——而失败恰恰常发生在子页面里（详情页启用失败、场景改名
  // 失败、模式保存 409 二次确认被拒）。横幅因此抽成片段，随子视图一起传下去，
  // 由子视图渲染在自己 `css.panel` 的顶部；主视图原处渲染同一片段。
  const notices = (
    <>
      {loadError !== null ? (
        <div className={css.errorBanner} role='alert'>
          <span>{loadError}</span>
          <button type='button' className={css.button} aria-label={tt('err.dismiss')} onClick={() => { setLoadError(null) }}>{tt('err.dismiss')}</button>
        </div>
      ) : null}
      {successBanner !== null ? (
        <div className={css.successBanner} role='status'>
          <span>{successBanner}</span>
          <button type='button' className={css.button} aria-label={tt('err.dismiss')} onClick={() => { setSuccessBanner(null) }}>{tt('err.dismiss')}</button>
        </div>
      ) : null}
    </>
  )

  // -------------------------------------------------------------- detail

  if (detail !== null) {
    const disabledSkill = catalog?.skills.find((skill) => skill.name === detail.name && !skill.enabled)
    return (
      <SkillDetailView
        detail={detail}
        notices={notices}
        hubConfig={hubConfig}
        uses={uses}
        groupsState={groupsState}
        sourcesState={hub.sourcesState}
        sourceCheck={sourceCheck}
        checkingSource={checkingSource}
        syncingSource={syncingSource}
        onEnable={disabledSkill !== undefined ? () => { void hub.toggle(disabledSkill, true).then(() => { setDetail(null) }) } : undefined}
        onBack={() => { setDetail(null) }}
        onCheck={(repo) => { void checkSources(repo) }}
        onSync={requestSync}
      />
    )
  }

  if (editingTag !== null) {
    return (
      <TagEditorView
        tag={editingTag}
        notices={notices}
        editName={editName}
        membersDraft={membersDraft}
        editSearch={editSearch}
        catalog={catalog}
        tagBusy={tagBusy}
        onBack={() => { setEditingTag(null) }}
        onEditName={setEditName}
        onEditSearch={setEditSearch}
        onToggleMember={(name, checked) => {
          setMembersDraft((previous) => {
            const next = new Set(previous)
            if (checked) next.add(name)
            else next.delete(name)
            return next
          })
        }}
        onRename={() => { void saveTag(editingTag.id, editName, null) }}
        onDelete={() => { void deleteTag(editingTag.id) }}
        onSaveMembers={() => { void saveTag(editingTag.id, editName, [...membersDraft]) }}
      />
    )
  }

  // 模式编辑器与 detail / 场景编辑器同类：整页替换，因此在这里提前返回。
  // 它只有从「模式」tab 点「配置」才会进入，此时不会有 tab 可切。
  if (hub.scopeFlow.editingPreset !== null) {
    return <ScopesView hub={hub} notices={notices} />
  }

  /** 生效中的筛选条件数（来源 + 调用方式），显示在「筛选」按钮上。 */
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0) + (hub.invocationFilter !== 'all' ? 1 : 0)
  /** 目录里被运行时关闭的技能数（关闭行仍在列表里，计数只作提示）。 */
  const disabledCount = catalog?.skills.filter((skill) => !skill.enabled).length ?? 0

  return (
    <div className={css.panel} aria-busy={batchBusy || tagBusy}>
      <div className={css.header}>
        <h2 className={css.title}><IconSkillOutline16 size={16} className={css.titleIcon} /> {tt('panel.title')}</h2>
        {catalog !== null
          ? <span className={css.headerCount}>
              {tt('panel.count', { count: catalog.skills.length })}
              {disabledCount > 0 ? ' · ' + tt('panel.disabledCount', { count: disabledCount }) : null}
            </span>
          : null}
        {catalog !== null && !catalog.complete ? <span className={css.hint}>{tt('panel.incomplete')}</span> : null}
        {catalog !== null && (catalog.duplicateNames?.length ?? 0) > 0 ? <button type='button' className={css.opBtn} title={tt('row.duplicateHint')} onClick={() => { clearListFilters() }}>⚠ {tt('row.duplicate')}×{(catalog.duplicateNames ?? []).length}</button> : null}
        <span className={css.actions}>
          <button type='button' className={css.button + ' ' + css.primary} onClick={() => { setFormMessage(null); setShowForm(true) }}>{tt('panel.new')}</button>
          <button
            type='button'
            className={css.button + (editMode ? ' ' + css.primary : '')}
            aria-pressed={editMode}
            title={tt('edit.hint')}
            onClick={() => { setEditMode((value) => !value) }}
          >{tt(editMode ? 'edit.done' : 'edit.start')}</button>
        </span>
      </div>
      <div className={css.subbar}>
        <span className={css.segmented}>
          <button type='button' className={css.segBtn + (tab === 'sources' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('sources') }}>{tt('view.sources')}</button>
          <button type='button' className={css.segBtn + (tab === 'scenes' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('scenes') }}>{tt('view.scenes')}</button>
          <button type='button' className={css.segBtn + (tab === 'market' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('market'); void loadMarket() }}>{tt('view.market')}</button>
          <button type='button' className={css.segBtn + (tab === 'scopes' ? ' ' + css.segBtnActive : '')} onClick={() => { setTab('scopes'); void hub.scopeFlow.loadScopes() }}>{tt('scope.tab')}</button>
        </span>
        <button type='button' className={css.legendToggle + (showLegend ? ' ' + css.legendToggleActive : '')} onClick={() => { setShowLegend((value) => !value) }} title={tt('legend.hint')}>?</button>
      </div>

      {notices}

      {showLegend ? (
        <div className={css.legend}>
          <span className={css.legendItem}><span className={css.dot + ' ' + css.dotModel} style={dotStyle(hubConfig?.dotModelColor)} />{tt('legend.model')}</span>
          <span className={css.legendItem}><span className={css.dot + ' ' + css.dotUser} style={dotStyle(hubConfig?.dotUserColor)} />{tt('legend.user')}</span>
          <span className={css.legendHint}>{tt('legend.hint')}</span>
        </div>
      ) : null}

      {loading ? (
        <div className={css.skeleton} role='status' aria-label={tt('panel.loading')}>
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
          <div className={css.skeletonRow} />
        </div>
      ) : null}

      {detailLoading ? <div className={css.empty}>{tt('detail.loading')}</div> : null}

      {tab === 'market' ? (
        <MarketView hub={hub} />
      ) : tab === 'scopes' ? (
        // 模式视图是自成一体的列表 + 编辑器，不共享目录筛选栏。
        <ScopesView hub={hub} />
      ) : catalog !== null ? (
        <>
          <div className={css.filterBar}>
            {tab === 'sources' ? (
              <span className={css.segmented}>
                <button type='button' className={css.segBtn + (skillView === 'flat' ? ' ' + css.segBtnActive : '')} onClick={() => { setSkillView('flat') }}>{tt('view.flat')}</button>
                <button type='button' className={css.segBtn + (skillView === 'groups' ? ' ' + css.segBtnActive : '')} onClick={() => { setSkillView('groups') }}>{tt('view.grouped')}</button>
              </span>
            ) : null}
            <select className={css.select} value={sortKey} onChange={(event) => { setSortKey(event.target.value as SortKey) }}>
              <option value='name'>{tt('sort.name')}</option>
              <option value='added'>{tt('sort.added')}</option>
              <option value='uses'>{tt('sort.uses')}</option>
            </select>
            <input className={css.search} value={search} onChange={(event) => { setSearch(event.target.value) }} placeholder={tt('panel.search')} />
            <button
              type='button'
              className={css.button + (filtersOpen || activeFilterCount > 0 ? ' ' + css.primary : '')}
              aria-expanded={filtersOpen}
              aria-controls='skill-hub-filter-panel'
              onClick={() => { setFiltersOpen((value) => !value) }}
            >{tt('filter.title')}{activeFilterCount > 0 ? ' (' + activeFilterCount + ')' : ''}</button>
          </div>
          {filtersOpen ? (
            <div className={css.filterPanel} id='skill-hub-filter-panel'>
              {tab === 'sources' ? (
                <label className={css.filterField}>
                  <span className={css.formLabel}>{tt('filter.source')}</span>
                  <select className={css.select} value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value) }}>
                    <option value='all'>{tt('filter.allSources')}</option>
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>{source === PRIVATE_SOURCE ? tt('filter.private') : source}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={css.filterField}>
                <span className={css.formLabel}>{tt('filter.invocation')}</span>
                <select className={css.select} value={hub.invocationFilter} onChange={(event) => { hub.setInvocationFilter(event.target.value as 'all' | 'model' | 'user') }}>
                  <option value='all'>{tt('filter.invocationAll')}</option>
                  <option value='model'>{tt('filter.modelOnly')}</option>
                  <option value='user'>{tt('filter.userOnly')}</option>
                </select>
              </label>
              {activeFilterCount > 0 ? (
                <button type='button' className={css.opBtn} onClick={() => { setSourceFilter('all'); hub.setInvocationFilter('all') }}>{tt('filter.clear')}</button>
              ) : null}
            </div>
          ) : null}
          {catalog !== null && (filtered.length !== catalog.skills.length || hub.invocationFilter !== 'all' || sourceFilter !== 'all') ? (
            <div className={css.hintLine} style={{ margin: '2px 2px 0', display:'flex', gap:8, flexWrap:'wrap' }}>
              <span>{tt('filter.showing', { shown: filtered.length, total: catalog.skills.length, filtered: hub.invocationFilter !== 'all' || sourceFilter !== 'all' ? tt('filter.filteredSuffix') : '' })}</span>
              {shortenedCount > 0 ? <span title={tt('filter.shortened', { count: shortenedCount })}>{tt('filter.shortened', { count: shortenedCount })}</span> : null}
            </div>
          ) : null}

          {filtered.length === 0 && search.trim() !== '' ? <div className={css.empty}>{tt('panel.empty')}</div> : null}
          {filtered.length === 0 && search.trim() === '' && catalog.skills.length === 0 && catalog.diagnostics.length === 0
            ? <div className={css.empty}>{tt('panel.emptyAll')}</div>
            : null}

          {tab === 'sources' ? <SourcesView hub={hub} /> : <ScenesView hub={hub} />}

          {catalog.diagnostics.length > 0 ? (
            <section className={css.section}>
              <div className={css.sectionTitle}>{tt('panel.diagnostics')}</div>
              {catalog.diagnostics.map((entry) => (
                <div key={entry.path} className={css.diagRow} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className={css.diagPath}>{entry.path}</div>
                    <div className={css.diagReason}>{entry.reason}</div>
                  </div>
                  {entry.fixable === true ? (
                    <button
                      type='button'
                      className={css.opBtn}
                      disabled={fixingPaths.has(entry.path)}
                      onClick={() => { void hub.fixDiagnostic(entry.path) }}
                      style={{ flex:'none', alignSelf:'center' }}
                    >{fixingPaths.has(entry.path) ? tt('diag.fixing') : tt('diag.fix')}</button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      <PanelDialogs
        conflictDialog={conflictDialog}
        tags={groupsState?.tags ?? []}
        collections={groupsState?.collections ?? []}
        setConflictDialog={setConflictDialog}
        resolveConflict={resolveConflict}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        runConfirmed={runConfirmed}
        branchChoice={branchChoice}
        branchBusy={branchBusy}
        setBranchChoice={setBranchChoice}
        confirmBranchChoice={confirmBranchChoice}
        versionDialog={hub.versionDialog}
        versionBusy={hub.versionBusy}
        setVersionDialog={hub.setVersionDialog}
        confirmVersionDialog={hub.confirmVersionDialog}
        marketSyncDialog={marketSyncDialog}
        syncBusy={syncBusy}
        setMarketSyncDialog={setMarketSyncDialog}
        confirmMarketSync={confirmMarketSync}
        showForm={showForm}
        formName={formName}
        formDesc={formDesc}
        formContent={formContent}
        formRoot={formRoot}
        formBusy={formBusy}
        formMessage={formMessage}
        setShowForm={setShowForm}
        setFormName={setFormName}
        setFormDesc={setFormDesc}
        setFormContent={setFormContent}
        setFormRoot={setFormRoot}
        setFormMessage={setFormMessage}
        create={create}
      />
    </div>
  )
}
