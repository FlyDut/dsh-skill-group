/**
 * The skill-hub plugin settings card: bridges the hub's settings
 * namespace (bound through the official settings transport) onto the
 * family-style staged card form (enabled master switch + agent announcement).
 * Registered into `plugins.bundle.config` under the bundle's package name, so
 * the Plugins manager renders it on skill-hub's own page. That slot is
 * dispatched with `view: 'page'` only, so the card always renders its full
 * form (no `summary` one-liner variant).
 */
import { type ReactElement } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CardShell, type FieldState, type FormScope } from './settings-form.ts';
/** The card's projected state. */
export interface SkillHubSettingsState extends CardShell {
    enabled: FieldState;
    announceToAgent: FieldState;
    dotModelColor: FieldState;
    dotUserColor: FieldState;
    showUseCount: FieldState;
    showUseTime: FieldState;
    showGroupSummary: FieldState;
    statsWindowDays: FieldState;
    statsScanMinutes: FieldState;
    githubToken: FieldState;
}
/** The business face the card's slot registration injects. */
interface SkillHubSettingsCardFace {
    hooks: {
        /** The card's snapshot store (projected form state). */
        skillHubSettingsCard: SnapshotStore<SkillHubSettingsState>;
    };
    save: () => void;
    discard: () => void;
    edit: (field: string, text: string) => void;
    resetField: (field: string) => void;
}
/** Props the slot renderer binds (locale copy + injected form actions). */
type SkillHubSettingsCardProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'skill-hub'> & InjectFace<SkillHubSettingsCardFace>;
/** Bridges the hub's config scope onto the card's staged form. */
export declare class SkillHubSettingsCardController {
    private readonly form;
    private readonly store;
    /** @param scope - the hub settings scope the card edits (FormScope-compatible). */
    constructor(scope: FormScope);
    private projection;
    /**
     * Build the face the card's slot registration injects.
     * @returns the card's snapshot hook and its form actions.
     */
    inject(): SkillHubSettingsCardFace;
}
/**
 * Render the skill-hub card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export declare function SkillHubSettingsCard(props: SkillHubSettingsCardProps): ReactElement;
export {};
