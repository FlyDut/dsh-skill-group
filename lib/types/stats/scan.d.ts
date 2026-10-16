import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type { SkillStat, SkillStatsCheckpoint } from '../protocol.ts';
import type { SessionPersistenceLike, SessionQueryLike } from './persistence.ts';
/** Fallback freeze horizon when no rolling window is configured (14 days). */
export declare const STATS_FREEZE_AFTER_MS: number;
/** Cadence of the full reconciliation that rebuilds the checkpoint (24 h). */
export declare const STATS_FULL_RECONCILE_MS: number;
/** Adaptive TTL factor: effective TTL ≥ this multiple of the last scan duration. */
export declare const STATS_TTL_SCAN_FACTOR = 3;
/** Per-skill invocation stats in one session's event log. */
export interface InvocationStat {
    count: number;
    /** Unix epoch ms of the most recent invocation in this batch. */
    lastUsed: number;
}
/** Collect per-skill invocation counts and last-used times from one session. */
export declare function countSkillInvocations(events: readonly SessionEvent[]): Map<string, InvocationStat>;
/**
 * One pass over the corpus. Runs either a full reconciliation (rebuilds the
 * per-session cache and advances the watermark — mutates the checkpoint) or a
 * cheap incremental scan (re-reads everything at or after the watermark and
 * merges over the cached sessions — leaves the checkpoint untouched). Totals
 * always apply the CURRENT window filter over the cached sessions, so a
 * window shrink takes effect immediately even before the next reconciliation.
 */
export declare function scan(query: SessionQueryLike, checkpoint: SkillStatsCheckpoint, nowMs: number, windowDays: number): Promise<{
    stats: SkillStat[];
    mutated: boolean;
}>;
/**
 * One pass over the corpus through the persistence seam. Reads are strictly
 * sequential and each handle is closed before the next opens, so at most one
 * raw log is resident. A session is re-read only when its revision token
 * changed since the checkpoint; the rolling window is applied from the
 * listing headers, so out-of-window logs are never even opened. Live sessions
 * (in-memory, possibly newer than their persisted revision) are read through
 * `readLive` and never enter the revision cache.
 *
 * A `list()` failure rejects — the reader keeps the previous totals, and the
 * next poll retries. Per-session failures are skipped, never fatal.
 */
export declare function scanCold(persistence: SessionPersistenceLike, checkpoint: SkillStatsCheckpoint, nowMs: number, windowDays: number, liveIds?: ReadonlySet<string>, readLive?: (id: SessionId) => Promise<readonly SessionEvent[] | undefined>): Promise<SkillStat[]>;
/**
 * Full-corpus totals in one shot (no checkpoint reuse). Kept as the
 * reference implementation for tests and one-off callers.
 */
export declare function readSkillStats(query: SessionQueryLike, windowDays?: number): Promise<SkillStat[]>;
/**
 * Full-corpus totals in one shot through the persistence seam (no checkpoint
 * reuse). Reference implementation for tests and one-off callers.
 */
export declare function readColdSkillStats(persistence: SessionPersistenceLike, windowDays?: number): Promise<SkillStat[]>;
