import { describe, expect, it } from 'vitest'
import type { CatalogResponse, CatalogSkill, CollectionGroup, SkillTag } from '../protocol.ts'
import { conflictsOnClose, disabledSkills, filterBySource, filterDisabled, formatRelativeTime, groupNamesOf, groupSwitchView, mergeGroupRows, PRIVATE_SOURCE, sortSkills, visibleCollections, type GroupRow } from './grouping.ts'

function skill(name: string, writable = true, enabled = true): CatalogSkill {
  return {
    name,
    description: '',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'filesystem',
    source: 'user-dsh',
    writable,
    enabled,
  }
}

/** 运行时关闭的技能：目录里仍是一行 CatalogSkill，只是 enabled=false。 */
function switchedOff(name: string, description = 'Paused skill'): CatalogSkill {
  return { ...skill(name), description, enabled: false }
}

describe('groupSwitchView', () => {
  it('is on when every known member is enabled, off when none, mixed otherwise', () => {
    const members = ['a', 'b', 'c']
    const known = new Set(members)
    expect(groupSwitchView(members, new Set(members), known).state).toBe('on')
    expect(groupSwitchView(members, new Set(), known).state).toBe('off')
    expect(groupSwitchView(members, new Set(['a']), known).state).toBe('mixed')
  })

  it('lists the enabled and disabled sides', () => {
    const view = groupSwitchView(['a', 'b', 'c'], new Set(['a', 'c']), new Set(['a', 'b', 'c']))
    expect(view.enabled).toEqual(['a', 'c'])
    expect(view.disabled).toEqual(['b'])
    expect(view.missing).toEqual([])
  })

  it('ignores members the catalog no longer knows, so the switch cannot stick on mixed', () => {
    // 已删除/改名的成员无法被开关：若把它算作关闭，组开关会永远停在「一半」且点不动。
    const view = groupSwitchView(['a', 'b', 'gone'], new Set(['a', 'b']), new Set(['a', 'b']))
    expect(view.state).toBe('on')
    expect(view.missing).toEqual(['gone'])
    expect(groupSwitchView(['gone'], new Set(), new Set()).state).toBe('off')
    const onlyMissing = groupSwitchView(['gone'], new Set(), new Set())
    expect(onlyMissing.enabled).toEqual([])
    expect(onlyMissing.disabled).toEqual([])
    expect(onlyMissing.missing).toEqual(['gone'])
  })
})

describe('conflictsOnClose', () => {
  it('flags enabled members that live in another group', () => {
    const members = ['a', 'b', 'c']
    const enabled = new Set(['a', 'b'])
    const others = [{ members: ['c', 'a'] }, { members: ['x'] }]
    expect(conflictsOnClose(members, enabled, others)).toEqual(['a'])
  })

  it('ignores disabled members and groups without the member', () => {
    const members = ['a', 'b']
    const enabled = new Set(['b'])
    const others = [{ members: ['a'] }]
    expect(conflictsOnClose(members, enabled, others)).toEqual([])
  })
})

describe('groupNamesOf', () => {
  it('collects tag and collection names for a skill', () => {
    const tags: SkillTag[] = [{ id: '1', name: 'web', skillNames: ['a'] }]
    const collections = [{ name: 'repo/x', skillNames: ['a', 'b'] }, { name: 'repo/y', skillNames: ['b'] }]
    expect(groupNamesOf('a', tags, collections)).toEqual(['web', 'repo/x'])
    expect(groupNamesOf('b', tags, collections)).toEqual(['repo/x', 'repo/y'])
    expect(groupNamesOf('c', tags, collections)).toEqual([])
  })
})

describe('filterBySource', () => {
  it('filters by origin repo, buckets untracked skills as private, and returns all for "all"', () => {
    const origins = { a: 'repo/x', b: 'repo/y' }
    const skills = [skill('a'), skill('b'), skill('c')]
    expect(filterBySource(skills, 'repo/x', origins).map((s) => s.name)).toEqual(['a'])
    expect(filterBySource(skills, PRIVATE_SOURCE, origins).map((s) => s.name)).toEqual(['c'])
    expect(filterBySource(skills, 'all', origins)).toHaveLength(3)
  })
})

describe('visibleCollections', () => {
  const collections: CollectionGroup[] = [
    { name: 'repo/x', skillNames: ['enabled-one', 'disabled-one'] },
    { name: 'repo/ghost', skillNames: ['gone'] },
  ]
  const disabledOne: CatalogSkill = switchedOff('disabled-one')
  const origins = { 'enabled-one': 'repo/x', 'disabled-one': 'repo/x' }

  it('keeps collections with visible members and drops empty shells', () => {
    const visible = visibleCollections(collections, [skill('enabled-one')], [disabledOne], '', 'all', origins)
    expect(visible.map((entry) => entry.collection.name)).toEqual(['repo/x'])
    expect(visible[0].skills.map((s) => s.name)).toEqual(['enabled-one'])
    expect(visible[0].disabledMembers.map((d) => d.name)).toEqual(['disabled-one'])
  })

  it('drops a collection when neither side passes the search filter', () => {
    expect(visibleCollections(collections, [], [disabledOne], 'no-match', 'all', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], 'paused', 'all', origins).map((e) => e.collection.name)).toEqual(['repo/x'])
  })

  it('applies the source filter to disabled-only collections', () => {
    expect(visibleCollections(collections, [], [disabledOne], '', 'repo/other', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], '', 'private', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], '', 'repo/x', origins).map((e) => e.collection.name)).toEqual(['repo/x'])
  })

  it('treats a disabled record with no origin as private', () => {
    const privateRecord = switchedOff('private-one')
    const privateCollection: CollectionGroup = { name: 'repo/y', skillNames: ['private-one'] }
    expect(visibleCollections([privateCollection], [], [privateRecord], '', PRIVATE_SOURCE, {}).map((e) => e.collection.name)).toEqual(['repo/y'])
  })
})

describe('filterDisabled', () => {
  const records: CatalogSkill[] = [
    switchedOff('repo-skill', 'From a repo'),
    switchedOff('private-skill', 'Paused personal'),
  ]
  const origins = { 'repo-skill': 'repo/x' }

  it('matches on name and description, and passes everything when blank', () => {
    expect(filterDisabled(records, '', 'all', origins).map((r) => r.name)).toEqual(['repo-skill', 'private-skill'])
    expect(filterDisabled(records, 'repo-skill', 'all', origins).map((r) => r.name)).toEqual(['repo-skill'])
    expect(filterDisabled(records, 'paused', 'all', origins).map((r) => r.name)).toEqual(['private-skill'])
    expect(filterDisabled(records, 'zzz', 'all', origins)).toEqual([])
  })

  it('follows the origin filter and treats an untracked record as private', () => {
    expect(filterDisabled(records, '', 'repo/x', origins).map((r) => r.name)).toEqual(['repo-skill'])
    expect(filterDisabled(records, '', PRIVATE_SOURCE, origins).map((r) => r.name)).toEqual(['private-skill'])
    expect(filterDisabled(records, '', 'repo/other', origins)).toEqual([])
  })
})

describe('sortSkills', () => {
  it('sorts by name ascending', () => {
    const skills = [skill('zeta'), skill('alpha'), skill('beta')]
    expect(sortSkills(skills, 'name').map((s) => s.name)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('sorts by added time descending, unknown times last', () => {
    const skills = [
      { ...skill('old'), addedAt: 100 },
      { ...skill('new'), addedAt: 300 },
      { ...skill('unknown') },
    ]
    expect(sortSkills(skills, 'added').map((s) => s.name)).toEqual(['new', 'old', 'unknown'])
  })

  it('sorts by invocation count descending, unknown counts as zero', () => {
    const skills = [skill('few'), skill('many'), skill('none')]
    const uses: Record<string, number | undefined> = { few: 2, many: 9 }
    expect(sortSkills(skills, 'uses', (name) => uses[name]).map((s) => s.name)).toEqual(['many', 'few', 'none'])
  })

  it('does not mutate the input list', () => {
    const skills = [skill('b'), skill('a')]
    const sorted = sortSkills(skills, 'name')
    expect(sorted.map((s) => s.name)).toEqual(['a', 'b'])
    expect(skills.map((s) => s.name)).toEqual(['b', 'a'])
  })
})

describe('mergeGroupRows', () => {
  const disabled = (name: string, addedAt?: number): CatalogSkill => ({
    ...switchedOff(name),
    ...(addedAt !== undefined ? { addedAt } : {}),
  })
  const nameOf = (row: GroupRow): string =>
    row.kind === 'skill' ? row.skill.name : row.record.name

  it('sorts enabled and disabled rows together by name', () => {
    const rows = mergeGroupRows([skill('alpha'), skill('gamma')], [disabled('beta')], 'name')
    expect(rows.map(nameOf)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('keeps a disabled row in place instead of trailing under added ordering', () => {
    const rows = mergeGroupRows(
      [{ ...skill('older'), addedAt: 100 }, { ...skill('newest'), addedAt: 300 }],
      [disabled('middle', 200)],
      'added',
    )
    expect(rows.map((row) => row.kind)).toEqual(['skill', 'disabled', 'skill'])
    expect(rows.map(nameOf)).toEqual(['newest', 'middle', 'older'])
  })

  it('orders both kinds by invocation count, unknown counts last', () => {
    const counts: Record<string, number | undefined> = { hot: 5, warm: 2 }
    const rows = mergeGroupRows([skill('hot'), skill('cold')], [disabled('warm')], 'uses', (name) => counts[name])
    expect(rows.map(nameOf)).toEqual(['hot', 'warm', 'cold'])
  })

  it('carries the original objects through unchanged', () => {
    const enabled = skill('one')
    const record = disabled('two')
    expect(mergeGroupRows([enabled], [record], 'name')).toEqual([
      { kind: 'skill', skill: enabled },
      { kind: 'disabled', record },
    ])
  })
})

describe('disabledSkills', () => {
  const catalog = (skills: CatalogSkill[]): CatalogResponse => ({
    ok: true, pluginVersion: '0.0.0', complete: true, skills, diagnostics: [],
  })

  it('picks the switched-off rows out of the single catalog list', () => {
    const response = catalog([skill('on-one'), skill('off-one', true, false), skill('off-two', false, false)])
    expect(disabledSkills(response).map((s) => s.name)).toEqual(['off-one', 'off-two'])
  })

  it('is empty for a missing catalog', () => {
    expect(disabledSkills(null)).toEqual([])
  })
})

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000
  it('buckets relative times correctly', () => {
    expect(formatRelativeTime(now, now)).toEqual({ key: 'time.justNow' })
    expect(formatRelativeTime(now - 30_000, now)).toEqual({ key: 'time.justNow' })
    expect(formatRelativeTime(now - 5 * 60_000, now)).toEqual({ key: 'time.minutesAgo', value: 5 })
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toEqual({ key: 'time.hoursAgo', value: 3 })
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toEqual({ key: 'time.daysAgo', value: 2 })
    expect(formatRelativeTime(now - 14 * 86_400_000, now)).toEqual({ key: 'time.weeksAgo', value: 2 })
  })

  it('clamps future timestamps to just now', () => {
    expect(formatRelativeTime(now + 5_000, now)).toEqual({ key: 'time.justNow' })
  })
})
