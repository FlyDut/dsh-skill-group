/**
 * 发现层 · 管理视图 provider —— 注册进官方 ctx.skills 注册表的 GLOBAL 层。
 *
 * 职责边界：它只回答"这台机器上现在有哪些技能、正文是什么"，不决定任何技能
 * 该不该可见（那是策展层 store/ 与执行层 enforcement/ 的事），也不知道模式
 * 的存在。GUI 的管理目录、路由目录装配、以及 ScopeView 的目录快照都读它。
 *
 * Why: in the dsh web app the base host skill-filesystem row is disabled on
 * purpose — agent presets own local discovery by mounting their own
 * skill-filesystem into their preset scope layers, so a host-plane query
 * against the registry's empty global layer sees nothing. The hub needs a
 * session-independent management view, so it contributes one itself: the two
 * user roots (~/.dsh/skills and ~/.agents/skills).
 *
 * Agent views are unaffected: preset layers are nearer than the global
 * layer, so a preset's own filesystem provider wins every duplicate name
 * outright, and this provider only surfaces skills for presets that mount
 * no filesystem row at all.
 */
import type { SkillCandidate, SkillDefinition, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill';
/**
 * Global-layer skill provider for the hub's management catalog.
 * Implements the official SkillProvider contract: list() returns
 * invocation-neutral candidates; get() resolves the winning candidate's
 * body. Both are readonly reads of the local skill roots.
 */
export declare class SkillHubProvider implements SkillProvider {
    readonly name = "skill-hub";
    private readonly home;
    private readonly control;
    private readonly watchTimer;
    private rootStamp;
    /** 上一次 watch 失败的错误文案（同一错误只记一次，避免 5 秒定时器刷屏）。 */
    private lastWatchError;
    constructor(control: SkillProviderControl, home?: string);
    /**
     * checkRoots 的守卫包装：某个根不可读（EACCES/ENOTDIR）时不能抛成未处理
     * 拒绝——构造时一次、之后每 5 秒一次。错误按文案去重，恢复后清零。
     */
    private watch;
    /**
     * Invalidate the registry cache when the discovered skill files changed.
     * The stamp covers the per-skill discovery file's mtime + size (plus the
     * entry set itself), so editing a SKILL.md body — not just adding or
     * renaming directories — refreshes the GUI catalog.
     */
    private checkRoots;
    list(_options?: {
        signal?: AbortSignal;
    }): Promise<readonly SkillCandidate[]>;
    get(candidate: SkillCandidate): Promise<SkillDefinition | undefined>;
    /**
     * The roots this provider lists: the two user roots.
     *
     * Roots resolving to the same directory collapse to one entry, keeping the
     * user identity: a `~/.agents/skills` symlinked onto `~/.dsh/skills` must
     * not report every user skill twice.
     */
    private roots;
    /** Public hook for the routes: invalidate after hub-driven mutations. */
    invalidate(): void;
}
