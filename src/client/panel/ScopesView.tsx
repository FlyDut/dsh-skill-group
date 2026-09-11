/**
 * 「模式」tab：模式级技能隔离。
 *
 * 两种状态：**列表态**（每个 agent preset 一行：策略摘要、接线状态、配置入口）
 * 与**编辑态**（按分组/单技能勾选白名单 + 实时预览该模式下会隐藏什么）。
 *
 * 结构与同类子页 `TagEditorView` 保持一致：根是 `css.panel`，内容按卡片
 * （`css.section`）分组，卡片内的行一律写 `css.row + ' ' + css.rowStatic`，
 * 名字/描述用 `css.rowName` + `css.rowDesc`，状态用 `css.badge`，主操作用
 * `css.button + css.primary`。
 *
 * 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row`
 * 同时使用——单独用会让行失去 flex / padding / gap，元素会挤成一团。
 *
 * 全部勾选与预览都在浏览器本地算出（复用 `domain/scope-policy` 的判定），
 * 保存一次落盘，随后宿主把闸门接到该 preset 的作用域上。
 * 能力不可用（部署缺 agent-presets / dsh-scope）时降级为只读提示。
 */

import { useMemo, useState, type JSX } from 'react'
import type { CatalogResponse, PresetScopeRow } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { scopeGroupOptions, useScopeFlow } from './hooks/useScopeFlow.ts'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

/** 分组类别在行描述里的短标签。 */
const KIND_LABEL: Record<'tag' | 'col' | 'src', string> = {
  tag: tt('scope.kindTag'),
  col: tt('scope.kindCol'),
  src: tt('scope.kindSrc'),
}

export function ScopesView(props: { hub: SkillHubState }): JSX.Element {
  const { hub } = props
  const flow = hub.scopeFlow
  const [scopeFilter, setScopeFilter] = useState('')

  const options = useMemo(
    () => scopeGroupOptions(hub.groupsState, hub.catalog, flow.scopePreview),
    [hub.groupsState, hub.catalog, flow.scopePreview],
  )

  // ---------------------------------------------------------------- 列表态

  if (flow.editingPreset === null) {
    const state = flow.scopeState
    if (state === null) return <div className={css.panel}><p className={css.empty}>{tt('scope.loading')}</p></div>
    if (!state.available) {
      return (
        <div className={css.panel}>
          <p className={css.empty}>{tt('scope.unavailable', { reason: state.unavailableReason ?? 'unknown' })}</p>
          <p className={css.hintLine}>{tt('scope.unavailableHint')}</p>
        </div>
      )
    }
    if (state.presets.length === 0) {
      return (
        <div className={css.panel}>
          <p className={css.empty}>{tt('scope.empty')}</p>
          <p className={css.hintLine}>{tt('scope.emptyHint')}</p>
        </div>
      )
    }
    return (
      <div className={css.panel}>
        {state.pendingCount > 0 ? <p className={css.hintLine}>{tt('scope.pendingNotice', { count: state.pendingCount })}</p> : null}
        <div className={css.section}>
          {state.presets.map((row) => (
            <ScopePresetRow key={row.id} row={row} busy={flow.scopeBusy} onEdit={() => { flow.beginScopeEdit(row) }} />
          ))}
        </div>
        <p className={css.hintLine}>{tt('scope.listHint')}</p>
      </div>
    )
  }

  // ---------------------------------------------------------------- 编辑态

  const row = flow.editingPreset
  const visibleCount = flow.scopePreview?.visible.length ?? 0
  const hiddenNames = flow.draftEnabled ? flow.scopeHiddenNames : []
  const needle = scopeFilter.trim().toLowerCase()
  const skillNames = flow.scopeAllNames.filter((name) => needle === '' || name.toLowerCase().includes(needle))
  const groupKeys = options.map((option) => option.key)

  return (
    <div className={css.panel}>
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={flow.cancelScopeEdit}>‹ {tt('scope.back')}</button>
        <span className={css.groupTitle}>{row.name ?? row.id}</span>
        <button
          type='button'
          role='switch'
          aria-checked={flow.draftEnabled}
          aria-label={tt('scope.enable')}
          className={css.switch + (flow.draftEnabled ? ' ' + css.switchOn : '')}
          onClick={() => { flow.setScopeEnabled(!flow.draftEnabled) }}
        ><span className={css.switchThumb} /></button>
      </div>
      <p className={css.hintLine}>
        {flow.draftEnabled ? tt('scope.enabled') : tt('scope.disabled')} · {tt('scope.enableHint')}
      </p>
      <p className={css.hintLine}>{row.mounted ? tt('scope.effectNow') : tt('scope.effectLater')}</p>

      {/* 分组勾选：场景 / 来源集合 / 来源根，整组生效。 */}
      <div className={css.section}>
        <div className={css.groupHead}>
          <span className={css.groupTitle}>{tt('scope.groupsTitle')}</span>
          <div className={css.groupOps}>
            <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('groups', groupKeys, true) }}>{tt('scope.selectAll')}</button>
            <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('groups', groupKeys, false) }}>{tt('scope.clearAll')}</button>
          </div>
        </div>
        {options.length === 0
          ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('scope.groupsEmpty')}</p>
          : options.map((option) => (
              <label key={option.key} className={css.row + ' ' + css.rowStatic}>
                <input
                  type='checkbox'
                  checked={flow.draftGroups.has(option.key)}
                  onChange={(event) => { flow.toggleScopeGroup(option.key, event.target.checked) }}
                />
                <div className={css.rowMain}>
                  <div className={css.rowName}><span className={css.rowNameText}>{option.label}</span></div>
                  <div className={css.rowDesc}>{KIND_LABEL[option.kind]} · {tt('scope.memberCount', { count: option.count })}</div>
                </div>
              </label>
            ))}
      </div>

      {flow.scopePreview !== null && flow.scopePreview.dangling.length > 0
        ? <p className={css.hintLine}>{tt('scope.dangling', { count: flow.scopePreview.dangling.length, keys: flow.scopePreview.dangling.join(', ') })}</p>
        : null}

      {/* 单技能：分组之外的补充勾选。 */}
      <input
        className={css.search}
        type='search'
        value={scopeFilter}
        placeholder={tt('scope.searchPlaceholder')}
        onChange={(event) => { setScopeFilter(event.target.value) }}
      />
      <div className={css.section}>
        <div className={css.groupHead}>
          <span className={css.groupTitle}>{tt('scope.skillsTitle')}</span>
          <div className={css.groupOps}>
            <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('skills', skillNames, true) }}>{tt('scope.selectAll')}</button>
            <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('skills', skillNames, false) }}>{tt('scope.clearAll')}</button>
          </div>
        </div>
        {skillNames.length === 0
          ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('scope.noSkillMatch')}</p>
          : skillNames.map((name) => (
              <label key={name} className={css.row + ' ' + css.rowStatic}>
                <input
                  type='checkbox'
                  checked={flow.draftSkills.has(name)}
                  onChange={(event) => { flow.toggleScopeSkill(name, event.target.checked) }}
                />
                <div className={css.rowMain}>
                  <div className={css.rowName}><span className={css.rowNameText}>{name}</span></div>
                  <div className={css.rowDesc}>{skillDescription(hub.catalog, name)}</div>
                </div>
              </label>
            ))}
      </div>

      {/* 预览：未启用时如实说明"看不到任何变化"，启用时逐行列出会被隐藏的技能。 */}
      <div className={css.section}>
        <div className={css.groupHead}>
          <span className={css.groupTitle}>{tt('scope.previewTitle')}</span>
          <div className={css.groupOps}>
            {flow.draftEnabled
              ? <span className={css.badge}>{tt('scope.visibleCount', { visible: visibleCount })}</span>
              : <span className={css.badge + ' ' + css.badgeReadonly}>{tt('scope.disabled')}</span>}
          </div>
        </div>
        {!flow.draftEnabled
          ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('scope.previewOffHint')}</p>
          : visibleCount === 0
            ? <p className={css.hintLine + ' ' + css.hintPadded}>{tt('scope.previewAllHidden')}</p>
            : hiddenNames.map((name) => (
                <div key={name} className={css.row + ' ' + css.rowStatic}>
                  <div className={css.rowMain}>
                    <div className={css.rowName}><span className={css.rowNameText}>{name}</span></div>
                    <div className={css.rowDesc}>{tt('scope.hiddenWhenOn')}</div>
                  </div>
                </div>
              ))}
      </div>

      <div className={css.buttons}>
        <button type='button' className={css.button + ' ' + css.primary} disabled={flow.scopeBusy} onClick={() => { flow.requestSaveScope() }}>
          {flow.scopeBusy ? tt('scope.saving') : tt('scope.save')}
        </button>
        <button type='button' className={css.button} disabled={flow.scopeBusy} onClick={flow.requestResetScope}>
          {tt('scope.reset')}
        </button>
        {flow.scopeSaved ? <span className={css.badge}>{tt('scope.saved')}</span> : null}
      </div>

      {flow.scopeConfirm !== null
        ? (
            <div className={css.dialogOverlay} role='dialog' aria-modal='true'>
              <div className={css.dialog}>
                <div className={css.dialogTitle}>
                  {flow.scopeConfirm === 'empty' ? tt('scope.confirmEmptyTitle') : tt('scope.confirmResetTitle')}
                </div>
                <p className={css.dialogText}>
                  {flow.scopeConfirm === 'empty'
                    ? tt('scope.confirmEmpty', { name: row.name ?? row.id })
                    : tt('scope.confirmReset', { name: row.name ?? row.id })}
                </p>
                <div className={css.dialogActions}>
                  <button type='button' className={css.button} onClick={() => { flow.setScopeConfirm(null) }}>{tt('scope.cancel')}</button>
                  <button
                    type='button'
                    className={css.button + ' ' + css.primary}
                    onClick={() => {
                      if (flow.scopeConfirm === 'empty') flow.requestSaveScope(true)
                      else void flow.resetScope()
                    }}
                  >{tt('scope.confirm')}</button>
                </div>
              </div>
            </div>
          )
        : null}
    </div>
  )
}

/** 目录里某个技能的描述（技能列表与预览复用；缺失时回退为占位）。 */
function skillDescription(catalog: CatalogResponse | null, name: string): string {
  const skill = catalog?.skills.find((entry) => entry.name === name)
  return skill?.shortDescription ?? skill?.description ?? '—'
}

/** 列表里的一行：模式身份 + 接线状态 + 策略摘要 + 配置入口。 */
function ScopePresetRow(props: { row: PresetScopeRow; busy: boolean; onEdit: () => void }): JSX.Element {
  const { row, busy, onEdit } = props
  const enabled = row.policy.enabled
  const status = enabled
    ? (row.gateActive ? tt('scope.gateActive') : tt('scope.gatePending'))
    : tt('scope.gateOff')
  return (
    <div
      className={css.row + ' ' + css.rowStatic}
      title={enabled && !row.gateActive ? tt('scope.gatePendingHint') : row.mounted ? tt('scope.mountedHint') : tt('scope.notMountedHint')}
    >
      <div className={css.rowMain}>
        <div className={css.rowName}>
          <span className={css.rowNameText}>{row.name ?? row.id}</span>
          {row.isDefault ? <span className={css.badge}>{tt('scope.default')}</span> : null}
          <span className={css.badge + ' ' + css.badgeReadonly}>
            {row.trust === 'system' ? tt('scope.trustSystem') : tt('scope.trustUser')}
          </span>
        </div>
        <div className={css.rowDesc}>{row.id} · {status} · {row.mounted ? tt('scope.mounted') : tt('scope.notMounted')}</div>
      </div>
      <div className={css.badges}>
        {enabled
          ? (
              <>
                <span className={css.badge}>{tt('scope.visibleCount', { visible: row.visibleCount })}</span>
                <span className={css.badge}>{tt('scope.hiddenCount', { hidden: row.hiddenCount })}</span>
              </>
            )
          : <span className={css.badge + ' ' + css.badgeReadonly}>{tt('scope.unrestricted')}</span>}
      </div>
      <button type='button' className={css.opBtn} disabled={busy} onClick={onEdit}>{tt('scope.configure')}</button>
    </div>
  )
}
