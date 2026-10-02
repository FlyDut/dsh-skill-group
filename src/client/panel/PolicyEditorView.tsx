/**
 * PolicyEditorView — 「可见性策略编辑器」的共用视图（模式与工作区两处共用）。
 *
 * 输入是一份由 `usePolicyDraft` 管理的草稿加三个主题相关的显示值：
 * 主体名（模式名 / 工作区标题）、主体类别称呼（填进 `policy.*` 的 `{subject}`）、
 * 生效时机那一行。除此之外的一切——分组勾选、单技能勾选、保存/重置/确认框——
 * 都与主体无关，所以只写一遍。
 *
 * 刻意**不做**「实时预览」窗口：预览整块列出来会把页面撑得很长，而每个主体的
 * 可见/隐藏计数在列表行里已经如实给出。保存与「重置为不限制」贴在顶部开关左边，
 * 编辑到哪儿都不用再滚回底部。
 *
 * 这是**整页替换**的子视图（与 `TagEditorView` / `SkillDetailView` 同类）：
 * 根是 `.panel`，由 `SkillHubPanel` 在编辑态时提前返回，因此它不会嵌在主面板里。
 *
 * 卡片内的行一律写 `css.row + ' ' + css.rowStatic`，名字/描述用 `css.rowName` +
 * `css.rowDesc`，状态用 `css.badge`，主操作用 `css.button + css.primary`。
 * 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row` 同时使用
 * ——单独用会让行失去 flex / padding / gap，元素会挤成一团。
 */

import { useMemo, useState, type JSX, type ReactNode } from 'react'
import type { CatalogResponse } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { scopeGroupOptions, type PolicyDraftApi } from './hooks/usePolicyDraft.ts'
import css from './panel.module.css'

export function PolicyEditorView(props: {
  /** 草稿机（模式与工作区共用）。 */
  draft: PolicyDraftApi
  /** 分组数据摊平成的勾选列表。 */
  groupsState: Parameters<typeof scopeGroupOptions>[0]
  /** 目录（技能描述与来源根成员数）。 */
  catalog: CatalogResponse | null
  /** 主体显示名（模式名 / 工作区标题）。 */
  subjectName: string
  /** 主体类别称呼，已翻译（「模式」/「工作区」），填进 `{subject}` 占位。 */
  subjectKind: string
  /** 生效时机那一行（由调用方按主题语义给出，已翻译）。 */
  effect: string
  notices?: ReactNode
}): JSX.Element {
  const { draft, groupsState, catalog, subjectName, subjectKind, effect, notices } = props
  const [filter, setFilter] = useState('')

  const options = useMemo(
    () => scopeGroupOptions(groupsState, catalog, draft.preview),
    [groupsState, catalog, draft.preview],
  )

  const kindLabel: Record<'tag' | 'col' | 'src', string> = {
    tag: tt('policy.kindTag'),
    col: tt('policy.kindCol'),
    src: tt('policy.kindSrc'),
  }
  const needle = filter.trim().toLowerCase()
  const skillNames = draft.allNames.filter((name) => needle === '' || name.toLowerCase().includes(needle))
  const groupKeys = options.map((option) => option.key)

  return (
    <div className={css.panel}>
      {notices}
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={draft.cancelEdit}>‹ {tt('policy.back', { subject: subjectKind })}</button>
        <span className={css.groupTitle}>{subjectName}</span>
        {/* 主操作贴在顶部开关左边：整页很长，落到底部才按保存太难受。 */}
        <div className={css.groupOps}>
          <button type='button' className={css.button + ' ' + css.primary} disabled={draft.busy} onClick={() => { draft.requestSave() }}>
            {draft.busy ? tt('policy.saving') : tt('policy.save')}
          </button>
          <button type='button' className={css.button} disabled={draft.busy} onClick={draft.requestReset}>{tt('policy.reset')}</button>
          {draft.saved ? <span className={css.badge}>{tt('policy.saved')}</span> : null}
          <button
            type='button'
            role='switch'
            aria-checked={draft.enabled}
            aria-label={tt('policy.enable', { subject: subjectKind })}
            className={css.switch + (draft.enabled ? ' ' + css.switchOn : '')}
            onClick={() => { draft.setEnabled(!draft.enabled) }}
          ><span className={css.switchThumb} /></button>
        </div>
      </div>
      <p className={css.hintLine}>
        {draft.enabled ? tt('policy.enabled') : tt('policy.disabled')} · {tt('policy.enableHint', { subject: subjectKind })}
      </p>
      <p className={css.hintLine}>{effect}</p>

      {/* 分组勾选：场景 / 来源集合 / 来源根，整组生效。 */}
      <div className={css.section}>
        <div className={css.groupHead}>
          <span className={css.groupTitle}>{tt('policy.groupsTitle')}</span>
          <div className={css.groupOps}>
            <button type='button' className={css.opBtn} onClick={() => { draft.setSelection('groups', groupKeys, true) }}>{tt('policy.selectAll')}</button>
            <button type='button' className={css.opBtn} onClick={() => { draft.setSelection('groups', groupKeys, false) }}>{tt('policy.clearAll')}</button>
          </div>
        </div>
        {options.length === 0
          ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('policy.groupsEmpty')}</p>
          : options.map((option) => (
              <label key={option.key} className={css.row + ' ' + css.rowStatic}>
                <input
                  type='checkbox'
                  checked={draft.groups.has(option.key)}
                  onChange={(event) => { draft.toggleGroup(option.key, event.target.checked) }}
                />
                <div className={css.rowMain}>
                  <div className={css.rowName}><span className={css.rowNameText}>{option.label}</span></div>
                  <div className={css.rowDesc}>{kindLabel[option.kind]} · {tt('policy.memberCount', { count: option.count })}</div>
                </div>
              </label>
            ))}
      </div>

      {draft.preview !== null && draft.preview.dangling.length > 0
        ? <p className={css.hintLine}>{tt('policy.dangling', { count: draft.preview.dangling.length, keys: draft.preview.dangling.join(', ') })}</p>
        : null}

      {/* 单技能：分组之外的补充勾选。 */}
      <input
        className={css.search}
        type='search'
        value={filter}
        placeholder={tt('policy.searchPlaceholder')}
        onChange={(event) => { setFilter(event.target.value) }}
      />
      <div className={css.section}>
        <div className={css.groupHead}>
          <span className={css.groupTitle}>{tt('policy.skillsTitle')}</span>
          <div className={css.groupOps}>
            <button type='button' className={css.opBtn} onClick={() => { draft.setSelection('skills', skillNames, true) }}>{tt('policy.selectAll')}</button>
            <button type='button' className={css.opBtn} onClick={() => { draft.setSelection('skills', skillNames, false) }}>{tt('policy.clearAll')}</button>
          </div>
        </div>
        {skillNames.length === 0
          ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('policy.noSkillMatch')}</p>
          : skillNames.map((name) => (
              <label key={name} className={css.row + ' ' + css.rowStatic}>
                <input
                  type='checkbox'
                  checked={draft.skills.has(name)}
                  onChange={(event) => { draft.toggleSkill(name, event.target.checked) }}
                />
                <div className={css.rowMain}>
                  <div className={css.rowName}><span className={css.rowNameText}>{name}</span></div>
                  <div className={css.rowDesc}>{skillDescription(catalog, name)}</div>
                </div>
              </label>
            ))}
      </div>

      {draft.confirm !== null
        ? (
            <div className={css.dialogOverlay} role='dialog' aria-modal='true'>
              <div className={css.dialog}>
                <div className={css.dialogTitle}>
                  {draft.confirm === 'empty' ? tt('policy.confirmEmptyTitle') : tt('policy.confirmResetTitle')}
                </div>
                <p className={css.dialogText}>
                  {draft.confirm === 'empty'
                    ? tt('policy.confirmEmpty', { name: subjectName })
                    : tt('policy.confirmReset', { name: subjectName })}
                </p>
                <div className={css.dialogActions}>
                  <button type='button' className={css.button} onClick={() => { draft.setConfirm(null) }}>{tt('policy.cancel')}</button>
                  <button
                    type='button'
                    className={css.button + ' ' + css.primary}
                    onClick={() => {
                      if (draft.confirm === 'empty') draft.requestSave(true)
                      else void draft.resetNow()
                    }}
                  >{tt('policy.confirm')}</button>
                </div>
              </div>
            </div>
          )
        : null}
    </div>
  )
}

/** 目录里某个技能的描述（编辑器单技能行用；缺失时回退为占位）。 */
function skillDescription(catalog: CatalogResponse | null, name: string): string {
  const skill = catalog?.skills.find((entry) => entry.name === name)
  return skill?.shortDescription ?? skill?.description ?? '—'
}
