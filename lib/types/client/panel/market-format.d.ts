/** Market tab number formatting (stars/downloads/bytes/speed). Pure, no deps. */
/** Compact count for stars/downloads (1234 → 1.2k). */
export declare function formatCount(n: number): string;
/** Compact byte size for repo preview rows. */
export declare function formatBytes(bytes: number): string;
export declare function formatSpeed(bps?: number): string;
