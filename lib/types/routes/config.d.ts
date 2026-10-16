/**
 * 配置域路由：config（总开关开着也可用，设置卡自救入口）/ update 自身更新
 * 检查 / diagnosticFix。从 routes.ts 原样搬出，handler 逻辑不变。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 配置域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function configRoutes(deps: SkillHubRouteDeps): RouteSpec[];
