/**
 * One switched-off skill row (name + description + source badge + enable
 * switch, plus the edit-mode delete entry). Shared by the source-group lists,
 * the scene-group lists, and the bottom disabled section.
 */

import type { JSX, KeyboardEvent } from 'react'
import type { CatalogSkill } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import type { HubKey } from '../locales.ts'
import css from './panel.module.css'

/** Source badge label for a switched-off row, derived from its origin. */
function disabledSourceLabel(source: string): string {
  return tt(('badge.source.' + source) as HubKey)
}

export function DisabledRow(props: { record: CatalogSkill; busy: boolean; onEnable: () => void; duplicate?: boolean; onOpen?: () => void; stageDelete?: (name: string) => void }): JSX.Element {
  const { record, busy, onEnable, duplicate, onOpen, stageDelete } = props
  /** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内开关）时生效。 */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (onOpen === undefined || event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  return (
    <div
      className={css.row + (onOpen === undefined ? ' ' + css.rowStatic : '')}
      role={onOpen === undefined ? undefined : 'button'}
      tabIndex={onOpen === undefined ? undefined : 0}
      aria-label={onOpen === undefined ? undefined : tt('row.open', { name: record.name })}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <div className={css.rowMain}>
        <div className={css.rowName}>{record.name}{duplicate === true ? <span className={css.badge + ' ' + css.statusError} style={{ marginLeft: 6 }} title={tt('row.duplicateHint')}>{tt('row.duplicate')}</span> : null}</div>
        <div className={css.rowDesc} title={record.description}>{record.description}</div>
      </div>
      <span className={css.badges}>
        <span className={css.badge + ' ' + css.badgeSource}>{disabledSourceLabel(record.source)}</span>
      </span>
      {stageDelete !== undefined && record.writable ? (
        <button type='button' className={css.opBtn + ' ' + css.opDanger} title={tt('row.deleteHint')} aria-label={tt('row.delete')} onClick={(event) => { event.stopPropagation(); stageDelete(record.name) }}>{tt('row.delete')}</button>
      ) : null}
      <button type='button' role='switch' aria-checked={false} aria-label={tt('row.enable')} className={css.switch} disabled={busy} onClick={(event) => { event.stopPropagation(); onEnable() }}><span className={css.switchThumb} /></button>
    </div>
  )
}
