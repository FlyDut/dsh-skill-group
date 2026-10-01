/**
 * 启动期的一次性对账与迁移。
 *
 * 两件事都「尽力而为」：失败只记一行日志，绝不让插件装载失败。
 *  ① 回收导入中断留下的 `.*.import-*` 临时目录（Issue #3）；
 *  ② 旧版 sidecar 配置在 settings 命名空间还没有用户层时迁移过去。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import { ENTRY_ID } from './config.ts'
import type { HubConfig } from './protocol.ts'
import { cleanupLeftoverImportDirs } from './repo.ts'
import { WRITABLE_ROOTS, rootPath } from './skillfs/paths.ts'
import type { SkillHubStore } from './store.ts'

interface StartupOptions {
  ctx: Context
  store: SkillHubStore
  /** Settings 服务（部署挂了才有）；缺席表示没有用户层可迁移。 */
  settingsOf: () => SettingsForms | undefined
  /** 已保存的用户层配置；非空表示迁移早已完成。 */
  saved: () => Partial<HubConfig>
}

/** 触发启动期清理、对账与旧 sidecar 配置迁移。全部异步、不阻塞装载。 */
export function runStartupTasks(options: StartupOptions): void {
  const { ctx, store, settingsOf, saved } = options

  void (async () => {
    for (const root of WRITABLE_ROOTS.map((id) => rootPath(id))) {
      try {
        const c = await cleanupLeftoverImportDirs(root)
        if (c > 0) ctx.logger.info(`[skill-hub] startup cleaned ${c} leftover import temp dir(s) in ${root}`)
      } catch (error) {
        ctx.logger.warn('[skill-hub] startup cleanup failed', error)
      }
    }
  })()

  // One-time migration: an install upgraded from the sidecar-configured build
  // seeds the settings namespace from the saved sidecar config when the
  // namespace has no user section yet. Later edits live only in the settings
  // document; the sidecar keeps its (now-stale) copy untouched.
  void (async () => {
    try {
      const legacy = await store.getConfig()
      const settings = settingsOf()
      if (settings !== undefined && Object.keys(legacy).length > 0 && Object.keys(saved()).length === 0) {
        await settings.update(ENTRY_ID, legacy as Record<string, unknown>)
      }
    } catch (error) {
      ctx.logger.warn('[skill-hub] sidecar config migration into the settings namespace failed', error)
    }
  })()
}
