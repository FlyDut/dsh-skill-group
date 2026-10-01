/**
 * 执行层单测：闸门候选的形状必须同时满足三件事——注册表的 `validateCandidate`
 * 硬校验、同层 rank 压制、以及"不可调用"的语义。
 */

import { describe, expect, it } from 'vitest'
import type { SkillCandidate } from '@deepseek-ai/dsh-skill'
import { GATE_PROVIDER_NAME, GATE_RANK, PresetGateProvider } from './preset-gate.ts'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'

function meta(patch: Partial<ScopeSkillMeta> = {}): ScopeSkillMeta {
  return { description: 'Original description.', source: 'user-dsh', provider: 'skill-hub', ...patch }
}

function gate(hidden: ReadonlyMap<string, ScopeSkillMeta>): PresetGateProvider {
  return new PresetGateProvider('coding', async () => hidden)
}

describe('PresetGateProvider', () => {
  it('对每个被隐藏的技能返回一条同名遮蔽候选', async () => {
    const candidates = await gate(new Map([
      ['alpha-skill', meta()],
      ['beta-skill', meta({ description: 'Beta.', source: 'project-dsh', whenToUse: 'When beta.' })],
    ])).list({}) as SkillCandidate[]

    expect(candidates.map((c) => c.name)).toEqual(['alpha-skill', 'beta-skill'])
    expect(candidates[1]).toMatchObject({
      description: 'Beta.',
      source: 'project-dsh',
      whenToUse: 'When beta.',
    })
  })

  it('候选形状满足注册表的硬校验（provider 必须自报其注册名）', async () => {
    const [candidate] = await gate(new Map([['alpha-skill', meta()]])).list({}) as SkillCandidate[]
    expect(candidate.provider).toBe(GATE_PROVIDER_NAME)
    expect(typeof candidate.description).toBe('string')
    expect(candidate.description.length).toBeGreaterThan(0)
    expect(typeof candidate.source).toBe('string')
    expect(typeof candidate.rank).toBe('number')
    expect(Number.isFinite(candidate.rank)).toBe(true)
  })

  it('rank 为 0，小于同层所有真实发现源', async () => {
    const [candidate] = await gate(new Map([['alpha-skill', meta()]])).list({}) as SkillCandidate[]
    // filesystem: 100/200/400/500；runtime: 250；bundled: 600。
    expect(candidate.rank).toBe(GATE_RANK)
    expect(candidate.rank).toBeLessThan(100)
  })

  it('两个 invocation 都为 false —— 模型目录与用户调用同时失效', async () => {
    const [candidate] = await gate(new Map([['alpha-skill', meta()]])).list({}) as SkillCandidate[]
    expect(candidate.invocation).toEqual({ modelInvocable: false, userInvocable: false })
  })

  it('get() 恒为 undefined，显式调用也加载不到', async () => {
    const provider = gate(new Map([['alpha-skill', meta()]]))
    const [candidate] = await provider.list({}) as SkillCandidate[]
    expect(await provider.get(candidate, {})).toBeUndefined()
  })

  it('没有隐藏项时不返回任何候选，完全不干扰既有发现', async () => {
    expect(await gate(new Map()).list({})).toEqual([])
  })

  it('描述缺失时用兜底文案，绝不给注册表一个空描述', async () => {
    const [candidate] = await gate(new Map([['alpha-skill', meta({ description: '' })]])).list({}) as SkillCandidate[]
    expect(candidate.description.length).toBeGreaterThan(0)
  })

  it('whenToUse 为空字符串时不下发该字段', async () => {
    const [candidate] = await gate(new Map([['alpha-skill', meta({ whenToUse: '' })]])).list({}) as SkillCandidate[]
    expect('whenToUse' in candidate).toBe(false)
  })

  it('遵循取消信号', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(gate(new Map([['alpha-skill', meta()]])).list({ signal: controller.signal })).rejects.toThrow()
  })

  it('每次 list 都重新读取隐藏表（策略变更无需重建 provider）', async () => {
    let hidden = new Map<string, ScopeSkillMeta>([['alpha-skill', meta()]])
    const provider = new PresetGateProvider('coding', async () => hidden)
    expect((await provider.list({}) as SkillCandidate[]).map((c) => c.name)).toEqual(['alpha-skill'])
    hidden = new Map([['beta-skill', meta()]])
    expect((await provider.list({}) as SkillCandidate[]).map((c) => c.name)).toEqual(['beta-skill'])
  })
})
