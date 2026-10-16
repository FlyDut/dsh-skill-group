/**
 * hooks 共享层：域 hooks 之间传递的通知接口、状态机类型、轮询常量、
 * 每日自动检查 helpers。从 useSkillHub.ts 原样搬出，行为不变。
 */
import type { MarketCheckResponse, MarketSourceRecord, RepoDiscoverResponse } from '../../../protocol.ts';
/**
 * 跨域共享的通知原语：聚合根用稳定的 setState setter 实现一次，
 * 各域 hooks 只调接口，不直接碰别人的 state。对象本身经 useMemo
 * 常驻，域回调的 useCallback 依赖它不会失稳。
 */
export interface FlowNotices {
    /** 报错条幅（覆盖旧报错）。 */
    fail: (message: string) => void;
    /** 清掉报错条幅。 */
    clearFail: () => void;
    /** 成功条幅（null = 清掉）。 */
    succeed: (message: string | null) => void;
    /** tag 域忙碌开关（多域共用）。 */
    setTagBusy: (busy: boolean) => void;
    /** 整组操作忙碌开关（toggle-batch 与全部更新共用）。 */
    setBatchBusy: (busy: boolean) => void;
}
/**
 * 统一异步动作外壳：清错 → 执行 → 异常转错误条幅 → 收尾（忙碌开关）。
 * 只用于同形的 clearFail/try/catch/finally 站点；成功后清错、自定义收尾、
 * 需要返回值的站点保持内联。
 */
export declare function runFlow<T>(shared: FlowNotices, body: () => Promise<T>, settle?: () => void): Promise<T | undefined>;
/** Catalog poll interval while the panel is mounted (the provider watcher feeds this). */
export declare const POLL_MS = 5000;
/** Relaxed poll for slower-changing data (stats, groups, sources, config). */
export declare const SLOW_POLL_MS = 60000;
/** 空统计补捞上限：冷启动全量扫描（数十 MB 会话日志）可能超过 2 分钟，72 次约 6 分钟内保持 5 秒粒度，之后交回 60 秒慢轮询。 */
export declare const USES_CATCH_UP_MAX = 72;
/** Whether the daily auto-check should run now (first visit or ≥24h since the last). */
export declare function shouldAutoCheck(): boolean;
/** Record that the daily auto-check ran. */
export declare function markAutoChecked(): void;
/** Repo scanner/import state (drives the market source preview). */
export type RepoDiscoverState = {
    status: 'idle';
} | {
    status: 'scanning';
} | {
    status: 'ready';
    data: RepoDiscoverResponse;
} | {
    status: 'error';
    message: string;
};
/** Market sources list state. */
export type MarketState = {
    status: 'loading' | 'ready' | 'error';
    repos: MarketSourceRecord[];
};
/** One market source's update-check outcome. */
export type MarketCheckResult = MarketCheckResponse['results'][number];
/** skillName → 调用次数/末次使用（统计域产出，目录排序消费）。 */
export type UsesMap = ReadonlyMap<string, {
    count: number;
    lastUsed?: number;
}>;
