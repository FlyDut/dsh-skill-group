/**
 * Shared dialog family for the panel: one overlay shell plus the specific
 * dialogs (group-close conflict, sync/delete confirm, branch picker, market
 * sync selection, and the new-skill scaffold). Every dialog closes on outside
 * click and keeps the same role/aria shell; the panel owns all dialog state.
 */

import { useEffect, useState, type JSX, type ReactNode } from 'react'
import type { CollectionGroup, SkillTag, WritableRoot } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { groupNamesOf } from '../grouping.ts'
import css from './panel.module.css'

/** A group-close conflict waiting for the user's decision. */
export interface ConflictDialogState {
  /** Group key: 'tag:<id>' or 'col:<name>'. */
  key: string
  name: string
  /** Conflicting skill names (enabled here and in other groups). */
  conflicts: string[]
}

/** A destructive/sync confirmation waiting for the user's decision. */
export interface ConfirmDialogState {
  kind: 'sync' | 'delete'
  repo: string
  /** Skills the action applies to. */
  skills: string[]
}

/** Branch picker shown when a repo has no release and no pinned ref. */
export interface BranchChoiceState {
  repo: string
  branches: string[]
  selected: string
}

/** Version picker for a market source: releases + branches + custom ref. */
export interface VersionChoiceState {
  repo: string
  current?: string
  releases: string[]
  branches: string[]
  selected: string
  custom: string
  loading: boolean
}

/** Post-sync skill update dialog: which tracked skills to refresh. */
export interface MarketSyncDialogState {
  repo: string
  ref: string
  skills: string[]
  selected: ReadonlySet<string>
}

/** Overlay + centered dialog shell; outside click or Escape cancels. */
function DialogShell(props: { onClose: () => void; children: ReactNode; role?: 'alertdialog' | 'dialog'; wide?: boolean }): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  })
  return (
    <div className={css.dialogOverlay} onClick={props.onClose}>
      <div
        className={props.wide === true ? css.dialog + ' ' + css.dialogWide : css.dialog}
        role={props.role ?? 'alertdialog'}
        aria-modal='true'
        onClick={(event) => { event.stopPropagation() }}
      >
        {props.children}
      </div>
    </div>
  )
}

/** Simple confirm dialog: title + text + optional skill list + cancel/confirm. */
export function ConfirmDialog(props: {
  title: string
  text: string
  /** Optional skill names listed between the text and the buttons. */
  items?: readonly string[]
  confirmLabel: string
  /** Danger-styled confirm button (destructive actions). */
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { title, text, items, confirmLabel, danger, onCancel, onConfirm } = props
  return (
    <DialogShell onClose={onCancel}>
      <h3 className={css.dialogTitle}>{title}</h3>
      <p className={css.dialogText}>{text}</p>
      {items !== undefined ? (
        <ul className={css.dialogList}>
          {items.map((name) => <li key={name}><span className={css.rowNameText}>{name}</span></li>)}
        </ul>
      ) : null}
      <div className={css.dialogActions}>
        <button type='button' className={css.button} onClick={onCancel}>{tt('form.cancel')}</button>
        <button type='button' className={css.button + (danger === true ? ' ' + css.danger : ' ' + css.primary)} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  )
}

/** New-skill scaffold: name + routing description + markdown body + target root, in a dialog. */
export function CreateSkillDialog(props: {
  name: string
  desc: string
  /** Markdown body written after the generated frontmatter; blank means the scaffold placeholder. */
  content: string
  root: WritableRoot
  busy: boolean
  /** Inline failure from the last attempt; closes with the dialog. */
  message: { kind: 'error' | 'success'; text: string } | null
  onName: (value: string) => void
  onDesc: (value: string) => void
  onContent: (value: string) => void
  onRoot: (value: WritableRoot) => void
  onCancel: () => void
  onSubmit: () => void
}): JSX.Element {
  const { name, desc, content, root, busy, message, onName, onDesc, onContent, onRoot, onCancel, onSubmit } = props
  return (
    <DialogShell role='dialog' wide onClose={onCancel}>
      <h3 className={css.dialogTitle}>{tt('form.title')}</h3>
      <form className={css.dialogForm} onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <div className={css.formRow}>
          <label className={css.formLabel}>{tt('form.name')}</label>
          <input className={css.input} value={name} autoFocus onChange={(event) => { onName(event.target.value) }} placeholder='code-review' />
        </div>
        <div className={css.formRow}>
          <label className={css.formLabel}>{tt('form.desc')}</label>
          <input className={css.input} value={desc} onChange={(event) => { onDesc(event.target.value) }} placeholder={tt('form.descPlaceholder')} />
        </div>
        <div className={css.formRow}>
          <label className={css.formLabel}>{tt('form.content')}</label>
          <textarea
            className={css.textarea}
            value={content}
            rows={9}
            spellCheck={false}
            onChange={(event) => { onContent(event.target.value) }}
            placeholder={tt('form.contentPlaceholder')}
          />
        </div>
        <div className={css.formRow}>
          <label className={css.formLabel}>{tt('form.root')}</label>
          <select className={css.select} value={root} onChange={(event) => { onRoot(event.target.value as WritableRoot) }}>
            <option value='user-dsh'>~/.dsh/skills</option>
            <option value='user-agents'>~/.agents/skills</option>
          </select>
        </div>
        {message !== null ? <div className={message.kind === 'error' ? css.formError : css.formSuccess}>{message.text}</div> : null}
        <div className={css.dialogActions}>
          <button type='button' className={css.button} onClick={onCancel}>{tt('form.cancel')}</button>
          <button type='submit' className={css.button + ' ' + css.primary} disabled={busy}>{busy ? tt('form.busy') : tt('form.submit')}</button>
        </div>
      </form>
    </DialogShell>
  )
}

/** Group-close conflict: which skills stay on, and which other groups also enable them. */
export function ConflictDialog(props: {
  dialog: ConflictDialogState
  tags: readonly SkillTag[]
  collections: readonly CollectionGroup[]
  onClose: () => void
  onKeepOn: () => void
  onCloseAll: () => void
}): JSX.Element {
  const { dialog, tags, collections, onClose, onKeepOn, onCloseAll } = props
  return (
    <DialogShell onClose={onClose}>
      <h3 className={css.dialogTitle}>{tt('groups.conflictTitle')}</h3>
      <p className={css.dialogText}>{tt('groups.conflictText')}</p>
      <ul className={css.dialogList}>
        {dialog.conflicts.map((name) => (
          <li key={name}>
            <span className={css.rowNameText}>{name}</span>
            {' — ' + groupNamesOf(name, [...tags], [...collections]).join(', ')}
          </li>
        ))}
      </ul>
      <div className={css.dialogActions}>
        <button type='button' className={css.button} onClick={onKeepOn}>{tt('groups.keepOn')}</button>
        <button type='button' className={css.button + ' ' + css.primary} onClick={onCloseAll}>{tt('groups.closeAll')}</button>
      </div>
    </DialogShell>
  )
}

/** Branch picker for a repo without releases (pins the ref, then rescans). */
export function BranchChoiceDialog(props: {
  choice: BranchChoiceState
  busy: boolean
  onSelect: (branch: string) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { choice, busy, onSelect, onCancel, onConfirm } = props
  return (
    <DialogShell onClose={onCancel}>
      <h3 className={css.dialogTitle}>{tt('market.branchTitle')}</h3>
      <p className={css.dialogText}>{tt('market.branchHint')}</p>
      <select className={css.select + ' ' + css.dialogSelect} value={choice.selected}
        onChange={(event) => { onSelect(event.target.value) }}>
        {choice.branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
      </select>
      <div className={css.dialogActions}>
        <button type='button' className={css.button} onClick={onCancel}>{tt('form.cancel')}</button>
        <button type='button' className={css.button + ' ' + css.primary} disabled={busy} onClick={onConfirm}>{tt('market.branchConfirm')}</button>
      </div>
    </DialogShell>
  )
}

/** Version picker: switch a market source's tracked ref (release / branch / custom). */
export function VersionChoiceDialog(props: {
  choice: VersionChoiceState
  busy: boolean
  onSelect: (ref: string) => void
  onCustom: (custom: string) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { choice, busy, onSelect, onCustom, onCancel, onConfirm } = props
  const effective = choice.custom.trim() !== '' ? choice.custom.trim() : choice.selected
  type RefGroup = 'releases' | 'branches'
  const branchOptions = choice.branches.filter((branch) => !choice.releases.includes(branch))
  const [refGroup, setRefGroup] = useState<RefGroup>(
    choice.releases.includes(choice.selected) || choice.branches.length === 0 ? 'releases' : 'branches',
  )
  // The dialog starts in a loading state and receives the release/branch
  // lists in a later render. Align the group once that data arrives, without
  // resetting it after the user selects another ref.
  useEffect(() => {
    if (choice.loading) return
    if (choice.releases.includes(choice.selected)) setRefGroup('releases')
    else if (branchOptions.includes(choice.selected)) setRefGroup('branches')
  }, [choice.loading, choice.repo])
  const activeRefs = refGroup === 'releases' ? choice.releases : branchOptions
  const listedRefs = [...choice.releases, ...branchOptions]
  const currentUnlistedRef = choice.selected !== '' && !listedRefs.includes(choice.selected) ? choice.selected : undefined
  const selectRefs = currentUnlistedRef !== undefined ? [currentUnlistedRef, ...activeRefs] : activeRefs
  const selectValue = selectRefs.includes(choice.selected) ? choice.selected : selectRefs[0] ?? ''
  const selectGroup = (next: RefGroup): void => {
    setRefGroup(next)
    const nextRefs = next === 'releases' ? choice.releases : branchOptions
    if (nextRefs.length > 0 && !nextRefs.includes(choice.selected)) onSelect(nextRefs[0])
  }
  return (
    <DialogShell onClose={onCancel}>
      <h3 className={css.dialogTitle}>{tt('market.versionTitle')}</h3>
      <p className={css.dialogText}>{tt('market.versionText', { repo: choice.repo })}{choice.current !== undefined ? ` (${tt('market.versionCurrent', { ref: choice.current })})` : ''}</p>
      {choice.loading ? <p className={css.dialogText}>{tt('market.scanning')}</p> : (
        <>
          <div className={css.segmented} role='group' aria-label={tt('market.versionTitle')} style={{ marginBottom: 8 }}>
            <button
              type='button'
              className={css.segBtn + (refGroup === 'releases' ? ' ' + css.segBtnActive : '')}
              disabled={choice.releases.length === 0}
              aria-pressed={refGroup === 'releases'}
              onClick={() => { selectGroup('releases') }}
            >{tt('market.versionReleases')}</button>
            <button
              type='button'
              className={css.segBtn + (refGroup === 'branches' ? ' ' + css.segBtnActive : '')}
              disabled={branchOptions.length === 0}
              aria-pressed={refGroup === 'branches'}
              onClick={() => { selectGroup('branches') }}
            >{tt('market.versionBranches')}</button>
          </div>
          {selectValue !== '' ? (
            <select className={css.select + ' ' + css.dialogSelect} value={selectValue}
              onChange={(event) => { onSelect(event.target.value) }}>
              {selectRefs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}
            </select>
          ) : null}
          <p className={css.dialogText} style={{ marginBottom: 4 }}>{tt('market.versionCustom')}</p>
          <input className={css.input + ' ' + css.dialogSelect} value={choice.custom}
            onChange={(event) => { onCustom(event.target.value) }} placeholder='v1.2.3 / main / abc1234' />
        </>
      )}
      <div className={css.dialogActions}>
        <button type='button' className={css.button} onClick={onCancel}>{tt('form.cancel')}</button>
        <button type='button' className={css.button + ' ' + css.primary} disabled={busy || choice.loading || effective === ''} onClick={onConfirm}>
          {busy ? tt('source.syncing') : tt('market.versionConfirm', { ref: effective })}
        </button>
      </div>
    </DialogShell>
  )
}

/** Post-sync selection: which tracked skills to batch-update to the new version. */
export function MarketSyncDialog(props: {
  dialog: MarketSyncDialogState
  busy: boolean
  onToggle: (name: string, checked: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { dialog, busy, onToggle, onCancel, onConfirm } = props
  return (
    <DialogShell onClose={onCancel}>
      <h3 className={css.dialogTitle}>{tt('market.syncTitle')}</h3>
      <p className={css.dialogText}>{tt('market.syncText', { ref: dialog.ref })}</p>
      {dialog.skills.length === 0 ? (
        <p className={css.dialogText}>{tt('market.syncNone')}</p>
      ) : (
        <div className={css.dialogList}>
          {dialog.skills.map((name) => (
            <label key={name} className={css.dialogRow}>
              <input type='checkbox' checked={dialog.selected.has(name)}
                onChange={(event) => { onToggle(name, event.target.checked) }} />
              <span className={css.rowNameText}>{name}</span>
            </label>
          ))}
        </div>
      )}
      <div className={css.dialogActions}>
        <button type='button' className={css.button} onClick={onCancel}>{tt('market.syncCancel')}</button>
        <button type='button' className={css.button + ' ' + css.primary} disabled={busy || dialog.skills.length === 0} onClick={onConfirm}>
          {busy ? tt('source.syncing') : tt('source.sync')}
        </button>
      </div>
    </DialogShell>
  )
}
