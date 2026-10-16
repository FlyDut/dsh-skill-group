/**
 * 分组域路由：groups / tag 新建重命名 / tag 删除 / tag 成员。
 * 从 routes.ts 原样搬出，handler 逻辑不变。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function groupRoutes(deps: SkillHubRouteDeps): RouteSpec[];
