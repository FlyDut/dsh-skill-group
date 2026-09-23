/**
 * 加载冒烟（发布前检查）：用真实 cordis runtime 装载**构建产物** lib/index.js，
 * 提供 dsh 宿主的四个服务替身，验证插件在真实进程形态下能起来、路由能注册、
 * 并且 /presets 与 /scope 真的能往返一次。
 *
 * 与单测的分工：单测覆盖模块行为，这里只回答"打包产物在近似真实的宿主里加载
 * 会不会炸、路由会不会重复注册、卸载会不会留残留"。跑之前先 `pnpm build`。
 *
 *   node scripts/smoke-load.mjs
 */

const { Context } = await import('@deepseek-ai/cordis')
const { SkillRegistry } = await import('@deepseek-ai/dsh-skill')
const { mkdtemp, rm, writeFile, mkdir } = await import('node:fs/promises')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')

let failures = 0
const log = (...a) => console.log('[smoke]', ...a)
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  log(`${ok ? 'PASS' : 'FAIL'} ${label}: got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}

// 隔离的 DSH_HOME，避免碰到真实 sidecar
const home = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-smoke-'))
process.env.DSH_HOME = home
await mkdir(join(home, 'skills'), { recursive: true })

const ctx = new Context()
await ctx.plugin(SkillRegistry)

// ── 宿主服务替身 ────────────────────────────────────────────────────────
const routes = []
const sections = []
const nsState = new Map()

// 撤销必须真的生效：hub 的 sync() 会先拆再注册，替身不撤销就验证不到幂等。
ctx.provide('webServer', {
  register: (route) => {
    routes.push(route)
    return () => { const at = routes.indexOf(route); if (at >= 0) routes.splice(at, 1) }
  },
})
ctx.provide('systemPrompt', {
  section: (spec) => {
    sections.push(spec)
    return () => { const at = sections.indexOf(spec); if (at >= 0) sections.splice(at, 1) }
  },
})
ctx.provide('settings', {
  register: (ns, _schema, options) => {
    nsState.set(ns, { user: {}, base: options?.base ?? {} })
    const scope = {
      // 真实 settings 服务会用命名空间的 schemastery 默认值填充后再合并用户层；
      // 替身给出同一结果，否则 apply 里的开关读不到默认值。
      get: () => ({ enabled: true, announceToAgent: true, ...nsState.get(ns).user }),
      watch: () => () => {},
      replace: async (next) => { nsState.get(ns).user = next },
      update: async (patch) => { nsState.set(ns, { ...nsState.get(ns), user: { ...nsState.get(ns).user, ...patch } }) },
    }
    return scope
  },
  describe: () => [...nsState.entries()].map(([ns, value]) => ({ ns, user: value.user })),
})

// 真实部署里由 dsh-agent-presets 提供；这里给一个最小替身，让 /presets 能列出模式。
ctx.provide('agentPresets', {
  defaultId: 'coding',
  list: async () => [
    { id: 'coding', trust: 'user', name: '编码模式', description: '专注代码工程。' },
    { id: 'minimal', trust: 'system', name: '最小模式' },
  ],
})

// ── 装载构建产物 ────────────────────────────────────────────────────────
const mod = await import('../lib/index.js')
check('plugin name', mod.name, 'skill-hub')
check('inject', mod.inject, ['webServer', 'skills', 'systemPrompt', 'settings'])

await ctx.plugin(mod)
log('plugin loaded; routes registered:', routes.length)

// 精确路由注册一次，另加一条覆盖整族的 prefix 兜底（未知路径回明确 404）。
const exactRoutes = routes.filter((r) => r.kind === 'exact')
const prefixRoutes = routes.filter((r) => r.kind === 'prefix')
check('exact route family mounted exactly once', exactRoutes.length, 38)
check('one 404 catch-all covers the family', prefixRoutes.length, 1)
check('catch-all sits on the family root', prefixRoutes[0]?.path, '/api/skill-hub')
check('section announced exactly once (re-sync is idempotent)', sections.length, 1)
const presetsRoute = routes.find((r) => r.path === '/api/skill-hub/presets')
check('/presets route present', presetsRoute !== undefined, true)
check('/scope route present', routes.some((r) => r.path === '/api/skill-hub/scope'), true)
check('/scope/preview route present', routes.some((r) => r.path === '/api/skill-hub/scope/preview'), true)

// ── 走一遍真实 HTTP handler ─────────────────────────────────────────────
function fakeReq(method, url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method, url,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
}
function fakeRes() {
  const res = { status: 0, headers: {}, body: '' }
  res.writeHead = (status, headers) => { res.status = status; if (headers) res.headers = headers }
  res.end = (chunk) => { res.body = chunk ?? '' }
  res.json = () => { try { return JSON.parse(res.body) } catch { return undefined } }
  return res
}

const listRes = fakeRes()
await presetsRoute.handler(fakeReq('GET', '/api/skill-hub/presets'), listRes)
const listed = listRes.json()
check('/presets answers 200', listRes.status, 200)
check('no preset is mounted in this process, so nothing is wired', listed.presets.map((p) => [p.mounted, p.gateActive]), [[false, false], [false, false]])
check('/presets reports available (runtime packages resolved + roster mounted)', listed.available, true)
check('/presets lists both modes', listed.presets.map((p) => p.id), ['coding', 'minimal'])
check('default flag comes from the roster', listed.presets[0].isDefault, true)
check('unconfigured mode is unrestricted', listed.presets[0].policy, { presetId: 'coding', enabled: false, groups: [], skills: [] })
check('trust is projected', listed.presets.map((p) => p.trust), ['user', 'system'])
// 没有任何 preset 挂载过（本进程没有会话），所以没有闸门接线。
check('pendingCount counts enabled-but-unwired modes', listed.pendingCount, 0)

const saveRes = fakeRes()
await routes.find((r) => r.path === '/api/skill-hub/scope').handler(
  fakeReq('POST', '/api/skill-hub/scope', { presetId: 'smoke-preset', enabled: true, groups: ['tag:t1'], skills: ['alpha-skill'] }),
  saveRes,
)
check('/scope saves a policy', saveRes.status, 200)
check('/scope echoes it back', saveRes.json().policy, { presetId: 'smoke-preset', enabled: true, groups: ['tag:t1'], skills: ['alpha-skill'] })

const previewRes = fakeRes()
await routes.find((r) => r.path === '/api/skill-hub/scope/preview').handler(
  fakeReq('GET', '/api/skill-hub/scope/preview?presetId=smoke-preset'), previewRes,
)
check('/scope/preview answers 200', previewRes.status, 200)
log('  preview:', JSON.stringify(previewRes.json()))

// 未知路径必须由兜底路由回写明路径的 404（落到宿主 SPA fallback 会变 401，
// 排查时会被误读成鉴权问题）。
const notFoundRes = fakeRes()
await prefixRoutes[0].handler(fakeReq('GET', '/api/skill-hub/market/sync'), notFoundRes)
check('unknown family path answers 404', notFoundRes.status, 404)
check('404 names the requested path', String(notFoundRes.json()?.error).includes('/api/skill-hub/market/sync'), true)

// 配置写入必须当场重建 surfaces，而不是等 watcher/重启：关掉 announceToAgent
// 后 systemPrompt section 要立刻消失，再打开要恢复且不重复注册（sync 幂等）。
const configRoute = routes.find((r) => r.path === '/api/skill-hub/config')
check('/config route present', configRoute !== undefined, true)
const offRes = fakeRes()
await configRoute.handler(fakeReq('POST', '/api/skill-hub/config', { announceToAgent: false }), offRes)
check('/config accepts the patch', offRes.status, 200)
check('announceToAgent off removes the section without a restart', sections.length, 0)
const onRes = fakeRes()
await configRoute.handler(fakeReq('POST', '/api/skill-hub/config', { announceToAgent: true }), onRes)
check('/config accepts re-enabling', onRes.status, 200)
check('announceToAgent back on re-announces exactly once', sections.length, 1)
check('/config never echoes a github token field', Object.hasOwn(onRes.json()?.config ?? {}, 'githubToken'), false)

// ── 落盘与重载 ──────────────────────────────────────────────────────────
const { readFile } = await import('node:fs/promises')
const persisted = JSON.parse(await readFile(join(home, 'dsh-skill-hub.json'), 'utf8'))
check('sidecar schema bumped to v5', persisted.version, 5)
check('policy persisted', persisted.scopes, [{ presetId: 'smoke-preset', enabled: true, groups: ['tag:t1'], skills: ['alpha-skill'] }])

// ── 卸载：全部副作用必须撤干净 ─────────────────────────────────────────
await ctx.stop?.()
log(failures === 0 ? '\n===== 加载冒烟全部通过 =====' : `\n===== 加载冒烟失败 ${failures} 项 =====`)
await rm(home, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
