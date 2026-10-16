import type { ScopePolicy, WorkspacePolicy } from '../../protocol.ts';
/** Copy a policy so callers cannot mutate the cached arrays. */
export declare function copyScope(policy: ScopePolicy): ScopePolicy;
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
export declare function saveScope(scopes: Map<string, ScopePolicy>, presetId: string, patch: {
    enabled?: boolean;
    groups?: string[];
    skills?: string[];
}): ScopePolicy;
/** Copy a workspace policy so callers cannot mutate the cached arrays. */
export declare function copyWorkspacePolicy(policy: WorkspacePolicy): WorkspacePolicy;
/**
 * Save one workspace's policy with partial-update semantics: absent fields keep
 * their current value. Same rules as {@link saveScope}: a brand-new policy stays
 * disabled until the user turns it on, and provided lists replace wholesale.
 *
 * @throws StoreError when the workspace id is not a legal shape.
 */
export declare function saveWorkspacePolicy(workspaces: Map<string, WorkspacePolicy>, workspaceId: string, patch: {
    enabled?: boolean;
    groups?: string[];
    skills?: string[];
}): WorkspacePolicy;
