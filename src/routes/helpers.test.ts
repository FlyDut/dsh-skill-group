import { describe, expect, it } from 'vitest'
import { applyInterface, buildCollections, readString, readStrings } from './helpers.ts'

describe('readString', () => {
  it('returns the string value, or an empty string for anything else', () => {
    expect(readString({ repo: 'a/b' }, 'repo')).toBe('a/b')
    expect(readString({ repo: 42 }, 'repo')).toBe('')
    expect(readString({}, 'repo')).toBe('')
    expect(readString({ repo: null }, 'repo')).toBe('')
  })
})

describe('readStrings', () => {
  it('keeps strings, drops non-strings and empty strings by default', () => {
    expect(readStrings({ names: ['a', 1, '', 'b', null] }, 'names')).toEqual(['a', 'b'])
    expect(readStrings({ names: 'a' }, 'names')).toEqual([])
    expect(readStrings({}, 'names')).toEqual([])
  })

  it('keeps empty strings when keepEmpty is set (caller owns the semantics)', () => {
    expect(readStrings({ names: ['a', '', 2] }, 'names', { keepEmpty: true })).toEqual(['a', ''])
  })
})

describe('buildCollections', () => {
  it('groups skills by origin, sorts members, and honours the collection order', () => {
    const origins = { beta: 'z/repo', alpha: 'z/repo', gamma: 'a/repo' }
    const { collections, memberships } = buildCollections(origins, ['a/repo'])
    expect(collections).toEqual([
      { name: 'a/repo', skillNames: ['gamma'] },
      { name: 'z/repo', skillNames: ['alpha', 'beta'] },
    ])
    expect(memberships).toEqual(origins)
  })

  it('sorts unordered collections by name after the ordered ones', () => {
    const { collections } = buildCollections({ one: 'b/repo', two: 'a/repo' }, [])
    expect(collections.map((collection) => collection.name)).toEqual(['a/repo', 'b/repo'])
  })

  it('returns an empty list for no origins', () => {
    expect(buildCollections({}, ['x'])).toEqual({ collections: [], memberships: {} })
  })

  it('groups plugin-provided skills by provider, after the market collections', () => {
    const skills = [
      { name: 'zeta', provider: 'reverse-skill', source: 'bundled' },
      { name: 'alpha', provider: 'reverse-skill', source: 'bundled' },
      { name: 'mine', provider: 'skill-hub', source: 'user-dsh' },
      { name: 'tracked', provider: 'filesystem', source: 'bundled' },
      { name: 'orphan', provider: '', source: 'bundled' },
      { name: 'plain', provider: 'filesystem', source: 'bundled' },
    ]
    const { collections, memberships } = buildCollections({ tracked: 'a/repo' }, ['a/repo'], skills)
    expect(collections).toEqual([
      { name: 'a/repo', skillNames: ['tracked'] },
      { name: 'reverse-skill', skillNames: ['alpha', 'zeta'], kind: 'provider' },
    ])
    expect(memberships).toEqual({ tracked: 'a/repo', alpha: 'reverse-skill', zeta: 'reverse-skill' })
  })

  it('lets a market collection of the same name win over the provider group', () => {
    const skills = [
      { name: 'from-plugin', provider: 'reverse-skill', source: 'bundled' },
      { name: 'from-market', provider: 'reverse-skill', source: 'bundled' },
    ]
    const { collections } = buildCollections({ 'from-market': 'reverse-skill' }, ['reverse-skill'], skills)
    // 同名只留市场组（同成员），插件组让位，避免两个组共用一个 col: 键。
    expect(collections).toEqual([{ name: 'reverse-skill', skillNames: ['from-market'] }])
  })
})

describe('applyInterface', () => {
  it('copies every defined interface field onto the row and leaves the rest alone', () => {
    const row: { displayName?: string; iconSmall?: string } = { displayName: 'old' }
    applyInterface(row, { displayName: 'New Name', iconSmall: 'assets/i.png' })
    expect(row).toEqual({ displayName: 'New Name', iconSmall: 'assets/i.png' })
  })

  it('ignores undefined fields (never clears an existing value)', () => {
    const row: { displayName?: string; shortDescription?: string } = { displayName: 'keep' }
    applyInterface(row, { shortDescription: 'desc' })
    expect(row).toEqual({ displayName: 'keep', shortDescription: 'desc' })
  })
})
