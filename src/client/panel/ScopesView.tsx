/**
 * 「模式」tab：模式级技能隔离。
 *
 * 两种状态：**列表态**（每个 agent preset 一行：策略摘要、接线状态、配置入口）
 * 与**编辑态**（按分组/单技能勾选白名单 + 实时预览该模式下会隐藏什么）。
 *
 * 两种状态的根元素不同，取决于它是内联还是整页替换：
 *   · 列表态 = 内联 tab 视图 → 根是 Fragment，只吐 `css.section` 卡片
 *     （与 `SourcesView` / `ScenesView` / `MarketView` 一致）；
 *   · 编辑态 = 整页子视图 → 交给共用的 `PolicyEditorView`（根是 `css.panel`），
 *     由 `SkillHubPanel` 提前返回（与 `TagEditorView` / `SkillDetailView` 一致）。
 *
 * 卡片内的行一律写 `css.row + ' ' + css.rowStatic`，
 * 名字/描述用 `css.rowName` + `css.rowDesc`，状态用 `css.badge`，主操作用
 * `css.button + css.primary`。
 *
 * 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row`
 * 同时使用——单独用会让行失去 flex / padding / gap，元素会挤成一团。
 *
 * 能力不可用（部署缺 agent-presets / dsh-scope）时降级为只读提示。
 */

import type { JSX, ReactNode } from 'react'
import type { PresetScopeRow } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { PolicyEditorView } from './PolicyEditorView.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function ScopesView(props: { hub: SkillHubState; notices?: ReactNode }): JSX.Element {
  const { hub, notices } = props
  const flow = hub.scopeFlow

  // ---------------------------------------------------------------- 列表态
  // 这是**内联** tab 视图（渲染在主面板内部），所以根必须是 Fragment，
  // 只吐出 .section 卡片——与 SourcesView / ScenesView / MarketView 一致。
  // 这里若再套一层 .panel，就会嵌套出第二份 padding 与 max-width:720px;
  // margin:0 auto，卡片被压窄居中、文字越界被裁。

  if (flow.editingPreset === null) {
    const state = flow.scopeState
    if (state === null) return <p className={css.empty}>{tt('scope.loading')}</p>
    if (!state.available) {
      return (
        <>
          <p className={css.empty}>{tt('scope.unavailable', { reason: state.unavailableReason ?? 'unknown' })}</p>
          <p className={css.hintLine}>{tt('scope.unavailableHint')}</p>
        </>
      )
    }
    if (state.presets.length === 0) {
      return (
        <>
          <p className={css.empty}>{tt('scope.empty')}</p>
          <p className={css.hintLine}>{tt('scope.emptyHint')}</p>
        </>
      )
    }
    return (
      <>
        {state.pendingCount > 0 ? <p className={css.hintLine}>{tt('scope.pendingNotice', { count: state.pendingCount })}</p> : null}
        <div className={css.section}>
          {state.presets.map((row) => (
            <ScopePresetRow key={row.id} row={row} busy={flow.scopeBusy} onEdit={() => { flow.beginScopeEdit(row) }} />
          ))}
        </div>
        <p className={css.hintLine}>{tt('scope.listHint')}</p>
      </>
    )
  }

  // ---------------------------------------------------------------- 编辑态
  // 这是**整页替换**的子视图（与 TagEditorView / SkillDetailView 同类）：根是
  // .panel，并由 SkillHubPanel 在 editingPreset 非空时提前返回，因此它不会
  // 嵌在主面板里。编辑器的全部内容由 PolicyEditorView 提供（与工作区共用）。

  const row = flow.editingPreset
  return (
    <PolicyEditorView
      draft={flow.draft}
      groupsState={hub.groupsState}
      catalog={hub.catalog}
      subjectName={row.name ?? row.id}
      subjectKind={tt('policy.subjectMode')}
      effect={row.mounted ? tt('scope.effectNow') : tt('scope.effectLater')}
      notices={notices}
    />
  )
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
                <span className={css.badge}>{tt('policy.visibleCount', { visible: row.visibleCount })}</span>
                <span className={css.badge}>{tt('policy.hiddenCount', { hidden: row.hiddenCount })}</span>
              </>
            )
          : <span className={css.badge + ' ' + css.badgeReadonly}>{tt('policy.unrestricted')}</span>}
      </div>
      <button type='button' className={css.opBtn} disabled={busy} onClick={onEdit}>{tt('scope.configure')}</button>
    </div>
  )
}
