/**
 * Sources tab: the flat skill list or the grouped view — a project-level
 * three-tier tree (workspaces from workspace.json, each optionally split by
 * .dsh/.agents), one card per upstream collection with check/sync/
 * follow-delete actions and the tri-state switch, plus the uncategorized
 * "personal" card (project skills never count as personal).
 */

import { useMemo, type JSX } from 'react'
import { tt } from '../helpers.ts'
import { filterBySource, filterDisabled, groupSwitchView, isProjectSource, mergeGroupRows, PRIVATE_SOURCE, visibleCollections } from '../grouping.ts'
import { SkillRow } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { ReorderButtons } from './ReorderButtons.tsx'
import { ProjectTree } from './ProjectTree.tsx'
import { CollectionCard } from './CollectionCard.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function SourcesView(props: { hub: SkillHubState }): JSX.Element {
  const { hub } = props
  const { catalog, groupsState, skillView, sourceFilter, origins, sorted, normalized, collapsedGroups, viewNames, sourceCheck, actionNames, checkingSource, syncingSource, batchBusy, busyNames, toggleGroupCollapse, setAllGroupsCollapsed, checkSources, requestSync, requestDelete, requestDeleteGroup, toggleGroup, enableDisabled } = hub
  /** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
  const duplicateNames = useMemo(() => new Set(catalog?.duplicateNames ?? []), [catalog])

  // ----- 顶层分组列表（project / col:xxx / personal，顺序由编辑态的 ↑↓ 按钮维护） -----
  const sourceFiltered = filterBySource(sorted, sourceFilter, origins)
  const projectSkillsAll = sourceFiltered.filter((skill) => isProjectSource(skill.source))
  const hasProject = projectSkillsAll.length > 0
  // 无可见成员的来源组不渲染：来源记录指向的技能可能已被删除，或禁用记录
  // 丢失导致技能既非启用也非禁用，留下一个组头有数字、展开 0 行的空壳。
  const visible = visibleCollections(groupsState?.collections ?? [], sourceFiltered, catalog?.disabled ?? [], normalized, sourceFilter, origins)
  const collections = visible.map((entry) => entry.collection)
  const uncategorized = sourceFiltered.filter((skill) => origins[skill.name] === undefined && !isProjectSource(skill.source))
  const personalDisabled = (catalog?.disabled ?? []).filter((record) => origins[record.name] === undefined)
    .filter((record) => normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
    .filter((record) => sourceFilter === 'all' || sourceFilter === PRIVATE_SOURCE)
  const allPersonalNames = [...uncategorized.map((s) => s.name), ...personalDisabled.map((r) => r.name)]
  const hasPersonal = allPersonalNames.length > 0
  const defaultTopKeys: string[] = [
    ...(hasProject ? ['project'] : []),
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
  const rowProps = { uses: hub.uses, hubConfig: hub.hubConfig, busyNames, editMode: hub.editMode, tagBusy: hub.tagBusy, duplicateNames, toggle: hub.toggle, openDetail: hub.openDetail, requestDeleteSkill: hub.requestDeleteSkill }
  /** 排序「按使用次数」时取调用统计（与目录域同一个 map）。 */
  const getUses = (name: string): number | undefined => hub.uses.get(name)?.count

  if (skillView === 'flat') {
    // 平铺视图同样要给出恢复入口：关掉开关的技能不能就此从列表里消失
    // （分组视图的来源卡与个人卡都渲染了这些行，平铺视图原先漏了）。启用行
    // 与禁用行合并后统一排序，开关只换样式，行不会跳到列表末尾。
    const rows = mergeGroupRows(sourceFiltered, filterDisabled(catalog?.disabled ?? [], normalized, sourceFilter, origins), hub.sortKey, getUses)
    return (
      <>
        {rows.map((row) => (row.kind === 'skill'
          ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
          : (
              <DisabledRow
                key={row.record.name}
                record={row.record}
                busy={busyNames.has(row.record.name)}
                duplicate={duplicateNames.has(row.record.name)}
                onEnable={() => { void enableDisabled(row.record) }}
                onOpen={() => { void hub.openDetail(row.record.name) }}
              />
            )))}
      </>
    )
  }

  // 空状态：没有任何分组时提示
  const isEmptyTop = !hasProject && collections.length === 0 && !hasPersonal
  return (
    <>
      {isEmptyTop ? <div className={css.empty}>{tt('groups.noCollections')}</div> : null}
      {topOrderedKeys.length > 1 ? (
        <div className={css.listTools}>
          <button type='button' className={css.opBtn} onClick={() => { setAllGroupsCollapsed(allTopCollapsed ? null : topOrderedKeys) }}>
            {allTopCollapsed ? tt('groups.expandAll') : tt('groups.collapseAll')}
          </button>
        </div>
      ) : null}
      {topOrderedKeys.map((topKey) => {
        // Project 顶层卡片
        if (topKey === 'project' && hasProject) {
          return (
            <ProjectTree
              key="project"
              editMode={hub.editMode}
              canMoveUp={topOrderedKeys.indexOf(topKey) > 0}
              canMoveDown={topOrderedKeys.indexOf(topKey) < topOrderedKeys.length - 1}
              onMove={(direction) => { moveTop(topKey, direction) }}
              skills={projectSkillsAll}
              collapsedGroups={collapsedGroups}
              toggleGroupCollapse={toggleGroupCollapse}
              subdividedProjects={hub.subdividedProjects}
              toggleSubdivide={hub.toggleSubdivide}
              rowProps={rowProps}
            />
          )
        }
        // Collection 卡片（归属顶层排序）
        if (topKey.startsWith('col:')) {
          const colName = topKey.slice(4)
          const entry = visible.find((item) => item.collection.name === colName)
          if (entry === undefined) return null
          const { collection, skills, disabledMembers } = entry
          const collapsed = collapsedGroups.has('col:' + collection.name)
          const view = groupSwitchView(collection.skillNames, viewNames)
          const check = sourceCheck[collection.name]
          const hasWritable = collection.skillNames.some((name) => actionNames.has(name))
          return (
            <CollectionCard
              key={'col:' + collection.name}
              collection={collection}
              scopeModes={hub.scopeFlow.scopeModesByKey.get('col:' + collection.name)}
              rows={mergeGroupRows(skills, disabledMembers, hub.sortKey, getUses)}
              collapsed={collapsed}
              view={view}
              check={check}
              hasWritable={hasWritable}
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
              requestDelete={requestDelete}
              toggleGroup={toggleGroup}
              requestDeleteGroup={requestDeleteGroup}
              enableDisabled={enableDisabled}
              openDetail={hub.openDetail}
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
                    <>
                      <ReorderButtons
                        canMoveUp={topOrderedKeys.indexOf(topKey) > 0}
                        canMoveDown={topOrderedKeys.indexOf(topKey) < topOrderedKeys.length - 1}
                        onMove={(direction) => { moveTop(topKey, direction) }}
                      />
                      <button type='button' className={css.opBtn + ' ' + css.opDanger} title={tt('source.deleteGroupHint', { count: allPersonalNames.length })} onClick={(event) => { event.stopPropagation(); requestDeleteGroup(tt('groups.personal'), allPersonalNames) }}>{tt('source.deleteGroup')}</button>
                    </>
                  ) : null}
                </span>
              </div>
              {!collapsed ? (
                <>
                  {mergeGroupRows(uncategorized, personalDisabled, hub.sortKey, getUses).map((row) => (row.kind === 'skill'
                    ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
                    : <DisabledRow key={row.record.name} record={row.record} busy={busyNames.has(row.record.name)} duplicate={duplicateNames.has(row.record.name)} onEnable={() => { void enableDisabled(row.record) }} onOpen={() => { void hub.openDetail(row.record.name) }} />))}
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
