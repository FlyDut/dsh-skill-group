/**
 * Market-source (市场仓库) mutations over the sidecar's market list.
 *
 * I/O-free by design: the store owns loading and persistence. The list is kept
 * in addition order, so these helpers mutate it in place.
 */
import type { MarketSourceRecord } from '../../protocol.ts';
/** One market source by repo (undefined when absent). */
export declare function findMarketSource(entries: readonly MarketSourceRecord[], repo: string): MarketSourceRecord | undefined;
/** Add a repo (deduplicated), optionally pinning a ref. */
export declare function addMarketSource(entries: MarketSourceRecord[], repo: string, ref?: string): void;
/** Remove a repo. Returns whether a record was removed. */
export declare function removeMarketSource(entries: MarketSourceRecord[], repo: string): boolean;
/** Pin a market source to an explicit ref (branch/tag), clearing the recorded commit. */
export declare function setMarketSourceRef(entries: MarketSourceRecord[], repo: string, ref: string): {
    entry: MarketSourceRecord | undefined;
    changed: boolean;
};
/** Record the commit a market source's pinned ref resolved to (update baseline). */
export declare function setMarketSourceCommit(entries: MarketSourceRecord[], repo: string, commitSha: string): boolean;
