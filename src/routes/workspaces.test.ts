/**
 * 工作区策略路由的用例：/workspaces 的读数投影（含孤儿行）与 /workspace 的
 * 校验、确认与落盘。与「模式」域用例对称，差异点单独断言。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRoutes, type SkillHubRouteDeps } from '../routes.ts'
import { SkillHubStore, statePath } from '../store.ts'
import {
  SKILL_HUB_API,
  type HubConfig,
  type WorkspacePolicy,
  type WorkspaceSaveResponse,
  type WorkspacesResponse,
} from '../protocol.ts'

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

function fakeReq(method: string, url = '/', body?: unknown, remoteAddress = '127.0.0.1') {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as never
}

describe('skill-hub workspace policy routes', () => {
  let dir: string
  let store: SkillHubStore
  let deps: SkillHubRouteDeps
  let host: {
    entries: Array<{ id: string; path: string; title?: string; sessionCount: number }>
    policies: Map<string, WorkspacePolicy>
    notified: number
    available: boolean
    reason?: string
    pendingCount: number
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill-hub-workspace-routes-'))
    store = new SkillHubStore(statePath(dir))
    host = {
      entries: [
        { id: 'proj-alpha', path: '/w/alpha', title: 'Alpha 项目', sessionCount: 3 },
        { id: 'proj-beta', path: '/w/beta', sessionCount: 0 },
      ],
      policies: new Map(),
      notified: 0,
      available: true,
      pendingCount: 0,
    }
    deps = {
      skills: { snapshot: async () => ({ skills: [], complete: true }), get: async () => undefined },
      store,
      home: dir,
      workspaces: {
        workspaces: async () => ({
          available: host.available,
          ...(host.reason !== undefined ? { reason: host.reason } : {}),
          entries: host.entries,
          pendingCount: host.pendingCount,
        }),
        listPolicies: async () => [...host.policies.values()],
        policyOf: async (workspaceId) => host.policies.get(workspaceId),
        visibilityOf: async (workspaceId) => ({
          enabled: host.policies.get(workspaceId)?.enabled === true,
          visible: ['alpha-skill', 'beta-skill'],
          hidden: workspaceId === 'proj-alpha' ? ['gamma-skill'] : [],
          resolved: { 'tag:t1': ['alpha-skill'] },
          dangling: [],
        }),
        savePolicy: async (workspaceId, patch) => {
          // 真落盘：同时覆盖路由链路与"重启后策略仍在"。
          const policy = await store.saveWorkspacePolicy(workspaceId, patch)
          host.policies.set(workspaceId, policy)
          return policy
        },
        deletePolicy: async (workspaceId) => {
          const existed = await store.deleteWorkspacePolicy(workspaceId)
          host.policies.delete(workspaceId)
          return existed
        },
        notifyPolicyChanged: () => { host.notified += 1 },
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

  it('keeps the loopback fence on both workspace routes', async () => {
    for (const [path, method] of [[SKILL_HUB_API.workspaces, 'GET'], [SKILL_HUB_API.workspace, 'POST']] as const) {
      const res = new FakeResponse()
      await routeFor(path).handler(fakeReq(method, path, method === 'POST' ? {} : undefined, '10.0.0.5'), res as never)
      expect(res.status, path).toBe(403)
    }
  })

  it('reports the workspace capability as unavailable when the host wired no deps', async () => {
    delete deps.workspaces
    const list = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspaces).handler(fakeReq('GET', SKILL_HUB_API.workspaces), list as never)
    expect(list.json()).toMatchObject({ ok: true, available: false, workspaces: [], pendingCount: 0 })
    expect((list.json() as WorkspacesResponse).unavailableReason).toContain('workspace isolation')

    const write = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(fakeReq('POST', SKILL_HUB_API.workspace, { workspaceId: 'proj-alpha' }), write as never)
    expect(write.status).toBe(503)
  })

  it('lists workspaces with their policy, session count and expanded counts', async () => {
    host.policies.set('proj-alpha', { workspaceId: 'proj-alpha', enabled: true, groups: ['tag:t1'], skills: [] })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspaces).handler(fakeReq('GET', SKILL_HUB_API.workspaces), res as never)

    const body = res.json() as WorkspacesResponse
    expect(body.available).toBe(true)
    expect(body.workspaces).toHaveLength(2)
    expect(body.workspaces[0]).toMatchObject({
      id: 'proj-alpha', title: 'Alpha 项目', path: '/w/alpha', sessionCount: 3, present: true,
      visibleCount: 2, hiddenCount: 1,
      policy: { enabled: true, groups: ['tag:t1'] },
    })
    // 未配置的工作区：不隔离，策略是缺省值而不是 undefined。
    expect(body.workspaces[1]).toMatchObject({ id: 'proj-beta', present: true, sessionCount: 0, visibleCount: 2, hiddenCount: 0 })
    expect(body.workspaces[1].policy).toEqual({ workspaceId: 'proj-beta', enabled: false, groups: [], skills: [] })
  })

  it('appends policies whose workspace is gone as orphan rows and never deletes them', async () => {
    const gone = await store.saveWorkspacePolicy('proj-gone', { enabled: true, skills: ['alpha-skill'] })
    host.policies.set('proj-gone', gone)
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspaces).handler(fakeReq('GET', SKILL_HUB_API.workspaces), res as never)

    const body = res.json() as WorkspacesResponse
    const orphan = body.workspaces.find((row) => row.id === 'proj-gone')
    expect(orphan).toMatchObject({ present: false, sessionCount: 0, visibleCount: 2 })
    expect(orphan?.policy).toMatchObject({ enabled: true, skills: ['alpha-skill'] })
    // 只是如实报告：策略仍在 store 里。
    expect(await store.getWorkspacePolicy('proj-gone')).toBeDefined()
  })

  it('saves a whitelist, notifies the wiring and survives a reload', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(
      fakeReq('POST', SKILL_HUB_API.workspace, { workspaceId: 'proj-alpha', enabled: true, groups: ['tag:t1', 'alpha-skill'] }),
      res as never,
    )
    expect(res.status).toBe(200)
    // 裸技能名被归一化成 `skill:` 键（与模式域同一口径）。
    expect((res.json() as WorkspaceSaveResponse).policy).toMatchObject({ enabled: true, groups: ['tag:t1', 'skill:alpha-skill'] })
    expect(host.notified).toBe(1)

    const reopened = new SkillHubStore(statePath(dir))
    expect(await reopened.getWorkspacePolicy('proj-alpha')).toMatchObject({ enabled: true, groups: ['tag:t1', 'skill:alpha-skill'] })
  })

  it('refuses an empty whitelist until it is confirmed', async () => {
    const body = { workspaceId: 'proj-alpha', enabled: true, groups: [] as string[], skills: [] as string[] }
    const refused = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(fakeReq('POST', SKILL_HUB_API.workspace, body), refused as never)
    expect(refused.status).toBe(409)
    expect(host.notified).toBe(0)

    const confirmed = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(
      fakeReq('POST', SKILL_HUB_API.workspace, { ...body, confirmEmpty: true }), confirmed as never,
    )
    expect(confirmed.status).toBe(200)
    expect((confirmed.json() as WorkspaceSaveResponse).policy).toMatchObject({ enabled: true, groups: [], skills: [] })
  })

  it('does not ask for confirmation when an existing whitelist is kept', async () => {
    const kept = await store.saveWorkspacePolicy('proj-alpha', { groups: ['tag:t1'] })
    host.policies.set('proj-alpha', kept)
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(
      fakeReq('POST', SKILL_HUB_API.workspace, { workspaceId: 'proj-alpha', enabled: true }), res as never,
    )
    expect(res.status).toBe(200)
    expect((res.json() as WorkspaceSaveResponse).policy).toMatchObject({ enabled: true, groups: ['tag:t1'] })
  })

  it('resets a policy back to unrestricted', async () => {
    const existing = await store.saveWorkspacePolicy('proj-alpha', { enabled: true, groups: ['tag:t1'] })
    host.policies.set('proj-alpha', existing)
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.workspace).handler(
      fakeReq('POST', SKILL_HUB_API.workspace, { workspaceId: 'proj-alpha', reset: true }), res as never,
    )
    expect(res.status).toBe(200)
    expect((res.json() as WorkspaceSaveResponse).policy).toBeNull()
    expect(await store.getWorkspacePolicy('proj-alpha')).toBeUndefined()
    expect(host.notified).toBe(1)
  })

  it('rejects malformed write requests with 400 and writes nothing', async () => {
    const cases: Array<[unknown, string]> = [
      [{ workspaceId: 'has space' }, 'workspaceId'],
      [{ workspaceId: '' }, 'workspaceId'],
      [{ workspaceId: 'proj-alpha', enabled: 'yes' }, 'enabled'],
      [{ workspaceId: 'proj-alpha', groups: 'tag:t1' }, 'groups'],
      [{ workspaceId: 'proj-alpha', skills: 'alpha-skill' }, 'skills'],
      [{ workspaceId: 'proj-alpha' }, 'nothing to update'],
    ]
    for (const [body, fragment] of cases) {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.workspace).handler(fakeReq('POST', SKILL_HUB_API.workspace, body), res as never)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect((res.json() as { error: string }).error).toContain(fragment)
    }
    expect(host.notified).toBe(0)
    expect(await store.listWorkspacePolicies()).toEqual([])
  })

  it('honours the master switch on workspace routes', async () => {
    deps.config = () => ({ enabled: false }) as HubConfig
    for (const [path, method] of [[SKILL_HUB_API.workspaces, 'GET'], [SKILL_HUB_API.workspace, 'POST']] as const) {
      const res = new FakeResponse()
      await routeFor(path).handler(fakeReq(method, path, method === 'POST' ? { workspaceId: 'proj-alpha', enabled: false } : undefined), res as never)
      expect(res.status, path).toBe(503)
    }
  })
})
