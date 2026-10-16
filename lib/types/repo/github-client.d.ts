/**
 * GitHub API 统一请求层：token 管理、鉴权头、ETag 缓存、错误映射、
 * 带缓存的 JSON GET。从 repo.ts 抽出，原 6 处重复的 try/catch +
 * headers + json 解析收敛到 fetchJson / fetchJsonCached 两个入口。
 */
/** Fetch failure carrying a useful HTTP status for the route layer. */
export declare class RepoFetchError extends Error {
    readonly status: number;
    constructor(message: string, status?: number);
}
/** Override the GitHub token at runtime ('' falls back to the env var). */
export declare function setGithubToken(token: string | undefined): void;
/** Authorization header for api.github.com / raw.githubusercontent.com calls. */
export declare function githubAuthHeaders(): Record<string, string>;
/**
 * 传输层：显式要求服务端返回未压缩实体。
 *
 * 为什么必须加：dsh 会把**启动环境**里的 `HTTP_PROXY`/`HTTPS_PROXY` 装成
 * undici 的全局 dispatcher（`@deepseek-ai/dsh-http-proxy`），插件里的 `fetch`
 * 因此走该代理。上游在带代理的环境里诊断出的失败模式是：经代理返回的响应
 * **丢掉 `content-encoding` 与 `content-type` 头，而 body 仍是 gzip**；undici
 * 只依据 `content-encoding` 决定是否解压，于是 `response.json()` 拿到 gzip
 * 二进制并抛错，被上层的 catch 映射成 `invalid github response for <url>`
 * ——看起来像 GitHub 坏了，实际是传输层被改写了头部。
 *
 * 代价是不走压缩（我们的响应体都很小），换来的是**无论中间代理是否改写头部
 * 都能正确取到实体**，且用户无需为插件调整启动命令。
 */
export declare const NO_COMPRESSION: Record<string, string>;
/** JSON API 默认请求头（含鉴权）。 */
export declare function apiHeaders(): Record<string, string>;
/**
 * Build a RepoFetchError; when the response shows an exhausted rate limit,
 * report the reset time instead of a bare HTTP status.
 */
export declare function fetchError(context: string, response: Response, fallbackStatus?: number): RepoFetchError;
/** 是否限流/中断类错误（调用方可直接透出，不再包装）。 */
export declare function isAbortError(error: unknown): boolean;
/**
 * 不带缓存的统一 GET+JSON：网络异常、非 2xx、坏 JSON 全部映射为
 * RepoFetchError，调用方无需重复写 try/catch。
 */
export declare function fetchJson(url: string, fetchImpl: typeof fetch, context: string, headers?: Record<string, string>): Promise<{
    json: unknown;
    response: Response;
}>;
/**
 * Load repo metadata and the recursive git tree at the given ref. The meta
 * request always resolves the default branch (used when ref is absent); the
 * tree is fetched at `ref ?? default_branch` so an explicit branch/tag scans
 * the exact same content a later download would fetch.
 */
export declare function fetchJsonCached(url: string, fetchImpl: typeof fetch, context: string): Promise<{
    json: unknown;
    response: Response;
}>;
