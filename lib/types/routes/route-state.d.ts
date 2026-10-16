/**
 * routes 共享状态：各类节流表、市场统计内存缓存、异步导入任务表。
 * 从 routes.ts 原样搬出，行为不变；各域 handler 从这里 import。
 */
import type { SkillHubRouteDeps } from './helpers.ts';
/** Minimum interval between network update checks per source (GitHub rate limits). */
export declare const MIN_CHECK_INTERVAL_MS: number;
/** Last successful check time per repo (in-memory throttle for GitHub rate limits). */
export declare const lastSourceCheck: Map<string, number>;
/** Last successful market update check per repo (same throttle). */
export declare const lastMarketCheck: Map<string, number>;
/** Market stats (stars/downloads) throttle: hourly, plus a fallback cache. */
export declare const lastMarketStats: Map<string, number>;
export declare const marketStatsCache: Map<string, {
    stars: number;
    downloads: number;
}>;
export declare const MARKET_STATS_TTL_MS: number;
export declare function seedMarketStats(deps: SkillHubRouteDeps): Promise<void>;
/** Async import job (B方案：jobId + 轮询，选项2后台继续) */
export interface ImportJob {
    jobId: string;
    total: number;
    done: number;
    current?: string;
    currentFile?: string;
    totalBytes: number;
    downloadedBytes: number;
    startTime: number;
    imported: Array<{
        name: string;
        origin: string;
        path: string;
    }>;
    skipped: Array<{
        name: string;
        reason: 'exists';
    }>;
    failed: Array<{
        name: string;
        error: string;
    }>;
    status: 'running' | 'done' | 'cancelled' | 'error';
    error?: string;
    controller: AbortController;
    createdAt: number;
}
export declare const importJobs: Map<string, ImportJob>;
export declare const IMPORT_JOB_MAX = 100;
export declare function gcImportJobs(): void;
/** Replace one skill directory with a fresh download; restores the old dir on failure. */
export declare function replaceSkillDir(targetDir: string, download: () => Promise<void>): Promise<void>;
