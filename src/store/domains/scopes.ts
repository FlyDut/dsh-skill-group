/**
 * Mode-scope (模式隔离) policy mutations over the sidecar's preset map.
 *
 * I/O-free by design: the store owns loading and persistence. Reads return
 * copies so callers cannot mutate the cached policy arrays.
 */
import { StoreError } from '../errors.ts'
import { normalizeScopePolicy } from '../../protocol/scopes.ts'
import type { ScopePolicy } from '../../protocol.ts'

/** Copy a policy so callers cannot mutate the cached arrays. */
export function copyScope(policy: ScopePolicy): ScopePolicy {
  return { ...policy, groups: [...policy.groups], skills: [...policy.skills] }
}

/**
 * Save one preset's policy with partial-update semantics: absent fields keep
 * their current value.
 *
 * A new policy defaults to `enabled: false` — saving a policy that only feeds
 * the preview must not change what any session sees; enabling is an explicit
 * user action. When provided, `groups`/`skills` replace the previous list
 * wholesale (the panel sends its complete selection).
 *
 * @throws StoreError when the preset id is not a legal shape.
 */
export function saveScope(scopes: Map<string, ScopePolicy>, presetId: string, patch: { enabled?: boolean; groups?: string[]; skills?: string[] }): ScopePolicy {
  const normalized = normalizeScopePolicy({ presetId, enabled: patch.enabled, groups: patch.groups, skills: patch.skills })
  if (normalized === undefined) throw new StoreError('validation', 'invalid preset id: ' + presetId)
  const previous = scopes.get(presetId)
  const next: ScopePolicy = {
    presetId,
    // 新建时只接受显式 true；已存在时保持现值。
    enabled: patch.enabled ?? previous?.enabled ?? false,
    groups: patch.groups !== undefined ? normalized.groups : (previous?.groups ?? []),
    skills: patch.skills !== undefined ? normalized.skills : (previous?.skills ?? []),
  }
  scopes.set(presetId, next)
  return next
}
