import { access, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRoutes, type SkillHubRouteDeps } from './routes.ts'
import { SkillHubStore, statePath } from './store.ts'
import { SKILL_HUB_API, SKILL_HUB_API_ROOT, type CatalogResponse, type ConfigResponse, type ErrorResponse, type HubConfig, type PresetsResponse, type ScopePolicy, type ScopeSaveResponse } from './protocol.ts'

/** Minimal response double recording status/headers/body. */
class FakeResponse {
  status = 0
  headers: Record<string, string> = {}
  body = ''
  writeHead(status: number, headers?: Record<string, string>): void {
    this.status = status
    if (headers !== undefined) this.headers = headers
  }
  end(chunk?: string): void {
    this.body = chunk ?? ''
  }
  json(): unknown {
    try { return JSON.parse(this.body) } catch { return undefined }
  }
}

/** Minimal request double (loopback by default; body available for POST). */
function fakeReq(method: string, url = '/', body?: unknown, remoteAddress = '127.0.0.1'): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

/** One registry summary with sane defaults. */
function summary(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    name: 'demo-skill',
    description: 'demo',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'user-dsh',
    provider: 'filesystem',
    ...overrides,
  }
}

/** One loaded definition with sane defaults. */
function definition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    ...summary(overrides),
    content: 'body',
    ...overrides,
  }
}

/** Stub global fetch by URL pattern; callers register respond(urlSubstring, Response). */
function stubFetch(routes: Array<[pattern: string, response: Response | (() => Response)]>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) return typeof response === 'function' ? response() : response
    }
    return new Response('unexpected url: ' + url, { status: 599 })
  }))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('skill-hub routes', () => {
  let dir: string
  let home: string
  let store: SkillHubStore
  let skills: SkillHubRouteDeps['skills']
  let deps: SkillHubRouteDeps

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-routes-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
    store = new SkillHubStore(statePath(home))
    skills = {
      snapshot: async () => ({ skills: [], complete: true }),
      get: async () => undefined,
    }
    deps = { skills, store, home }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** 按路径取路由（避免数组解构的位置脆弱性）。 */
  function routeFor(path: string) {
    const route = makeRoutes(deps).find((r) => r.path === path)
    if (route === undefined) throw new Error('route not found: ' + path)
    return route
  }

  it('rejects non-loopback requests', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.catalog).handler(fakeReq('GET', SKILL_HUB_API.catalog, undefined, '10.0.0.5'), res as never)
    expect(res.status).toBe(403)
  })

  it('reports stats unavailable without a reader, or when all usage displays are off', async () => {
    // 无 reader：面板显示空统计，不触发任何扫描。
    const empty = new FakeResponse()
    await routeFor(SKILL_HUB_API.stats).handler(fakeReq('GET', SKILL_HUB_API.stats), empty as never)
    expect(empty.json()).toEqual({ ok: true, available: false, stats: [] })

    // 有 reader 但三个展示开关全关：同样不调用 reader（kill-switch，issue #7）。
    let calls = 0
    deps.stats = async () => {
      calls += 1
      return [{ name: 'tdd', count: 1 }]
    }
    deps.config = () => ({ showUseCount: false, showUseTime: false, showGroupSummary: false }) as HubConfig
    const off = new FakeResponse()
    await routeFor(SKILL_HUB_API.stats).handler(fakeReq('GET', SKILL_HUB_API.stats), off as never)
    expect(off.json()).toEqual({ ok: true, available: false, stats: [] })
    expect(calls).toBe(0)

    // 默认开任意一个即正常服务。
    deps.config = () => ({ showUseCount: true }) as HubConfig
    const on = new FakeResponse()
    await routeFor(SKILL_HUB_API.stats).handler(fakeReq('GET', SKILL_HUB_API.stats), on as never)
    expect(on.json()).toEqual({ ok: true, available: true, stats: [{ name: 'tdd', count: 1 }] })
    expect(calls).toBe(1)

    // reader 自带的来源标记会透出（无标记时不加字段）。
    deps.stats.source = 'cold'
    const sourced = new FakeResponse()
    await routeFor(SKILL_HUB_API.stats).handler(fakeReq('GET', SKILL_HUB_API.stats), sourced as never)
    expect(sourced.json()).toEqual({ ok: true, available: true, source: 'cold', stats: [{ name: 'tdd', count: 1 }] })
  })

  it('serves the catalog with writable flags and diagnostics', async () => {
    skills.snapshot = async () => ({
      skills: [summary({ source: 'user-dsh' }), summary({ name: 'bundled-x', source: 'bundled', provider: 'bundled' })],
      complete: true,
    })
    // A broken file in the writable root shows up as a diagnostic.
    await writeFile(join(home, 'skills', 'broken.md'), '# no frontmatter', 'utf8')
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.catalog).handler(fakeReq('GET', SKILL_HUB_API.catalog), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as CatalogResponse
    expect(body.ok).toBe(true)
    expect(body.skills).toHaveLength(2)
    expect(body.skills[0].writable).toBe(true)
    expect(body.skills[1].writable).toBe(false)
    expect(body.diagnostics).toHaveLength(1)
    expect(body.diagnostics[0].reason).toBe('missing YAML frontmatter (--- block)')
    // 面板标题旁的插件版本徽标数据源：随 catalog 附带当前安装版本。
    expect(body.pluginVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('flags duplicate names only across distinct source/provider identities', async () => {
    skills.snapshot = async () => ({
      skills: [
        summary({ name: 'shared-user', source: 'user-dsh', provider: 'skill-hub' }),
        summary({ name: 'two-homes', source: 'custom', provider: 'openviking' }),
        summary({ name: 'two-homes', source: 'user-dsh', provider: 'skill-hub' }),
      ],
      complete: true,
    })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.catalog).handler(fakeReq('GET', SKILL_HUB_API.catalog), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as CatalogResponse
    // 同一来源+提供者即使重复出现也只算一份；来源不同 → 标重名。
    expect(body.duplicateNames ?? []).toEqual(['two-homes'])
  })

  it('serves skill detail and 404s unknown names', async () => {
    skills.get = async (name: string) => name === 'demo-skill' ? definition({ path: '/x/demo-skill/SKILL.md' }) : undefined
    const ok = new FakeResponse()
    await routeFor(SKILL_HUB_API.skill).handler(fakeReq('GET', SKILL_HUB_API.skill + '?name=demo-skill'), ok as never)
    expect(ok.status).toBe(200)
    const missing = new FakeResponse()
    await routeFor(SKILL_HUB_API.skill).handler(fakeReq('GET', SKILL_HUB_API.skill + '?name=nope'), missing as never)
    expect(missing.status).toBe(404)
  })

  it('switches a skill off and back on through the sidecar, leaving the file alone', async () => {
    const path = join(home, 'skills', 'demo-skill', 'SKILL.md')
    await mkdir(join(home, 'skills', 'demo-skill'), { recursive: true })
    await writeFile(path, '---\nname: demo-skill\ndescription: demo\n---\n\nbody', 'utf8')
    skills.snapshot = async () => ({ skills: [summary({ name: 'demo-skill' })], complete: true })
    skills.get = async () => definition({ path })

    const off = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'demo-skill', enabled: false }), off as never)
    expect(off.status).toBe(200)
    expect(await store.listDisabled()).toHaveLength(1)
    // 关闭只写 sidecar：技能文件原地不动，插件不再改后缀也不再搬目录。
    await expect(access(path)).resolves.toBeUndefined()
    const offBody = off.json() as import('./protocol.ts').ToggleResponse
    expect(offBody.catalog.skills[0]).toMatchObject({ name: 'demo-skill', enabled: false })

    const on = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'demo-skill', enabled: true }), on as never)
    expect(on.status).toBe(200)
    expect(await store.listDisabled()).toHaveLength(0)
    await expect(access(path)).resolves.toBeUndefined()
    const onBody = on.json() as import('./protocol.ts').ToggleResponse
    expect(onBody.catalog.skills[0]).toMatchObject({ name: 'demo-skill', enabled: true })
  })

  it('404s when switching off an unknown skill and when switching on a live one', async () => {
    const off = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'ghost', enabled: false }), off as never)
    expect(off.status).toBe(404)
    expect((off.json() as ErrorResponse).error).toContain('skill not found')

    skills.get = async () => definition({})
    const on = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'demo-skill', enabled: true }), on as never)
    expect(on.status).toBe(404)
    expect((on.json() as ErrorResponse).error).toContain('skill is not switched off')
  })

  it('keeps a switched-off skill in the catalog as one row flagged enabled:false', async () => {
    skills.snapshot = async () => ({ skills: [summary({ name: 'timed-skill' })], complete: true })
    skills.get = async () => definition({ name: 'timed-skill' })
    const off = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'timed-skill', enabled: false }), off as never)
    expect(off.status).toBe(200)
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.catalog).handler(fakeReq('GET', SKILL_HUB_API.catalog), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').CatalogResponse
    // 目录里每个技能只有一行；关闭态是行上的标记，不再有第二份列表。
    const rows = body.skills.filter((skill) => skill.name === 'timed-skill')
    expect(rows).toHaveLength(1)
    expect(rows[0].enabled).toBe(false)
  })

  it('switches off a read-only source too, since only the sidecar changes', async () => {
    // 运行时关闭不动任何文件，只写中间层状态：只读来源（bundled 等）一样能被隐藏。
    skills.snapshot = async () => ({ skills: [summary({ name: 'demo-skill', source: 'bundled', provider: 'bundled' })], complete: true })
    skills.get = async () => definition({ source: 'bundled', provider: 'bundled' })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggle).handler(fakeReq('POST', SKILL_HUB_API.toggle, { name: 'demo-skill', enabled: false }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').ToggleResponse
    expect(body.catalog.skills.find((skill) => skill.name === 'demo-skill')?.enabled).toBe(false)
    expect(await store.getDisabled('demo-skill')).toBeDefined()
  })

  it('disables a whole group in one write', async () => {
    for (const name of ['batch-a', 'batch-b']) {
      const dir = join(home, 'skills', name)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SKILL.md'), '---\nname: ' + name + '\ndescription: A batch skill\n---\n\nbody', 'utf8')
    }
    skills.get = async (name: string) => definition({ name, path: join(home, 'skills', name, 'SKILL.md'), source: 'user-dsh' })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggleBatch).handler(fakeReq('POST', SKILL_HUB_API.toggleBatch, { names: ['batch-a', 'batch-b'], enabled: false }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').ToggleBatchResponse
    expect(body.ok).toBe(true)
    expect(body.failures).toEqual([])
    expect(await store.listDisabled()).toHaveLength(2)
  })

  it('re-enables a group and skips already-enabled names as no-ops', async () => {
    for (const name of ['batch-a', 'batch-b']) {
      const pth = join(home, 'skills', name, 'SKILL.md')
      await mkdir(dirname(pth), { recursive: true })
      await writeFile(pth, '---\nname: ' + name + '\ndescription: y\n---\n\nbody', 'utf8')
    }
    // batch-a 处于运行时关闭态；batch-b 一直开着（应被当成 no-op 跳过）。
    await store.addDisabled({ name: 'batch-a', disabledAt: 1 })
    skills.get = async (name: string) => definition({ name, source: 'user-dsh' })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggleBatch).handler(fakeReq('POST', SKILL_HUB_API.toggleBatch, { names: ['batch-a', 'batch-b'], enabled: true }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').ToggleBatchResponse
    expect(body.failures).toEqual([])
    expect(await store.listDisabled()).toHaveLength(0)
  })

  it('reports per-name failures for unknown skills while landing the rest', async () => {
    const dir = join(home, 'skills', 'batch-c')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: batch-c\ndescription: ok\n---', 'utf8')
    skills.get = async (name: string) => name === 'batch-c'
      ? definition({ name, path: join(dir, 'SKILL.md'), source: 'user-dsh' })
      : undefined
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.toggleBatch).handler(fakeReq('POST', SKILL_HUB_API.toggleBatch, { names: ['batch-c', 'missing-x'], enabled: false }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').ToggleBatchResponse
    expect(body.failures).toHaveLength(1)
    expect(body.failures[0].name).toBe('missing-x')
    expect(await store.listDisabled()).toHaveLength(1)
  })

  it('deletes a bundle directory from disk and drops its sidecar traces', async () => {
    const bundle = join(home, 'skills', 'demo-skill')
    await mkdir(bundle, { recursive: true })
    await writeFile(join(bundle, 'SKILL.md'), '---\nname: demo-skill\ndescription: demo\n---\n\nbody', 'utf8')
    skills.get = async (name: string) => definition({ name, path: join(bundle, 'SKILL.md') })
    // 关闭记录 + 场景成员 + 来源跟踪：三处 sidecar 痕迹都该随删除消失。
    await store.addDisabled({ name: 'demo-skill', disabledAt: 1 })
    const tag = await store.saveTag({ name: 'scene-x' })
    await store.addSkillToTag(tag.id, 'demo-skill')
    await store.addSourceSkill('owner/repo', 'skills', 'abc123', 'v1', 'demo-skill')

    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.skillDelete).handler(fakeReq('POST', SKILL_HUB_API.skillDelete, { names: ['demo-skill'] }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').SkillDeleteResponse
    expect(body.deleted).toEqual(['demo-skill'])
    expect(body.failures).toEqual([])
    // 整个技能目录（不只是 SKILL.md）都没了。
    await expect(lstat(bundle)).rejects.toThrow()
    expect(await store.getDisabled('demo-skill')).toBeUndefined()
    expect((await store.listTags()).find((entry) => entry.id === tag.id)?.skillNames).toEqual([])
    expect((await store.listOrigins())['demo-skill']).toBeUndefined()
  })

  it('deletes a flat skill file on its own', async () => {
    const file = join(home, 'skills', 'flat-skill.md')
    await writeFile(file, '---\nname: flat-skill\ndescription: flat\n---', 'utf8')
    skills.get = async (name: string) => definition({ name, path: file })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.skillDelete).handler(fakeReq('POST', SKILL_HUB_API.skillDelete, { names: ['flat-skill'] }), res as never)
    expect(res.status).toBe(200)
    expect((res.json() as import('./protocol.ts').SkillDeleteResponse).deleted).toEqual(['flat-skill'])
    await expect(lstat(file)).rejects.toThrow()
    // 父目录还在：删的是文件，不是可写根。
    await expect(lstat(join(home, 'skills'))).resolves.toBeDefined()
  })

  it('unlinks a symlinked bundle instead of deleting what it points at', async () => {
    // 市场/自己 checkout 的技能常以软链接挂进可写根：删的必须是链接本身。
    const checkout = join(dir, 'checkout', 'linked-skill')
    await mkdir(checkout, { recursive: true })
    await writeFile(join(checkout, 'SKILL.md'), '---\nname: linked-skill\ndescription: linked\n---', 'utf8')
    const link = join(home, 'skills', 'linked-skill')
    await symlink(checkout, link, 'dir')
    skills.get = async (name: string) => definition({ name, path: join(link, 'SKILL.md') })

    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.skillDelete).handler(fakeReq('POST', SKILL_HUB_API.skillDelete, { names: ['linked-skill'] }), res as never)
    expect(res.status).toBe(200)
    expect((res.json() as import('./protocol.ts').SkillDeleteResponse).deleted).toEqual(['linked-skill'])
    await expect(lstat(link)).rejects.toThrow()
    // 链接指向的目录与其内容原封不动。
    await expect(lstat(join(checkout, 'SKILL.md'))).resolves.toBeDefined()
  })

  it('refuses read-only sources and paths outside the writable roots, per name', async () => {
    const outside = join(dir, 'elsewhere', 'stray', 'SKILL.md')
    await mkdir(dirname(outside), { recursive: true })
    await writeFile(outside, '---\nname: stray\ndescription: stray\n---', 'utf8')
    skills.get = async (name: string) => name === 'bundled-x'
      ? definition({ name, source: 'bundled', provider: 'bundled', path: join(home, 'skills', 'bundled-x', 'SKILL.md') })
      : definition({ name, path: outside })

    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.skillDelete).handler(fakeReq('POST', SKILL_HUB_API.skillDelete, { names: ['bundled-x', 'stray'] }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').SkillDeleteResponse
    expect(body.deleted).toEqual([])
    expect(body.failures.map((failure) => failure.name)).toEqual(['bundled-x', 'stray'])
    expect(body.failures[0].error).toContain('not user-level')
    expect(body.failures[1].error).toContain('outside the hub writable roots')
    // 两份文件都还在：拒绝的路径一个字节都没动。
    await expect(lstat(outside)).resolves.toBeDefined()
  })

  it('rejects an empty name list', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.skillDelete).handler(fakeReq('POST', SKILL_HUB_API.skillDelete, { names: [] }), res as never)
    expect(res.status).toBe(400)
  })

  it('creates a skill scaffold and rejects bad names', async () => {
    const ok = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'new-skill', description: 'Fresh' }), ok as never)
    expect(ok.status).toBe(201)
    const bad = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'Not Valid' }), bad as never)
    expect(bad.status).toBe(400)
  })

  it('writes the submitted markdown body into the new SKILL.md', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(
      fakeReq('POST', SKILL_HUB_API.create, { name: 'body-skill', description: 'Body', content: '## Steps\n\n1. Do it' }),
      res as never,
    )
    expect(res.status).toBe(201)
    const created = res.json() as import('./protocol.ts').CreateResponse
    const text = await readFile(created.path, 'utf8')
    // 正文来自请求体，frontmatter 仍由后端按 name/description 生成。
    expect(text).toContain('name: body-skill')
    expect(text).toContain('description: Body')
    expect(text).toContain('## Steps')
    expect(text).toContain('1. Do it')
  })

  it('falls back to the scaffold placeholder when no body is submitted', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'plain-skill' }), res as never)
    expect(res.status).toBe(201)
    const created = res.json() as import('./protocol.ts').CreateResponse
    const text = await readFile(created.path, 'utf8')
    expect(text).toContain('# plain-skill')
    expect(text).toContain('Describe what this skill does')
  })

  it('refuses to create a duplicate name', async () => {
    skills.get = async () => definition({})
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'demo-skill' }), res as never)
    expect(res.status).toBe(409)
  })

  it('lets a stale switched-off record be re-created and clears it', async () => {
    // 同名技能曾被关闭、随后被用户手工删掉：残留记录不该挡住建回，也不该让新技能一出生就是关闭态。
    await store.addDisabled({ name: 'demo-skill', disabledAt: Date.now() })
    skills.get = async () => undefined
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'demo-skill' }), res as never)
    expect(res.status).toBe(201)
    expect(await store.getDisabled('demo-skill')).toBeUndefined()
  })

  it('serves the hub config with saved overrides', async () => {
    const routes = makeRoutes({
      ...deps,
      config: () => ({ enabled: false, announceToAgent: true }),
      saved: () => ({ enabled: false }),
    })
    const res = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('GET', SKILL_HUB_API.config), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as ConfigResponse
    expect(body.ok).toBe(true)
    expect(body.pluginVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(body.config).toEqual({ enabled: false, announceToAgent: true, showUseCount: true, showUseTime: true, showGroupSummary: true, statsWindowDays: 14, statsScanMinutes: 5 })
    expect(body.saved).toEqual({ enabled: false })
  })

  it('never echoes the github token back from the config route', async () => {
    const token = 'ghp_secretsecret123abc'
    // GET with a token in effect: the flag says yes, no payload field carries it.
    const getRoutes = makeRoutes({
      ...deps,
      config: () => ({ enabled: true, announceToAgent: true, githubToken: token }),
      saved: () => ({ githubToken: token }),
    })
    const get = new FakeResponse()
    await getRoutes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('GET', SKILL_HUB_API.config), get as never)
    expect(get.status).toBe(200)
    const body = get.json() as ConfigResponse
    expect(body.githubTokenSet).toBe(true)
    expect(body.config).not.toHaveProperty('githubToken')
    expect(body.saved).not.toHaveProperty('githubToken')
    expect(get.body).not.toContain(token)

    // POST, local merge path (no owner updateConfig).
    const merged = new FakeResponse()
    await getRoutes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { enabled: true }), merged as never)
    expect(merged.status).toBe(200)
    expect((merged.json() as ConfigResponse).config).not.toHaveProperty('githubToken')
    expect(merged.body).not.toContain(token)

    // POST, owner updateConfig path.
    const updateConfig = async (): Promise<HubConfig> => ({ enabled: true, announceToAgent: true, showUseCount: true, showUseTime: true, showGroupSummary: true, githubToken: token })
    const postRoutes = makeRoutes({ ...deps, updateConfig })
    const posted = new FakeResponse()
    await postRoutes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { enabled: true }), posted as never)
    expect(posted.status).toBe(200)
    const postBody = posted.json() as ConfigResponse
    expect(postBody.githubTokenSet).toBe(true)
    expect(postBody.config).not.toHaveProperty('githubToken')
    expect(posted.body).not.toContain(token)
  })

  it('reports githubTokenSet false when no token is configured', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.config).handler(fakeReq('GET', SKILL_HUB_API.config), res as never)
    const body = res.json() as ConfigResponse
    expect(body.githubTokenSet).toBe(false)
  })

  it('patches the hub config through the owner updateConfig', async () => {
    const patches: Array<Partial<HubConfig>> = []
    const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
      patches.push(patch)
      return { enabled: false, announceToAgent: false, showUseCount: true, showUseTime: true, showGroupSummary: true }
    }
    const routes = makeRoutes({
      ...deps,
      config: () => ({ enabled: true, announceToAgent: true }),
      saved: () => ({ enabled: false, announceToAgent: false }),
      updateConfig,
    })
    const res = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { announceToAgent: false }), res as never)
    expect(res.status).toBe(200)
    expect(patches).toEqual([{ announceToAgent: false }])
    const body = res.json() as ConfigResponse
    expect(body.config).toEqual({ enabled: false, announceToAgent: false, showUseCount: true, showUseTime: true, showGroupSummary: true })
  })

  it('clears a saved override with null on the config route', async () => {
    const patches: Array<Partial<HubConfig>> = []
    const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
      patches.push(patch)
      return { enabled: true, announceToAgent: true, showUseCount: true, showUseTime: true, showGroupSummary: true }
    }
    const routes = makeRoutes({
      ...deps,
      config: () => ({ enabled: false, announceToAgent: true }),
      saved: () => ({ enabled: false }),
      updateConfig,
    })
    const res = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { enabled: null }), res as never)
    expect(res.status).toBe(200)
    expect(patches).toEqual([{ enabled: undefined }])
  })

  it('rejects non-boolean config patches', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.config).handler(fakeReq('POST', SKILL_HUB_API.config, { enabled: 'yes' }), res as never)
    expect(res.status).toBe(400)
    const body = res.json() as ErrorResponse
    expect(body.error).toContain('enabled must be a boolean or null')
  })

  it('sets and clears the github token through the config route', async () => {
    const patches: Array<Partial<HubConfig>> = []
    const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
      patches.push(patch)
      return { enabled: true, announceToAgent: true, showUseCount: true, showUseTime: true, showGroupSummary: true, statsWindowDays: 14, statsScanMinutes: 5 }
    }
    const routes = makeRoutes({ ...deps, updateConfig })
    const set = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { githubToken: 'ghp_1234567890abcdef' }), set as never)
    expect(set.status).toBe(200)
    expect(patches).toEqual([{ githubToken: 'ghp_1234567890abcdef' }])
    const clear = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { githubToken: null }), clear as never)
    expect(clear.status).toBe(200)
    expect(patches[1]).toEqual({ githubToken: undefined })
    const bad = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('POST', SKILL_HUB_API.config, { githubToken: 'not a token!' }), bad as never)
    expect(bad.status).toBe(400)
  })

  it('keeps the config route up while the hub is disabled (business routes 503)', async () => {
    const routes = makeRoutes({
      ...deps,
      config: () => ({ enabled: false, announceToAgent: true }),
      saved: () => ({ enabled: false }),
    })
    const business = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.catalog)?.handler(fakeReq('GET', SKILL_HUB_API.catalog), business as never)
    expect(business.status).toBe(503)
    const cfg = new FakeResponse()
    await routes.find((r) => r.path === SKILL_HUB_API.config)?.handler(fakeReq('GET', SKILL_HUB_API.config), cfg as never)
    expect(cfg.status).toBe(200)
  })

  // ------------------------------------------------------- market sources
  it('lists, adds, and removes market sources', async () => {
    const list = new FakeResponse()
    await routeFor(SKILL_HUB_API.market).handler(fakeReq('GET', SKILL_HUB_API.market), list as never)
    expect((list.json() as import('./protocol.ts').MarketSourcesResponse).repos).toEqual([])
    const add = new FakeResponse()
    await routeFor(SKILL_HUB_API.marketSource).handler(fakeReq('POST', SKILL_HUB_API.marketSource, { repo: 'https://github.com/anthropics/skills' }), add as never)
    expect(add.status).toBe(200)
    expect((add.json() as import('./protocol.ts').MarketSourceResponse).repos).toEqual([{ repo: 'anthropics/skills' }])
    const dup = new FakeResponse()
    await routeFor(SKILL_HUB_API.marketSource).handler(fakeReq('POST', SKILL_HUB_API.marketSource, { repo: 'anthropics/skills' }), dup as never)
    expect((dup.json() as import('./protocol.ts').MarketSourceResponse).repos).toEqual([{ repo: 'anthropics/skills' }])
    const pinned = new FakeResponse()
    await routeFor(SKILL_HUB_API.marketSource).handler(fakeReq('POST', SKILL_HUB_API.marketSource, { repo: 'other/repo@v2.0.0' }), pinned as never)
    expect(pinned.status).toBe(200)
    expect((pinned.json() as import('./protocol.ts').MarketSourceResponse).repos).toEqual([
      { repo: 'anthropics/skills' },
      { repo: 'other/repo', ref: 'v2.0.0' },
    ])
    const bad = new FakeResponse()
    await routeFor(SKILL_HUB_API.marketSource).handler(fakeReq('POST', SKILL_HUB_API.marketSource, { repo: 'not a repo' }), bad as never)
    expect(bad.status).toBe(400)
    const del = new FakeResponse()
    await routeFor(SKILL_HUB_API.marketSourceDelete).handler(fakeReq('POST', SKILL_HUB_API.marketSourceDelete, { repo: 'anthropics/skills' }), del as never)
    expect((del.json() as import('./protocol.ts').MarketSourceResponse).repos).toEqual([{ repo: 'other/repo', ref: 'v2.0.0' }])
  })

  // ------------------------------------------------------- repo import (B方案 job+轮询)
  it('imports repo skills and records the upstream source', async () => {
    const skillMd = '---\nname: code-review\ndescription: Reviews code\n---\n\nbody'
    stubFetch([
      // 更具体的 URL 在前（stubFetch 按顺序匹配）。
      ['repos/example/repo/git/trees/main', jsonResponse({ tree: [
        { path: 'skills/code-review/SKILL.md', type: 'blob', size: 60 },
        { path: 'skills/code-review/helper.py', type: 'blob', size: 20 },
      ] })],
      ['repos/example/repo/commits', jsonResponse({ sha: 'abc123', commit: { tree: { sha: 'tree1' } } })],
      ['repos/example/repo', jsonResponse({ default_branch: 'main' })],
      ['raw.githubusercontent.com/example/repo/main/skills/code-review/SKILL.md', new Response(skillMd, { status: 200 })],
      ['raw.githubusercontent.com/example/repo/main/skills/code-review/helper.py', new Response('x = 1', { status: 200 })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.repoImport).handler(fakeReq('POST', SKILL_HUB_API.repoImport, { repo: 'example/repo', paths: ['skills/code-review/SKILL.md'] }), res as never)
      expect(res.status).toBe(200)
      const created = res.json() as import('./protocol.ts').RepoImportResponse
      expect(created.jobId).toMatch(/^imp_/)
      expect(created.total).toBe(1)
      // 轮询直到完成（后台任务选项2：关面板也继续跑，轮询查进度）
      let prog: import('./protocol.ts').RepoImportProgressResponse | undefined
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50))
        const progRes = new FakeResponse()
        await routeFor(SKILL_HUB_API.repoImportProgress).handler(fakeReq('GET', `${SKILL_HUB_API.repoImportProgress}?jobId=${created.jobId}`), progRes as never)
        expect(progRes.status).toBe(200)
        prog = progRes.json() as import('./protocol.ts').RepoImportProgressResponse
        if (prog.status !== 'running') break
      }
      expect(prog).toBeDefined()
      expect(prog!.status).toBe('done')
      expect(prog!.imported).toHaveLength(1)
      expect(prog!.imported[0]).toMatchObject({ name: 'code-review', origin: 'example/repo' })
      await expect(access(join(home, 'skills', 'code-review', 'SKILL.md'))).resolves.toBeUndefined()
      const sources = await store.listSources()
      expect(sources).toHaveLength(1)
      expect(sources[0]).toMatchObject({ repo: 'example/repo', root: 'skills', commitSha: 'abc123', skills: ['code-review'] })
      expect(sources[0].manifest).toEqual({
        'skills/code-review/SKILL.md': 60,
        'skills/code-review/helper.py': 20,
      })
      // 导入的技能自动归入默认场景「通用」，场景 tab 里可见。
      expect((await store.getDefaultTag())?.skillNames).toEqual(['code-review'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // -------------------------------------------------------------- groups
  it('serves groups: user tags + system collections + origins', async () => {
    const tag = await store.saveTag({ name: 'web' })
    await store.setTagMembers(tag.id, ['demo-skill'])
    await store.addSourceSkill('superpowers', 'skills', '', undefined, 'demo-skill')
    await store.addSourceSkill('anthropics/skills', 'skills', '', undefined, 'pdf')
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.groups).handler(fakeReq('GET', SKILL_HUB_API.groups), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').GroupsResponse
    expect(body.tags.filter((t) => t.default !== true)).toHaveLength(1)
    expect(body.tags.find((t) => t.default !== true)).toMatchObject({ name: 'web', skillNames: ['demo-skill'] })
    expect(body.collections).toEqual([
      { name: 'anthropics/skills', skillNames: ['pdf'] },
      { name: 'superpowers', skillNames: ['demo-skill'] },
    ])
    expect(body.origins).toEqual({ 'demo-skill': 'superpowers', pdf: 'anthropics/skills' })
  })

  // 插件自带的技能集合没有来源记录，按 provider 成组（kind: 'provider'），
  // 且不进「个人」卡；市场来源记录优先，本地用户技能仍留在个人卡。
  it('groups provider-provided skills that no source record claims', async () => {
    skills.snapshot = async () => ({
      skills: [
        summary({ name: 'alpha', provider: 'reverse-skill', source: 'bundled' }),
        summary({ name: 'zeta', provider: 'reverse-skill', source: 'bundled' }),
        summary({ name: 'tracked', provider: 'reverse-skill', source: 'bundled' }),
        summary({ name: 'mine' }),
      ],
      complete: true,
    })
    await store.addSourceSkill('owner/repo', 'skills', 'sha', undefined, 'tracked')
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.groups).handler(fakeReq('GET', SKILL_HUB_API.groups), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').GroupsResponse
    expect(body.collections).toEqual([
      { name: 'owner/repo', skillNames: ['tracked'] },
      { name: 'reverse-skill', skillNames: ['alpha', 'zeta'], kind: 'provider' },
    ])
    expect(body.origins).toEqual({ tracked: 'owner/repo', alpha: 'reverse-skill', zeta: 'reverse-skill' })
  })

  // ---------------------------------------------------------- tag
  it('creates and renames a tag', async () => {
    const created = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { name: 'web' }), created as never)
    expect(created.status).toBe(200)
    const createdBody = created.json() as import('./protocol.ts').TagSaveResponse
    // 响应里含默认场景「通用」，新建的排在它后面。
    const createdTag = createdBody.tags.find((t) => t.default !== true)
    expect(createdTag).toMatchObject({ name: 'web' })
    const id = createdTag!.id
    const renamed = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { id, name: 'frontend' }), renamed as never)
    expect(renamed.status).toBe(200)
    const renamedBody = renamed.json() as import('./protocol.ts').TagSaveResponse
    expect(renamedBody.tags.find((t) => t.id === id)).toMatchObject({ id, name: 'frontend' })
    const empty = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { name: '  ' }), empty as never)
    expect(empty.status).toBe(400)
  })

  it('reports a 404 when renaming a tag that does not exist', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { id: 'no-such-id', name: 'x' }), res as never)
    expect(res.status).toBe(404)
  })

  it('deletes a tag', async () => {
    const created = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { name: 'tmp' }), created as never)
    const createdBody = created.json() as import('./protocol.ts').TagSaveResponse
    const id = createdBody.tags.find((t) => t.default !== true)!.id
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.tagDelete).handler(fakeReq('POST', SKILL_HUB_API.tagDelete, { id }), res as never)
    expect(res.status).toBe(200)
    // 默认场景「通用」不可删，删普通 tag 后只剩它。
    const after = (res.json() as import('./protocol.ts').TagDeleteResponse).tags
    expect(after.filter((t) => t.default !== true)).toEqual([])
    expect(after.some((t) => t.default === true)).toBe(true)
  })

  it('sets tag members and drops names absent from the catalog', async () => {
    skills.snapshot = async () => ({ skills: [summary()], complete: true })
    const created = new FakeResponse()
    await routeFor(SKILL_HUB_API.tag).handler(fakeReq('POST', SKILL_HUB_API.tag, { name: 'web' }), created as never)
    const createdBody = created.json() as import('./protocol.ts').TagSaveResponse
    const id = createdBody.tags.find((t) => t.default !== true)!.id
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.tagMembers).handler(fakeReq('POST', SKILL_HUB_API.tagMembers, { id, skillNames: ['demo-skill', 'ghost-skill'] }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').TagMembersResponse
    expect(body.tags.find((t) => t.id === id)?.skillNames).toEqual(['demo-skill'])
  })

  // ------------------------------------------------------------- sources
  it('serves sources with derived origins and collections', async () => {
    await store.addSourceSkill('repo/a', 'skills', 'sha', undefined, 'one')
    await store.addSourceSkill('repo/a', 'skills', 'sha', undefined, 'two')
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.sources).handler(fakeReq('GET', SKILL_HUB_API.sources), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').SourcesResponse
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].skills).toEqual(['one', 'two'])
    expect(body.origins).toEqual({ one: 'repo/a', two: 'repo/a' })
    expect(body.collections).toEqual([{ name: 'repo/a', skillNames: ['one', 'two'] }])
  })

  it('checks a source: unchanged commit reports no update; changed commit diffs the tree', async () => {
    await store.addSourceSkill('repo/check-a', 'skills', 'same-sha', undefined, 'alpha')
    stubFetch([
      ['repos/repo/check-a/commits', jsonResponse({ sha: 'same-sha', commit: { tree: { sha: 't' } } })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.sourceCheck).handler(fakeReq('POST', SKILL_HUB_API.sourceCheck, {}), res as never)
      expect(res.status).toBe(200)
      const body = res.json() as import('./protocol.ts').SourceCheckResponse
      expect(body.results).toHaveLength(1)
      expect(body.results[0]).toMatchObject({ repo: 'repo/check-a', changed: false, updated: [], deleted: [] })
    } finally {
      vi.unstubAllGlobals()
    }

    // A changed commit pulls the tree: alpha updated (manifest baseline), beta deleted.
    await store.addSourceSkill('repo/check-b', 'skills', 'old-sha', undefined, 'alpha')
    await store.addSourceSkill('repo/check-b', 'skills', 'old-sha', undefined, 'beta')
    await store.mergeSourceManifest('repo/check-b', { 'skills/alpha/SKILL.md': 10 })
    stubFetch([
      ['repos/repo/check-b/commits', jsonResponse({ sha: 'new-sha', commit: { tree: { sha: 'treeX' } } })],
      ['repos/repo/check-b/git/trees/treeX', jsonResponse({ tree: [
        { path: 'skills/alpha/SKILL.md', type: 'blob', size: 99 },
        { path: 'skills/alpha/tools.py', type: 'blob', size: 5 },
      ] })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.sourceCheck).handler(fakeReq('POST', SKILL_HUB_API.sourceCheck, { repo: 'repo/check-b' }), res as never)
      expect(res.status).toBe(200)
      const body = res.json() as import('./protocol.ts').SourceCheckResponse
      expect(body.results[0]).toMatchObject({ repo: 'repo/check-b', changed: true, commitSha: 'new-sha', updated: ['alpha'], deleted: ['beta'] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a per-source check error without failing the batch', async () => {
    await store.addSourceSkill('repo/error-x', 'skills', 'old', undefined, 'one')
    stubFetch([
      ['repos/repo/error-x/commits', new Response('nope', { status: 404 })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.sourceCheck).handler(fakeReq('POST', SKILL_HUB_API.sourceCheck, {}), res as never)
      expect(res.status).toBe(200)
      const body = res.json() as import('./protocol.ts').SourceCheckResponse
      expect(body.results[0].error).toContain('404')
      expect(body.results[0].changed).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('syncs a source to the latest commit, updating the manifest and leaving the runtime switch alone', async () => {
    await store.addSourceSkill('repo/sync-a', 'skills', 'old-sha', undefined, 'docx')
    await store.addSourceSkill('repo/sync-a', 'skills', 'old-sha', undefined, 'pdf')
    await store.mergeSourceManifest('repo/sync-a', { 'skills/docx/SKILL.md': 10, 'skills/pdf/SKILL.md': 10 })
    const dir = join(home, 'skills', 'docx')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: docx\ndescription: old\n---', 'utf8')
    // docx 处于运行时关闭态：同步照常覆盖文件，关闭状态是 sidecar 的事，不受影响。
    await store.addDisabled({ name: 'docx', disabledAt: 1 })

    stubFetch([
      ['repos/repo/sync-a/commits', jsonResponse({ sha: 'new-sha', commit: { tree: { sha: 'treeY' } } })],
      ['repos/repo/sync-a/git/trees/treeY', jsonResponse({ tree: [
        { path: 'skills/docx/SKILL.md', type: 'blob', size: 80 },
        { path: 'skills/pdf/SKILL.md', type: 'blob', size: 70 },
      ] })],
      ['raw.githubusercontent.com/repo/sync-a/new-sha/skills/docx/SKILL.md', new Response('---\nname: docx\ndescription: fresh\n---\n\nnew body', { status: 200 })],
      ['raw.githubusercontent.com/repo/sync-a/new-sha/skills/pdf/SKILL.md', new Response('---\nname: pdf\ndescription: fresh pdf\n---\n\nbody', { status: 200 })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.sourceSync).handler(fakeReq('POST', SKILL_HUB_API.sourceSync, { repo: 'repo/sync-a' }), res as never)
      expect(res.status).toBe(200)
      const body = res.json() as import('./protocol.ts').SourceSyncResponse
      expect(body.synced).toEqual(['docx', 'pdf'])
      expect(body.failed).toEqual([])
      expect(body.commitSha).toBe('new-sha')
      // 上游内容落到原地：既不改名也不进回收站。
      const text = await readFile(join(home, 'skills', 'docx', 'SKILL.md'), 'utf8')
      expect(text).toContain('description: fresh')
      await expect(access(join(home, 'skills', 'docx', 'SKILL.md.disabled'))).rejects.toThrow()
      await expect(access(join(home, 'skills', 'pdf', 'SKILL.md'))).resolves.toBeUndefined()
      // 关闭记录原地保留：同步不会替用户把技能打开。
      expect(await store.getDisabled('docx')).toBeDefined()
      const source = await store.getSource('repo/sync-a')
      expect(source?.commitSha).toBe('new-sha')
      expect(source?.manifest).toEqual({ 'skills/docx/SKILL.md': 80, 'skills/pdf/SKILL.md': 70 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports an upstream deletion without touching the local copy', async () => {
    const dir = join(home, 'skills', 'gone-skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), '---\nname: gone-skill\ndescription: x\n---', 'utf8')
    await store.addSourceSkill('repo/delete-a', 'skills', 'sha', undefined, 'gone-skill')
    await store.mergeSourceManifest('repo/delete-a', { 'skills/gone-skill/SKILL.md': 10 })
    stubFetch([
      ['repos/repo/delete-a/commits', jsonResponse({ sha: 'new', commit: { tree: { sha: 'treeZ' } } })],
      ['repos/repo/delete-a/git/trees/treeZ', jsonResponse({ tree: [] })],
    ])
    try {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.sourceCheck).handler(fakeReq('POST', SKILL_HUB_API.sourceCheck, { repo: 'repo/delete-a' }), res as never)
      expect(res.status).toBe(200)
      const body = res.json() as import('./protocol.ts').SourceCheckResponse
      expect(body.results[0].deleted).toEqual(['gone-skill'])
      // 本插件不代删：文件留在原地，由用户自己决定怎么处理。
      await expect(access(join(dir, 'SKILL.md'))).resolves.toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('patches display toggles on the config route', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.config).handler(fakeReq('POST', SKILL_HUB_API.config, { showUseCount: false }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').ConfigResponse
    expect(body.config.showUseCount).toBe(false)
    const bad = new FakeResponse()
    await routeFor(SKILL_HUB_API.config).handler(fakeReq('POST', SKILL_HUB_API.config, { showUseTime: 'x' }), bad as never)
    expect(bad.status).toBe(400)
  })

  it('keeps the old commit snapshot when a sync partially fails', async () => {
    await mkdir(join(home, 'skills', 'a-skill'), { recursive: true })
    await writeFile(join(home, 'skills', 'a-skill', 'SKILL.md'), '---\nname: a-skill\ndescription: x\n---', 'utf8')
    await store.addSourceSkill('repo/partial', 'skills', 'oldcommit', undefined, 'a-skill')
    await store.addSourceSkill('repo/partial', 'skills', 'oldcommit', undefined, 'b-skill')
    // Upstream only still has a-skill; b-skill is missing → that item fails.
    stubFetch([
      ['repos/repo/partial/commits', jsonResponse({ sha: 'newcommit', commit: { tree: { sha: 't2' } } })],
      ['repos/repo/partial/git/trees/t2', jsonResponse({ tree: [
        { path: 'skills/a-skill/SKILL.md', type: 'blob', size: 40 },
      ] })],
      ['raw.githubusercontent.com/repo/partial/newcommit/skills/a-skill/SKILL.md', new Response('---\nname: a-skill\ndescription: x\n---', { status: 200 })],
    ])
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.sourceSync).handler(fakeReq('POST', SKILL_HUB_API.sourceSync, { repo: 'repo/partial' }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').SourceSyncResponse
    expect(body.synced).toEqual(['a-skill'])
    expect(body.failed.map((f) => f.name)).toEqual(['b-skill'])
    // The snapshot must NOT advance: the next check still diffs the tree and
    // re-reports b-skill instead of silently hiding the stale copy.
    expect((await store.getSource('repo/partial'))?.commitSha).toBe('oldcommit')
  })

  it('refuses to overwrite a broken same-name directory on create', async () => {
    await mkdir(join(home, 'skills', 'broken-dir'), { recursive: true })
    await writeFile(join(home, 'skills', 'broken-dir', 'SKILL.md'), '# not a valid skill', 'utf8')
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.create).handler(fakeReq('POST', SKILL_HUB_API.create, { name: 'broken-dir' }), res as never)
    expect(res.status).toBe(409)
    // The original broken file must still be there, untouched.
    expect(await readFile(join(home, 'skills', 'broken-dir', 'SKILL.md'), 'utf8')).toBe('# not a valid skill')
  })

  it('backfills an unverified source snapshot on first check', async () => {
    await store.addSourceSkill('repo/verify-me', 'skills', '', undefined, 's1')
    stubFetch([
      ['repos/repo/verify-me/commits', jsonResponse({ sha: 'v1', commit: { tree: { sha: 'tv' } } })],
    ])
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.sourceCheck).handler(fakeReq('POST', SKILL_HUB_API.sourceCheck, { repo: 'repo/verify-me' }), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as import('./protocol.ts').SourceCheckResponse
    expect(body.results[0]).toMatchObject({ repo: 'repo/verify-me', changed: false, unverified: true, commitSha: 'v1' })
    // Snapshot backfilled, so the next check has a real baseline.
    expect((await store.getSource('repo/verify-me'))?.commitSha).toBe('v1')
  })

})

describe('skill-hub mode scope routes', () => {
  let dir: string
  let store: SkillHubStore
  let deps: SkillHubRouteDeps
  /** 一次读取的宿主替身记录。 */
  let sessions: {
    entries: Array<{ id: string; name?: string; trust: 'system' | 'user'; isDefault: boolean }>
    active: string[]
    mounted: string[]
    policies: Map<string, ScopePolicy>
    hidden: Map<string, string[]>
    notified: string[]
    available: boolean
    reason?: string
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-scope-routes-'))
    store = new SkillHubStore(statePath(dir))
    sessions = {
      entries: [
        { id: 'coding', name: '编码模式', trust: 'user', isDefault: true },
        { id: 'minimal', trust: 'system', isDefault: false },
      ],
      active: ['coding'],
      mounted: ['coding', 'minimal'],
      policies: new Map(),
      hidden: new Map([['coding', ['gamma-skill']]]),
      notified: [],
      available: true,
    }
    deps = {
      skills: { snapshot: async () => ({ skills: [], complete: true }), get: async () => undefined },
      store,
      home: dir,
      scopes: {
        presets: async () => ({
          available: sessions.available,
          ...(sessions.reason !== undefined ? { reason: sessions.reason } : {}),
          entries: sessions.entries,
          active: sessions.active,
          mounted: sessions.mounted,
        }),
        visibilityOf: async (presetId) => ({
          enabled: sessions.policies.get(presetId)?.enabled === true,
          visible: ['alpha-skill', 'beta-skill'],
          hidden: sessions.hidden.get(presetId) ?? [],
          resolved: { 'tag:t1': ['alpha-skill'] },
          dangling: [],
        }),
        policyOf: async (presetId) => sessions.policies.get(presetId),
        savePolicy: async (presetId, patch) => {
          // 真正落盘：这样既覆盖路由链路，也覆盖"重启后策略仍在"。
          const policy = await store.saveScope(presetId, patch)
          sessions.policies.set(presetId, policy)
          return policy
        },
        deletePolicy: async (presetId) => {
          const existed = await store.deleteScope(presetId)
          sessions.policies.delete(presetId)
          sessions.hidden.delete(presetId)
          return existed
        },
        notifyPolicyChanged: (presetId) => { sessions.notified.push(presetId) },
      },
    }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function routeFor(path: string) {
    const route = makeRoutes(deps).find((r) => r.path === path)
    if (route === undefined) throw new Error('route not found: ' + path)
    return route
  }

  it('keeps the loopback fence on every mode route', async () => {
    for (const [path, method] of [[SKILL_HUB_API.presets, 'GET'], [SKILL_HUB_API.scopePreview, 'GET'], [SKILL_HUB_API.scope, 'POST']] as const) {
      const res = new FakeResponse()
      await routeFor(path).handler(fakeReq(method, path, method === 'POST' ? {} : undefined, '10.0.0.5'), res as never)
      expect(res.status, path).toBe(403)
    }
  })

  it('reports the mode capability as unavailable when the host wired no scope deps', async () => {
    delete deps.scopes
    const presets = new FakeResponse()
    await routeFor(SKILL_HUB_API.presets).handler(fakeReq('GET', SKILL_HUB_API.presets), presets as never)
    expect(presets.json()).toMatchObject({ ok: true, available: false, presets: [], pendingCount: 0 })

    for (const [path, method] of [[SKILL_HUB_API.scopePreview, 'GET'], [SKILL_HUB_API.scope, 'POST']] as const) {
      const res = new FakeResponse()
      await routeFor(path).handler(fakeReq(method, path, method === 'POST' ? { presetId: 'coding' } : undefined), res as never)
      expect(res.status, path).toBe(503)
    }
  })

  it('lists presets with their policy, counts and wiring state', async () => {
    sessions.policies.set('coding', { presetId: 'coding', enabled: true, groups: ['tag:t1'], skills: [] })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.presets).handler(fakeReq('GET', SKILL_HUB_API.presets), res as never)

    const body = res.json() as PresetsResponse
    expect(body.available).toBe(true)
    expect(body.presets).toHaveLength(2)
    expect(body.presets[0]).toMatchObject({
      id: 'coding', name: '编码模式', trust: 'user', isDefault: true,
      mounted: true, gateActive: true, visibleCount: 2, hiddenCount: 1,
      policy: { enabled: true, groups: ['tag:t1'] },
    })
    // 未配置的模式：不隔离、不接线、隐藏数为 0。
    expect(body.presets[1]).toMatchObject({ id: 'minimal', trust: 'system', isDefault: false, mounted: true, gateActive: false })
    expect(body.presets[1].policy).toEqual({ presetId: 'minimal', enabled: false, groups: [], skills: [] })
  })

  it('counts presets that are enabled but not yet wired', async () => {
    sessions.policies.set('minimal', { presetId: 'minimal', enabled: true, groups: [], skills: ['alpha-skill'] })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.presets).handler(fakeReq('GET', SKILL_HUB_API.presets), res as never)
    // minimal 已挂载但闸门未注入（它不在 active 里）→ 计入待接线。
    expect((res.json() as PresetsResponse).pendingCount).toBe(1)
  })

  it('reports why the mode capability is unavailable', async () => {
    sessions.available = false
    sessions.reason = 'agent-presets service is not mounted in this deployment'
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.presets).handler(fakeReq('GET', SKILL_HUB_API.presets), res as never)
    expect((res.json() as PresetsResponse).unavailableReason).toContain('agent-presets')
  })

  it('saves a policy and notifies the enforcement layer', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.scope).handler(
      fakeReq('POST', SKILL_HUB_API.scope, { presetId: 'coding', enabled: true, groups: ['tag:t1', 'alpha-skill'] }),
      res as never,
    )
    expect(res.status).toBe(200)
    expect((res.json() as ScopeSaveResponse).policy).toEqual({
      presetId: 'coding', enabled: true, groups: ['tag:t1', 'skill:alpha-skill'], skills: [],
    })
    expect(sessions.notified).toEqual(['coding'])
    // 已经落盘，重启后仍在。
    expect(await new SkillHubStore(statePath(dir)).getScope('coding')).toMatchObject({ enabled: true })
  })

  it('rejects a bad preset id, a non-array list, and an empty patch', async () => {
    for (const body of [
      { presetId: '../escape', enabled: true },
      { presetId: '', enabled: true },
      { presetId: 'coding', groups: 'tag:t1' },
      { presetId: 'coding' },
    ]) {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.scope).handler(fakeReq('POST', SKILL_HUB_API.scope, body), res as never)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('refuses to enable an empty whitelist without an explicit confirmation', async () => {
    const body = { presetId: 'coding', enabled: true, groups: [], skills: [] }
    const refused = new FakeResponse()
    await routeFor(SKILL_HUB_API.scope).handler(fakeReq('POST', SKILL_HUB_API.scope, body), refused as never)
    // 空白名单 = 该模式看不到任何技能：合法但需显式确认。
    expect(refused.status).toBe(409)
    expect((refused.json() as ErrorResponse).error).toContain('confirmEmpty')
    expect(sessions.policies.has('coding')).toBe(false)

    const confirmed = new FakeResponse()
    await routeFor(SKILL_HUB_API.scope).handler(
      fakeReq('POST', SKILL_HUB_API.scope, { ...body, confirmEmpty: true }), confirmed as never,
    )
    expect(confirmed.status).toBe(200)
    expect((confirmed.json() as ScopeSaveResponse).policy).toMatchObject({ enabled: true, groups: [], skills: [] })
  })

  it('resets a policy back to unrestricted', async () => {
    sessions.policies.set('coding', { presetId: 'coding', enabled: true, groups: ['tag:t1'], skills: [] })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.scope).handler(fakeReq('POST', SKILL_HUB_API.scope, { presetId: 'coding', reset: true }), res as never)
    expect(res.status).toBe(200)
    expect((res.json() as ScopeSaveResponse).policy).toBeNull()
    expect(sessions.policies.has('coding')).toBe(false)
    expect(sessions.notified).toEqual(['coding'])
  })

  it('previews the expansion for one preset', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.scopePreview).handler(
      fakeReq('GET', SKILL_HUB_API.scopePreview + '?presetId=coding'), res as never,
    )
    expect(res.json()).toMatchObject({
      ok: true, presetId: 'coding', enabled: false,
      visible: ['alpha-skill', 'beta-skill'], hidden: ['gamma-skill'],
      resolved: { 'tag:t1': ['alpha-skill'] },
    })
  })

  it('requires a valid presetId on the preview route', async () => {
    for (const query of ['', '?presetId=', '?presetId=..%2Fescape']) {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.scopePreview).handler(fakeReq('GET', SKILL_HUB_API.scopePreview + query), res as never)
      expect(res.status, query).toBe(400)
    }
  })

  it('honours the master switch on business mode routes', async () => {
    deps.config = () => ({ enabled: false }) as HubConfig
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.presets).handler(fakeReq('GET', SKILL_HUB_API.presets), res as never)
    expect(res.status).toBe(503)
  })
})

describe('skill-hub API surface', () => {
  let dir: string
  let home: string
  let store: SkillHubStore
  let deps: SkillHubRouteDeps

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-api-'))
    home = join(dir, 'home')
    await mkdir(join(home, 'skills'), { recursive: true })
    store = new SkillHubStore(statePath(home))
    deps = { skills: { snapshot: async () => ({ skills: [], complete: true }), get: async () => undefined }, store, home }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps every path inside the family root and registered', () => {
    const routes = makeRoutes(deps)
    const registered = new Set(routes.filter((route) => route.kind === 'exact').map((route) => route.path))
    const declared = Object.values(SKILL_HUB_API)
    for (const path of declared) expect(path.startsWith(SKILL_HUB_API_ROOT + '/')).toBe(true)
    // 常量与注册表互为子集：一个声明了没注册（客户端必然 404），或注册了没声明
    // （客户端永远调不到），都是漂移。
    expect([...registered].sort()).toEqual([...declared].sort())
  })

  it('registers one 404 catch-all covering the whole family', async () => {
    const routes = makeRoutes(deps)
    const catchAll = routes.filter((route) => route.kind === 'prefix')
    expect(catchAll).toHaveLength(1)
    expect(catchAll[0].path).toBe(SKILL_HUB_API_ROOT)
    // 未知路径给出写明路径的 404，而不是让请求落到宿主 fallback 的 401。
    const res = new FakeResponse()
    await catchAll[0].handler(fakeReq('GET', '/api/skill-hub/market/sync'), res as never)
    expect(res.status).toBe(404)
    expect((res.json() as ErrorResponse).error).toContain('/api/skill-hub/market/sync')
  })

  it('never shadows a registered exact route', async () => {
    const routes = makeRoutes(deps)
    // 精确路由仍是 kind 'exact'，宿主先查精确表，兜底只负责未命中的路径。
    const catalog = routes.find((route) => route.path === SKILL_HUB_API.catalog)
    expect(catalog?.kind).toBe('exact')
    const res = new FakeResponse()
    await catalog?.handler(fakeReq('GET', SKILL_HUB_API.catalog), res as never)
    expect(res.status).toBe(200)
  })
})
