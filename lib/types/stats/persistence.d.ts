import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
/** Narrow structural view of the session-query service (kept loose for tests). */
export interface SessionQueryLike {
    listSessions(signal?: AbortSignal): Promise<Array<{
        header: {
            id: SessionId;
            createdAt?: number;
        };
    }>>;
    readSession(id: SessionId): Promise<{
        events: SessionEvent[];
    }>;
}
/**
 * Narrow structural view of the host's session-persistence seam (kept loose
 * so no runtime import of host packages is needed — the owner adapts the real
 * service via {@link asPersistenceSeam}). Raw log reads here cost decompress +
 * parse only: no Session restore, no per-event clone, no deep-freeze.
 */
export interface ColdSessionSnapshot {
    header: {
        id: SessionId;
        createdAt?: number;
    };
    /** Opaque per-session change token, kept as its string form. */
    revision: string;
}
/** One read handle over a stored session log (always closed after counting). */
export interface ColdSessionHandle {
    read(): Promise<{
        events: SessionEvent[];
    }>;
    close(): Promise<void> | void;
}
/** Minimal persistence surface the cold scan needs. */
export interface SessionPersistenceLike {
    /** Lightweight listing: headers + revision tokens, no event logs. */
    list(): Promise<readonly ColdSessionSnapshot[]>;
    open(id: SessionId, access: 'read'): Promise<ColdSessionHandle>;
}
/**
 * Adapt a host persistence service to {@link SessionPersistenceLike}.
 * Shape-checked only (no I/O): returns undefined when the value is not a
 * usable seam, so callers fall back to the query path. The adapter re-resolves
 * nothing and holds no state — a replaced host service surfaces as ordinary
 * per-call failures, which scans already tolerate.
 */
export declare function asPersistenceSeam(service: unknown): SessionPersistenceLike | undefined;
