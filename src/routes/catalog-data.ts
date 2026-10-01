/**
 * routes 共享层 · 目录装配：完整目录响应（时间戳/interface 元数据/重名诊断）
 * 与详情映射。目录只覆盖用户级根；技能是否处于「运行时关闭」由 sidecar 的
 * 关闭名单标记成 `enabled: false`，文件与发现层完全不动。
 */

import { stat } from 'node:fs/promises'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import {
  type CatalogResponse,
  type CatalogSkill,
  type SkillDetail,
  type WritableRoot,
} from '../protocol.ts'
import { readSkillInterface, scanDiagnostics, skillDir, skillLocationCandidates, type SkillInterface } from '../skillfs.ts'
import { CURRENT_VERSION } from '../version.ts'
import { homeOf, isWritableSource, type SkillHubRouteDeps } from './deps.ts'

/** 目录中存在的技能名集合（tag 成员校验用）：目录名 ∪ 关闭名单，避免成员因关闭而丢失。 */
export async function knownSkillNames(deps: SkillHubRouteDeps): Promise<Set<string>> {
  const snapshot = await deps.skills.snapshot()
  const names = new Set(snapshot.skills.map((skill) => skill.name))
  for (const disabled of await deps.store.listDisabled()) names.add(disabled.name)
  return names
}

/**
 * Build the full catalog response (shared by catalog/toggle/create handlers).
 *
 * 管理视图只覆盖用户级根（~/.dsh/skills、~/.agents/skills）。关闭的技能仍在
 * 目录里，只是带上 `enabled: false`：文件没改名，发现层照常看到它，面板需要
 * 那一行来把开关打开。
 */
export async function buildCatalog(deps: SkillHubRouteDeps): Promise<CatalogResponse> {
  const home = homeOf(deps)
  const snapshot = await deps.skills.snapshot()
  const disabledNames = new Set((await deps.store.listDisabled()).map((entry) => entry.name))
  // Distinct identities per name: the same skill reappearing across provider
  // snapshots (same source+provider) is one skill, not a duplicate. Only
  // different source/provider identities sharing a name are ambiguous.
  const identitiesByName = new Map<string, Set<string>>()
  const byName = new Map<string, SkillSummary>()
  for (const skill of snapshot.skills) {
    let identities = identitiesByName.get(skill.name)
    if (identities === undefined) {
      identities = new Set()
      identitiesByName.set(skill.name, identities)
    }
    identities.add(skill.source + '\0' + skill.provider)
    if (!byName.has(skill.name)) byName.set(skill.name, skill)
  }
  const duplicateNames = [...identitiesByName.entries()]
    .filter(([, identities]) => identities.size > 1)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))
  // 添加/更新时间 = 用户级技能文件的创建/修改时间（排序与详情展示用）。
  // snapshot 只给 SkillSummary（无 path），所以按可写根推断路径；非用户级
  // 来源没有稳定路径，省略字段，客户端排序会把它放到末尾。
  // 全部技能并发收集（面板每 5 秒轮询一次，逐个串行 stat 会让响应随技能
  // 数量线性变慢）。
  const timesByName = new Map<string, { addedAt: number; updatedAt: number }>()
  await Promise.all([...byName.values()].map(async (skill) => {
    if (!isWritableSource(skill.source)) return
    for (const candidate of skillLocationCandidates(skill.source as WritableRoot, skill.name, home)) {
      try {
        const times = await stat(candidate)
        timesByName.set(skill.name, { addedAt: times.birthtimeMs, updatedAt: times.mtimeMs })
        return
      } catch {
        // 目录/文件不存在则尝试下一个候选路径。
      }
    }
  }))
  // UI metadata from agents/openai.yaml (codex SkillInterface) — best-effort, no error if missing.
  const interfaceByName = new Map<string, SkillInterface>()
  await Promise.all([...byName.values()].map(async (skill) => {
    if (!isWritableSource(skill.source)) return
    const dir = skillDir(skill.source as WritableRoot, skill.name, home)
    try {
      const iface = await readSkillInterface(dir)
      if (iface !== undefined) interfaceByName.set(skill.name, iface)
    } catch {
      // ignore
    }
  }))
  const skills: CatalogSkill[] = [...byName.values()].map((skill) => {
    const row: CatalogSkill = {
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
      invocation: {
        modelInvocable: skill.invocation.modelInvocable,
        userInvocable: skill.invocation.userInvocable,
      },
      provider: skill.provider,
      writable: isWritableSource(skill.source),
      source: skill.source,
      enabled: !disabledNames.has(skill.name),
    }
    const times = timesByName.get(skill.name)
    if (times !== undefined) {
      row.addedAt = times.addedAt
      row.updatedAt = times.updatedAt
    }
    const iface = interfaceByName.get(skill.name)
    if (iface !== undefined) applyInterface(row, iface)
    return row
  })
  const diagnostics = [
    ...(await scanDiagnostics('user-dsh', home)),
    ...(await scanDiagnostics('user-agents', home)),
  ]

  return {
    ok: true,
    pluginVersion: CURRENT_VERSION,
    complete: snapshot.complete,
    skills,
    diagnostics,
    ...(duplicateNames.length > 0 ? { duplicateNames } : {}),
  }
}

/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
export function applyInterface<T extends SkillInterface>(row: T, iface: SkillInterface): void {
  if (iface.displayName !== undefined) row.displayName = iface.displayName
  if (iface.shortDescription !== undefined) row.shortDescription = iface.shortDescription
  if (iface.brandColor !== undefined) row.brandColor = iface.brandColor
  if (iface.iconSmall !== undefined) row.iconSmall = iface.iconSmall
  if (iface.iconLarge !== undefined) row.iconLarge = iface.iconLarge
  if (iface.defaultPrompt !== undefined) row.defaultPrompt = iface.defaultPrompt
}

/** Map a loaded definition onto the wire shape. `enabled` mirrors the sidecar switch. */
export function toDetail(skill: SkillDefinition, enabled = true): SkillDetail {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    invocation: {
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
    },
    provider: skill.provider,
    ...(skill.path !== undefined ? { path: skill.path } : {}),
    content: skill.content,
    enabled,
  }
}
