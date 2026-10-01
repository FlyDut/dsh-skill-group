/**
 * 执行层 · 工作区名单投影：形状不符一律降级为 undefined（面板据此只读），
 * 形状正确时也只做投影——会话数只计数，不推断、不写回。
 */

import { describe, expect, it } from 'vitest'
import { readWorkspaceRoster, resolveWorkspaceId } from './workspace-roster.ts'

describe('readWorkspaceRoster', () => {
  it('投影 id/目录/标题/会话数，并接受同步 list', async () => {
    const entries = await readWorkspaceRoster({
      list: () => [
        { id: 'w1', path: '/w/alpha', title: 'Alpha', sessionIds: ['s1', 's2'] },
        { id: 'w2', path: '/w/beta', sessionIds: [] },
      ],
    })
    expect(entries).toEqual([
      { id: 'w1', path: '/w/alpha', title: 'Alpha', sessionCount: 2 },
      { id: 'w2', path: '/w/beta', sessionCount: 0 },
    ])
  })

  it('没有 list 的服务降级为 undefined', async () => {
    expect(await readWorkspaceRoster(undefined)).toBeUndefined()
    expect(await readWorkspaceRoster(null)).toBeUndefined()
    expect(await readWorkspaceRoster({})).toBeUndefined()
    expect(await readWorkspaceRoster({ list: 'nope' })).toBeUndefined()
  })

  it('list 抛错或返回非数组时降级为 undefined', async () => {
    expect(await readWorkspaceRoster({ list: () => { throw new Error('boom') } })).toBeUndefined()
    expect(await readWorkspaceRoster({ list: async () => undefined })).toBeUndefined()
  })

  it('丢掉坏行、按 id 去重，并保留注册表顺序', async () => {
    const entries = await readWorkspaceRoster({
      list: async () => [
        { id: 'w1', path: '/w/alpha' },
        { id: 'w1', path: '/w/dup' },
        { id: '', path: '/w/empty-id' },
        { id: 'w2', path: '' },
        null,
        'nope',
        { id: 'w3', path: '/w/gamma', title: '' },
      ],
    })
    expect(entries).toEqual([
      { id: 'w1', path: '/w/alpha', sessionCount: 0 },
      { id: 'w3', path: '/w/gamma', sessionCount: 0 },
    ])
  })
})

describe('resolveWorkspaceId', () => {
  const entries = [
    { id: 'w1', path: '/w/alpha', sessionCount: 0 },
    { id: 'w2', path: '/w/beta', sessionCount: 2 },
  ]

  it('精确相等才命中：子目录不算属于该工作区', async () => {
    expect(await resolveWorkspaceId(entries, '/w/alpha')).toBe('w1')
    // 子目录不算（dsh 的归属判定就是精确匹配）。
    expect(await resolveWorkspaceId(entries, '/w/alpha/sub')).toBeUndefined()
    // 没有 cwd：不猜。
    expect(await resolveWorkspaceId(entries, undefined)).toBeUndefined()
    expect(await resolveWorkspaceId(entries, '')).toBeUndefined()
  })

  it('没直接命中时用规范化路径兜底（软链、.. 之类）', async () => {
    const normalize = async (path: string) => (path === '/link/alpha' ? '/w/alpha' : path)
    expect(await resolveWorkspaceId(entries, '/link/alpha', normalize)).toBe('w1')
    // 规范化后仍不命中：还是没有工作区。
    expect(await resolveWorkspaceId(entries, '/w/gamma', normalize)).toBeUndefined()
  })

  it('规范化抛错（目录已不存在）时按"没有工作区"处理', async () => {
    let calls = 0
    const normalize = async () => { calls += 1; throw new Error('ENOENT') }
    expect(await resolveWorkspaceId(entries, '/w/gone', normalize)).toBeUndefined()
    expect(calls).toBe(1)
    // 精确命中时根本不需要规范化。
    expect(await resolveWorkspaceId(entries, '/w/alpha', normalize)).toBe('w1')
    expect(calls).toBe(1)
  })
})
