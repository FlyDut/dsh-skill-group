/**
 * Full-page skill detail view: metadata, upstream source card with check/sync
 * actions, and the raw SKILL.md body. Pure presentation — every state value
 * and action arrives as a prop, so the panel stays the single owner of state.
 */

import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import type { GroupsResponse, HubConfig, SkillDetail, SourceCheckResult, SourcesResponse } from '../../protocol.ts'
import { copyTextToClipboard, isDisplayNameDistinct, tt } from '../helpers.ts'
import css from './panel.module.css'
import { dotStyle, formatDateTime, shortSha } from './format.ts'
import { SourceStatusBadge } from './SourceStatusBadge.tsx'

interface SkillDetailViewProps {
  detail: SkillDetail
  /**
   * 面板的错误/成功横幅。这个视图是整页替换，主视图的横幅位置它拿不到，
   * 但"启用失败""同步失败"恰好发生在这里，所以由面板把片段传进来渲染在顶部。
   */
  notices?: ReactNode
  hubConfig: HubConfig | null
  /** skillName → usage stat (count + last used). */
  uses: ReadonlyMap<string, { count: number; lastUsed?: number }>
  groupsState: GroupsResponse | null
  sourcesState: SourcesResponse | null
  sourceCheck: Readonly<Record<string, SourceCheckResult>>
  checkingSource: string | null
  syncingSource: string | null
  /** Re-enable a skill that is switched off at runtime. */
  onEnable?: () => void
  onBack: () => void
  /** Check one source repo for upstream updates. */
  onCheck: (repo: string) => void
  /** Request syncing the skill (overwrites local edits; opens a confirm). */
  onSync: (repo: string, skills: string[]) => void
}

export function SkillDetailView(props: SkillDetailViewProps): JSX.Element {
  const { detail, notices, hubConfig, uses, groupsState, sourcesState, sourceCheck, checkingSource, syncingSource, onEnable, onBack, onCheck, onSync } = props
  const detailSource = sourcesState?.sources.find((source) => source.skills.includes(detail.name))
  const detailCheck = detailSource !== undefined ? sourceCheck[detailSource.repo] : undefined
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(copyTimer.current) }, [])
  const copyText = (text: string, key: string): void => {
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(key)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(null) }, 1200)
    })
  }
  return (
    <div className={css.panel}>
      {notices}
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={onBack}>{tt('detail.back')}</button>
        <span className={css.detailName} style={{ display:'inline-flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {detail.name}
          {isDisplayNameDistinct(detail.name, detail.displayName) ? <span className={css.displayName} style={{ fontSize:13, marginLeft:0 }}>{detail.displayName}</span> : null}
          {detail.invocation.modelInvocable
            ? <span className={css.dot + ' ' + css.dotModel} style={dotStyle(hubConfig?.dotModelColor)} title={tt('legend.model')} />
            : detail.invocation.userInvocable
              ? <span className={css.dot + ' ' + css.dotUser} style={dotStyle(hubConfig?.dotUserColor)} title={tt('legend.user')} />
              : null}
        </span>
        <span className={css.actions} style={{ marginLeft: 'auto', gap: 6 }}>
          {detail.enabled === false && onEnable !== undefined ? <button type='button' className={css.opBtn} role='switch' aria-checked={false} aria-label={tt('row.enable')} onClick={onEnable}>{tt('row.enable')}</button> : null}
          <button type='button' className={css.opBtn} onClick={() => { copyText('$' + detail.name, 'mention') }}>{copied === 'mention' ? tt('detail.copied') : tt('detail.copyMention')}</button>
          {detail.path !== undefined ? <button type='button' className={css.opBtn} onClick={() => { const path = detail.path; if (path !== undefined) copyText(path, 'path') }}>{copied === 'path' ? tt('detail.copied') : tt('detail.copyPath')}</button> : null}
        </span>
      </div>
      <div className={css.detailMeta}>
        <div className={css.detailMetaLine}>{tt('detail.provider')}: {detail.provider}</div>
        {detail.addedAt !== undefined ? <div className={css.detailMetaLine}>{tt('detail.addedAt')}: {formatDateTime(detail.addedAt)}</div> : null}
        {detail.updatedAt !== undefined ? <div className={css.detailMetaLine}>{tt('detail.updatedAt')}: {formatDateTime(detail.updatedAt)}</div> : null}
        {detail.path !== undefined ? <div className={css.detailMetaLine}>{tt('detail.path')}: {detail.path}</div> : null}
        {detail.whenToUse !== undefined ? <div className={css.detailMetaLine}>{tt('detail.whenToUse')}: {detail.whenToUse}</div> : null}
        {(() => {
          const stat = uses.get(detail.name)
          if (stat === undefined || stat.count === 0) return null
          const at = stat.lastUsed !== undefined ? ' · ' + new Date(stat.lastUsed).toLocaleString() : ''
          return <div className={css.detailMetaLine}>{tt('detail.uses')}: {stat.count}{at}</div>
        })()}
        {(() => {
          const tags = (groupsState?.tags ?? []).filter((tag) => tag.skillNames.includes(detail.name)).map((tag) => tag.name)
          return tags.length > 0 ? <div className={css.detailMetaLine}>{tt('detail.groups')}: {tags.join(', ')}</div> : null
        })()}
      </div>
      {detailSource !== undefined ? (
        <div className={css.sourceCard}>
          <div className={css.sourceCardTitle}>
            <a className={css.sourceLink} href={'https://github.com/' + detailSource.repo} target='_blank' rel='noreferrer'>{detailSource.repo}</a>
            {detailSource.ref !== undefined ? <span className={css.badge + ' ' + css.badgeSource}>{detailSource.ref}</span> : null}
            <SourceStatusBadge check={detailCheck} />
          </div>
          <div className={css.detailMetaLine}>
            {tt('source.commit')}: {detailSource.commitSha === '' ? tt('source.unverified') : shortSha(detailSource.commitSha)}
          </div>
          <div className={css.buttons + ' ' + css.actionsTop}>
            <button type='button' className={css.opBtn} disabled={checkingSource !== null} onClick={() => { onCheck(detailSource.repo) }}>
              {checkingSource === detailSource.repo ? tt('source.checking') : tt('source.check')}
            </button>
            {detail.enabled ? (
              <button type='button' className={css.opBtn} disabled={syncingSource !== null} onClick={() => { onSync(detailSource.repo, [detail.name]) }}>
                {syncingSource === detailSource.repo ? tt('source.syncing') : tt('source.sync')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className={css.hintLine}>{tt('source.private')}</p>
      )}
      <pre className={css.detailContent}>{detail.content}</pre>
    </div>
  )
}
