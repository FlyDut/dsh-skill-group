/**
 * 「模式」tab：模式级技能隔离。
 *
 * 两种状态：**列表态**（每个 agent preset 一行：策略摘要、接线状态、快速开关）
 * 与**编辑态**（左栏按分组/单技能勾选白名单，右栏实时预览该模式下可见与隐藏的
 * 技能）。全部勾选与预览都在浏览器本地算出（复用 `domain/scope-policy` 的判定），
 * 保存一次落盘，随后宿主把闸门接到该 preset 的作用域上。
 *
 * 能力不可用（部署缺 agent-presets / dsh-scope）时降级为只读提示，不影响其余 tab。
 */

import { useMemo, useState, type JSX } from 'react'
import type { PresetScopeRow } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { scopeGroupOptions, useScopeFlow } from './hooks/useScopeFlow.ts'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

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
    return (
      <div className={css.section}>
        {state === null ? (
          <p className={css.empty}>{tt('scope.loading')}</p>
        ) : !state.available ? (
          <>
            <p className={css.empty}>{tt('scope.unavailable', { reason: state.unavailableReason ?? 'unknown' })}</p>
            <p className={css.hint}>{tt('scope.unavailableHint')}</p>
          </>
        ) : state.presets.length === 0 ? (
          <>
            <p className={css.empty}>{tt('scope.empty')}</p>
            <p className={css.hint}>{tt('scope.emptyHint')}</p>
          </>
        ) : (
          <>
            {state.pendingCount > 0 ? <p className={css.hint}>{tt('scope.pendingNotice', { count: state.pendingCount })}</p> : null}
            <div className={css.sectionTitle}>{tt('scope.columnMode')}</div>
            {state.presets.map((row) => (
              <ScopePresetRowItem key={row.id} row={row} onEdit={() => { flow.beginScopeEdit(row) }} />
            ))}
            <p className={css.hint}>{tt('scope.effectNow')}</p>
          </>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------- 编辑态

  const row = flow.editingPreset
  const visibleCount = flow.scopePreview?.visible.length ?? 0
  const hiddenCount = flow.scopeHiddenNames.length
  const needle = scopeFilter.trim().toLowerCase()
  const skillNames = flow.scopeAllNames.filter((name) => needle === '' || name.toLowerCase().includes(needle))

  return (
    <div className={css.section}>
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={flow.cancelScopeEdit}>‹ {tt('scope.back')}</button>
        <span className={css.detailName}>{tt('scope.editing', { name: row.name ?? row.id })}</span>
      </div>

      <div className={css.form}>
        <label className={css.rowMain} htmlFor='scope-enabled'>
          <input
            id='scope-enabled'
            type='checkbox'
            checked={flow.draftEnabled}
            onChange={(event) => { flow.setScopeEnabled(event.target.checked) }}
          />
          <span className={css.rowNameText}>{tt('scope.enable')}</span>
        </label>
        <p className={css.hint}>{tt('scope.enableHint')}</p>
        <p className={css.hint}>{row.mounted ? tt('scope.effectNow') : tt('scope.effectLater')}</p>
      </div>

      <div className={css.groupHead}>
        <span className={css.groupTitle}>{tt('scope.groupsTitle')}</span>
        <div className={css.groupOps}>
          <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('groups', options.map((o) => o.key), true) }}>{tt('scope.selectAll')}</button>
          <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('groups', options.map((o) => o.key), false) }}>{tt('scope.clearAll')}</button>
        </div>
      </div>
      <p className={css.hint}>{tt('scope.groupsHint')}</p>
      {options.length === 0
        ? <p className={css.empty}>{tt('scope.groupsEmpty')}</p>
        : options.map((option) => (
            <label key={option.key} className={css.rowStatic} htmlFor={'scope-group-' + option.key}>
              <input
                id={'scope-group-' + option.key}
                type='checkbox'
                checked={flow.draftGroups.has(option.key)}
                onChange={(event) => { flow.toggleScopeGroup(option.key, event.target.checked) }}
              />
              <span className={css.rowMain}>
                <span className={css.rowNameText}>{option.label}</span>
                <span className={css.badges}>
                  <span className={css.badge}>{option.kind}</span>
                  <span className={css.badge}>{option.count}</span>
                </span>
              </span>
            </label>
          ))}

      <div className={css.groupHead}>
        <span className={css.groupTitle}>{tt('scope.skillsTitle')}</span>
        <div className={css.groupOps}>
          <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('skills', skillNames, true) }}>{tt('scope.selectAll')}</button>
          <button type='button' className={css.opBtn} onClick={() => { flow.setScopeSelection('skills', skillNames, false) }}>{tt('scope.clearAll')}</button>
        </div>
      </div>
      <p className={css.hint}>{tt('scope.skillsHint')}</p>
      <input
        className={css.input}
        type='search'
        value={scopeFilter}
        placeholder={tt('scope.searchPlaceholder')}
        onChange={(event) => { setScopeFilter(event.target.value) }}
      />
      {skillNames.map((name) => (
        <label key={name} className={css.rowStatic} htmlFor={'scope-skill-' + name}>
          <input
            id={'scope-skill-' + name}
            type='checkbox'
            checked={flow.draftSkills.has(name)}
            onChange={(event) => { flow.toggleScopeSkill(name, event.target.checked) }}
          />
          <span className={css.rowNameText}>{name}</span>
        </label>
      ))}

      <div className={css.groupHead}>
        <span className={css.groupTitle}>{tt('scope.previewTitle')}</span>
      </div>
      <p className={css.hint}>
        {flow.draftEnabled
          ? tt('scope.previewVisible', { count: visibleCount }) + ' · ' + tt('scope.previewHidden', { count: hiddenCount })
          : tt('scope.disabled')}
      </p>
      {flow.scopePreview !== null && flow.scopePreview.dangling.length > 0 && (
        <p className={css.diagReason}>
          {tt('scope.dangling', { count: flow.scopePreview.dangling.length, keys: flow.scopePreview.dangling.join(', ') })}
          {' — '}{tt('scope.danglingHint')}
        </p>
      )}
      <p className={css.hint}>{tt('scope.previewHiddenList')}</p>
      <p className={css.diagPath}>{flow.draftEnabled ? flow.scopeHiddenNames.join(', ') || '—' : '—'}</p>

      <div className={css.buttons}>
        <button type='button' className={css.button} disabled={flow.scopeBusy} onClick={() => { flow.requestSaveScope() }}>
          {flow.scopeBusy ? tt('scope.saving') : tt('scope.save')}
        </button>
        <button type='button' className={css.button} disabled={flow.scopeBusy} onClick={flow.requestResetScope}>
          {tt('scope.reset')}
        </button>
        {flow.scopeSaved && <span className={css.badge}>{tt('scope.saved')}</span>}
      </div>

      {flow.scopeConfirm !== null && (
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
                className={css.button}
                onClick={() => {
                  if (flow.scopeConfirm === 'empty') flow.requestSaveScope(true)
                  else void flow.resetScope()
                }}
              >
                {tt('scope.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 列表里的一行：模式身份 + 策略摘要 + 接线状态 + 配置入口。 */
function ScopePresetRowItem(props: { row: PresetScopeRow; onEdit: () => void }): JSX.Element {
  const { row, onEdit } = props
  const enabled = row.policy.enabled
  const status = enabled
    ? (row.gateActive ? tt('scope.gateActive') : tt('scope.gatePending'))
    : tt('scope.gateOff')
  const statusHint = enabled && !row.gateActive
    ? tt('scope.gatePendingHint')
    : row.mounted ? tt('scope.mountedHint') : tt('scope.notMountedHint')
  return (
    <div className={css.row} title={statusHint}>
      <div className={css.rowMain}>
        <span className={css.rowName}>
          <span className={css.rowNameText}>{row.name ?? row.id}</span>
        </span>
        <span className={css.rowDesc}>{row.id}</span>
        <span className={css.badges}>
          {row.isDefault && <span className={css.badge}>{tt('scope.default')}</span>}
          <span className={css.badge + (row.trust === 'system' ? ' ' + css.badgeReadonly : '')}>
            {row.trust === 'system' ? tt('scope.trustSystem') : tt('scope.trustUser')}
          </span>
          <span className={css.badge}>{row.mounted ? tt('scope.mounted') : tt('scope.notMounted')}</span>
          <span className={css.badge}>{status}</span>
          {enabled
            ? (
                <>
                  <span className={css.badge}>{tt('scope.visibleCount', { visible: row.visibleCount })}</span>
                  <span className={css.badge}>{tt('scope.hiddenCount', { hidden: row.hiddenCount })}</span>
                </>
              )
            : <span className={css.badge}>{tt('scope.unrestricted')}</span>}
        </span>
      </div>
      <div className={css.groupOps}>
        {/* 列表里只提供"进编辑器"一个入口：白名单为空时开启隔离意味着一个技能都
            看不到，这种决定必须在能看到预览的地方做，不能是列表上的顺手一点。 */}
        <button type='button' className={css.opBtn} onClick={onEdit}>{tt('scope.configure')}</button>
      </div>
    </div>
  )
}
