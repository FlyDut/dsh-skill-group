/**
 * 目录域路由：catalog / skill 详情 / toggle / toggle-batch / skill 删除 /
 * create / stats。
 *
 * 开关是运行时的：toggle 只写 sidecar 的关闭名单，文件与发现层一律不动；
 * 真正的遮蔽由执行层的 per-preset 闸门在下一轮接线时生效。删除是唯一的破坏性
 * 操作，只在面板确认之后才落盘，且仅限用户级可写根。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function catalogRoutes(deps: SkillHubRouteDeps): RouteSpec[];
