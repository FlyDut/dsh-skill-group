/**
 * 来源跟踪域路由：sources 列表 / check 上游更新 / sync 同步。上游删除只做
 * 报告，本插件不再替用户删本地文件（删除是用户的决定，插件不碰文件）。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 来源跟踪域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function sourceRoutes(deps: SkillHubRouteDeps): RouteSpec[];
