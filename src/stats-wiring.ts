/**
 * 调用次数统计的接线。
 *
 * Optional trigger statistics: while a session-query service exists, wire a
 * cached invocation-count reader into the stats route. The caller re-syncs its
 * routes once a reader is installed (no sessionQuery service ever mounted
 * means none of this runs).
 *
 * Read-path preference: the host's sessionPersistence seam serves raw stored
 * logs (decompress + parse only — no Session restore/validation, the host
 * cost that OOMed large histories, see issue #7), with the query seam
 * covering live sessions. Without a persistence service the reader falls
 * back to sequential query reads. Scans are strictly lazy: the first one
 * starts on the panel's first /stats poll, never at plugin startup (a
 * headless boot with no browser must not pay for statistics nobody reads).
 *
 * Mount ordering between the two host services is not guaranteed, so the
 * reader is (re-)built generation-guarded: a query-only reader wires
 * immediately, and a later-arriving persistence service upgrades it to the
 * cold path. A superseded build never assigns.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-query'
import { HUB_CONFIG_DEFAULTS, type HubConfig } from './protocol.ts'
import { createSkillStatsReader, asPersistenceSeam, type SessionPersistenceLike, type SessionQueryLike, type SkillStatsReader } from './stats.ts'
import type { SkillHubStore } from './store.ts'

interface InvocationStatsOptions {
  ctx: Context
  store: SkillHubStore
  /** 实时配置：扫描间隔与滚动窗口都从这里读，卡片里改完即生效。 */
  current: () => HubConfig
  /** reader 就绪后交给调用方（调用方通常会再 sync 一次把路由挂上）。 */
  install: (reader: SkillStatsReader) => void
}

/** 软接线 sessionQuery / sessionPersistence；两个服务都不在时什么都不做。 */
export function wireInvocationStats(options: InvocationStatsOptions): void {
  const { ctx, store, current, install } = options
  let statsQuery: SessionQueryLike | undefined
  let statsPersistence: SessionPersistenceLike | undefined
  let statsGeneration = 0

  const wireStats = (): void => {
    const query = statsQuery
    if (query === undefined) return
    const generation = ++statsGeneration
    const cold = statsPersistence
    void (async () => {
      // 恢复 sidecar 里的增量扫描检查点后再建 reader（异步、不阻塞）：
      // 重启后无需重新解压全部历史日志；每次扫描完都落盘（含上次总数），所以
      // 重启后面板秒出旧数、后台重扫。扫描间隔与滚动窗口都从设置命名空间
      // 实时读取——卡片里改完即生效，无需重启。
      const checkpoint = await store.getSkillStatsState().catch(() => undefined)
      if (generation !== statsGeneration) return
      const scanMinutes = (): number => {
        const value = current().statsScanMinutes
        return typeof value === 'number' && value >= 1 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsScanMinutes
      }
      const windowDays = (): number => {
        const value = current().statsWindowDays
        return typeof value === 'number' && value >= 0 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsWindowDays
      }
      const reader = createSkillStatsReader(query, () => scanMinutes() * 60_000, {
        checkpoint,
        windowDays,
        ...(cold === undefined ? {} : {
          persistence: cold,
          listLiveIds: async () => {
            try {
              const records = await query.listSessions()
              return records.filter((record) => (record as { live?: unknown }).live === true).map((record) => record.header.id)
            } catch {
              return []
            }
          },
          readLiveSession: async (id) => {
            try {
              return { events: (await query.readSession(id)).events }
            } catch {
              return undefined
            }
          },
        }),
        onCheckpoint: (next) => {
          void store.saveSkillStatsState(next).catch((error) => {
            ctx.logger.warn('[skill-hub] persisting skill-stats checkpoint failed', error)
          })
        },
      })
      if (generation !== statsGeneration) return
      // The fiber can be torn down while the checkpoint read / reader build is
      // in flight (a live patch reload restarts the plugin, or the host is
      // shutting down). Registering effects on a disposed context throws
      // INACTIVE_EFFECT, which the host surfaces as a fatal, process-wide load
      // failure — so drop this stale wiring instead of re-syncing.
      if (ctx.fiber.uid === null) return
      ctx.logger.info(`[skill-hub] stats seam: ${cold === undefined ? 'session-query (fallback)' : 'session-persistence (cold)'}`)
      install(reader)
    })()
  }

  ctx.inject(['sessionQuery'], (sctx) => {
    statsQuery = sctx.sessionQuery
    wireStats()
    // The persistence service may mount after the query service: upgrade the
    // reader when it arrives (no-op when it never does).
    sctx.inject(['sessionPersistence'] as unknown as ['sessionQuery'], (pctx) => {
      void (async () => {
        const raw = (pctx as unknown as { sessionPersistence?: unknown }).sessionPersistence
        const seam = asPersistenceSeam(raw)
        if (seam === undefined) {
          ctx.logger.warn('[skill-hub] sessionPersistence shape mismatch, staying on query fallback')
          return
        }
        try {
          await seam.list() // probe: headers only, must succeed before trusting the cold path
        } catch (error) {
          ctx.logger.warn('[skill-hub] persistence seam probe failed, staying on query fallback', error)
          return
        }
        statsPersistence = seam
        wireStats()
      })()
    })
  })
}
