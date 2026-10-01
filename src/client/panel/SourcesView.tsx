/**
 * Sources tab: the flat skill list or the grouped view — one card per upstream
 * collection with check/sync actions and the tri-state switch, plus the
 * uncategorized "personal" card for skills that no source record claims.
 */

import { useMemo, type JSX } from 'react'
import { tt } from '../helpers.ts'
import { filterBySource, filterDisabled, groupSwitchView, mergeGroupRows, PRIVATE_SOURCE, visibleCollections } from '../grouping.ts'
import { SkillRow } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { ReorderButtons } from './ReorderButtons.tsx'
import { CollectionCard } from './CollectionCard.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function SourcesView(props: { hub: SkillHubState }): JSX.Element {
  const { hub } = props
  const { catalog, groupsState, skillView, sourceFilter, origins, sorted, normalized, collapsedGroups, viewNames, sourceCheck, actionNames, checkingSource, syncingSource, batchBusy, busyNames, toggleGroupCollapse, setAllGroupsCollapsed, checkSources, requestSync, toggleGroup } = hub
  /** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
  const duplicateNames = useMemo(() => new Set(catalog?.duplicateNames ?? []), [catalog])
  /** 已运行时关闭的行（暂存待删除的在目录域里已经剔除）。 */
  const offSkills = hub.offSkills

  // ----- 顶层分组列表（col:xxx / personal，顺序由编辑态的 ↑↓ 按钮维护） -----
  const sourceFiltered = filterBySource(sorted, sourceFilter, origins)
  // 无可见成员的来源组不渲染：来源记录指向的技能可能已被删除，或关闭状态
  // 丢失导致技能既非启用也非关闭，留下一个组头有数字、展开 0 行的空壳。
  const visible = visibleCollections(groupsState?.collections ?? [], sourceFiltered, offSkills, normalized, sourceFilter, origins)
  const collections = visible.map((entry) => entry.collection)
  const uncategorized = sourceFiltered.filter((skill) => origins[skill.name] === undefined)
  const personalDisabled = offSkills.filter((record) => origins[record.name] === undefined)
    .filter((record) => normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
    .filter(() => sourceFilter === 'all' || sourceFilter === PRIVATE_SOURCE)
  const allPersonalNames = [...uncategorized.map((s) => s.name), ...personalDisabled.map((r) => r.name)]
  const hasPersonal = allPersonalNames.length > 0
  const defaultTopKeys: string[] = [
    ...collections.map((c) => 'col:' + c.name),
    ...(hasPersonal ? ['uncategorized-source'] : []),
  ]
  const storedTopOrder = groupsState?.sourceGroupOrder ?? []
  const topOrderedKeys = (() => {
    if (storedTopOrder.length === 0) return defaultTopKeys
    const set = new Set(storedTopOrder)
    const result = storedTopOrder.filter((k) => defaultTopKeys.includes(k))
    for (const k of defaultTopKeys) if (!set.has(k)) result.push(k)
    // 兼容旧 collectionOrder：若 storedTopOrder 为空但旧 order 有值，已在 defaultTopKeys 中体现 collection 顺序
    if (result.length === 0) return defaultTopKeys
    return result
  })()
  /** 顶层分组是否已全部折叠（决定「全部折叠/展开」按钮的文案）。 */
  const allTopCollapsed = topOrderedKeys.length > 0 && topOrderedKeys.every((key) => collapsedGroups.has(key))
  /** 排序：与相邻项交换后落盘。 */
  const moveTop = (key: string, direction: -1 | 1): void => {
    const from = topOrderedKeys.indexOf(key)
    const to = from + direction
    if (from === -1 || to < 0 || to >= topOrderedKeys.length) return
    const next = [...topOrderedKeys]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    void hub.reorderSourceGroups(next)
  }
  /** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
  const rowProps = { uses: hub.uses, hubConfig: hub.hubConfig, busyNames, duplicateNames, toggle: hub.toggle, openDetail: hub.openDetail, stageDelete: hub.editMode ? hub.stageDelete : undefined }
  /** 排序「按使用次数」时取调用统计（与目录域同一个 map）。 */
  const getUses = (name: string): number | undefined => hub.uses.get(name)?.count

  /**
   * 来源 tab 的工具行：左边「全部折叠/展开」（分组视图才有意义），右边
   * 「新建」与「编辑/完成」——这两件事就是在直接管理技能文件，所以放在
   * 技能真正落地的那一 tab 里，而不是面板标题栏。
   */
  const listTools = (
    <div className={css.listTools}>
      {skillView === 'groups' && topOrderedKeys.length > 1 ? (
        <button type='button' className={css.opBtn} onClick={() => { setAllGroupsCollapsed(allTopCollapsed ? null : topOrderedKeys) }}>
          {allTopCollapsed ? tt('groups.expandAll') : tt('groups.collapseAll')}
        </button>
      ) : null}
      <button type='button' className={css.button + ' ' + css.primary} onClick={() => { hub.setFormMessage(null); hub.setShowForm(true) }}>{tt('panel.new')}</button>
      <button
        type='button'
        className={css.button + (hub.editMode ? ' ' + css.primary : '')}
        aria-pressed={hub.editMode}
        title={tt('edit.hint')}
        onClick={() => {
          // 退出编辑态前先把暂存的删除过一遍确认：取消就留在编辑态，
          // 暂存内容原样保留（一行都还没落盘）。
          if (hub.editMode && hub.pendingDeletes.length > 0) { hub.setDeleteDialog(true); return }
          hub.setEditMode((value) => !value)
        }}
      >{tt(hub.editMode ? 'edit.done' : 'edit.start')}</button>
    </div>
  )

  if (skillView === 'flat') {
    // 平铺视图同样要给出恢复入口：关掉开关的技能不能就此从列表里消失
    // （分组视图的来源卡与个人卡都渲染了这些行，平铺视图原先漏了）。启用行
    // 与关闭行合并后统一排序，开关只换样式，行不会跳到列表末尾。
    const rows = mergeGroupRows(sourceFiltered, filterDisabled(offSkills, normalized, sourceFilter, origins), hub.sortKey, getUses)
    return (
      <>
        {listTools}
        {rows.map((row) => (row.kind === 'skill'
          ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
          : (
              <DisabledRow
                key={row.record.name}
                record={row.record}
                busy={busyNames.has(row.record.name)}
                duplicate={duplicateNames.has(row.record.name)}
                onEnable={() => { void hub.toggle(row.record, true) }}
                onOpen={() => { void hub.openDetail(row.record.name) }}
                stageDelete={rowProps.stageDelete}
              />
            )))}
      </>
    )
  }

  // 空状态：没有任何分组时提示
  const isEmptyTop = collections.length === 0 && !hasPersonal
  return (
    <>
      {isEmptyTop ? <div className={css.empty}>{tt('groups.noCollections')}</div> : null}
      {listTools}
      {topOrderedKeys.map((topKey) => {
        // Collection 卡片（归属顶层排序）
        if (topKey.startsWith('col:')) {
          const colName = topKey.slice(4)
          const entry = visible.find((item) => item.collection.name === colName)
          if (entry === undefined) return null
          const { collection, skills, disabledMembers } = entry
          const collapsed = collapsedGroups.has('col:' + collection.name)
          const view = groupSwitchView(collection.skillNames, viewNames, actionNames)
          const check = sourceCheck[collection.name]
          const hasTogglable = collection.skillNames.some((name) => actionNames.has(name))
          return (
            <CollectionCard
              key={'col:' + collection.name}
              collection={collection}
              scopeModes={hub.scopeFlow.scopeModesByKey.get('col:' + collection.name)}
              rows={mergeGroupRows(skills, disabledMembers, hub.sortKey, getUses)}
              collapsed={collapsed}
              view={view}
              check={check}
              hasTogglable={hasTogglable}
              editMode={hub.editMode}
              canMoveUp={topOrderedKeys.indexOf(topKey) > 0}
              canMoveDown={topOrderedKeys.indexOf(topKey) < topOrderedKeys.length - 1}
              onMove={(direction) => { moveTop(topKey, direction) }}
              checkingSource={checkingSource}
              syncingSource={syncingSource}
              batchBusy={batchBusy}
              rowProps={rowProps}
              toggleGroupCollapse={toggleGroupCollapse}
              checkSources={checkSources}
              requestSync={requestSync}
              toggleGroup={toggleGroup}
            />
          )
        }
        // Personal 顶层卡片
        if (topKey === 'uncategorized-source' && hasPersonal) {
          if (allPersonalNames.length === 0) return null
          const collapsed = collapsedGroups.has('uncategorized-source')
          return (
            <section key="uncategorized-source" className={css.section}>
              <div className={css.groupHead}>
                <button type='button' className={css.disclosure} aria-expanded={!collapsed} onClick={() => { toggleGroupCollapse('uncategorized-source') }}>
                  <span className={css.chevron + (collapsed ? ' ' + css.chevronCollapsed : '')} />
                  <span className={css.groupTitle}>{tt('groups.personal')} · {allPersonalNames.length}<GroupSummary members={allPersonalNames} uses={hub.uses} hubConfig={hub.hubConfig} /></span>
                </button>
                <span className={css.groupOps}>
                  {hub.editMode ? (
                    <ReorderButtons
                      canMoveUp={topOrderedKeys.indexOf(topKey) > 0}
                      canMoveDown={topOrderedKeys.indexOf(topKey) < topOrderedKeys.length - 1}
                      onMove={(direction) => { moveTop(topKey, direction) }}
                    />
                  ) : null}
                </span>
              </div>
              {!collapsed ? (
                <>
                  {mergeGroupRows(uncategorized, personalDisabled, hub.sortKey, getUses).map((row) => (row.kind === 'skill'
                    ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
                    : <DisabledRow key={row.record.name} record={row.record} busy={busyNames.has(row.record.name)} duplicate={duplicateNames.has(row.record.name)} onEnable={() => { void hub.toggle(row.record, true) }} onOpen={() => { void hub.openDetail(row.record.name) }} stageDelete={rowProps.stageDelete} />))}
                </>
              ) : null}
            </section>
          )
        }
        return null
      })}
    </>
  )
}
