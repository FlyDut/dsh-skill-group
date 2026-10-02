/**
 * Scenes tab: user tag groups (one card per scene with the tri-state switch
 * and edit entry) plus the new-scene form. Scenes are the user's own
 * enable/disable units (e.g. a Godot scene vs a Java scene); upstream repos
 * are managed in the sources tab.
 */

import { useMemo, type JSX } from 'react'
import { tt } from '../helpers.ts'
import { groupSwitchView, mergeGroupRows } from '../grouping.ts'
import { SkillRow } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { GroupSwitchButton } from './GroupSwitchButton.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function ScenesView(props: { hub: SkillHubState }): JSX.Element {
  const { hub } = props
  const { catalog, groupsState, sorted, normalized, collapsedGroups, viewNames, actionNames, batchBusy, busyNames, newTagName, setNewTagName, tagBusy, createTag, toggleGroupCollapse, setAllGroupsCollapsed, toggleGroup, setEditingTag, setEditName, setMembersDraft, setEditSearch } = hub
  /** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
  const duplicateNames = useMemo(() => new Set(catalog?.duplicateNames ?? []), [catalog])
  /** 已运行时关闭的行（暂存待删除的在目录域里已经剔除）。 */
  const offSkills = hub.offSkills
  const tagKeys = (groupsState?.tags ?? []).map((tag) => 'tag:' + tag.id)
  /** 所有场景是否已折叠（决定「全部折叠/展开」按钮的文案）。 */
  const allTagsCollapsed = tagKeys.length > 0 && tagKeys.every((key) => collapsedGroups.has(key))
  /** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
  const rowProps = { uses: hub.uses, hubConfig: hub.hubConfig, busyNames, duplicateNames, toggle: hub.toggle, openDetail: hub.openDetail, stageDelete: hub.editMode ? hub.stageDelete : undefined }
  /** 排序「按使用次数」时取调用统计（与目录域同一个 map）。 */
  const getUses = (name: string): number | undefined => hub.uses.get(name)?.count
  return (
    <>
      <form className={css.form} onSubmit={(event) => { void createTag(event) }}>
        <div className={css.buttons}>
          <input
            className={css.input + ' ' + css.grow}
            value={newTagName}
            onChange={(event) => { setNewTagName(event.target.value) }}
            placeholder={tt('groups.namePlaceholder')}
          />
          <button type='submit' className={css.button + ' ' + css.primary} disabled={tagBusy || newTagName.trim() === ''}>{tt('groups.new')}</button>
        </div>
      </form>

      {groupsState !== null && groupsState.tags.length === 0 ? <div className={css.empty}>{tt('groups.empty')}</div> : null}
      {tagKeys.length > 1 ? (
        <div className={css.listTools}>
          <button type='button' className={css.opBtn} onClick={() => { setAllGroupsCollapsed(allTagsCollapsed ? null : tagKeys) }}>
            {allTagsCollapsed ? tt('groups.expandAll') : tt('groups.collapseAll')}
          </button>
        </div>
      ) : null}
      {groupsState?.tags.map((tag) => {
        const skills = sorted.filter((skill) => tag.skillNames.includes(skill.name))
        const disabledMembers = offSkills.filter((record) => tag.skillNames.includes(record.name) && (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized)))
        const collapsed = collapsedGroups.has('tag:' + tag.id)
        const view = groupSwitchView(tag.skillNames, viewNames, actionNames)
        const hasTogglable = tag.skillNames.some((name) => actionNames.has(name))
        // 场景头显示实际存在的成员数；已在目录里消失的成员由 view.missing 提示。
        const memberCount = view.enabled.length + view.disabled.length
        return (
          <section key={'tag:' + tag.id} className={css.section}>
            <div className={css.groupHead}>
              <button type='button' className={css.disclosure} aria-expanded={!collapsed} onClick={() => { toggleGroupCollapse('tag:' + tag.id) }}>
                <span className={css.chevron + (collapsed ? ' ' + css.chevronCollapsed : '')} />
                <span className={css.groupTitle}>
                  {tag.name} · {memberCount}
                  <GroupSummary members={tag.skillNames} uses={hub.uses} hubConfig={hub.hubConfig} />
                  {view.missing.length > 0 ? <span className={css.groupNote}>{tt('groups.missing', { count: view.missing.length })}</span> : null}
                </span>
              </button>
              <span className={css.groupOps}>
                <GroupSwitchButton
                  state={view.state}
                  label={tag.name}
                  memberCount={memberCount}
                  missingCount={view.missing.length}
                  batchBusy={batchBusy}
                  hasTogglable={hasTogglable}
                  onToggle={() => { toggleGroup('tag:' + tag.id, tag.name, view.state) }}
                />
                <button type='button' className={css.opBtn} onClick={() => { setEditingTag(tag); setEditName(tag.name); setMembersDraft(new Set(tag.skillNames)); setEditSearch('') }}>{tt('groups.edit')}</button>
              </span>
            </div>
            {!collapsed ? (
              <>
                {mergeGroupRows(skills, disabledMembers, hub.sortKey, getUses).map((row) => (row.kind === 'skill'
                  ? <SkillRow key={row.skill.name} skill={row.skill} {...rowProps} />
                  : <DisabledRow key={row.record.name} record={row.record} busy={busyNames.has(row.record.name)} duplicate={duplicateNames.has(row.record.name)} onEnable={() => { void hub.toggle(row.record, true) }} onOpen={() => { void hub.openDetail(row.record.name) }} stageDelete={rowProps.stageDelete} />))}
              </>
            ) : null}
          </section>
        )
      })}
    </>
  )
}
