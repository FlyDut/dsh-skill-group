/**
 * 模式域路由：preset 名单 + 每条的接线状态与策略（GET /presets）、可见性展开
 * 明细（GET /scope/preview）、策略写入（POST /scope）。
 *
 * 这一层只做三件事：参数校验、把宿主接口的读数投影成契约形状、错误映射成
 * 4xx。策略语义与运行时效果分别在 `domain/` 与 `enforcement/`，此处不复制。
 *
 * 能力缺席（部署里没有 agent-presets / dsh-scope）时不是错误：/presets 老实地
 * 报告 `available: false` 与原因，写入口返回 503——面板据此把「模式」tab 降级
 * 为只读，而插件其余功能毫无感知。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 模式域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function scopeRoutes(deps: SkillHubRouteDeps): RouteSpec[];
