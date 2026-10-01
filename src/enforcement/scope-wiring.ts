/**
 * 执行层 · 接线（wiring）：把闸门接到每个 preset 的 standing 作用域上，并管理
 * 它的生命周期。
 *
 * 机制（见 `scope-mechanism.test.ts` 的契约测试）：`dsh-agent-preset-registry` 为每个
 * 被使用的 preset 建立一次 standing mount，并 mint 一个不透明的 scope key；
 * `ctx.skills` 的分层**按该 key 的对象 identity 索引 layer**。因此用同一个 key
 * 调一次 `createScope`，在其中注册的 provider 就落进该 preset 的层——而
 * `createScope` 返回的 scope 归 hub 的 fiber 所有，销毁时连带清掉注册。
 *
 * 这条路径**不修改任何 preset 文件**，所以对部署自带的 system preset
 * （minimal / standard / ptc / cordis，不可写）同样生效。
 *
 * 三点刻意的保守设计：
 *  1. 运行时依赖用**动态 import** 载入并缓存；任何失败都降级为"能力不可用"，
 *     绝不让缺包/不兼容把整个插件拖下水。
 *  2. 所有注入与清理都包在 try/catch 里：单个 preset 接线失败只影响它自己。
 *  3. 只有"已挂载"的 preset 能接线。新挂载的 preset 由定时 tick 或面板请求
 *     触发的下一轮 sync 接上（在此之前它按不隔离运行，不会误伤）。
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Scope } from '@deepseek-ai/dsh-scope'
import { errorText } from '../error-text.ts'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'
import { PresetGateProvider } from './preset-gate.ts'

/** `livePresetMounts` 返回值的结构视图（只取接线需要两个字段）。 */
export interface PresetMountLike {
  /** 该 standing mount 属于哪个 preset。 */
  readonly presetId: string
  /** standing scope key；正在拆卸的记录可能缺省。 */
  readonly key?: object
}

/** 动态载入的运行时能力。真实实现来自 dsh 包，测试可注入替身。 */
export interface RuntimeBindings {
  /** 列出当前仍安装着的 preset standing mount（`within` 限定在某个 fiber 子树内）。 */
  livePresetMounts: (within?: Fiber) => readonly PresetMountLike[]
  /** 在给定的 scope key 下 mint 一个受调用方 fiber 管辖的作用域。 */
  createScope: (ctx: Context, key: object) => Pick<Scope, 'ctx' | 'dispose'>
}

/** 接线器依赖。 */
interface PresetWiringDeps {
  /** hub 的宿主 ctx；`createScope` 挂在它下面，随插件卸载一起回收。 */
  ctx: Context
  /** 载入运行时能力；返回 undefined 表示不可用（原因另行记录）。 */
  runtime: () => Promise<RuntimeBindings | undefined>
  /** 该 preset 当前是否需要闸门（模式策略或任一工作区策略已启用隔离）。 */
  isEnforced: (presetId: string) => Promise<boolean>
  /**
   * 该 preset 在某个工作目录下应被遮蔽的技能与元数据。
   * @param presetId - 目标 preset。
   * @param cwd - 会话工作目录（缺省时只算模式策略）。
   */
  hiddenOf: (presetId: string, cwd?: string) => Promise<ReadonlyMap<string, ScopeSkillMeta>>
  /** 诊断输出（默认走 ctx.logger）。 */
  log?: (level: 'info' | 'warn', message: string) => void
}

/** 接线状态快照（面板展示与诊断）。 */
interface WiringStatus {
  /** 运行时能力是否可用。 */
  available: boolean
  /** 不可用原因；可用时缺省。 */
  reason?: string
  /** 已接线（闸门已注入）的 preset id，升序。 */
  active: string[]
  /** 已挂载、可用于接线的 preset id，升序。 */
  mounted: string[]
}

/** 一条已生效的注入记录。 */
interface InjectedEntry {
  presetId: string
  scope: Pick<Scope, 'ctx' | 'dispose'>
  /** 注册表借出的失效句柄；scope 被销毁后可能已失效，故调用点一律 try/catch。 */
  control?: { invalidate: () => void }
}

/**
 * 把闸门接到 preset 作用域上的接线器。一个 hub 实例持有一个。
 */
export class PresetWiring {
  private readonly injected = new Map<object, InjectedEntry>()
  /** 运行时能力的 in-flight / 已解析结果。 */
  private bindings: Promise<RuntimeBindings | undefined> | undefined
  /** 不可用原因（首次载入失败时记录一次，避免重复 import 与刷日志）。 */
  private unavailable: string | undefined
  /** 正在进行的一轮 sync；并发调用共享它而不重复注入。 */
  private syncing: Promise<void> | undefined
  private disposed = false

  constructor(private readonly deps: PresetWiringDeps) {}

  /**
   * 跑一轮同步：清理失效注入（mount 消失或策略关闭），补上缺失的注入
   * （已挂载且策略启用）。并发调用共享同一轮。
   */
  sync(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.syncing ??= this.runSync().finally(() => { this.syncing = undefined })
    return this.syncing
  }

  /**
   * 通知某个 preset 的闸门"策略变了"，让注册表丢弃已完成的目录缓存，
   * 从而在会话的下一个 turn 生效。
   * @param presetId - 目标 preset。
   */
  invalidate(presetId: string): void {
    for (const entry of this.injected.values()) {
      if (entry.presetId !== presetId) continue
      try {
        entry.control?.invalidate()
      } catch (error) {
        this.log('warn', `invalidating the gate for preset "${presetId}" failed: ${errorText(error)}`)
      }
    }
  }

  /**
   * 通知**全部**已接线的闸门刷新缓存。目录变化（新增/删除/重命名技能）后调用，
   * 让每个模式的隐藏集合按新目录重算。
   */
  invalidateAll(): void {
    for (const entry of this.injected.values()) {
      try {
        entry.control?.invalidate()
      } catch (error) {
        this.log('warn', `invalidating the gate for preset "${entry.presetId}" failed: ${errorText(error)}`)
      }
    }
  }

  /** 当前接线状态（面板与诊断用）。 */
  async status(): Promise<WiringStatus> {
    const runtime = await this.load()
    if (runtime === undefined) {
      return { available: false, ...(this.unavailable !== undefined ? { reason: this.unavailable } : {}), active: this.activeIds(), mounted: [] }
    }
    return { available: true, active: this.activeIds(), mounted: this.mountedIds(runtime) }
  }

  /** 拆掉全部注入并停止后续同步（插件卸载路径）。 */
  async dispose(): Promise<void> {
    this.disposed = true
    const entries = [...this.injected.entries()]
    this.injected.clear()
    for (const [, entry] of entries) await this.disposeEntry(entry)
  }

  // ------------------------------------------------------------ internals

  private async runSync(): Promise<void> {
    const runtime = await this.load()
    if (runtime === undefined) return

    let mounts: readonly PresetMountLike[]
    try {
      // 用 root fiber 限定在本运行时内：mount 挂在 agent 的 fiber 下，不在 hub
      // 的子树里，所以不能传 ctx.fiber。
      mounts = runtime.livePresetMounts(this.deps.ctx.root.fiber)
    } catch (error) {
      this.log('warn', `enumerating preset mounts failed: ${errorText(error)}`)
      return
    }

    const live = new Map<object, string>()
    for (const mount of mounts) {
      if (mount.key !== undefined) live.set(mount.key, mount.presetId)
    }

    // 1) 清理：mount 已消失，或该 preset 不再启用隔离。
    for (const [key, entry] of [...this.injected]) {
      const stillMounted = live.has(key)
      const stillEnforced = stillMounted && await this.enforced(entry.presetId)
      if (stillMounted && stillEnforced) continue
      this.injected.delete(key)
      await this.disposeEntry(entry)
    }

    // 2) 补齐：已挂载、策略启用、尚未注入。
    for (const [key, presetId] of live) {
      if (this.injected.has(key)) continue
      if (!await this.enforced(presetId)) continue
      await this.install(presetId, key, runtime)
    }
  }

  /** 载入（并缓存）运行时能力；失败原因只记录一次。 */
  private load(): Promise<RuntimeBindings | undefined> {
    if (this.bindings !== undefined) return this.bindings
    this.bindings = (async () => {
      try {
        const bindings = await this.deps.runtime()
        if (bindings === undefined) {
          this.unavailable = 'agent-presets / dsh-scope 不可用'
          this.log('warn', 'preset scope wiring unavailable: ' + this.unavailable)
        }
        return bindings
      } catch (error) {
        this.unavailable = errorText(error)
        this.log('warn', 'preset scope wiring unavailable: ' + this.unavailable)
        return undefined
      }
    })()
    return this.bindings
  }

  /** 策略是否启用；查询失败按"不启用"处理（宁可不遮蔽也不误伤）。 */
  private async enforced(presetId: string): Promise<boolean> {
    try {
      return await this.deps.isEnforced(presetId)
    } catch (error) {
      this.log('warn', `reading the scope policy for preset "${presetId}" failed: ${errorText(error)}`)
      return false
    }
  }

  /** 在一个 preset 的 standing key 下注入闸门。 */
  private async install(presetId: string, key: object, runtime: RuntimeBindings): Promise<void> {
    try {
      const scope = runtime.createScope(this.deps.ctx, key)
      const provider = new PresetGateProvider(presetId, (cwd) => this.deps.hiddenOf(presetId, cwd))
      let control: { invalidate: () => void } | undefined
      // 通过 scoped ctx 注册：SkillRegistry 把 this.ctx 重绑定到调用者，因此这次
      // 注册落进该 preset 的 layer，而不是 hub 所在的 global layer。
      scope.ctx.skills.registerProvider((given) => {
        control = given
        return provider
      })
      this.injected.set(key, { presetId, scope, ...(control !== undefined ? { control } : {}) })
      this.log('info', `gate attached to preset "${presetId}"`)
    } catch (error) {
      // 单点失败不影响其他 preset，也不影响插件其余功能。
      this.log('warn', `attaching the gate to preset "${presetId}" failed: ${errorText(error)}`)
    }
  }

  /** 拆掉一条注入；scope 销毁会连带清掉其中的 provider 注册。 */
  private async disposeEntry(entry: InjectedEntry): Promise<void> {
    try {
      await entry.scope.dispose()
      this.log('info', `gate detached from preset "${entry.presetId}"`)
    } catch (error) {
      this.log('warn', `detaching the gate from preset "${entry.presetId}" failed: ${errorText(error)}`)
    }
  }

  private activeIds(): string[] {
    return [...new Set([...this.injected.values()].map((entry) => entry.presetId))].sort()
  }

  private mountedIds(runtime: RuntimeBindings): string[] {
    try {
      return [...new Set(runtime.livePresetMounts(this.deps.ctx.root.fiber)
        .filter((mount) => mount.key !== undefined)
        .map((mount) => mount.presetId))].sort()
    } catch {
      return []
    }
  }

  private log(level: 'info' | 'warn', message: string): void {
    if (this.deps.log !== undefined) {
      this.deps.log(level, message)
      return
    }
    if (level === 'warn') console.warn('[skill-hub] ' + message)
    else console.info('[skill-hub] ' + message)
  }
}

/**
 * 动态载入 dsh 的运行时能力。两个包都是**可选**对等依赖：部署里没有（或形状
 * 变了）就返回 undefined，接线器据此整体降级为"策略仅预览"。
 *
 * 0.1.7 起 preset 侧包名从 `dsh-agent-presets` 换成了
 * `dsh-agent-preset-registry`（服务名仍是 `ctx.agentPresets`），`livePresetMounts`
 * 的签名与 `PresetMount.presetId/key` 字段不变。
 * @returns 可用的运行时绑定，或 undefined。
 */
export async function loadScopeRuntime(): Promise<RuntimeBindings | undefined> {
  const [presets, scope] = await Promise.all([
    import('@deepseek-ai/dsh-agent-preset-registry'),
    import('@deepseek-ai/dsh-scope'),
  ])
  if (typeof presets.livePresetMounts !== 'function' || typeof scope.createScope !== 'function') {
    return undefined
  }
  return { livePresetMounts: presets.livePresetMounts, createScope: scope.createScope }
}
