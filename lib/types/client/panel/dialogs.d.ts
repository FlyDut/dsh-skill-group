/**
 * Shared dialog family for the panel: one overlay shell plus the specific
 * dialogs (group-close conflict, sync/delete confirm, branch picker, market
 * sync selection, and the new-skill scaffold). Every dialog closes on outside
 * click and keeps the same role/aria shell; the panel owns all dialog state.
 */
import { type JSX } from 'react';
import type { CollectionGroup, SkillTag, WritableRoot } from '../../protocol.ts';
/** A group-close conflict waiting for the user's decision. */
export interface ConflictDialogState {
    /** Group key: 'tag:<id>' or 'col:<name>'. */
    key: string;
    name: string;
    /** Conflicting skill names (enabled here and in other groups). */
    conflicts: string[];
}
/** A sync confirmation waiting for the user's decision. */
export interface ConfirmDialogState {
    repo: string;
    /** Skills the action applies to. */
    skills: string[];
}
/** Branch picker shown when a repo has no release and no pinned ref. */
export interface BranchChoiceState {
    repo: string;
    branches: string[];
    selected: string;
}
/** Version picker for a market source: releases + branches + custom ref. */
export interface VersionChoiceState {
    repo: string;
    current?: string;
    releases: string[];
    branches: string[];
    selected: string;
    custom: string;
    loading: boolean;
}
/** Post-sync skill update dialog: which tracked skills to refresh. */
export interface MarketSyncDialogState {
    repo: string;
    ref: string;
    skills: string[];
    selected: ReadonlySet<string>;
}
/** Simple confirm dialog: title + text + optional skill list + cancel/confirm. */
export declare function ConfirmDialog(props: {
    title: string;
    text: string;
    /** Optional skill names listed between the text and the buttons. */
    items?: readonly string[];
    confirmLabel: string;
    /** Danger-styled confirm button (destructive actions). */
    danger?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** New-skill scaffold: name + routing description + markdown body + target root, in a dialog. */
export declare function CreateSkillDialog(props: {
    name: string;
    desc: string;
    /** Markdown body written after the generated frontmatter; blank means the scaffold placeholder. */
    content: string;
    root: WritableRoot;
    busy: boolean;
    /** Inline failure from the last attempt; closes with the dialog. */
    message: {
        kind: 'error' | 'success';
        text: string;
    } | null;
    onName: (value: string) => void;
    onDesc: (value: string) => void;
    onContent: (value: string) => void;
    onRoot: (value: WritableRoot) => void;
    onCancel: () => void;
    onSubmit: () => void;
}): JSX.Element;
/** Group-close conflict: which skills stay on, and which other groups also enable them. */
export declare function ConflictDialog(props: {
    dialog: ConflictDialogState;
    tags: readonly SkillTag[];
    collections: readonly CollectionGroup[];
    onClose: () => void;
    onKeepOn: () => void;
    onCloseAll: () => void;
}): JSX.Element;
/** Branch picker for a repo without releases (pins the ref, then rescans). */
export declare function BranchChoiceDialog(props: {
    choice: BranchChoiceState;
    busy: boolean;
    onSelect: (branch: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** Version picker: switch a market source's tracked ref (release / branch / custom). */
export declare function VersionChoiceDialog(props: {
    choice: VersionChoiceState;
    busy: boolean;
    onSelect: (ref: string) => void;
    onCustom: (custom: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** Post-sync selection: which tracked skills to batch-update to the new version. */
export declare function MarketSyncDialog(props: {
    dialog: MarketSyncDialogState;
    busy: boolean;
    onToggle: (name: string, checked: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
