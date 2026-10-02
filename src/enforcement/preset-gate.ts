/**
 * 执行层 · 模式闸门（gate）：把一个会话"不该看到的技能"变成**同名遮蔽候选**，
 * 注册进该会话所用 preset 的 standing 作用域层。
 *
 * 隐藏集合是**按工作目录**算出来的：同一个 preset 在 A 工作区里可能隔离成
 * 一组技能、在 B 工作区里是另一组（工作区策略），所以 `list()` 每次都把注册表
 * 转发的 `cwd` 交给闭包，由宿主按"工作区策略优先、否则模式策略"重新解析。
 *
 * 为什么是遮蔽而不是删除：`ctx.skills` 的分层合并是"最近的层赢同名"，一个层
 * 无法删掉另一层的条目——但它可以用一个更近/同层更小 rank 的同名候选把它顶掉。
 * 于是这里对每个被隐藏的技能返回一个：
 *   - `rank: 0`（同层最小，压过 filesystem 的 100/200/400/500 与 runtime 的 250）
 *   - `invocation: { modelInvocable: false, userInvocable: false }`
 *   - `get()` 恒 `undefined`（模型就算知道名字也加载不到）
 * 的候选。`dsh-tool-skill` 的 `<available_skills>` 目录按 `isModelInvocable`
 * 过滤，显式调用按同一策略拒绝——两者同时失效，等于"看不见"。
 *
 * 遮蔽候选沿用原技能真实的 `description` / `whenToUse` / `source`：它不会
 * 出现在模型目录里，但仍可能被别的 UI 消费者读到，那时它应当是"真实但不可
 * 调用"，而不是一条假数据。
 */

import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider } from '@deepseek-ai/dsh-skill'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'

/**
 * gate 候选的秩。必须小于同层所有真实发现源的秩（filesystem 依次是
 * 100 / 200 / 400 / 500，bundled 是 600，runtime 是 250），0 留足余量。
 */
export const GATE_RANK = 0

/** gate provider 在注册表里的名字；同名 provider 在同一层只能有一个。 */
export const GATE_PROVIDER_NAME = 'skill-hub-gate'

/** 元数据缺失时的兜底描述（`validateCandidate` 要求非空字符串）。 */
const FALLBACK_DESCRIPTION = 'hidden in this agent preset by skill-hub'

/**
 * 一个 preset 作用域里的闸门。实例由 {@link PresetGateProvider} 的构造方
 * 持有，`readHidden` 是闭包——它直接读宿主的 {@link ScopeView}，不走服务
 * 查找，因此 gate 不需要知道自己属于哪个 preset，也不需要再问一次。
 */
export class PresetGateProvider implements SkillProvider {
  readonly name = GATE_PROVIDER_NAME

  /**
   * @param presetId - 该实例负责的 preset（只用于日志与诊断）。
   * @param readHidden - 按会话工作目录读取当前应被遮蔽的技能及元数据；
   *   空表表示不干预（`cwd` 缺省时只算模式策略）。
   */
  constructor(
    private readonly presetId: string,
    private readonly readHidden: (cwd?: string) => Promise<ReadonlyMap<string, ScopeSkillMeta>>,
  ) {}

  /**
   * 只返回被隐藏技能的同名遮蔽候选；可见技能一律不返回，让真正发现它们的
   * provider 在自己的秩上正常胜出。
   * @param options - 注册表转发给 provider 的查找上下文（工作目录 + 取消信号）。
   * @returns 遮蔽候选列表。
   */
  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
    const hidden = await this.readHidden(options.cwd)
    options.signal?.throwIfAborted()
    if (hidden.size === 0) return []
    const candidates: SkillCandidate[] = []
    for (const [name, meta] of hidden) {
      candidates.push({
        name,
        description: meta.description !== '' ? meta.description : FALLBACK_DESCRIPTION,
        ...(meta.whenToUse !== undefined && meta.whenToUse !== '' ? { whenToUse: meta.whenToUse } : {}),
        invocation: { modelInvocable: false, userInvocable: false },
        source: meta.source,
        provider: this.name,
        rank: GATE_RANK,
        locator: { presetId: this.presetId, name },
      })
    }
    return candidates
  }

  /**
   * 被遮蔽的技能一律不可加载——这是"遮蔽"能挡住显式调用的关键。
   * @param _candidate - 注册表选中的候选（本 provider 恒不加载）。
   * @param _options - 查找上下文（未使用）。
   * @returns 恒为 undefined。
   */
  async get(_candidate: SkillCandidate, _options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    return undefined
  }
}
