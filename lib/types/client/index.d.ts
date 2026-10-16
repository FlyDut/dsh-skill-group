/**
 * Browser-half entry for the skill-hub plugin — runs inside the dsh
 * web GUI.
 *
 * Registers the skill-hub locale dictionaries and mounts:
 *  - a top-level Settings section (Settings → 技能分组) hosting the skill hub
 *    panel: catalog, search, enable/disable, diagnostics, new-skill form;
 *  - the chat "/" menu skill dots, colored from the same config the panel reads.
 *
 *  - a configuration card in the `plugins.bundle.config` slot, keyed by the
 *    BUNDLE PACKAGE NAME, rendered on the plugin's own page in the Plugins
 *    manager (sidebar → 插件 → skill-hub). dsh 0.1.7 has no auto-generated
 *    config page: the manager only renders that section for bundles that
 *    register this slot, and the card writes through the shared config form
 *    (`ctx.configForms.get(skill-hub)`), the same form the host routes read.
 *
 * Failure policy: mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and an external
 * plugin must not take the GUI down.
 *
 * Export discipline (packages/client rule): the /client surface carries
 * what cordis loading needs plus types only — all value exports stay
 * internal.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        slots: any;
    }
}
import { type HubKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** skill-hub surface copy. */
        'skill-hub': HubKey;
    }
}
/**
 * Required services (fiber inject waiting — the runtime must be up first).
 * `connection`/`remote` are the settings transport's own prerequisites
 * (`ctx.configForms.get` resolves them on the caller's fiber), and
 * `configForms` is the shared settings-form service itself; mirror the
 * official settings-plugins inject list.
 */
export declare const inject: string[];
/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { SkillHubPanelProps } from './panel/SkillHubPanel.tsx';
export type { SkillHubSettingsState } from './SkillHubSettingsCard.tsx';
export type { HubKey } from './locales.ts';
/**
 * Mount the settings card and the skill hub section.
 * @param ctx - client root context (slots, locale).
 */
export declare function apply(ctx: ClientContext): void;
