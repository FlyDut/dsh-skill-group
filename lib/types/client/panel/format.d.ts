/**
 * Shared display helpers for the panel views (skill rows, detail view, and
 * dialogs): dot color styling, relative/absolute time text, and commit-SHA
 * shortening. Kept in one place so the views render identically.
 *
 * The invocation-status dot defaults live here (not in the settings card) so
 * both the panel legend and the chat `/` skill menu draw from one source and
 * so this primitives-free module stays unit-testable.
 */
import type { CSSProperties } from 'react';
/** Model-invocable dot color default. Single source for the TS side; the
 *  panel's CSS mirrors it via --hub-model (panel.module.css). */
export declare const DEFAULT_DOT_MODEL_COLOR = "#2f81f7";
/** User-invocable dot color default. Single source for the TS side; the
 *  panel's CSS mirrors it via --hub-user (panel.module.css). */
export declare const DEFAULT_DOT_USER_COLOR = "#3fb950";
/** Dot inline style from the user-chosen color (undefined keeps the CSS default). */
export declare function dotStyle(color: string | undefined): CSSProperties | undefined;
/** Localized relative-time text for a Unix-ms timestamp. */
export declare function relativeTimeText(ms: number): string;
/** Localized absolute time for the detail meta (e.g. "2026/8/16 11:00:00"). */
export declare function formatDateTime(ms: number): string;
/** Short form of a commit SHA for display. */
export declare function shortSha(sha: string): string;
