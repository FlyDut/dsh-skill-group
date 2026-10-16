/**
 * 技能可见性隔离的装配：把策展数据（store）、纯计算判定（ScopeView）与运行时
 * 效果（PresetWiring）接到一起，并打包 `/presets`、`/scope`、`/workspaces`、
 * `/workspace` 路由需要的依赖。
 *
 * 三层各归其位：策略在 store（②），判定在 ScopeView（纯计算 + 目录快照），运行时
 * 效果在 PresetWiring（把闸门接进每个 preset 的 standing 作用域）。它们都不改
 * 用户的 preset 文件，也不改技能文件。
 *
 * 会话上的实际语义是**覆盖**：一个会话按它所用的 preset 取模式策略、按它的工作
 * 目录取工作区策略，工作区启用隔离时由它独占生效（见 domain/scope-policy.ts 的
 * overridePolicyEntries）。因此闸门注入只按 preset 走，而隐藏集合按 (preset, cwd)
 * 现算。
 */
import type { Context } from '@deepseek-ai/cordis';
import { ScopeView } from './domain/scope-view.ts';
import { PresetWiring } from './enforcement/scope-wiring.ts';
import type { ScopeRouteDeps, WorkspaceRouteDeps } from './routes.ts';
import type { SkillHubStore } from './store.ts';
/**
 * 模式隔离的接线轮询间隔。只做一件很便宜的事：枚举当前活着的 preset
 * standing mount 并补齐/清理闸门注入。首个注入之后它几乎总是无操作。
 */
export declare const SCOPE_WIRING_TICK_MS = 5000;
/** 隔离装配的产物：判定视图、运行时接线器、路由依赖。 */
interface ScopeAssembly {
    /** 纯计算的可见性判定 + 目录快照缓存。 */
    view: ScopeView;
    /** 往每个 preset 的 standing 作用域注入/回收闸门。 */
    wiring: PresetWiring;
    /** 交给 makeRoutes 的 /scopes 依赖。 */
    deps: ScopeRouteDeps;
    /** 交给 makeRoutes 的 /workspaces 依赖。 */
    workspaceDeps: WorkspaceRouteDeps;
}
/**
 * @param options.ctx - 宿主上下文（读技能目录、写日志）。
 * @param options.store - 隔离策略的唯一来源。
 * @param options.presets - `ctx.agentPresets`（软注入），缺失的部署只是没有模式可配。
 * @param options.workspaces - `ctx.workspaceRegistry`（软注入），缺失的部署只是没有工作区可配。
 */
export declare function assembleScopes(options: {
    ctx: Context;
    store: SkillHubStore;
    presets: () => unknown;
    workspaces: () => unknown;
}): ScopeAssembly;
export {};
