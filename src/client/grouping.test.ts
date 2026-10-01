import { describe, expect, it } from 'vitest'
import type { CatalogSkill, CollectionGroup, DisabledSkill, SkillTag } from '../protocol.ts'
import { conflictsOnClose, filterBySource, filterDisabled, formatRelativeTime, groupNamesOf, groupSwitchView, mergeGroupRows, PRIVATE_SOURCE, sortSkills, visibleCollections } from './grouping.ts'

function skill(name: string, writable = true): CatalogSkill {
  return {
    name,
    description: '',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'filesystem',
    source: 'user-dsh',
    writable,
  }
}

describe('groupSwitchView', () => {
  it('is on when every member is enabled, off when none, mixed otherwise', () => {
    const enabled = new Set(['a', 'b', 'c'])
    expect(groupSwitchView(['a', 'b', 'c'], enabled).state).toBe('on')
    expect(groupSwitchView(['a'], new Set()).state).toBe('off')
    expect(groupSwitchView(['a', 'b'], new Set(['a'])).state).toBe('mixed')
  })

  it('lists the enabled and disabled sides', () => {
    const view = groupSwitchView(['a', 'b', 'c'], new Set(['a', 'c']))
    expect(view.enabled).toEqual(['a', 'c'])
    expect(view.disabled).toEqual(['b'])
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

  it('never buckets project skills as private (they belong to the project tree)', () => {
    const origins = {}
    const proj = skill('proj')
    proj.source = 'project-dsh'
    const projAgents = skill('proj-agents')
    projAgents.source = 'project-agents'
    const skills = [skill('personal'), proj, projAgents]
    expect(filterBySource(skills, PRIVATE_SOURCE, origins).map((s) => s.name)).toEqual(['personal'])
    expect(filterBySource(skills, 'all', origins)).toHaveLength(3)
  })
})

describe('visibleCollections', () => {
  const collections: CollectionGroup[] = [
    { name: 'repo/x', skillNames: ['enabled-one', 'disabled-one'] },
    { name: 'repo/ghost', skillNames: ['gone'] },
  ]
  const disabledOne: DisabledSkill = { name: 'disabled-one', description: 'Paused skill', path: '/x/disabled-one/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1 }
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
    const privateRecord = { ...disabledOne, name: 'private-one' }
    const privateCollection: CollectionGroup = { name: 'repo/y', skillNames: ['private-one'] }
    expect(visibleCollections([privateCollection], [], [privateRecord], '', PRIVATE_SOURCE, {}).map((e) => e.collection.name)).toEqual(['repo/y'])
  })
})

describe('filterDisabled', () => {
  const records: DisabledSkill[] = [
    { name: 'repo-skill', description: 'From a repo', path: '/x/repo-skill/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1 },
    { name: 'private-skill', description: 'Paused personal', path: '/x/private-skill/SKILL.md.disabled', root: 'user-dsh', disabledAt: 2 },
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
  const disabled = (name: string, addedAt?: number): DisabledSkill => ({
    name,
    description: 'Paused skill',
    path: '/x/' + name + '/SKILL.md.disabled',
    root: 'user-dsh',
    disabledAt: 1,
    ...(addedAt !== undefined ? { addedAt } : {}),
  })
  const nameOf = (row: { kind: 'skill'; skill: CatalogSkill } | { kind: 'disabled'; record: DisabledSkill }): string =>
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
