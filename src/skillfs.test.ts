import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSkill, deleteSkillFiles, parseFrontmatter, rootOfPath, scanDiagnostics } from './skillfs.ts'

describe('parseFrontmatter', () => {
  it('parses a healthy frontmatter', () => {
    const text = '---\nname: demo-skill\ndescription: Does demo things\n---\n\n# Body'
    expect(parseFrontmatter(text)).toEqual({
      value: {
        name: 'demo-skill',
        description: 'Does demo things',
        invocation: { modelInvocable: true, userInvocable: true },
        content: '# Body',
      },
    })
  })

  it('parses whenToUse and invocation overrides', () => {
    const text = [
      '---',
      'name: guarded-skill',
      'description: Guarded',
      'whenToUse: Only for guard checks',
      'disable-model-invocation: true',
      'user-invocable: false',
      '---',
      '',
      'Body text',
    ].join('\n')
    const parsed = parseFrontmatter(text)
    expect(parsed).toEqual({
      value: {
        name: 'guarded-skill',
        description: 'Guarded',
        whenToUse: 'Only for guard checks',
        invocation: { modelInvocable: false, userInvocable: false },
        content: 'Body text',
      },
    })
  })

  it('parses folded YAML descriptions', () => {
    const text = [
      '---',
      'name: folded-skill',
      'description: |',
      '  Line one.',
      '  Line two.',
      '---',
      '',
      'Body',
    ].join('\n')
    const parsed = parseFrontmatter(text)
    expect(parsed).toMatchObject({
      value: { name: 'folded-skill', description: 'Line one.\nLine two.' },
    })
  })

  it('rejects legacy invocation keys', () => {
    expect(parseFrontmatter('---\nname: x-skill\ndescription: x\ndisableModelInvocation: true\n---')).toEqual({
      error: 'frontmatter field "disableModelInvocation" is unsupported; use "disable-model-invocation"',
    })
  })

  it('rejects non-boolean invocation values', () => {
    expect(parseFrontmatter('---\nname: x-skill\ndescription: x\ndisable-model-invocation: maybe\n---')).toEqual({
      error: 'frontmatter field "disable-model-invocation" must be a boolean',
    })
  })

  it('rejects a missing block', () => {
    expect(parseFrontmatter('# no frontmatter')).toEqual({ error: 'missing YAML frontmatter (--- block)' })
  })

  it('rejects a missing name', () => {
    expect(parseFrontmatter('---\ndescription: x\n---')).toEqual({ error: 'frontmatter requires a name field' })
  })

  it('rejects a non-kebab-case name', () => {
    expect(parseFrontmatter('---\nname: Bad Name!\ndescription: x\n---')).toEqual({ error: 'invalid skill name "Bad Name!" (must be kebab-case)' })
  })

  it('rejects a missing description', () => {
    expect(parseFrontmatter('---\nname: ok-name\n---')).toEqual({ error: 'frontmatter requires a description field' })
  })

  it('ignores sets frontmatter (sets grouping was removed)', () => {
    const expected = { name: 'ok-name', description: 'x', invocation: { modelInvocable: true, userInvocable: true }, content: '' }
    expect(parseFrontmatter('---\nname: ok-name\ndescription: x\nsets: engineering\n---')).toEqual({ value: expected })
    expect(parseFrontmatter('---\nname: ok-name\ndescription: x\nsets: [engineering, " 3d ", ""]\n---')).toEqual({ value: expected })
  })
})

describe('createSkill', () => {
  let dir: string
  let home: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-fs-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('scaffolds a directory-bundle skill with frontmatter', async () => {
    const path = await createSkill('user-dsh', 'demo-skill', 'Does demo things', home)
    const text = await readFile(path, 'utf8')
    expect(text).toContain('name: demo-skill')
    expect(text).toContain('description: Does demo things')
    expect(parseFrontmatter(text)).toMatchObject({ value: { name: 'demo-skill', description: 'Does demo things' } })
  })

  it('writes a caller-provided markdown body after the frontmatter', async () => {
    const path = await createSkill('user-dsh', 'body-skill', 'Body', home, '\n## Steps\n\n1. Do it\n')
    const text = await readFile(path, 'utf8')
    expect(parseFrontmatter(text)).toMatchObject({ value: { name: 'body-skill', description: 'Body' } })
    // 正文 trim 后原样接在 frontmatter 之后，脚手架占位段不再出现。
    expect(text.endsWith('## Steps\n\n1. Do it\n')).toBe(true)
    expect(text).not.toContain('Describe what this skill does')
  })

  it('scaffolds numeric-looking names as YAML strings', async () => {
    const path = await createSkill('user-dsh', '1312', '1231', home)
    const text = await readFile(path, 'utf8')
    expect(text).toContain("name: '1312'")
    expect(text).toContain("description: '1231'")
    expect(parseFrontmatter(text)).toMatchObject({ value: { name: '1312', description: '1231' } })
  })

  it('escapes YAML-significant description text', async () => {
    const path = await createSkill('user-dsh', 'review-skill', 'Reviews: code #1', home)
    expect(parseFrontmatter(await readFile(path, 'utf8'))).toMatchObject({
      value: { name: 'review-skill', description: 'Reviews: code #1' },
    })
  })

  it('refuses to create a skill whose name is not kebab-case', async () => {
    await expect(createSkill('user-dsh', 'Not Valid', '', home)).rejects.toThrow(/kebab-case/)
  })
})

describe('deleteSkillFiles', () => {
  let dir: string
  let home: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-del-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('removes the whole bundle directory behind SKILL.md', async () => {
    const path = await createSkill('user-dsh', 'demo-skill', 'demo', home)
    await writeFile(join(dirname(path), 'extra.md'), 'sibling', 'utf8')
    expect(await deleteSkillFiles(path, home)).toBe(dirname(path))
    await expect(lstat(dirname(path))).rejects.toThrow()
  })

  it('keeps the writable-root fence at the filesystem layer', async () => {
    // 路由层先拒，但真正的写入助手不能依赖调用方已经把过关。
    const outside = join(dir, 'elsewhere', 'stray.md')
    await mkdir(dirname(outside), { recursive: true })
    await writeFile(outside, 'x', 'utf8')
    await expect(deleteSkillFiles(outside, home)).rejects.toThrow(/not a hub writable skill path/)
    await expect(lstat(outside)).resolves.toBeDefined()
  })

  it('reports an already-deleted skill instead of silently succeeding', async () => {
    await expect(deleteSkillFiles(join(home, 'skills', 'gone', 'SKILL.md'), home)).rejects.toThrow(/already gone/)
  })
})

describe('scanDiagnostics', () => {
  let dir: string
  let home: string
  let skills: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-diag-'))
    home = join(dir, 'home')
    skills = join(home, 'skills')
    await mkdir(skills, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty list for a healthy root', async () => {
    await createSkill('user-dsh', 'good-skill', 'Does good things well', home)
    expect(await scanDiagnostics('user-dsh', home)).toEqual([])
  })

  it('reports skipped files with reasons', async () => {
    await writeFile(join(skills, 'no-frontmatter.md'), '# nothing', 'utf8')
    await mkdir(join(skills, 'bad-name'))
    await writeFile(join(skills, 'bad-name', 'SKILL.md'), '---\nname: Bad Name\ndescription: x\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.reason)).toContain('missing YAML frontmatter (--- block)')
    expect(entries.map((entry) => entry.reason)).toContain('invalid skill name "Bad Name" (must be kebab-case)')
  })

  it('skips hub-disabled files', async () => {
    await writeFile(join(skills, 'paused.md.disabled'), '---\nname: paused\ndescription: x\n---', 'utf8')
    expect(await scanDiagnostics('user-dsh', home)).toEqual([])
  })

  it('returns an empty list when the root does not exist', async () => {
    expect(await scanDiagnostics('user-dsh', join(dir, 'missing'))).toEqual([])
  })

  it('flags a frontmatter name that diverges from the discovery path', async () => {
    await mkdir(join(skills, 'folder-name'))
    await writeFile(join(skills, 'folder-name', 'SKILL.md'), '---\nname: other-name\ndescription: A decent longer description\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(1)
    expect(entries[0].reason).toContain('does not match the discovery path "folder-name"')
  })

  it('flags a too-short description', async () => {
    await mkdir(join(skills, 'short-desc'))
    await writeFile(join(skills, 'short-desc', 'SKILL.md'), '---\nname: short-desc\ndescription: x\n---', 'utf8')
    const entries = await scanDiagnostics('user-dsh', home)
    expect(entries).toHaveLength(1)
    expect(entries[0].reason).toContain('description is only 1 chars')
  })
})

describe('rootOfPath', () => {
  it('recognizes the writable roots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skill-hub-root-'))
    try {
      expect(rootOfPath(join(dir, 'skills', 'a', 'SKILL.md'), dir)).toBe('user-dsh')
      expect(rootOfPath(join(dir, 'other', 'b.md'), dir)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
