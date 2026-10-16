/**
 * routes 共享层：请求围栏（回环信任/方法/总开关/JSON 体）、统一错误映射、
 * 可写技能解析、目录/分组数据装配。handler 只写业务，从这里 import。
 * 从 routes.ts 原样搬出，行为不变。
 * 本文件是聚合出口（barrel）：实现按域拆到 ./http.ts（围栏/错误映射/读体）、
 * ./deps.ts（依赖视图/可写解析）、./collection.ts（集合装配）、
 * ./catalog-data.ts（目录装配）；对外导出面保持不变。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute, WebRouteKind } from '@deepseek-ai/dsh-host-webserver';
import { type SkillHubRouteDeps } from './deps.ts';
export { MAX_JSON_BODY_BYTES, STORE_ERROR_STATUS, isLoopbackRequest, pathExists, queryParam, readJsonBody, readString, readStrings, writeError, writeJson, writeRouteError, } from './http.ts';
export { configOf, disabledGate, homeOf, isWritableSource, resolveWritableSkill, savedOf, } from './deps.ts';
export type { SkillHubRouteDeps, SkillLookupLike, ScopeRouteDeps, ScopePresetSnapshot, WorkspaceRouteDeps, WorkspaceRosterSnapshot, WritableSkill, } from './deps.ts';
export { buildCollections, buildGroups } from './collection.ts';
export { applyInterface, buildCatalog, knownSkillNames, toDetail, } from './catalog-data.ts';
/** What a route handler receives: fences already passed, URL/body prepared. */
interface RouteContext {
    req: IncomingMessage;
    res: ServerResponse;
    /** Request URL parsed against a localhost base (query reading for GET). */
    url: URL;
    /** Parsed JSON body; empty object for requests without one. */
    body: Record<string, unknown>;
}
type RouteHandler = (context: RouteContext) => Promise<void>;
/** One declarative route: path + accepted methods + the business handler. */
export interface RouteSpec {
    path: string;
    /**
     * Match kind: 'exact' (default) matches the pathname verbatim; 'prefix'
     * matches the path and everything beneath it. The webserver consults the
     * exact table first and then resolves prefixes longest-first, so a prefix
     * route is a catch-all that can never shadow a real route.
     */
    kind?: WebRouteKind;
    /** Accepted HTTP methods; anything else answers 405. */
    methods: readonly ('GET' | 'POST')[];
    /** POST requests must carry a JSON body (400 when missing/unparseable). */
    jsonBody?: boolean;
    /** Skip the master-switch gate (the config route stays up while disabled). */
    skipGate?: boolean;
    handler: RouteHandler;
}
/**
 * Wrap one handler in the shared request fences. Order matches the
 * original per-handler prologue: loopback trust → HTTP method → master
 * switch → JSON body. The outer catch maps errors onto the JSON error
 * body (preserving RepoFetchError status codes).
 */
export declare function createRoute(deps: SkillHubRouteDeps, spec: RouteSpec): WebRoute;
