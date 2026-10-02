/**
 * 策展层单测：白名单展开、悬空键、裁剪、启用语义。
 * 这些判定同时驱动运行时遮蔽与面板预览，所以边界必须钉死。
 */

import { describe, expect, it } from 'vitest'
import { collectionKey, skillKey, sourceKey, tagKey, type ScopePolicy } from '../protocol/scopes.ts'
import { expandScopePolicy, overridePolicyEntries, resolveScopeVisibility, scopeCacheKey, type ScopeGroupIndex } from './scope-policy.ts'

const KNOWN = ['alpha-skill', 'beta-skill', 'gamma-skill'] as const

/** 一个典型索引：两个 tag、一个集合、一个来源根，外加一个悬空键。 */
function index(overrides: Partial<ScopeGroupIndex> = {}): ScopeGroupIndex {
  return {
    members: new Map<string, readonly string[]>([
      [tagKey('t1'), ['alpha-skill', 'beta-skill']],
      [tagKey('t2'), ['gamma-skill']],
      [collectionKey('acme/skills'), ['alpha-skill']],
      [sourceKey('user-dsh'), ['beta-skill', 'gamma-skill']],
      [tagKey('emptied'), []],
    ]),
    known: new Set(KNOWN),
    ...overrides,
  }
}

function policy(patch: Partial<ScopePolicy> = {}): ScopePolicy {
  return { presetId: 'coding', enabled: true, groups: [], skills: [], ...patch }
}

describe('expandScopePolicy', () => {
  it('按分组键展开并裁剪到目录中存在的技能', () => {
    const expanded = expandScopePolicy(policy({ groups: [tagKey('t1')] }), index())
    expect(expanded.visible).toEqual(['alpha-skill', 'beta-skill'])
    expect(expanded.resolved[tagKey('t1')]).toEqual(['alpha-skill', 'beta-skill'])
    expect(expanded.dangling).toEqual([])
  })

  it('四类键各按其来源展开，并集去重', () => {
    const expanded = expandScopePolicy(policy({
      groups: [tagKey('t1'), collectionKey('acme/skills'), sourceKey('user-dsh'), skillKey('gamma-skill')],
    }), index())
    expect(expanded.visible).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
    expect(expanded.resolved[collectionKey('acme/skills')]).toEqual(['alpha-skill'])
    expect(expanded.resolved[sourceKey('user-dsh')]).toEqual(['beta-skill', 'gamma-skill'])
  })

  it('groups 里的 skill: 键与 skills[] 里的裸名等价', () => {
    const viaGroups = expandScopePolicy(policy({ groups: [skillKey('alpha-skill')] }), index())
    const viaSkills = expandScopePolicy(policy({ skills: ['alpha-skill'] }), index())
    expect(viaGroups.visible).toEqual(['alpha-skill'])
    expect(viaSkills.visible).toEqual(['alpha-skill'])
    // 裸名以 skill:<name> 归键，面板据此回显勾选状态。
    expect(viaSkills.resolved[skillKey('alpha-skill')]).toEqual(['alpha-skill'])
  })

  it('分组里已删除的成员被裁剪，不会凭空复活技能', () => {
    const idx = index({ members: new Map([[tagKey('t1'), ['alpha-skill', 'gone-skill']]]) })
    const expanded = expandScopePolicy(policy({ groups: [tagKey('t1')] }), idx)
    expect(expanded.visible).toEqual(['alpha-skill'])
    expect(expanded.resolved[tagKey('t1')]).toEqual(['alpha-skill'])
  })

  it('已删除的分组键记为悬空且不贡献成员', () => {
    const expanded = expandScopePolicy(policy({ groups: [tagKey('t1'), tagKey('deleted')] }), index())
    expect(expanded.visible).toEqual(['alpha-skill', 'beta-skill'])
    expect(expanded.dangling).toEqual([tagKey('deleted')])
    expect(expanded.resolved[tagKey('deleted')]).toEqual([])
  })

  it('存在但当前没有成员的分组不算悬空', () => {
    const expanded = expandScopePolicy(policy({ groups: [tagKey('emptied')] }), index())
    expect(expanded.dangling).toEqual([])
    expect(expanded.visible).toEqual([])
  })

  it('目录中不存在的裸技能名被忽略', () => {
    const expanded = expandScopePolicy(policy({ skills: ['alpha-skill', 'ghost-skill'] }), index())
    expect(expanded.visible).toEqual(['alpha-skill'])
    expect(expanded.resolved[skillKey('ghost-skill')]).toBeUndefined()
  })

  it('重复的键与重复的成员都收敛为一次', () => {
    const expanded = expandScopePolicy(policy({
      groups: [tagKey('t1'), tagKey('t1')],
      skills: ['alpha-skill', 'alpha-skill'],
    }), index())
    expect(expanded.visible).toEqual(['alpha-skill', 'beta-skill'])
    expect(expanded.resolved[tagKey('t1')]).toEqual(['alpha-skill', 'beta-skill'])
    expect(expanded.resolved[skillKey('alpha-skill')]).toEqual(['alpha-skill'])
  })

  it('形状都不对的键记入悬空且不影响其他条目', () => {
    const expanded = expandScopePolicy(policy({ groups: ['not-a-key', tagKey('t2')] }), index())
    expect(expanded.visible).toEqual(['gamma-skill'])
    expect(expanded.dangling).toEqual(['not-a-key'])
  })

  it('结果按名称升序，与勾选顺序无关', () => {
    const expanded = expandScopePolicy(policy({ groups: [sourceKey('user-dsh'), tagKey('t1')] }), index())
    expect(expanded.visible).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
  })
})

describe('resolveScopeVisibility', () => {
  it('未启用隔离时不限制：可见即全集、隐藏为空，但仍给出展开预览', () => {
    const result = resolveScopeVisibility(policy({ enabled: false, groups: [tagKey('t2')] }), index(), KNOWN)
    expect(result.enabled).toBe(false)
    expect(result.visible).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
    expect(result.hidden).toEqual([])
    // 预览仍有意义：用户能看到"打开后会只剩 gamma-skill"。
    expect(result.resolved[tagKey('t2')]).toEqual(['gamma-skill'])
  })

  it('启用且白名单为空时隐藏全部技能（合法的强隔离）', () => {
    const result = resolveScopeVisibility(policy(), index(), KNOWN)
    expect(result.enabled).toBe(true)
    expect(result.visible).toEqual([])
    expect(result.hidden).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
  })

  it('启用时隐藏项恰为全集减去白名单', () => {
    const result = resolveScopeVisibility(policy({ groups: [tagKey('t1')] }), index(), KNOWN)
    expect(result.visible).toEqual(['alpha-skill', 'beta-skill'])
    expect(result.hidden).toEqual(['gamma-skill'])
  })

  it('悬空键在启用语义下依然被透出，供面板标注', () => {
    const result = resolveScopeVisibility(policy({ groups: [tagKey('deleted')] }), index(), KNOWN)
    expect(result.dangling).toEqual([tagKey('deleted')])
    expect(result.hidden).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
  })
})

describe('scopeCacheKey', () => {
  it('对同一策略与目录稳定，与数组顺序无关', () => {
    const a = scopeCacheKey(policy({ groups: [tagKey('t2'), tagKey('t1')] }), KNOWN)
    const b = scopeCacheKey(policy({ groups: [tagKey('t1'), tagKey('t2')] }), KNOWN)
    expect(a).toBe(b)
  })

  it('策略内容变化时改变', () => {
    const a = scopeCacheKey(policy({ groups: [tagKey('t1')] }), KNOWN)
    expect(scopeCacheKey(policy({ groups: [tagKey('t2')] }), KNOWN)).not.toBe(a)
    expect(scopeCacheKey(policy({ groups: [tagKey('t1')], enabled: false }), KNOWN)).not.toBe(a)
  })

  it('目录变化时改变', () => {
    const a = scopeCacheKey(policy({ groups: [tagKey('t1')] }), KNOWN)
    expect(scopeCacheKey(policy({ groups: [tagKey('t1')] }), [...KNOWN, 'delta-skill'])).not.toBe(a)
  })
})

describe('overridePolicyEntries', () => {
  it('两边都没配置时等价于不限制', () => {
    const effective = overridePolicyEntries(undefined, undefined)
    expect(effective).toEqual({ enabled: false, groups: [], skills: [] })
    expect(resolveScopeVisibility(effective, index(), KNOWN)).toMatchObject({ enabled: false, hidden: [] })
  })

  it('工作区启用时完全接管：模式勾的键一个都不补', () => {
    const effective = overridePolicyEntries(
      policy({ groups: [tagKey('t1')] }),
      policy({ presetId: 'w1', groups: [collectionKey('acme/skills')] }),
    )
    expect(effective.enabled).toBe(true)
    expect(effective.groups).toEqual([collectionKey('acme/skills')])
    const visibility = resolveScopeVisibility(effective, index(), KNOWN)
    expect(visibility.visible).toEqual(['alpha-skill'])
    expect(visibility.hidden).toEqual(['beta-skill', 'gamma-skill'])
  })

  it('工作区没启用隔离时回落到模式策略', () => {
    const mode = policy({ groups: [tagKey('t2')] })
    const off = policy({ presetId: 'w1', enabled: false, groups: [collectionKey('acme/skills')] })
    expect(overridePolicyEntries(mode, off).groups).toEqual([tagKey('t2')])
    expect(resolveScopeVisibility(overridePolicyEntries(mode, off), index(), KNOWN).visible).toEqual(['gamma-skill'])
    // 该工作区压根没有策略记录时同样回落。
    expect(overridePolicyEntries(mode, undefined).groups).toEqual([tagKey('t2')])
  })

  it('工作区启用但白名单为空 = 全部隐藏，不回落', () => {
    const effective = overridePolicyEntries(policy({ groups: [tagKey('t1')] }), policy({ presetId: 'w1' }))
    expect(resolveScopeVisibility(effective, index(), KNOWN).hidden).toEqual(['alpha-skill', 'beta-skill', 'gamma-skill'])
  })

  it('返回的是副本，不是传入的那份策略', () => {
    const mode = policy({ groups: [tagKey('t1')] })
    const effective = overridePolicyEntries(mode, undefined)
    expect(effective.groups).toEqual([tagKey('t1')])
    expect(effective.groups).not.toBe(mode.groups)
  })
})
