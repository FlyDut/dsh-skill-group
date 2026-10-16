/**
 * Settings-card form machinery, vendored from the dsh-web-ui family bucket
 * (packages/dsh-task-board/src/client/settings-form.ts) and re-typed. Stages
 * one card's edits over one settings namespace and writes them on save.
 *
 * The Host is the only authority on whether a value was accepted — its
 * validators own the constraints no schema can express — so the outcome is
 * read back from the section rather than predicted here. A save that did not
 * land keeps its drafts, so the user can correct them instead of retyping.
 */
/** One editable field spec: formatting plus text parsing. */
interface FieldSpec {
    field: string;
    format: (value: unknown) => string;
    parse: (text: string) => {
        kind: 'set';
        value: unknown;
    } | {
        kind: 'clear';
    } | undefined;
}
/** A boolean field, edited through true/false draft text. */
export declare function booleanField(field: string): FieldSpec;
/** A #rrggbb color field, edited through hex draft text. */
export declare function colorField(field: string): FieldSpec;
/**
 * A secret field (API token): the stored value is never echoed back into the
 * draft (format always yields ''), so typing is always a fresh set and Reset
 * always unsets. An empty draft stages nothing.
 */
export declare function secretField(field: string): FieldSpec;
/**
 * A numeric field with range clamping. Integer by default: a fractional draft
 * is truncated so "5.5 分钟" cannot sneak past an integer-only schema.
 */
export declare function numberField(field: string, options?: {
    min?: number;
    max?: number;
    integer?: boolean;
}): FieldSpec;
/** Card-level state the chrome renders. */
export interface CardShell {
    available: boolean;
    exposed: boolean;
    writable: boolean;
    dirty: boolean;
    invalid: boolean;
    saving: boolean;
    failed: boolean;
}
/** One field's state from the effective section and its staged draft. */
export interface FieldState {
    text: string;
    overridden: boolean;
    invalid: boolean;
}
/**
 * The settings-form face this card consumes. Declared structurally rather than
 * imported so the card stays independent of the settings package's generics:
 * the browser half passes it `ctx.configForms.get<HubSettingsValue>(HUB_ENTRY_ID)`,
 * which satisfies this shape (ConfigForm<T>).
 */
export interface FormScope {
    subscribe(listener: () => void): () => void;
    getSnapshot(): {
        status: string;
        writable: boolean;
        value?: Record<string, unknown>;
        base?: unknown;
        user?: unknown;
    };
    /** Both write paths report host acceptance (ConfigForm.set/unset contract). */
    set(field: string, value: unknown): Promise<boolean>;
    unset(field: string): Promise<boolean>;
}
/** Stages one card's edits and writes them through the settings transport. */
export declare class CardForm {
    private readonly scope;
    private readonly specs;
    private readonly staged;
    private readonly listeners;
    private saving;
    private failed;
    /** @param scope - the bound settings scope for this card's namespace. */
    constructor(scope: FormScope, specs: FieldSpec[]);
    /** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
    bind<T>(project: () => T): import("@deepseek-ai/dsh-client-store").SnapshotStore<T>;
    /** Read the card-level state: what the Host serves, and what a save would do. */
    shell(): CardShell;
    /** Read one field's state from the effective section and its staged draft. */
    field(field: string): FieldState;
    /** The actions the card's slot registration injects. */
    actions(): {
        edit: (field: string, text: string) => void;
        resetField: (field: string) => void;
        save: () => void;
        discard: () => void;
    };
    /** Write every staged edit, then re-seed from what the Host accepted. */
    save(): Promise<void>;
    /** Every staged edit a save would write, in staging order. */
    plan(): Array<{
        field: string;
        run: (() => Promise<boolean>) | undefined;
    }>;
    private clear;
    private store;
    private userRecord;
    private stage;
    private specOf;
    private sectionValue;
    private baseValue;
    private stored;
    private publish;
}
export {};
