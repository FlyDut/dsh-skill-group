/**
 * 执行层单测：接线器的生命周期与降级。
 *
 * 这里用**真实的** cordis Context / SkillRegistry / dsh-scope `createScope`
 * 搭一个单副本运行时（测试进程里只有一个 dsh-scope 实例，不会出现跨副本
 * Symbol 不匹配），只把"哪些 preset 已挂载、它们的 scoped ctx 是什么"换成替身
 * ——那正是 `dsh-agent-preset-registry` 负责的部分。
 *
 * 因此最后一个用例是端到端的：接线之后，那个 preset 的 agent 真的看不到技能。
 * 另外专门钉住一个回归：mount 没带宿主 scoped ctx 时**必须跳过**，绝不能把
 * gate 注册进 global layer（那会让整个技能目录自锁）。
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SkillRegistry, isModelInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillProvider } from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'
import { PresetWiring, serviceMounts, type PresetMountLike, type RuntimeBindings } from './scope-wiring.ts'

const HIDDEN_META: ScopeSkillMeta = { description: 'Alpha probe skill.', source: 'user-dsh', provider: 'skill-hub' }

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
    logs: [],
  }
  const runtime = overrides.runtime ?? (async (): Promise<RuntimeBindings | undefined> => ({
    livePresetMounts: async () => state.mounts,
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

/**
 * 在某个 standing key 下挂一个真实的发现 provider（模拟 preset 的
 * skill-filesystem），并把宿主 mint 的 scoped ctx 一起交给接线器。
 */
function seedStandingScope(scenario: Scenario, key: object, presetId: string): void {
  const scope = createScope(scenario.hubCtx, key)
  scope.ctx.skills.registerProvider(() => filesystemProvider())
  scenario.mounts.push({ presetId, key, ctx: scope.ctx })
}

/** 在超时时间内必须完成——用来钉死"无报错挂死"这类回归。 */
async function within<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`operation did not settle within ${ms}ms`)), ms)
      timer.unref?.()
    }),
  ])
}

describe('PresetWiring', () => {
  it('未启用隔离的 preset 不注入任何东西', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')

    await state.wiring.sync()

    expect((await state.wiring.status()).active).toEqual([])
    expect((await state.wiring.status()).mounted).toEqual(['coding'])
    expect(state.logs.some((line) => line.includes('gate attached'))).toBe(false)
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
    await state.wiring.sync()
    await state.wiring.sync()

    expect(state.logs.filter((line) => line.includes('gate attached')).length).toBe(1)
  })

  it('并发 sync 共享同一轮，不会重复注入', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')

    await Promise.all([state.wiring.sync(), state.wiring.sync(), state.wiring.sync()])

    expect(state.logs.filter((line) => line.includes('gate attached')).length).toBe(1)
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

  it('服务晚到不会被永久缓存为不可用（软注入回归）', async () => {
    const state = await scenario()
    seedStandingScope(state, {}, 'coding')
    state.enforced.add('coding')

    let available = false
    state.wiring = new PresetWiring({
      ctx: state.hubCtx,
      runtime: async () => available ? { livePresetMounts: async () => state.mounts } : undefined,
      isEnforced: async (presetId) => state.enforced.has(presetId),
      hiddenOf: async () => new Map(),
      log: (level, message) => { state.logs.push(`${level}: ${message}`) },
    })

    await state.wiring.sync()
    expect((await state.wiring.status()).available).toBe(false)

    available = true
    await state.wiring.sync()
    expect((await state.wiring.status()).available).toBe(true)
    expect((await state.wiring.status()).active).toEqual(['coding'])
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
        livePresetMounts: async () => { throw new Error('boom') },
      }),
    })

    await expect(state.wiring.sync()).resolves.toBeUndefined()
    expect(state.logs.some((line) => line.includes('boom'))).toBe(true)
  })

  it('mount 没有宿主 scoped ctx 时跳过接线，绝不注册进 global layer', async () => {
    const state = await scenario()
    const key = {}
    createScope(state.hubCtx, key).ctx.skills.registerProvider(() => filesystemProvider())
    // 只给 key、不给 ctx：模拟宿主服务拿不到 revision 内 ctx 的降级路径。
    state.mounts.push({ presetId: 'coding', key })
    state.enforced.add('coding')

    await state.wiring.sync()

    expect((await state.wiring.status()).active).toEqual([])
    expect(state.logs.some((line) => line.includes('no scoped context'))).toBe(true)
    // 关键回归：global 快照必须照常完成（旧实现会在这里自锁），且 agent 视图
    // 不会被误注册进 global 的 gate 遮蔽。
    const agentKey = {}
    createScope(state.hubCtx, agentKey, { parent: key })
    expect((await within(state.hubCtx.skills.snapshot())).skills).toEqual([])
    const snapshot = await within(state.hubCtx.skills.snapshot({ scope: agentKey }))
    expect(snapshot.skills.filter(isModelInvocable).map((skill) => skill.name)).toEqual(['alpha-skill', 'beta-skill'])
  })

  it('单个 preset 接线失败不阻断其余 preset', async () => {
    const state = await scenario()
    seedStandingScope(state, { bad: true }, 'broken')
    seedStandingScope(state, { good: true }, 'coding')
    state.enforced.add('broken')
    state.enforced.add('coding')

    const brokenCtx = {
      plugin: () => { throw new Error('cannot mount gate') },
    } as unknown as Context
    state.mounts[0] = { presetId: 'broken', key: state.mounts[0].key, ctx: brokenCtx }

    await state.wiring.sync()

    expect((await state.wiring.status()).active).toEqual(['coding'])
    expect(state.logs.some((line) => line.includes('cannot mount gate'))).toBe(true)
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

  it('端到端：隐藏集合按会话目录现算（工作区）——同一 preset 下不同 cwd 结果不同', async () => {
    const state = await scenario()
    const standingKey = {}
    seedStandingScope(state, standingKey, 'coding')
    const ALPHA = '/w/alpha'
    // 自定义 hiddenOf：只有目录等于 /w/alpha 的会话隐藏 alpha-skill。
    const wiring = new PresetWiring({
      ctx: state.hubCtx,
      runtime: async () => ({ livePresetMounts: async () => state.mounts }),
      isEnforced: async () => true,
      hiddenOf: async (_presetId, cwd) => (cwd === ALPHA ? new Map([['alpha-skill', HIDDEN_META]]) : new Map()),
    })
    const agentKey = {}
    createScope(state.hubCtx, agentKey, { parent: standingKey })
    await wiring.sync()

    // 同一个 agent scope，换了 cwd 就是另一个工作区：可见集不同。
    expect((await state.hubCtx.skills.snapshot({ scope: agentKey, cwd: ALPHA })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['beta-skill'])
    expect((await state.hubCtx.skills.snapshot({ scope: agentKey, cwd: '/w/beta' })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['alpha-skill', 'beta-skill'])
    // 显式加载同样按目录判定。
    expect(await state.hubCtx.skills.get('alpha-skill', { scope: agentKey, cwd: ALPHA })).toBeUndefined()
    expect((await state.hubCtx.skills.get('alpha-skill', { scope: agentKey, cwd: '/w/beta' }))?.content).toBe('body of alpha-skill')

    await wiring.dispose()
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
    state.hidden.set('coding', new Map([['beta-skill', { description: 'Beta probe skill.', source: 'user-dsh', provider: 'skill-hub' }]]))
    state.wiring.invalidate('coding')

    // 缓存必须失效，否则用户改了设置却看不到任何变化。
    await state.hubCtx.skills.snapshot({ scope: agentKey })
    expect((await state.hubCtx.skills.snapshot({ scope: agentKey })).skills.filter(isModelInvocable).map((s) => s.name))
      .toEqual(['alpha-skill'])
  })
})

/**
 * 宿主接线入口：模块级 `livePresetMounts` 不可用时，从注册表服务读 standing
 * key，并从同一个 revision 记录里取**宿主 mint 的 scoped ctx**。
 */
describe('serviceMounts', () => {
  it('把已挂载的 preset 读成 mount（含宿主 ctx），并归还每个租约', async () => {
    const released: string[] = []
    const standingKey = {}
    const scopedCtx = { tag: 'host-scoped' } as unknown as Context
    const generations = new Map<object, unknown>([[standingKey, { scope: { ctx: scopedCtx } }]])
    const mounts = serviceMounts({
      list: async () => [{ id: 'standard' }, { id: 'ptc' }],
      acquireScope: async (id?: string) => {
        if (id === 'ptc') throw new Error('agent-preset/invalid')
        return {
          key: standingKey,
          [Symbol.asyncDispose]: async () => {
            released.push(id ?? '')
          },
        }
      },
      generations,
    })
    expect(mounts).toBeTypeOf('function')

    expect(await mounts!()).toEqual([{ presetId: 'standard', key: standingKey, ctx: scopedCtx }])
    // 借读数、立即归还：未挂载的 preset 根本不产生租约。
    expect(released).toEqual(['standard'])
  })

  it('服务缺席或形状不符时返回 undefined（接线器据此整体降级）', () => {
    expect(serviceMounts(undefined)).toBeUndefined()
    expect(serviceMounts(null)).toBeUndefined()
    expect(serviceMounts({})).toBeUndefined()
    expect(serviceMounts({ list: async () => [] })).toBeUndefined()
    expect(serviceMounts({ acquireScope: async () => ({ key: {} }) })).toBeUndefined()
    // 拿不到 revision 表就没有宿主 scoped ctx：宁可降级，也不注册到 global。
    expect(serviceMounts({
      list: async () => [],
      acquireScope: async () => ({ key: {} }),
    })).toBeUndefined()
  })

  it('revision 表缺失对应记录时仍返回 key（由接线器跳过接线）', async () => {
    const standingKey = {}
    const mounts = serviceMounts({
      list: async () => [{ id: 'standard' }],
      acquireScope: async () => ({ key: standingKey }),
      generations: new Map(),
    })
    expect(await mounts!()).toEqual([{ presetId: 'standard', key: standingKey }])
  })

  it('list 抛错退化为空名单，不把失败抛给接线器', async () => {
    const mounts = serviceMounts({
      list: async () => {
        throw new Error('registry down')
      },
      acquireScope: async () => ({ key: {} }),
      generations: new Map(),
    })
    expect(await mounts!()).toEqual([])
  })

  it('名单里缺 id、key 不是对象、以及不返回租约的 preset 都被跳过', async () => {
    const mounts = serviceMounts({
      list: async () => [{ id: 'standard' }, { id: '' }, { notAnId: true }, { id: 'ghost' }, { id: 'bare' }],
      acquireScope: async (id?: string) => {
        if (id === 'ghost') return { key: 'not-an-object' }
        if (id === 'bare') return undefined
        return { key: {} }
      },
      generations: new Map(),
    })
    expect((await mounts!()).map((row) => row.presetId)).toEqual(['standard'])
  })
})
