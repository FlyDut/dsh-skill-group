/**
 * 并发工具：有界并发的 map。原先 repo.ts 与 stats.ts 各有一份实现，
 * 这里统一为一份（采用 stats 版本的 limit 夹取，调用点 limit≥1 行为不变）。
 */
/** Run an async worker over items with a bounded concurrency, preserving index order. */
export declare function mapConcurrent<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
