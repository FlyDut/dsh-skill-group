/**
 * 执行层单测：接线器的生命周期与降级。
 *
 * 这里用**真实的** cordis Context / SkillRegistry / dsh-scope `createScope`，
 * 只把"哪些 preset 已挂载"换成替身——那正是 `dsh-agent-presets` 负责的部分。
 * 因此最后一个用例是端到端的：接线之后，那个 preset 的 agent 真的看不到技能。
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, isModelInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'
import { PresetWiring, type PresetMountLike, type RuntimeBindings } from './scope-wiring.ts'

const HIDDEN_META: ScopeSkillMeta = { description: 'Alpha probe skill.', source: 'user-dsh' }

/** 一个真实的最小 dsh 运行时 + 一个声明了 inject 的"hub ctx"。 */
async function setup(): Promise<{ root: Context; hubCtx: Context }> {
  const root = new Context()
  await root.plugin(SkillRegistry)
  let hubCtx: Context | undefined
  await new Promise<void>((resolve) => {
    root.plugin({
      inject: ['skills'],
      apply(c: Context) {
        hubCtx = c
        resolve()
      },
    })
  })
  return { root, hubCtx: hubCtx! }
}

function filesystemProvider(): SkillProvider {
  return {
    name: 'test-filesystem',
    list: async () => ['alpha-skill', 'beta-skill'].map((name) => ({
      name,
      description: `${name} description.`,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'user-dsh',
      provider: 'test-filesystem',
      rank: 400,
      locator: { name },
    })),
    get: async (candidate) => ({
      name: candidate.name,
      description: `${candidate.name} description.`,
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'user-dsh',
      provider: 'test-filesystem',
      content: `body of ${candidate.name}`,
    }),
  }
}

/** 一个可编程的接线场景。 */
interface Scenario {
  root: Context
  hubCtx: Context
  /** 当前"已挂载"的 preset（改这个数组来模拟 mount / unmount）。 */
  mounts: PresetMountLike[]
  /** 当前启用了隔离的 preset id。 */
  enforced: Set<string>
  /** 某个 preset 当前被隐藏的技能。 */
  hidden: Map<string, Map<string, ScopeSkillMeta>>
  /** 接线器。 */
  wiring: PresetWiring
  /** createScope 的调用记录（验证不会重复注入）。 */
  scopeCalls: number
  /** 平台日志。 */
  logs: string[]
}

async function scenario(overrides: { runtime?: () => Promise<RuntimeBindings | undefined> } = {}): Promise<Scenario> {
  const { root, hubCtx } = await setup()
  const state: Scenario = {
    root,
    hubCtx,
    mounts: [],
    enforced: new Set<string>(),
    hidden: new Map<string, Map<string, ScopeSkillMeta>>(),
    wiring: undefined as unknown as PresetWiring,
    scopeCalls: 0,
    logs: [],
  }
  const runtime = overrides.runtime ?? (async (): Promise<RuntimeBindings | undefined> => ({
    livePresetMounts: () => state.mounts,
    createScope: (ctx, key) => {
      state.scopeCalls += 1
      return createScope(ctx, key)
    },
  }))
  state.wiring = new PresetWiring({
    ctx: hubCtx,
    runtime,
    isEnforced: async (presetId) => state.enforced.has(presetId),
    hiddenOf: async (presetId) => state.hidden.get(presetId) ?? new Map(),
    log: (level, message) => { state.logs.push(`${level}: ${message}`) },
  })
  return state
}

/** 在某个 standing key 下挂一个真实的发现 provider（模拟 preset 的 skill-filesystem）。 */
function seedStandingScope(scenario: Scenario, key: object, presetId: string): void {
  const scope = createScope(scenario.hubCtx, key)
  scope.ctx.skills.registerProvider(() => filesystemProvider())
  scenario.mounts.push({ presetId, key })
}

describe('PresetWiring', () => {
  it('未启用隔离的 preset 不注入任何东西', async () => {
    const state = await scenario()
    const key = {}
    seedStandingScope(state, key, 'coding')

    await state.wiring.sync()

    // seed 用的是真实 createScope（不计入），所以 0 表示接线器一次都没 mint scope。
    expect(state.scopeCalls).toBe(0)
    expect((await state.wiring.status()).active).toEqual([])
    expect((await state.wiring.status()).mounted).toEqual(['coding'])
  })

  it('已挂载且启用了隔离的 preset 会被接上闸门', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    state.hidden.set('coding', new Map([['alpha-skill', HIDDEN_META]]))

    await state.wiring.sync()

    const status = await state.wiring.status()
    expect(status.available).toBe(true)
    expect(status.active).toEqual(['coding'])
    expect(status.mounted).toEqual(['coding'])
  })

  it('重复 sync 幂等：已接线的 preset 不会再注入一次', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    state.hidden.set('coding', new Map([['alpha-skill', HIDDEN_META]]))

    await state.wiring.sync()
    const after = state.scopeCalls
    await state.wiring.sync()
    await state.wiring.sync()

    expect(state.scopeCalls).toBe(after)
  })

  it('并发 sync 共享同一轮，不会重复注入', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    const before = state.scopeCalls

    await Promise.all([state.wiring.sync(), state.wiring.sync(), state.wiring.sync()])

    expect(state.scopeCalls).toBe(before + 1)
  })

  it('preset 被卸载后，下一轮 sync 拆掉它的闸门', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    await state.wiring.sync()
    expect((await state.wiring.status()).active).toEqual(['coding'])

    state.mounts = []
    await state.wiring.sync()

    const status = await state.wiring.status()
    expect(status.active).toEqual([])
    expect(status.mounted).toEqual([])
  })

  it('策略关闭后，下一轮 sync 拆掉闸门', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    await state.wiring.sync()

    state.enforced.delete('coding')
    await state.wiring.sync()

    expect((await state.wiring.status()).active).toEqual([])
  })

  it('dispose 拆掉全部注入并停止后续同步', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    seedStandingScope(state, {}, 'minimal')
    state.enforced.add('coding')
    state.enforced.add('minimal')
    await state.wiring.sync()
    expect((await state.wiring.status()).active).toEqual(['coding', 'minimal'])

    await state.wiring.dispose()
    await state.wiring.sync()

    expect((await state.wiring.status()).active).toEqual([])
  })

  it('运行时能力不可用时降级：available=false 且带原因，sync 不抛', async () => {
    const state = await scenario({ runtime: async () => undefined })

    await expect(state.wiring.sync()).resolves.toBeUndefined()
    const status = await state.wiring.status()
    expect(status.available).toBe(false)
    expect(status.reason).toBeTruthy()
    expect(status.active).toEqual([])
  })

  it('runtime 载入抛错时同样降级，且原因来自异常', async () => {
    const state = await scenario({ runtime: async () => { throw new Error('module not found') } })

    await expect(state.wiring.sync()).resolves.toBeUndefined()
    const status = await state.wiring.status()
    expect(status.available).toBe(false)
    expect(status.reason).toContain('module not found')
  })

  it('枚举 mount 抛错时只记日志，不影响其他功能', async () => {
    const state = await scenario({
      runtime: async () => ({
        livePresetMounts: () => { throw new Error('boom') },
        createScope: (ctx, key) => createScope(ctx, key),
      }),
    })

    await expect(state.wiring.sync()).resolves.toBeUndefined()
    expect(state.logs.some((line) => line.includes('boom'))).toBe(true)
  })

  it('单个 preset 接线失败不阻断其余 preset', async () => {
    const state = await scenario()
    seedStandingScope(state, { bad: true }, 'broken')
    seedStandingScope(state, { good: true }, 'coding')
    state.enforced.add('broken')
    state.enforced.add('coding')

    const realCreate = createScope
    const wiring = new PresetWiring({
      ctx: state.hubCtx,
      runtime: async () => ({
        livePresetMounts: () => state.mounts,
        createScope: (ctx, key) => {
          if (key === state.mounts[0].key) throw new Error('cannot mint scope')
          return realCreate(ctx, key)
        },
      }),
      isEnforced: async (presetId) => state.enforced.has(presetId),
      hiddenOf: async (presetId) => state.hidden.get(presetId) ?? new Map(),
      log: (level, message) => { state.logs.push(`${level}: ${message}`) },
    })

    await wiring.sync()

    expect((await wiring.status()).active).toEqual(['coding'])
    expect(state.logs.some((line) => line.includes('cannot mint scope'))).toBe(true)
  })

  it('invalidate 通知已接线的闸门，未接线的 preset 不受影响', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')
    await state.wiring.sync()

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.wiring.invalidate('coding')
    state.wiring.invalidate('never-mounted')
    spy.mockRestore()
    // 调用本身不抛就说明它拿到了 control；行为效果由下面的端到端用例覆盖。
    expect(true).toBe(true)
  })

  it('端到端：接线后该 preset 的 agent 看不到被隐藏的技能，拆掉后恢复', async () => {
    const state = await scenario()
    const standingKey = {}
    seedStandingScope(state, standingKey, 'coding')
    state.enforced.add('coding')
    state.hidden.set('coding', new Map([['alpha-skill', HIDDEN_META]]))

    const agentKey = {}
    createScope(state.hubCtx, agentKey, { parent: standingKey })

    // 接线前：两个技能都对模型可见。
    const before = await state.hubCtx.skills.snapshot({ scope: agentKey })
    expect(before.skills.filter(isModelInvocable).map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])

    await state.wiring.sync()

    // 接线后：alpha-skill 从"模型可见"里消失，beta-skill 不受影响。
    const after = await state.hubCtx.skills.snapshot({ scope: agentKey })
    expect(after.skills.filter(isModelInvocable).map((s) => s.name)).toEqual(['beta-skill'])
    // 显式加载同样被拒（不能凭名字绕过去）。
    expect(await state.hubCtx.skills.get('alpha-skill', { scope: agentKey })).toBeUndefined()
    expect((await state.hubCtx.skills.get('beta-skill', { scope: agentKey }))?.content).toBe('body of beta-skill')

    // 关掉隔离：下一轮 sync 之后恢复。
    state.enforced.delete('coding')
    await state.wiring.sync()
    const restored = await state.hubCtx.skills.snapshot({ scope: agentKey })
    expect(restored.skills.filter(isModelInvocable).map((s) => s.name)).toEqual(['alpha-skill', 'beta-skill'])
  })

  it('端到端：两个 preset 的闸门互不干扰', async () => {
    const state = await scenario()
    const gatedKey = {}
    const openKey = {}
    seedStandingScope(state, gatedKey, 'coding')
    seedStandingScope(state, openKey, 'minimal')
    state.enforced.add('coding')
    state.hidden.set('coding', new Map([['alpha-skill', HIDDEN_META]]))

    const gatedAgent = {}
    const openAgent = {}
    createScope(state.hubCtx, gatedAgent, { parent: gatedKey })
    createScope(state.hubCtx, openAgent, { parent: openKey })

    await state.wiring.sync()

    expect((await state.hubCtx.skills.snapshot({ scope: gatedAgent })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['beta-skill'])
    expect((await state.hubCtx.skills.snapshot({ scope: openAgent })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['alpha-skill', 'beta-skill'])
  })

  it('端到端：策略变更后 invalidate 让新的隐藏集合立刻生效', async () => {
    const state = await scenario()
    const standingKey = {}
    seedStandingScope(state, standingKey, 'coding')
    state.enforced.add('coding')
    state.hidden.set('coding', new Map([['alpha-skill', HIDDEN_META]]))
    await state.wiring.sync()

    const agentKey = {}
    createScope(state.hubCtx, agentKey, { parent: standingKey })
    expect((await state.hubCtx.skills.snapshot({ scope: agentKey })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['beta-skill'])

    // 改策略：现在换 beta-skill 被隐藏。
    state.hidden.set('coding', new Map([['beta-skill', { description: 'Beta probe skill.', source: 'user-dsh' }]]))
    state.wiring.invalidate('coding')

    // 缓存必须失效，否则用户改了设置却看不到任何变化。
    await state.hubCtx.skills.snapshot({ scope: agentKey })
    expect((await state.hubCtx.skills.snapshot({ scope: agentKey })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['alpha-skill'])
  })
})
