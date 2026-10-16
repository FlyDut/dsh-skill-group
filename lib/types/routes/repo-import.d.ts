/**
 * 仓库导入域路由：repo 发现 / repoImport 异步导入任务 / progress 轮询 /
 * cancel 取消。从 routes.ts 原样搬出，handler 逻辑不变。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 仓库导入域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function repoImportRoutes(deps: SkillHubRouteDeps): RouteSpec[];
