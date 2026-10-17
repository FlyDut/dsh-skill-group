/**
 * 执行层 · 接线（wiring）：把闸门接到每个 preset 的 standing 作用域上，并管理
 * 它的生命周期。
 *
 * 机制（见 `scope-mechanism.test.ts` 的契约测试）：`dsh-agent-preset-registry` 为每个
 * 被使用的 preset 建立一次 standing mount，并 mint 一个不透明的 scope key；
 * `ctx.skills` 的分层**按该 key 的对象 identity 索引 layer**。因此用**宿主自己的**
 * scoped context 注册 provider，注册就落进该 preset 的层。
 *
 * 为什么不再自己 `import('@deepseek-ai/dsh-scope')` + `createScope`：
 * `dsh-scope` 的 `kScope` 是**模块级 `Symbol()`**。插件与宿主各自解析自己的副本
 * （profile / 全局安装 / 插件 node_modules 三份都见过），用插件的 `createScope`
 * 打上的 tag，宿主的 `scopeOf()` 读不到 —— 注册会静默落进 **global layer**。
 * 而 gate 的 `list()` 又会回调 `ScopeView.snapshot()` → `ctx.skills.snapshot()`，
 * 于是 global 快照在等 gate、gate 又在等同一个 global 快照：**整个 dsh 无报错挂死**
 * （技能目录、模式面板、模型调用全部无限等待）。这不是假设：2026-10 的现场就是
 * 这个死锁。
 *
 * 所以接线改用 `ctx.agentPresets` 服务自己持有的 scoped context（`generations`
 * 里那个由宿主的 `createScope` mint 出来的 `scope.ctx`）：tag 必然与宿主的
 * `scopeOf()` 同源，且不需要任何运行时模块。
 *
 * 这条路径**不修改任何 preset 文件**，所以对部署自带的 system preset
 * （minimal / standard / ptc / cordis，不可写）同样生效。
 *
 * 三点刻意的保守设计：
 *  1. 运行时能力只从 `ctx.agentPresets` 软取，不做跨副本模块 import；任何失败
 *     都降级为"能力不可用"，绝不让缺服务/不兼容把整个插件拖下水。
 *  2. 所有注入与清理都包在 try/catch 里：单个 preset 接线失败只影响它自己。
 *  3. 只有"已挂载"的 preset 能接线。新挂载的 preset 由定时 tick 或面板请求
 *     触发的下一轮 sync 接上（在此之前它按不隔离运行，不会误伤）；拿不到宿主
 *     scoped context 时宁可不接线，也绝不在 global layer 里注册。
 */
import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { ScopeSkillMeta } from '../domain/scope-view.ts';
/** `livePresetMounts` 返回值的结构视图。 */
export interface PresetMountLike {
    /** 该 standing mount 属于哪个 preset。 */
    readonly presetId: string;
    /** standing scope key；正在拆卸的记录可能缺省。 */
    readonly key?: object;
    /**
     * 宿主 mint 出来的、带该 key tag 的 scoped context。
     * 只有它能让注册落进 preset 的 layer；缺省表示这个 mount 不可接线。
     */
    readonly ctx?: Context;
}
/** 运行时能力。真实实现来自宿主服务，测试可注入替身。 */
export interface RuntimeBindings {
    /**
     * 列出当前仍安装着的 preset standing mount。
     * @param within - 限定在某个 fiber 子树内；服务路径按 preset 名单枚举，忽略它。
     */
    livePresetMounts: (within?: Fiber) => Promise<readonly PresetMountLike[]>;
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
    /** 已解析的运行时能力。**只缓存成功**：服务晚到（软注入）时下一轮 sync 能跟上。 */
    private bindings;
    /** 当前不可用原因；与上一次相同时不重复刷日志。 */
    private unavailable;
    /** 上一次记录的不可用原因（日志去重）。 */
    private lastReason;
    /** 正在进行的一轮 sync；并发调用共享它而不重复注入。 */
    private syncing;
    /** 已警告过"mount 没有 scoped ctx"的 preset（避免 5 秒 tick 刷屏）。 */
    private readonly warnedNoCtx;
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
    /**
     * 解析运行时能力。**不缓存失败**：`agentPresets` 是软注入，服务晚到时
     * 下一轮 sync 必须能重新探测，否则整个进程生命周期都停在"不可用"。
     */
    private load;
    /** 记录不可用原因；同一原因只打一次日志。 */
    private markUnavailable;
    private markAvailable;
    /** 策略是否启用；查询失败按"不启用"处理（宁可不遮蔽也不误伤）。 */
    private enforced;
    /** 在一个 preset 的 standing scope 上注入闸门。 */
    private install;
    /** 拆掉一条注入：只注销 hub 自己的子 fiber，宿主 preset 的 scope 不动。 */
    private disposeEntry;
    private activeIds;
    private mountedIds;
    private log;
}
/**
 * 用注册表服务合成 `livePresetMounts`：逐个探测 preset 的挂载状态，并带上
 * 宿主 mint 的 scoped context。
 *
 * `acquireScope(id)` 对**已挂载**的 preset 借出一个 revision 租约，租约里的
 * `key` 就是该 preset 的 standing scope key；未挂载或激活失败的 preset 会抛
 * `agent-preset/invalid`，据此判定"挂载中"。
 *
 * scoped context 取自注册表内部按同一个 key 索引的 revision 记录：那个 ctx 是
 * **宿主的** `createScope` 创建的，tag 与宿主 `scopeOf()` 同源。绝不能用插件自己
 * import 的 dsh-scope 去 mint scope —— 副本不同 → Symbol 不同 → 注册落进 global
 * layer → 与 ScopeView 的回读形成死锁（见文件头）。
 *
 * 只借读数、立即归还租约：长期持有会顶住注册表的引用计数，让已退休的 revision
 * 无法回收；而只要 preset 仍在挂载中，那个 standing key 就一直有效。
 * @param service - `ctx.agentPresets`（缺席或形状不符时返回 undefined）。
 * @returns 枚举函数，或服务不可用时的 undefined。
 */
export declare function serviceMounts(service: unknown): RuntimeBindings['livePresetMounts'] | undefined;
/**
 * 读取宿主提供的接线能力。**不再 import 任何 dsh 包**：所有数据都来自
 * `ctx.agentPresets`（软注入，每次现读，服务晚到或热重载都能跟上）。
 *
 * 服务缺席、形状不符或拿不到内部 revision 表时返回 undefined，接线器整体降级为
 * "策略仅预览"——绝不冒把 provider 注册进 global layer 的风险。
 * @param options.presets - `ctx.agentPresets` 软注入的读取器。
 * @returns 可用的运行时绑定，或 undefined。
 */
export declare function loadScopeRuntime(options: {
    presets: () => unknown;
}): Promise<RuntimeBindings | undefined>;
export {};
