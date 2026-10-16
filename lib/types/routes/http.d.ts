/**
 * routes 共享层 · HTTP 围栏：回环信任检查、JSON 响应与错误映射、请求体读取、
 * 查询/字段读取与文件存在性检查。从 helpers.ts 原样搬出，行为不变。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Cap on JSON request bodies (toggle/create payloads are tiny). */
export declare const MAX_JSON_BODY_BYTES: number;
/** Loopback literal check plus browser same-origin markers. */
export declare function isLoopbackRequest(request: IncomingMessage): boolean;
/** One JSON response. */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
/** One JSON error response. */
export declare function writeError(res: ServerResponse, status: number, error: unknown): void;
/** HTTP status per store business-rule kind (user error, not server fault). */
export declare const STORE_ERROR_STATUS: {
    readonly validation: 400;
    readonly 'not-found': 404;
    readonly conflict: 409;
};
/** Map known error types onto HTTP statuses: repo fetch + store business rules. */
export declare function writeRouteError(res: ServerResponse, error: unknown): void;
/** Read a JSON request body (undefined when too large or unparseable). */
export declare function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined>;
/** URL query helper (first value, decoded). */
export declare function queryParam(url: URL, name: string): string | undefined;
/**
 * 读取请求体里的字符串字段（缺失或类型不符返回 ''）。替代各 handler 里
 * `body as unknown as XRequest` 的断言 + 手写 typeof 收窄。
 */
export declare function readString(body: Record<string, unknown>, key: string): string;
/**
 * 读取请求体里的字符串数组：非数组返回 []，丢弃非字符串项；默认同时丢弃
 * 空串（keepEmpty=true 时保留空串，由调用方决定语义）。
 */
export declare function readStrings(body: Record<string, unknown>, key: string, options?: {
    keepEmpty?: boolean;
}): string[];
/** Async existence check (import/sync use it on the user root). */
export declare function pathExists(path: string): Promise<boolean>;
