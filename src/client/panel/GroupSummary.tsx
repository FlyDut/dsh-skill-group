/**
 * Group-header usage summary: total invocation count chip + the group's most
 * recent last-used time. Honours the showGroupSummary config switch.
 */

import type { JSX } from 'react'
import type { HubConfig } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { relativeTimeText } from './format.ts'
import css from './panel.module.css'

/** The narrowed hub surface one group summary consumes. */
interface GroupSummaryProps {
  /** The group's member skill names. */
  members: readonly string[]
  /** skillName → usage stats. */
  uses: ReadonlyMap<string, { count: number; lastUsed?: number }>
  /** Effective hub config; null while it has not loaded. */
  hubConfig: HubConfig | null
  /**
   * 把该分组当作可见性白名单的模式显示名（只含已启用隔离的模式）。
   * 缺省或为空时不渲染——没在用这个功能的部署看不到任何额外元素。
   */
  scopeModes?: readonly string[]
  /**
   * 把该分组当作可见性白名单的工作区显示名（只含已启用隔离的工作区）。
   * 与 `scopeModes` 并排渲染：一个分组可能同时被若干模式与若干工作区引用。
   */
  scopeWorkspaces?: readonly string[]
}

export function GroupSummary(props: GroupSummaryProps): JSX.Element {
  const { members, uses, hubConfig, scopeModes, scopeWorkspaces } = props
  let total = 0
  let latest: number | undefined
  for (const name of members) {
    const stat = uses.get(name)
    if (stat === undefined) continue
    total += stat.count
    if (stat.lastUsed !== undefined && (latest === undefined || stat.lastUsed > latest)) latest = stat.lastUsed
  }
  return (
    <span className={css.groupTitleInner}>
      {hubConfig?.showGroupSummary !== false && total > 0 ? <span className={css.useCount}>{total}</span> : null}
      {hubConfig?.showGroupSummary !== false && latest !== undefined ? <span className={css.useTime + ' ' + css.groupTime}>{relativeTimeText(latest)}</span> : null}
      {scopeModes !== undefined && scopeModes.length > 0
        ? (
            <span
              className={css.badge}
              title={tt('scope.badgeTitle', { count: scopeModes.length, names: scopeModes.join(', ') })}
            >{tt('scope.tab')} · {scopeModes.join(', ')}</span>
          )
        : null}
      {scopeWorkspaces !== undefined && scopeWorkspaces.length > 0
        ? (
            <span
              className={css.badge}
              title={tt('workspace.badgeTitle', { count: scopeWorkspaces.length, names: scopeWorkspaces.join(', ') })}
            >{tt('workspace.tab')} · {scopeWorkspaces.join(', ')}</span>
          )
        : null}
    </span>
  )
}
