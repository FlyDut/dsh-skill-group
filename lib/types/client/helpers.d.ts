/**
 * Shared panel helpers: the active-dictionary pick (document-language
 * based, family precedent) plus a small error-message extractor.
 */
import { type HubKey, type TranslateValues } from './locales.ts';
export declare function dictionary(): Record<string, string>;
/** Translate a key with optional {name} template params (current language). */
export declare function tt(key: HubKey, values?: TranslateValues): string;
/** Human-readable error text from an unknown thrown value. */
export declare function errorMessage(error: unknown): string;
/**
 * Whether a displayName is worth showing beside the kebab-case name.
 * Pure case/punctuation variants (e.g. "Code Review" vs "code-review") are redundant.
 */
export declare function isDisplayNameDistinct(name: string, displayName: string | undefined): displayName is string;
/**
 * Copy text to the clipboard. Uses the async API with a positioned-textarea
 * fallback for insecure contexts. Resolves true only when the copy succeeded.
 */
export declare function copyTextToClipboard(text: string): Promise<boolean>;
