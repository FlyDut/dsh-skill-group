/**
 * 策展层单测：宿主视图的拼装与缓存。它同时供 gate（取遮蔽名单）与面板
 * （取预览）使用，所以缓存失效的时机必须精确——改完设置必须立刻可见。
 */

import { describe, expect, it } from 'vitest'
import { collectionKey, tagKey, type ScopePolicy } from '../protocol/scopes.ts'
import { mergePolicyEntries } from './scope-policy.ts'
import { ScopeView, type ScopeCatalogSnapshot, type ScopeSkillMeta } from './scope-view.ts'

const META: Record<string, ScopeSkillMeta> = {
  'alpha-skill': { description: 'Alpha.', source: 'user-dsh', provider: 'skill-hub' },
  'beta-skill': { description: 'Beta.', source: 'user-dsh', provider: 'skill-hub' },
  'gamma-skill': { description: 'Gamma.', source: 'user-agents', provider: 'skill-hub' },
}

interface Counter {
  catalog: number
  groups: number
  policy: number
}

/** 一个可改写的宿主替身。 */
function harness(initial: { policy?: ScopePolicy | undefined; names?: string[]; closed?: ReadonlySet<string> } = {}): {
  view: ScopeView
  calls: Counter
  setPolicy: (policy: ScopePolicy | undefined) => void
  setNames: (names: string[]) => void
} {
  const calls: Counter = { catalog: 0, groups: 0, policy: 0 }
  let names = initial.names ?? Object.keys(META)
  let policy = initial.policy
  const members = new Map<string, readonly string[]>([
    [tagKey('t1'), ['alpha-skill', 'beta-skill']],
    [collectionKey('acme/skills'), ['gamma-skill']],
  ])
  const view = new ScopeView({
    catalog: async (): Promise<ScopeCatalogSnapshot> => {
      calls.catalog += 1
      return { names: [...names], meta: new Map(Object.entries(META)) }
    },
    groups: async () => {
      calls.groups += 1
      return new Map(members)
    },
    policyOf: async (presetId) => {
      calls.policy += 1
      // 只对策略自己的 preset 返回它：未配置的模式必须走"不隔离"。
      return policy !== undefined && policy.presetId === presetId ? policy : undefined
    },
    closed: async () => initial.closed ?? new Set<string>(),
  })
  return {
    view,
    calls,
    setPolicy: (next) => { policy = next },
    setNames: (next) => { names = next },
  }
}

describe('ScopeView', () => {
  it('未配置的模式按"不隔离"处理，可见即全集', async () => {
    const { view } = harness()
    const result = await view.visibilityOf('coding')
    expect(result.enabled).toBe(false)
    expect(result.visible).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
    expect(result.hidden).toEqual([])
  })

  it('启用隔离后隐藏项为全集减白名单', async () => {
    const { view } = harness({ policy: { presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] } })
    const result = await view.visibilityOf('coding')
    expect(result.visible).toEqual(['alpha-skill', 'beta-skill'])
    expect(result.hidden).toEqual(['gamma-skill'])
  })

  it('visibilityFor 直接吃"主体无关"的策略：模式与工作区合并后的并集', async () => {
    const { view } = harness()
    // 两个主体：一个按 tag:t1，一个按集合 acme/skills；合并后是并集。
    const mode: ScopePolicy = { presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] }
    const workspace: ScopePolicy = { presetId: 'w1', enabled: false, groups: [collectionKey('acme/skills')], skills: [] }
    const merged = mergePolicyEntries([mode, workspace])
    const result = await view.visibilityFor(merged)
    expect(result.enabled).toBe(true)
    expect(result.visible).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
    expect(result.hidden).toEqual([])
    // 任一主体启用即启用：只留工作区策略时隐藏另两个。
    const onlyWorkspace = await view.visibilityFor(mergePolicyEntries([undefined, { ...workspace, enabled: true }]))
    expect(onlyWorkspace.hidden).toEqual(['alpha-skill', 'beta-skill'])
    expect((await view.hiddenFor(merged)).size).toBe(0)
  })

  it('hiddenOf 只返回被隐藏技能，并带上真实元数据', async () => {
    const { view } = harness({ policy: { presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] } })
    const hidden = await view.hiddenOf('coding')
    expect([...hidden.keys()]).toEqual(['gamma-skill'])
    expect(hidden.get('gamma-skill')).toEqual({ description: 'Gamma.', source: 'user-agents', provider: 'skill-hub' })
  })

  it('未启用隔离时 hiddenOf 为空——闸门完全不干预', async () => {
    const { view } = harness({ policy: { presetId: 'coding', enabled: false, groups: [], skills: [] } })
    expect((await view.hiddenOf('coding')).size).toBe(0)
  })

  it('白名单为空且启用时隐藏全部技能', async () => {
    const { view } = harness({ policy: { presetId: 'coding', enabled: true, groups: [], skills: [] } })
    expect(await view.hiddenOf('coding')).toHaveLength(3)
  })

  it('目录与分组表按 invalidate 失效，判定按内容键复用', async () => {
    const { view, calls } = harness({ policy: { presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] } })

    await view.visibilityOf('coding')
    await view.visibilityOf('coding')
    await view.visibilityOf('coding')
    // 目录只读一次、分组只拼一次、每个模式的判定也只算一次。
    expect(calls.catalog).toBe(1)
    expect(calls.groups).toBe(1)

    view.invalidate()
    await view.visibilityOf('coding')
    expect(calls.catalog).toBe(2)
    expect(calls.groups).toBe(2)
  })

  it('目录快照带 TTL：超过存活时间后重读，覆盖 hub 之外的文件变化', async () => {
    // ttl=0 → 每次读取都重取目录（等价于"外部刚改了技能文件"）。
    let reads = 0
    const view = new ScopeView({
      catalog: async () => {
        reads += 1
        // 第二次读取时多出一个技能：它必须进入判定，否则会在该隔离它的模式下漏网。
        const names = reads === 1 ? ['alpha-skill'] : ['alpha-skill', 'delta-skill']
        return { names, meta: new Map(names.map((n) => [n, { description: n, source: 'user-dsh', provider: 'skill-hub' }])) }
      },
      groups: async () => new Map([[tagKey('t1'), ['alpha-skill']]]),
      policyOf: async () => ({ presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] }),
      closed: async () => new Set<string>(),
    }, 0)

    expect((await view.visibilityOf('coding')).hidden).toEqual([])
    expect(reads).toBe(1)
    // delta-skill 是新来的、不在白名单里 → 必须被判为隐藏。
    expect((await view.visibilityOf('coding')).hidden).toEqual(['delta-skill'])
    expect(reads).toBe(2)
  })

  it('目录内容变化时判定自动重算（缓存键覆盖目录）', async () => {
    const { view, setNames } = harness({ policy: { presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] } })
    expect((await view.visibilityOf('coding')).hidden).toEqual(['gamma-skill'])

    // 新技能出现：即使没有显式 invalidate，判定键也会变（目录是键的一部分）。
    setNames([...Object.keys(META), 'delta-skill'])
    expect((await view.visibilityOf('coding')).hidden).toEqual(['gamma-skill'])
  })

  it('目录与判定之间技能被删除时不做无据遮蔽', async () => {
    // meta 里没有 gamma-skill（模拟判定算出隐藏后目录立刻删掉了它）。
    const view = new ScopeView({
      catalog: async () => ({ names: ['alpha-skill', 'beta-skill', 'gamma-skill'], meta: new Map([['alpha-skill', META['alpha-skill']]]) }),
      groups: async () => new Map([[tagKey('t1'), ['alpha-skill', 'beta-skill']]]),
      policyOf: async () => ({ presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] }),
      closed: async () => new Set<string>(),
    })
    const hidden = await view.hiddenOf('coding')
    // gamma-skill 确实被判定为隐藏，但目录里已没有它的元数据 → 不生成遮蔽候选。
    expect(hidden.has('gamma-skill')).toBe(false)
    expect(hidden.size).toBe(0)
  })

  it('多个 preset 各自独立判定', async () => {
    const { view, setPolicy } = harness()
    setPolicy({ presetId: 'coding', enabled: true, groups: [tagKey('t1')], skills: [] })
    const coding = await view.visibilityOf('coding')
    // 另一个 preset 没有策略 → 不限制（同一 view 实例，缓存不得串台）。
    const minimal = await view.visibilityOf('minimal')
    expect(coding.hidden).toEqual(['gamma-skill'])
    expect(minimal.hidden).toEqual([])
  })

  it('全局关闭名单并入所有模式的遮蔽（未隔离的模式也生效）', async () => {
    const { view } = harness({ closed: new Set(['alpha-skill']) })
    const minimal = await view.visibilityOf('minimal')
    expect(minimal.hidden).toEqual(['alpha-skill'])
    expect(minimal.enabled).toBe(true)

    // 目录里没有这个名字 → 不做无据遮蔽。
    const { view: absent } = harness({ closed: new Set(['never-existed']) })
    expect((await absent.visibilityOf('minimal')).hidden).toEqual([])
  })
})
