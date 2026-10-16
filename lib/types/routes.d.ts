/**
 * The /api/skill-hub route family: full catalog (local user-level skills from
 * the official registry, each flagged with its runtime switch state, plus
 * discovery diagnostics), skill detail, the runtime on/off toggle, new-skill
 * scaffold, user groups (tags + origin collections), and upstream source
 * tracking (check/sync; upstream deletions are only reported). Every route
 * carries a loopback-only trust fence — these endpoints write the hub's
 * sidecar state and can create files under the user's skill roots, so
 * LAN-exposed dsh web deployments must not serve them.
 *
 * 按域拆分后的聚合入口：各域 handler 在 ./routes/<domain>.ts，共享围栏在
 * ./routes/helpers.ts，节流/任务状态在 ./routes/route-state.ts。
 * 老 `from './routes.ts'`（makeRoutes + SkillHubRouteDeps）保持可用。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type SkillHubRouteDeps } from './routes/helpers.ts';
export type { SkillHubRouteDeps, SkillLookupLike, ScopeRouteDeps, ScopePresetSnapshot, WorkspaceRouteDeps, WorkspaceRosterSnapshot } from './routes/helpers.ts';
/**
 * Build every /api/skill-hub route.
 * @param deps - skill registry view + sidecar store.
 * @returns the exact-path routes plus the family's 404 catch-all.
 */
export declare function makeRoutes(deps: SkillHubRouteDeps): WebRoute[];
