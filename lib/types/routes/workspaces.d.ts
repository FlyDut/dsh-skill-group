/**
 * 工作区域路由：工作区名单 + 每条的策略与展开计数（GET /workspaces）、
 * 策略写入（POST /workspace）。
 *
 * 与 `./scopes.ts`（模式域）结构完全对称：这一层只做三件事——参数校验、把宿主
 * 接口的读数投影成契约形状、错误映射成 4xx。策略语义在 `domain/`，运行时效果在
 * `enforcement/`，此处不复制。
 *
 * 两处刻意的差异：
 *  1. 工作区策略没有"接线状态"可对齐（闸门按 preset 注入、隐藏集合按 cwd 现算），
 *     所以行里不报 `mounted/gateActive`，只有 `pendingCount` 表达"还没生效"。
 *  2. 工作区可能先被删、策略还在。这类**孤儿行**如实列出（`present: false`），
 *     允许用户清掉，但绝不自动清理。
 *
 * 能力缺席（部署里没有 workspaceRegistry / dsh-scope）时不是错误：/workspaces
 * 老实报告 `available: false` 与原因，写入口返回 503——面板据此把「工作区」tab
 * 降级为只读，而插件其余功能毫无感知。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 工作区域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function workspaceRoutes(deps: SkillHubRouteDeps): RouteSpec[];
