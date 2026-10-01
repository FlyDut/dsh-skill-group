/**
 * 「工作区」tab：工作区级技能隔离。
 *
 * 与「模式」tab 完全对称——两种状态、两套根元素、同一套卡片样式：
 *   · 列表态 = 内联 tab 视图 → 根是 Fragment，只吐 `css.section` 卡片
 *     （与 `SourcesView` / `ScenesView` / `MarketView` 一致）；
 *   · 编辑态 = 整页子视图 → 交给共用的 `PolicyEditorView`（根是 `css.panel`），
 *     由 `SkillHubPanel` 提前返回。
 *
 * 与模式的两处语义差异：
 *   · 身份来自 DSH 的工作区注册表（`ctx.workspaceRegistry`），会话按自己的工作
 *     目录**精确**匹配到某个工作区；模式是按会话当前的 agent preset 匹配。
 *   · 会话的技能取「模式 ∪ 工作区」的并集，两边各自独立、互不覆盖。
 *
 * 工作区可能先被删、策略还在：这类**孤儿行**如实列出（`present: false`），
 * 让用户能进来清掉，但面板绝不自动删除任何策略。
 */

import type { JSX, ReactNode } from 'react'
import type { WorkspaceScopeRow } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { PolicyEditorView } from './PolicyEditorView.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function WorkspacesView(props: { hub: SkillHubState; notices?: ReactNode }): JSX.Element {
  const { hub, notices } = props
  const flow = hub.workspaceFlow

  // ---------------------------------------------------------------- 列表态
  // 与 ScopesView 同样：内联视图的根必须是 Fragment，只吐 .section 卡片。

  if (flow.editingWorkspace === null) {
    const state = flow.workspaceState
    if (state === null) return <p className={css.empty}>{tt('workspace.loading')}</p>
    if (!state.available) {
      return (
        <>
          <p className={css.empty}>{tt('workspace.unavailable', { reason: state.unavailableReason ?? 'unknown' })}</p>
          <p className={css.hintLine}>{tt('workspace.unavailableHint')}</p>
        </>
      )
    }
    if (state.workspaces.length === 0) {
      return (
        <>
          <p className={css.empty}>{tt('workspace.empty')}</p>
          <p className={css.hintLine}>{tt('workspace.emptyHint')}</p>
        </>
      )
    }
    return (
      <>
        {state.pendingCount > 0 ? <p className={css.hintLine}>{tt('workspace.pendingNotice', { count: state.pendingCount })}</p> : null}
        <div className={css.section}>
          {state.workspaces.map((row) => (
            <WorkspaceRow key={row.id} row={row} busy={flow.workspaceBusy} onEdit={() => { flow.beginWorkspaceEdit(row) }} />
          ))}
        </div>
        <p className={css.hintLine}>{tt('workspace.listHint')}</p>
      </>
    )
  }

  // ---------------------------------------------------------------- 编辑态
  // 工作区隔离没有"接线等待"：闸门按 preset 注入、隐藏集合按 cwd 现算，
  // 所以生效时机只有一句话，不像模式那样分 mounted / notMounted 两种。

  const row = flow.editingWorkspace
  return (
    <PolicyEditorView
      draft={flow.draft}
      groupsState={hub.groupsState}
      catalog={hub.catalog}
      subjectName={row.title ?? row.path ?? row.id}
      subjectKind={tt('policy.subjectWorkspace')}
      effect={tt('workspace.effectHint')}
      notices={notices}
    />
  )
}

/** 列表里的一行：工作区身份 + 会话数（或"已不在 DSH 里"）+ 策略摘要 + 配置入口。 */
function WorkspaceRow(props: { row: WorkspaceScopeRow; busy: boolean; onEdit: () => void }): JSX.Element {
  const { row, busy, onEdit } = props
  const enabled = row.policy.enabled
  const label = row.title ?? row.path ?? row.id
  const status = row.present
    ? (row.sessionCount > 0 ? tt('workspace.sessionCount', { count: row.sessionCount }) : tt('workspace.noSession'))
    : tt('workspace.orphan')
  const hint = !row.present ? tt('workspace.orphanHint') : enabled ? tt('workspace.effectHint') : undefined
  return (
    <div className={css.row + ' ' + css.rowStatic} title={hint}>
      <div className={css.rowMain}>
        <div className={css.rowName}>
          <span className={css.rowNameText}>{label}</span>
          {row.present ? null : <span className={css.badge + ' ' + css.badgeReadonly}>{tt('workspace.orphan')}</span>}
        </div>
        <div className={css.rowDesc}>{row.present ? (row.path ?? row.id) : row.id} · {status}</div>
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
