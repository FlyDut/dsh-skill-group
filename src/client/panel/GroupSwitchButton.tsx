/**
 * The tri-state group switch shared by the source cards and the scene cards:
 * one switch whose state is derived from the group's members (every known
 * member enabled → 'on', none → 'off', otherwise 'mixed'). Only the group
 * identity, its member count and the toggle callback differ between the two
 * call sites.
 *
 * 'mixed' is a real state — a group may hold both switched-on and switched-off
 * members — so the switch always carries a title explaining what a click does,
 * and mentions members the catalog no longer knows (they cannot be toggled).
 */

import type { JSX, MouseEvent } from 'react'
import type { GroupSwitchState } from '../grouping.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

/** Props one group switch needs: the derived state plus its group identity. */
interface GroupSwitchButtonProps {
  /** Derived switch state of the group (all/none/some members enabled). */
  state: GroupSwitchState
  /** Accessible name of the group (aria-label). */
  label: string
  /** Known (toggleable) member count; a group without any cannot be toggled. */
  memberCount: number
  /** Members the catalog no longer knows; reported in the tooltip only. */
  missingCount: number
  /** True while a batch toggle is in flight. */
  batchBusy: boolean
  /** True when at least one member can be switched from the hub. */
  hasTogglable: boolean
  /** Toggle the whole group; the click's stopPropagation is applied here. */
  onToggle: () => void
}

export function GroupSwitchButton(props: GroupSwitchButtonProps): JSX.Element {
  const { state, label, memberCount, missingCount, batchBusy, hasTogglable, onToggle } = props
  const canToggle = memberCount > 0 && (state === 'off' || hasTogglable) && !batchBusy
  const stateHint = state === 'on' ? tt('groups.switchOn') : state === 'off' ? tt('groups.switchOff') : tt('groups.switchMixed')
  const title = canToggle
    ? stateHint + (missingCount > 0 ? ' · ' + tt('groups.missing', { count: missingCount }) : '')
    : tt('groups.noToggleable')
  return (
    <button type='button' role='switch' title={title}
      aria-checked={state === 'mixed' ? 'mixed' : state === 'on'} aria-label={label}
      className={css.switch + (state === 'on' ? ' ' + css.switchOn : state === 'mixed' ? ' ' + css.switchMixed : '')}
      disabled={!canToggle}
      onClick={(event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); onToggle() }}>
      <span className={css.switchThumb} />
    </button>
  )
}
