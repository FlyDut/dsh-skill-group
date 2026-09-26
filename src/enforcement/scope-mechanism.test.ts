/**
 * 机制契约测试：本次「模式级技能隔离」方案**依赖 dsh 的三条行为**，这里用
 * 真实的 `@deepseek-ai/dsh-scope` / `dsh-skill` 把这三条钉成可执行契约。
 *
 * 契约内容（读 dsh 源码得出，此处实证）：
 *  1. `ScopedLayers` 按 **scope key 对象的 identity** 索引 layer，因此用同一个
 *     standing scope key 再次 `createScope(ctx, key)`，其中做的注册会落进
 *     **同一个 layer**——这是 hub 能在 host 平面把 gate 接到某个 preset 上的前提。
 *  2. 层合并时**层优先于 rank**：preset 层（standing）永远赢 host global 层。
 *     所以遮蔽必须发生在 preset 层，host 层的同名遮蔽候选**无效**。
 *  3. 同层内 rank 小者胜，因此 rank 0 的遮蔽候选能压过 filesystem 的 100/200/
 *     400/500 与 runtime 的 250。
 *
 * 任何一条失效，本测试会失败，`enforcement/scope-wiring` 的接线就失去依据
 * ——届时必须改走备案（写 preset composition 一行），而不是继续信任这里。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, isModelInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'

/** 与 dsh-skill-filesystem 的 user-dsh 根同秩，用来代表"真实发现 provider"。 */
const FILESYSTEM_RANK = 400
/** gate 用的同层最小秩。 */
const GATE_RANK = 0

const TABLE = new Map([
  ['alpha-skill', { description: 'Alpha probe skill.' }],
  ['beta-skill', { description: 'Beta probe skill.' }],
])

/** 模拟 dsh-skill-filesystem 的正常发现结果。 */
function filesystemProvider(): SkillProvider {
  return {
    name: 'test-filesystem',
    list: async () => [...TABLE.keys()].map((name) => ({
      name,
      description: TABLE.get(name)!.description,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'user-dsh',
      provider: 'test-filesystem',
      rank: FILESYSTEM_RANK,
      locator: { name },
    })),
    get: async (candidate) => TABLE.has(candidate.name)
      ? {
          name: candidate.name,
          description: TABLE.get(candidate.name)!.description,
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'user-dsh',
          provider: 'test-filesystem',
          content: `body of ${candidate.name}`,
        }
      : undefined,
  }
}

/** 模拟 gate：rank 0、双 invocation=false、get() 恒 undefined 的同名遮蔽。 */
function gateProvider(hidden: readonly string[]): SkillProvider {
  return {
    name: 'test-gate',
    list: async () => hidden.map((name) => ({
      name,
      description: TABLE.get(name)?.description ?? 'hidden probe skill',
      invocation: { modelInvocable: false, userInvocable: false },
      source: 'user-dsh',
      provider: 'test-gate',
      rank: GATE_RANK,
      locator: { name },
    })),
    get: async () => undefined,
  }
}

/**
 * 一个最小 dsh 运行时：root ctx + skills 服务 + 一个 preset standing scope
 * （含其 agent）。真实部署里 standing scope 由 `dsh-agent-preset-registry` 在
 * `mountPreset` 时 mint，hub 通过 `livePresetMounts()` 拿到它的 key。
 */
async function harness(): Promise<{
  ctx: Context
  standingKey: object
  agentKey: object
}> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const standingKey = {}
  const standing = createScope(ctx, standingKey)
  // 真实部署里 hub 的 ctx 已声明 inject:['skills',…]，createScope 继承该依赖
  // API，scoped ctx 上可直接读 ctx.skills；测试的 root ctx 没有声明，故显式补上。
  standing.ctx.inject(['skills'], (sctx) => {
    sctx.skills.registerProvider(() => filesystemProvider())
  })
  return { ctx, standingKey, agentKey: { agent: true } }
}

/** 在 scoped ctx 下声明 skills 依赖后执行注册（等价于插件里的 inject 声明）。 */
async function registerInScope(scopeCtx: Context, create: (control: { invalidate: () => void }) => SkillProvider): Promise<void> {
  await new Promise<void>((resolve) => {
    scopeCtx.inject(['skills'], (sctx) => {
      sctx.skills.registerProvider((control) => create(control))
      resolve()
    })
  })
}

describe('技能注册表的作用域分层（方案依赖的 dsh 契约）', () => {
  it('preset 层的 agent 能看到该层 provider 的技能；host 平面看不到', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })

    const scoped = await ctx.skills.snapshot({ scope: agentKey })
    expect(scoped.skills.map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])
    expect(scoped.skills.every(isModelInvocable)).toBe(true)

    // host 平面读的是 global 层：standing 层的贡献对它不可见——这正是 hub 需要
    // 自建一个 global provider 才能渲染管理目录的原因。
    const host = await ctx.skills.snapshot()
    expect(host.skills).toEqual([])
  })

  it('契约 2（反证）：host global 层的同名遮蔽无法穿透 preset 层', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })

    const dispose = ctx.skills.registerProvider(() => gateProvider(['alpha-skill']))
    const snap = await ctx.skills.snapshot({ scope: agentKey })
    const alpha = snap.skills.find((s) => s.name === 'alpha-skill')

    // 层优先于 rank：更近的 preset 层候选赢，global 层的 rank 0 也无济于事。
    expect(alpha?.provider).toBe('test-filesystem')
    expect(isModelInvocable(alpha!)).toBe(true)
    dispose()
  })

  it('契约 1+3：用同一 standing key 再 mint 一个 scope，遮蔽候选在同层内胜出', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })

    const gateScope = createScope(ctx, standingKey)
    await registerInScope(gateScope.ctx, () => gateProvider(['alpha-skill']))

    const snap = await ctx.skills.snapshot({ scope: agentKey })
    const alpha = snap.skills.find((s) => s.name === 'alpha-skill')
    const beta = snap.skills.find((s) => s.name === 'beta-skill')

    // 被遮蔽者：仍在集合里（遮蔽而非删除），但已不可调用。
    expect(alpha?.provider).toBe('test-gate')
    expect(isModelInvocable(alpha!)).toBe(false)
    expect(alpha?.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    // 未被遮蔽者：完全不受影响，仍由 filesystem 提供。
    expect(beta?.provider).toBe('test-filesystem')
    expect(isModelInvocable(beta!)).toBe(true)

    // 遮蔽必须同时让显式加载失败，否则模型仍能凭记忆调到它。
    expect(await ctx.skills.get('alpha-skill', { scope: agentKey })).toBeUndefined()
    expect((await ctx.skills.get('beta-skill', { scope: agentKey }))?.content).toBe('body of beta-skill')
  })

  it('gate 只落 preset 层，host 管理视图不受影响', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })
    const gateScope = createScope(ctx, standingKey)
    await registerInScope(gateScope.ctx, () => gateProvider(['alpha-skill']))

    expect((await ctx.skills.snapshot()).skills).toEqual([])
  })

  it('策略变更后的 invalidate 保持遮蔽（下一个 turn 生效的机制）', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })

    let control: { invalidate: () => void } | undefined
    const gateScope = createScope(ctx, standingKey)
    await registerInScope(gateScope.ctx, (given) => {
      control = given
      return gateProvider(['alpha-skill'])
    })

    await ctx.skills.snapshot({ scope: agentKey }) // 先填充收集缓存
    control!.invalidate()
    const snap = await ctx.skills.snapshot({ scope: agentKey })
    expect(isModelInvocable(snap.skills.find((s) => s.name === 'alpha-skill')!)).toBe(false)
  })

  it('dispose gate scope 后彻底恢复（停用隔离不留残留）', async () => {
    const { ctx, standingKey, agentKey } = await harness()
    createScope(ctx, agentKey, { parent: standingKey })
    const gateScope = createScope(ctx, standingKey)
    await registerInScope(gateScope.ctx, () => gateProvider(['alpha-skill']))
    expect(isModelInvocable((await ctx.skills.snapshot({ scope: agentKey })).skills.find((s) => s.name === 'alpha-skill')!)).toBe(false)

    await gateScope.dispose()

    const snap = await ctx.skills.snapshot({ scope: agentKey })
    const alpha = snap.skills.find((s) => s.name === 'alpha-skill')
    expect(alpha?.provider).toBe('test-filesystem')
    expect(isModelInvocable(alpha!)).toBe(true)
  })

  it('两个 preset 的 gate 互不干扰', async () => {
    const { ctx, standingKey } = await harness()
    const otherKey = {}
    const other = createScope(ctx, otherKey)
    await registerInScope(other.ctx, () => filesystemProvider())

    const gatedAgent = { gated: true }
    const openAgent = { open: true }
    createScope(ctx, gatedAgent, { parent: standingKey })
    createScope(ctx, openAgent, { parent: otherKey })

    const gateScope = createScope(ctx, standingKey)
    await registerInScope(gateScope.ctx, () => gateProvider(['alpha-skill']))

    const gated = await ctx.skills.snapshot({ scope: gatedAgent })
    const open = await ctx.skills.snapshot({ scope: openAgent })
    expect(isModelInvocable(gated.skills.find((s) => s.name === 'alpha-skill')!)).toBe(false)
    expect(isModelInvocable(open.skills.find((s) => s.name === 'alpha-skill')!)).toBe(true)
    expect(open.skills.map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])
  })

  it('声明了 inject 的插件 ctx 下，scoped ctx 可直接读 ctx.skills（wiring 的写法依据）', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const standingKey = {}

    // 模拟 dsh 插件行：hub 的 ctx 已声明 inject:['skills',…]。
    let direct: unknown
    let scopedCtx: Context | undefined
    await new Promise<void>((resolve) => {
      ctx.plugin({
        inject: ['skills'],
        apply(c: Context) {
          const scope = createScope(c, standingKey)
          scopedCtx = scope.ctx
          direct = scope.ctx.skills
          resolve()
        },
      })
    })

    // 能直接读到，则 wiring 可以 `scope.ctx.skills.registerProvider(...)` 一步到位。
    expect(direct).toBeDefined()
    expect(typeof (direct as { registerProvider?: unknown }).registerProvider).toBe('function')

    // 且注册确实落进 standing 层（而不是 global 层）。
    scopedCtx!.skills.registerProvider(() => filesystemProvider())
    const agentKey = {}
    createScope(ctx, agentKey, { parent: standingKey })
    const scoped = await ctx.skills.snapshot({ scope: agentKey })
    expect(scoped.skills.map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])
    expect((await ctx.skills.snapshot()).skills).toEqual([])
  })
})
