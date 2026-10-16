/**
 * 市场域路由：market 列表 / source 增删 / ref 锁定 / versions 选择器 /
 * check 更新检查 / stats 星标统计 / sync 对齐版本。从 routes.ts 原样搬出，
 * handler 逻辑不变。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 市场域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function marketRoutes(deps: SkillHubRouteDeps): RouteSpec[];
