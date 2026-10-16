/**
 * 执行层 · 接线（wiring）：把闸门接到每个 preset 的 standing 作用域上，并管理
 * 它的生命周期。
 *
 * 机制（见 `scope-mechanism.test.ts` 的契约测试）：`dsh-agent-preset-registry` 为每个
 * 被使用的 preset 建立一次 standing mount，并 mint 一个不透明的 scope key；
 * `ctx.skills` 的分层**按该 key 的对象 identity 索引 layer**。因此用同一个 key
 * 调一次 `createScope`，在其中注册的 provider 就落进该 preset 的层——而
 * `createScope` 返回的 scope 归 hub 的 fiber 所有，销毁时连带清掉注册。
 *
 * 这条路径**不修改任何 preset 文件**，所以对部署自带的 system preset
 * （minimal / standard / ptc / cordis，不可写）同样生效。
 *
 * 三点刻意的保守设计：
 *  1. 运行时依赖用**动态 import** 载入并缓存；任何失败都降级为"能力不可用"，
 *     绝不让缺包/不兼容把整个插件拖下水。
 *  2. 所有注入与清理都包在 try/catch 里：单个 preset 接线失败只影响它自己。
 *  3. 只有"已挂载"的 preset 能接线。新挂载的 preset 由定时 tick 或面板请求
 *     触发的下一轮 sync 接上（在此之前它按不隔离运行，不会误伤）。
 */
import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { Scope } from '@deepseek-ai/dsh-scope';
import type { ScopeSkillMeta } from '../domain/scope-view.ts';
/** `livePresetMounts` 返回值的结构视图（只取接线需要两个字段）。 */
export interface PresetMountLike {
    /** 该 standing mount 属于哪个 preset。 */
    readonly presetId: string;
    /** standing scope key；正在拆卸的记录可能缺省。 */
    readonly key?: object;
}
/** 动态载入的运行时能力。真实实现来自 dsh 包，测试可注入替身。 */
export interface RuntimeBindings {
    /**
     * 列出当前仍安装着的 preset standing mount。
     * @param within - 限定在某个 fiber 子树内；服务路径按 preset 名单枚举，忽略它。
     */
    livePresetMounts: (within?: Fiber) => Promise<readonly PresetMountLike[]>;
    /** 在给定的 scope key 下 mint 一个受调用方 fiber 管辖的作用域。 */
    createScope: (ctx: Context, key: object) => Pick<Scope, 'ctx' | 'dispose'>;
}
/** 接线器依赖。 */
interface PresetWiringDeps {
    /** hub 的宿主 ctx；`createScope` 挂在它下面，随插件卸载一起回收。 */
    ctx: Context;
    /** 载入运行时能力；返回 undefined 表示不可用（原因另行记录）。 */
    runtime: () => Promise<RuntimeBindings | undefined>;
    /** 该 preset 当前是否需要闸门（模式策略或任一工作区策略已启用隔离）。 */
    isEnforced: (presetId: string) => Promise<boolean>;
    /**
     * 该 preset 在某个工作目录下应被遮蔽的技能与元数据。
     * @param presetId - 目标 preset。
     * @param cwd - 会话工作目录（缺省时只算模式策略）。
     */
    hiddenOf: (presetId: string, cwd?: string) => Promise<ReadonlyMap<string, ScopeSkillMeta>>;
    /** 诊断输出（默认走 ctx.logger）。 */
    log?: (level: 'info' | 'warn', message: string) => void;
}
/** 接线状态快照（面板展示与诊断）。 */
interface WiringStatus {
    /** 运行时能力是否可用。 */
    available: boolean;
    /** 不可用原因；可用时缺省。 */
    reason?: string;
    /** 已接线（闸门已注入）的 preset id，升序。 */
    active: string[];
    /** 已挂载、可用于接线的 preset id，升序。 */
    mounted: string[];
}
/**
 * 把闸门接到 preset 作用域上的接线器。一个 hub 实例持有一个。
 */
export declare class PresetWiring {
    private readonly deps;
    private readonly injected;
    /** 运行时能力的 in-flight / 已解析结果。 */
    private bindings;
    /** 不可用原因（首次载入失败时记录一次，避免重复 import 与刷日志）。 */
    private unavailable;
    /** 正在进行的一轮 sync；并发调用共享它而不重复注入。 */
    private syncing;
    private disposed;
    constructor(deps: PresetWiringDeps);
    /**
     * 跑一轮同步：清理失效注入（mount 消失或策略关闭），补上缺失的注入
     * （已挂载且策略启用）。并发调用共享同一轮。
     */
    sync(): Promise<void>;
    /**
     * 通知某个 preset 的闸门"策略变了"，让注册表丢弃已完成的目录缓存，
     * 从而在会话的下一个 turn 生效。
     * @param presetId - 目标 preset。
     */
    invalidate(presetId: string): void;
    /**
     * 通知**全部**已接线的闸门刷新缓存。目录变化（新增/删除/重命名技能）后调用，
     * 让每个模式的隐藏集合按新目录重算。
     */
    invalidateAll(): void;
    /** 当前接线状态（面板与诊断用）。 */
    status(): Promise<WiringStatus>;
    /** 拆掉全部注入并停止后续同步（插件卸载路径）。 */
    dispose(): Promise<void>;
    private runSync;
    /** 载入（并缓存）运行时能力；失败原因只记录一次。 */
    private load;
    /** 策略是否启用；查询失败按"不启用"处理（宁可不遮蔽也不误伤）。 */
    private enforced;
    /** 在一个 preset 的 standing key 下注入闸门。 */
    private install;
    /** 拆掉一条注入；scope 销毁会连带清掉其中的 provider 注册。 */
    private disposeEntry;
    private activeIds;
    private mountedIds;
    private log;
}
/**
 * 用注册表服务合成 `livePresetMounts`：逐个探测 preset 的挂载状态。
 *
 * 0.2.x 把 standing mount 收进了注册表内部（模块级 `livePresetMounts` 已移除），
 * 公开的读法是 `acquireScope(id)`：它对**已挂载**的 preset 借出一个 revision 租约，
 * 租约里的 `key` 就是该 preset 的 standing scope key；未挂载或激活失败的 preset
 * 会抛 `agent-preset/invalid`，据此即可判定"挂载中"。
 *
 * 只借读数、立即归还租约：长期持有会顶住注册表的引用计数，让已退休的 revision
 * 无法回收；而只要 preset 仍在挂载中，那个 standing key 就一直有效。
 * @param service - `ctx.agentPresets`（缺席或形状不符时返回 undefined）。
 * @returns 枚举函数，或服务不可用时的 undefined。
 */
export declare function serviceMounts(service: unknown): RuntimeBindings['livePresetMounts'] | undefined;
/**
 * 动态载入 dsh 的运行时能力。两个包都是**可选**对等依赖：部署里没有（或形状
 * 变了）就返回 undefined，接线器据此整体降级为"策略仅预览"。
 *
 * 两条路径并存：
 *  - `0.1.7`：preset 侧包名从 `dsh-agent-presets` 换成 `dsh-agent-preset-registry`
 *    （服务名仍是 `ctx.agentPresets`），模块导出的 `livePresetMounts` 直接枚举
 *    standing mount，`PresetMount.presetId/key` 字段不变。
 *  - `0.2.x`：模块级枚举被移除，改从注册表服务借 `acquireScope` 读同一个
 *    standing key（见 {@link serviceMounts}）。
 * @param options.presets - `ctx.agentPresets` 软注入的读取器（每次现读，热重载跟得上）。
 * @returns 可用的运行时绑定，或 undefined。
 */
export declare function loadScopeRuntime(options: {
    presets: () => unknown;
}): Promise<RuntimeBindings | undefined>;
export {};
