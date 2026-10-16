/**
 * 策展层 · 可见性判定的宿主视图：把 sidecar 里的策略、侧栏的分组成员、以及
 * 注册表的目录快照拼成"某个主体此刻可见/隐藏哪些技能"。主体可以是模式，也可以
 * 是工作区，还可以是覆盖后择一生效的那份策略——判定只看策略的内容，不看它挂在谁身上。
 *
 * 它是 `enforcement` 与 `routes` 共用的**唯一数据入口**：gate 从这里取遮蔽
 * 名单，面板从这里取可见性判定。所有 IO 都通过注入的函数发生（`catalog` / `groups`
 * / `policyOf`），因此本模块可以在测试里用内存替身完整驱动。
 *
 * 缓存分两级：目录与分组按 `invalidate()` 全清（目录变更、分组变更、策略变更
 * 都调它），每份策略的判定按"策略内容 + 目录内容"的键缓存——所以一次目录
 * 变更不会让未受影响的策略重算，模式与工作区覆盖合成出的策略也能直接命中。
 */
import type { PolicyEntries, ScopePolicy } from '../protocol/scopes.ts';
import { type ScopeVisibility } from './scope-policy.ts';
/** gate 构造遮蔽候选所需的元数据。 */
export interface ScopeSkillMeta {
    /** 原技能的描述（遮蔽候选沿用真实描述，任何消费者看到的都不是假数据）。 */
    description: string;
    /** 原技能的 whenToUse（有则沿用）。 */
    whenToUse?: string;
    /** 原技能的 source 桶（面板与 UI 徽标据此显示来源）。 */
    source: string;
    /** 原技能的 provider（插件技能集合按键聚合时用它）。 */
    provider: string;
}
/** 目录快照：当前真实可用的技能及其元数据（含被运行时关闭的技能）。 */
export interface ScopeCatalogSnapshot {
    /** 技能名，升序。 */
    names: string[];
    /** 技能名 → 元数据。 */
    meta: Map<string, ScopeSkillMeta>;
}
/** 宿主注入的依赖：全部 IO 都在这里。 */
interface ScopeViewDeps {
    /** 读取目录快照。 */
    catalog: () => Promise<ScopeCatalogSnapshot>;
    /**
     * 读取分组成员表：分组键 → 成员技能名。
     * 应包含**所有现存**的分组（含空分组）；缺席的键被判定为悬空。
     * 需要整份快照而不是只有名字，因为 `src:` 类的分组要按技能的 source 归并。
     */
    groups: (snapshot: ScopeCatalogSnapshot) => Promise<Map<string, readonly string[]>>;
    /** 某模式的策略；undefined 表示从未配置（= 不隔离）。 */
    policyOf: (presetId: string) => Promise<ScopePolicy | undefined>;
    /**
     * 全局关闭名单（sidecar 里的运行时开关，只有技能名）。
     * 它对**每个**模式都生效，与模式自己的隔离策略叠加。
     */
    closed: () => Promise<ReadonlySet<string>>;
}
/**
 * 模式可见性视图。生命周期与 hub 的宿主半边一致：`invalidate()` 由目录变更、
 * 分组变更、策略变更与设置同步触发。
 */
export declare class ScopeView {
    private readonly deps;
    private readonly catalogTtlMs;
    /**
     * 目录快照 + 它的读取时刻。**必须带 TTL**：技能文件也可能在 hub 之外被
     * 增删（手工放进 `~/.dsh/skills`、别的工具写入），那条路径不会经过
     * `invalidate()`；没有 TTL 的话，新出现的技能既不进可见集也不进隐藏集，
     * 于是在"该隔离它的模式"里漏网。判定本身另有内容键缓存，所以 TTL 到期只
     * 重读一次目录，不会重算没变化的模式。
     */
    private catalog?;
    /** 分组成员表的 promise，附它对应的快照摘要。 */
    private groups?;
    /** 判定缓存，键为策略内容 + 目录内容 + 关闭名单的摘要（与主体身份无关）。 */
    private readonly visibility;
    /**
     * @param deps - 宿主注入的 IO。
     * @param catalogTtlMs - 目录快照的最长存活时间；默认与面板轮询同周期。
     */
    constructor(deps: ScopeViewDeps, catalogTtlMs?: number);
    /** 丢弃全部缓存。目录、分组或策略任一变化后调用。 */
    invalidate(): void;
    /** 当前目录快照（invalidate 或 TTL 到期后重读）。 */
    snapshot(): Promise<ScopeCatalogSnapshot>;
    /**
     * 一个模式自己那份策略的可见性判定（面板列表用；不含工作区维度）。
     * @param presetId - preset id；未配置时按"不隔离"返回，仍带展开明细。
     * @returns 判定结果（可见名单、隐藏名单、逐键明细、悬空键）。
     */
    visibilityOf(presetId: string): Promise<ScopeVisibility>;
    /**
     * 任意一份策略的可见性判定（覆盖后的生效策略也走这里）。这是唯一的计算入口：
     * 判定与主体身份无关，只与策略内容、分组成员、目录与全局关闭名单有关。
     * @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
     * @returns 判定结果。
     */
    visibilityFor(policy: PolicyEntries): Promise<ScopeVisibility>;
    /**
     * 一份策略需要被 gate 遮蔽的技能及其元数据（隔离 ∪ 全局运行时关闭）。
     * 没有任何需要遮蔽的技能时返回空表——gate 因此完全不干预该作用域。
     * @param policy - 待判定的策略（模式、工作区，或覆盖后的生效策略）。
     * @returns 技能名 → 元数据；空表表示不需要遮蔽。
     */
    hiddenFor(policy: PolicyEntries): Promise<Map<string, ScopeSkillMeta>>;
    /**
     * 一个模式自己那份策略需要被遮蔽的技能（不含工作区维度）。覆盖语义由
     * 装配层（scope-assembly）负责，它拿到两侧策略后走 {@link hiddenFor}。
     * @param presetId - preset id。
     * @returns 技能名 → 元数据。
     */
    hiddenOf(presetId: string): Promise<Map<string, ScopeSkillMeta>>;
    /** 按目录快照摘要复用分组成员表。 */
    private groupIndex;
}
export {};
