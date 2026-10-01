/**
 * CollectionCard — 一个上游来源集合卡片：组头（来源链接 + 成员数 + 用量
 * 汇总）、检查/同步徽章、三态开关、编辑态排序，以及展开后的启用行与关闭行。
 * 数据与动作均由 SourcesView 传入。上游删除只在徽章里报告，本插件不代删。
 */

import type { JSX } from 'react'
import type { CollectionGroup, SourceCheckResult } from '../../protocol.ts'
import type { GroupRow, GroupSwitchView } from '../grouping.ts'
import { tt } from '../helpers.ts'
import { SourceStatusBadge } from './SourceStatusBadge.tsx'
import { SkillRow, type SkillRowProps } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { GroupSwitchButton } from './GroupSwitchButton.tsx'
import { ReorderButtons } from './ReorderButtons.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

interface CollectionCardProps {
  collection: CollectionGroup
  /** 该集合内通过筛选的行（启用技能与关闭技能已按当前排序键合并）。 */
  rows: GroupRow[]
  /** 该集合卡片是否折叠。 */
  collapsed: boolean
  /** 成员开关状态（groupSwitchView 派生）。 */
  view: GroupSwitchView
  /** 该来源的上游检查结果。 */
  check: SourceCheckResult | undefined
  /** 组内至少一个成员可开关（三态开关可点）。 */
  hasTogglable: boolean
  /** 编辑模式（显示排序按钮）。 */
  editMode: boolean
  /** 顶层排序位置边界（编辑模式显示上移/下移按钮）。 */
  canMoveUp: boolean
  canMoveDown: boolean
  /** 把该集合当作可见性白名单的模式显示名（只含已启用隔离的模式）。 */
  scopeModes?: readonly string[]
  /** 键盘排序：-1 上移，1 下移。 */
  onMove: (direction: -1 | 1) => void
  /** 正在检查的来源名。 */
  checkingSource: string | null
  /** 正在同步的来源名。 */
  syncingSource: string | null
  /** 整组操作忙碌。 */
  batchBusy: boolean
  /** SkillRow / DisabledRow 共用的收窄 props（skill/record 由行内传入）。 */
  rowProps: Omit<SkillRowProps, 'skill'>
  toggleGroupCollapse: SkillHubState['toggleGroupCollapse']
  checkSources: SkillHubState['checkSources']
  requestSync: SkillHubState['requestSync']
  toggleGroup: SkillHubState['toggleGroup']
}

export function CollectionCard(props: CollectionCardProps): JSX.Element {
  const {
    collection, rows, collapsed, view, check, hasTogglable, editMode,
    canMoveUp, canMoveDown, onMove,
    checkingSource, syncingSource, batchBusy, rowProps,
    toggleGroupCollapse, checkSources, requestSync, toggleGroup,
  } = props
  const { busyNames, duplicateNames, uses, hubConfig } = rowProps
  // 卡片头显示**实际存在**的成员数：跟踪清单里的成员可能已经被手工删掉了，
  // 那个数字不属于「这个组有几条看得见的技能」。缺失的部分由 view.missing 提示。
  const memberCount = view.enabled.length + view.disabled.length
  return (
    <section className={css.section}>
      <div className={css.groupHead}>
        <button type='button' className={css.disclosure} aria-expanded={!collapsed} onClick={() => { toggleGroupCollapse('col:' + collection.name) }}>
          <span className={css.chevron + (collapsed ? ' ' + css.chevronCollapsed : '')} />
          <span className={css.groupTitle}>
            <a className={css.sourceLink} href={'https://github.com/' + collection.name} target='_blank' rel='noreferrer' onClick={(event) => { event.stopPropagation() }}>{collection.name}</a>
            {' · ' + memberCount}
            <GroupSummary members={collection.skillNames} uses={uses} hubConfig={hubConfig} scopeModes={props.scopeModes} />
            {view.missing.length > 0 ? <span className={css.groupNote}>{tt('groups.missing', { count: view.missing.length })}</span> : null}
          </span>
        </button>
        <span className={css.groupOps}>
          {editMode ? <ReorderButtons canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMove={onMove} /> : null}
          <SourceStatusBadge
            check={check}
            checking={checkingSource === collection.name}
            onCheck={() => { void checkSources(collection.name) }}
          />
          {check !== undefined && check.changed && check.updated.length > 0
            ? <button type='button' className={css.opBtn} disabled={syncingSource !== null} onClick={(event) => { event.stopPropagation(); requestSync(collection.name, check.updated) }}>
                {syncingSource === collection.name ? tt('source.syncing') : tt('source.sync')}
              </button>
            : null}
          <GroupSwitchButton
            state={view.state}
            label={collection.name}
            memberCount={memberCount}
            missingCount={view.missing.length}
            batchBusy={batchBusy}
            hasTogglable={hasTogglable}
            onToggle={() => { toggleGroup('col:' + collection.name, collection.name, view.state) }}
          />
        </span>
      </div>
      {!collapsed ? (
        <>
          {rows.map((row) => (row.kind === 'skill'
            ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
            : <DisabledRow key={row.record.name} record={row.record} busy={busyNames.has(row.record.name)} duplicate={duplicateNames.has(row.record.name)} onEnable={() => { void rowProps.toggle(row.record, true) }} onOpen={() => { void rowProps.openDetail(row.record.name) }} stageDelete={rowProps.stageDelete} />))}
        </>
      ) : null}
    </section>
  )
}
