/**
 * Slash-menu skill dots: puts the invocation-status dot (model-callable blue /
 * user-only green) in front of every skill candidate in the chat `/` menu.
 *
 * Mechanism: hooks the `/skill` source's `candidates` so the hub learns which
 * rows are skill candidates and how each one classifies for model invocation,
 * then injects the dot straight into the rendered option rows. The menu's
 * `icon` slot is unusable for this — `MenuView` narrowed `icon` to an enum
 * ('file' | 'folder' | 'session') and renders it through `ReferenceIcon`, so a
 * custom element never reaches the DOM. Colors come from the same settings
 * (dotModelColor / dotUserColor) and the same `modelInvocable` classification
 * the panel legend uses — so the chat menu and the Settings → 技能 panel stay
 * in sync, and editing the color updates both.
 *
 * The skill source is registered by the core plugin under the `name` "skill"
 * on the `/` trigger; re-registering the same name would throw, so this wraps
 * the already-registered source object instead (found through the runtime
 * source registry, which the frozen contract exposes only as `registerSource`
 * / `sessionOf` — the lookup below is defensive: it never throws).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InputTriggerServiceContract, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { HubSettingsValue } from '../protocol.ts';
import type { SkillHubApi } from './api.ts';
/**
 * Find the core `/skill` source through the runtime registry, or undefined.
 * The lookup never throws: a missing/reshaped registry just means no dots. Exported
 * for unit tests; the apply path only calls it indirectly through setupSkillSlashDots.
 * @param service - the ctx.inputTriggers service face.
 * @returns the registered skill source, or undefined.
 */
export declare function findSkillSource(service: InputTriggerServiceContract): InputTriggerSource | undefined;
/**
 * Clear the modelInvocable cache. Called on connection/reset so a fresh
 * catalog wins after reconnect; exported for deterministic unit tests.
 */
export declare function resetModelCache(): void;
/**
 * Wrap the core skill source so every menu row carries the invocation dot.
 * Exported for unit tests; production wiring goes through setupSkillSlashDots.
 * @param source - the registered `/skill` source.
 * @param api - hub browser API for the modelInvocable lookup.
 * @param scope - hub settings scope for the dot colors.
 * @returns a disposer restoring the original candidates.
 */
export declare function wrapSkillSource(source: InputTriggerSource, api: SkillHubApi, scope: ConfigForm<HubSettingsValue>): () => void;
/**
 * Mount the slash-menu dots on the registered `/skill` source. Idempotent and
 * defensive: if the core source isn't registered yet (or the registry shape
 * changes), it retries briefly and then gives up silently — the chat keeps
 * working, it simply shows no dots. The returned disposer restores the
 * original candidates and clears the model cache.
 * @param ctx - the client root context (inputTriggers + events).
 * @param api - hub browser API.
 * @param scope - hub settings scope for dot colors.
 * @returns a cleanup function for `ctx.effect`.
 */
export declare function setupSkillSlashDots(ctx: ClientContext, api: SkillHubApi, scope: ConfigForm<HubSettingsValue>): () => void;
