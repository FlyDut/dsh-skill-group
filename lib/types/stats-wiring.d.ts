/**
 * 调用次数统计的接线。
 *
 * Optional trigger statistics: while a session-query service exists, wire a
 * cached invocation-count reader into the stats route. The caller re-syncs its
 * routes once a reader is installed (no sessionQuery service ever mounted
 * means none of this runs).
 *
 * Read-path preference: the host's sessionPersistence seam serves raw stored
 * logs (decompress + parse only — no Session restore/validation, the host
 * cost that OOMed large histories, see issue #7), with the query seam
 * covering live sessions. Without a persistence service the reader falls
 * back to sequential query reads. Scans are strictly lazy: the first one
 * starts on the panel's first /stats poll, never at plugin startup (a
 * headless boot with no browser must not pay for statistics nobody reads).
 *
 * Mount ordering between the two host services is not guaranteed, so the
 * reader is (re-)built generation-guarded: a query-only reader wires
 * immediately, and a later-arriving persistence service upgrades it to the
 * cold path. A superseded build never assigns.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type HubConfig } from './protocol.ts';
import { type SkillStatsReader } from './stats.ts';
import type { SkillHubStore } from './store.ts';
interface InvocationStatsOptions {
    ctx: Context;
    store: SkillHubStore;
    /** 实时配置：扫描间隔与滚动窗口都从这里读，卡片里改完即生效。 */
    current: () => HubConfig;
    /** reader 就绪后交给调用方（调用方通常会再 sync 一次把路由挂上）。 */
    install: (reader: SkillStatsReader) => void;
}
/** 软接线 sessionQuery / sessionPersistence；两个服务都不在时什么都不做。 */
export declare function wireInvocationStats(options: InvocationStatsOptions): void;
export {};
