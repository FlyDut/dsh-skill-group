/**
 * Hub sidecar store: the plugin's whole writable state, kept outside the
 * skill files. Switching a skill off is runtime-only — this store records
 * the name (and when), while enforcement hides it through a shadowing
 * provider / preset gate, so no SKILL.md is renamed or moved. It also
 * persists user tag groups, upstream source records (repo + commit snapshot
 * for update checks) and the market source list.
 *
 * State file: $DSH_HOME/dsh-skill-group.json — a small JSON document written
 * atomically (tmp file + rename).
 *
 * 按职责拆分后的重导出入口：老 `from './store.ts'` 写法保持可用，
 * 新代码可按需直引 `from './store/<module>.ts'`。
 */

export { STORE_VERSION, statePath, type StoreFile } from './store/paths.ts'
export { StoreError } from './store/errors.ts'
export { migrateStore, hydrateMigratedState, type MigratedStore, type HydratedState } from './store/migrate.ts'
export { SkillHubStore } from './store/store.ts'
