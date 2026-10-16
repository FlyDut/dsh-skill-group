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
import type { JSX } from 'react';
import type { GroupSwitchState } from '../grouping.ts';
/** Props one group switch needs: the derived state plus its group identity. */
interface GroupSwitchButtonProps {
    /** Derived switch state of the group (all/none/some members enabled). */
    state: GroupSwitchState;
    /** Accessible name of the group (aria-label). */
    label: string;
    /** Known (toggleable) member count; a group without any cannot be toggled. */
    memberCount: number;
    /** Members the catalog no longer knows; reported in the tooltip only. */
    missingCount: number;
    /** True while a batch toggle is in flight. */
    batchBusy: boolean;
    /** True when at least one member can be switched from the hub. */
    hasTogglable: boolean;
    /** Toggle the whole group; the click's stopPropagation is applied here. */
    onToggle: () => void;
}
export declare function GroupSwitchButton(props: GroupSwitchButtonProps): JSX.Element;
export {};
