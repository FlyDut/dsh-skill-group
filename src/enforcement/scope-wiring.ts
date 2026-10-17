/**
 * 执行层 · 接线（wiring）：把闸门接到每个 preset 的 standing 作用域上，并管理
 * 它的生命周期。
 *
 * 机制（见 `scope-mechanism.test.ts` 的契约测试）：`dsh-agent-preset-registry` 为每个
 * 被使用的 preset 建立一次 standing mount，并 mint 一个不透明的 scope key；
 * `ctx.skills` 的分层**按该 key 的对象 identity 索引 layer**。因此用**宿主自己的**
 * scoped context 注册 provider，注册就落进该 preset 的层。
 *
 * 为什么不再自己 `import('@deepseek-ai/dsh-scope')` + `createScope`：
 * `dsh-scope` 的 `kScope` 是**模块级 `Symbol()`**。插件与宿主各自解析自己的副本
 * （profile / 全局安装 / 插件 node_modules 三份都见过），用插件的 `createScope`
 * 打上的 tag，宿主的 `scopeOf()` 读不到 —— 注册会静默落进 **global layer**。
 * 而 gate 的 `list()` 又会回调 `ScopeView.snapshot()` → `ctx.skills.snapshot()`，
 * 于是 global 快照在等 gate、gate 又在等同一个 global 快照：**整个 dsh 无报错挂死**
 * （技能目录、模式面板、模型调用全部无限等待）。这不是假设：2026-10 的现场就是
 * 这个死锁。
 *
 * 所以接线改用 `ctx.agentPresets` 服务自己持有的 scoped context（`generations`
 * 里那个由宿主的 `createScope` mint 出来的 `scope.ctx`）：tag 必然与宿主的
 * `scopeOf()` 同源，且不需要任何运行时模块。
 *
 * 这条路径**不修改任何 preset 文件**，所以对部署自带的 system preset
 * （minimal / standard / ptc / cordis，不可写）同样生效。
 *
 * 三点刻意的保守设计：
 *  1. 运行时能力只从 `ctx.agentPresets` 软取，不做跨副本模块 import；任何失败
 *     都降级为"能力不可用"，绝不让缺服务/不兼容把整个插件拖下水。
 *  2. 所有注入与清理都包在 try/catch 里：单个 preset 接线失败只影响它自己。
 *  3. 只有"已挂载"的 preset 能接线。新挂载的 preset 由定时 tick 或面板请求
 *     触发的下一轮 sync 接上（在此之前它按不隔离运行，不会误伤）；拿不到宿主
 *     scoped context 时宁可不接线，也绝不在 global layer 里注册。
 */

import type { Context, Fiber } from '@deepseek-ai/cordis'
import { errorText } from '../error-text.ts'
import type { ScopeSkillMeta } from '../domain/scope-view.ts'
import { GATE_PROVIDER_NAME, PresetGateProvider } from './preset-gate.ts'

/** `livePresetMounts` 返回值的结构视图。 */
export interface PresetMountLike {
  /** 该 standing mount 属于哪个 preset。 */
  readonly presetId: string
  /** standing scope key；正在拆卸的记录可能缺省。 */
  readonly key?: object
  /**
   * 宿主 mint 出来的、带该 key tag 的 scoped context。
   * 只有它能让注册落进 preset 的 layer；缺省表示这个 mount 不可接线。
   */
  readonly ctx?: Context
}

/** 运行时能力。真实实现来自宿主服务，测试可注入替身。 */
export interface RuntimeBindings {
  /**
   * 列出当前仍安装着的 preset standing mount。
   * @param within - 限定在某个 fiber 子树内；服务路径按 preset 名单枚举，忽略它。
   */
  livePresetMounts: (within?: Fiber) => Promise<readonly PresetMountLike[]>
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
  /** 只拆掉 hub 自己这一条注册（子 fiber / provider 注册），绝不动宿主 preset 的 scope。 */
  dispose: () => void | Promise<void>
  /** 注册表借出的失效句柄；scope 被销毁后可能已失效，故调用点一律 try/catch。 */
  control?: { invalidate: () => void }
}

/** 一张 provider 表的只读视图（NamedEntries 的 `has`）。 */
interface ProviderTableLike {
  has: (name: string) => boolean
}

/** SkillRegistry.layer 表的结构视图：只用于注册落点自检。 */
interface SkillLayersLike {
  global?: { providers?: ProviderTableLike }
  scoped?: { get: (key: object) => { providers?: ProviderTableLike } | undefined }
}

/**
 * 自检 gate 这次注册到底落在哪一层。
 *
 * 这是对"跨副本 dsh-scope 的 Symbol 不匹配 → 静默落进 global layer → 与
 * ScopeView 互等挂死"的**运行时保险**：注册完立刻读注册表的 layer 表，
 * 落错就回滚。结构读不到（宿主换了存储形状）时返回 undefined，交给
 * ScopeView 的重入守卫兜底，绝不影响正常接线。
 * @param skills - 子 ctx 上解析到的 SkillRegistry 服务。
 * @param key - 本次接线目标的 standing scope key。
 * @returns 'scoped'（正确）、'global'（危险）或 undefined（无法判断）。
 */
function gateLayerOf(skills: unknown, key: object): 'scoped' | 'global' | undefined {
  const layers = (skills as { layers?: SkillLayersLike } | null | undefined)?.layers
  if (layers === undefined) return undefined
  if (layers.scoped?.get(key)?.providers?.has(GATE_PROVIDER_NAME) === true) return 'scoped'
  if (layers.global?.providers?.has(GATE_PROVIDER_NAME) === true) return 'global'
  return undefined
}

/**
 * 把闸门接到 preset 作用域上的接线器。一个 hub 实例持有一个。
 */
export class PresetWiring {
  private readonly injected = new Map<object, InjectedEntry>()
  /** 已解析的运行时能力。**只缓存成功**：服务晚到（软注入）时下一轮 sync 能跟上。 */
  private bindings: RuntimeBindings | undefined
  /** 当前不可用原因；与上一次相同时不重复刷日志。 */
  private unavailable: string | undefined
  /** 上一次记录的不可用原因（日志去重）。 */
  private lastReason: string | undefined
  /** 正在进行的一轮 sync；并发调用共享它而不重复注入。 */
  private syncing: Promise<void> | undefined
  /** 已警告过"mount 没有 scoped ctx"的 preset（避免 5 秒 tick 刷屏）。 */
  private readonly warnedNoCtx = new Set<string>()
  /** 已警告过 global layer 里有 gate 残留（日志去重）。 */
  private warnedGlobalGate = false
  /** 已警告过无法自检注册落点（日志去重）。 */
  private warnedUnverifiable = false
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
    return { available: true, active: this.activeIds(), mounted: await this.mountedIds(runtime) }
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
      mounts = await runtime.livePresetMounts(this.deps.ctx.root.fiber)
    } catch (error) {
      this.log('warn', `enumerating preset mounts failed: ${errorText(error)}`)
      return
    }

    const live = new Map<object, PresetMountLike>()
    for (const mount of mounts) {
      if (mount.key !== undefined) live.set(mount.key, mount)
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
    for (const [key, mount] of live) {
      if (this.injected.has(key)) continue
      if (!await this.enforced(mount.presetId)) continue
      await this.install(mount)
    }
  }

  /**
   * 解析运行时能力。**不缓存失败**：`agentPresets` 是软注入，服务晚到时
   * 下一轮 sync 必须能重新探测，否则整个进程生命周期都停在"不可用"。
   */
  private async load(): Promise<RuntimeBindings | undefined> {
    if (this.bindings !== undefined) return this.bindings
    try {
      const runtime = await this.deps.runtime()
      if (runtime === undefined) {
        this.markUnavailable('agent-presets service is not mounted (or does not expose acquireScope)')
        return undefined
      }
      this.bindings = runtime
      this.markAvailable()
      return runtime
    } catch (error) {
      this.markUnavailable(errorText(error))
      return undefined
    }
  }

  /** 记录不可用原因；同一原因只打一次日志。 */
  private markUnavailable(reason: string): void {
    this.unavailable = reason
    if (this.lastReason === reason) return
    this.lastReason = reason
    this.log('warn', 'preset scope wiring unavailable: ' + reason)
  }

  private markAvailable(): void {
    this.unavailable = undefined
    this.lastReason = undefined
  }

  /** global layer 里已有 gate 残留时提示一次（本实例无法注销别人的注册）。 */
  private warnGlobalGateOnce(): void {
    if (this.warnedGlobalGate) return
    this.warnedGlobalGate = true
    this.log(
      'warn',
      `a "${GATE_PROVIDER_NAME}" provider is already present in the GLOBAL skill layer; this hub cannot remove it — restart dsh to clear it. Preset gates are still attached to their scoped layers.`,
    )
  }

  /** 宿主注册表结构不可自检时提示一次：仍有 ScopeView 的重入守卫兜底。 */
  private warnUnverifiableOnce(): void {
    if (this.warnedUnverifiable) return
    this.warnedUnverifiable = true
    this.log(
      'warn',
      'cannot verify the gate registration layer on this dsh build; relying on the catalog re-entrancy guard to prevent a self-deadlock',
    )
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

  /** 在一个 preset 的 standing scope 上注入闸门。 */
  private async install(mount: PresetMountLike): Promise<void> {
    const { presetId } = mount
    const key = mount.key
    if (key === undefined) return
    // 没有宿主 scoped ctx 就不接线：用别的 dsh-scope 副本 mint scope 会把注册
    // 静默落到 global layer，进而让技能目录/模型调用全部挂死（见文件头）。
    if (mount.ctx === undefined) {
      if (!this.warnedNoCtx.has(presetId)) {
        this.warnedNoCtx.add(presetId)
        this.log('warn', `preset "${presetId}" is mounted but exposes no scoped context; gate skipped`)
      }
      return
    }
    this.warnedNoCtx.delete(presetId)

    const provider = new PresetGateProvider(presetId, (cwd) => this.deps.hiddenOf(presetId, cwd))
    let providerDispose: (() => void) | undefined
    let failure: unknown
    let failureReported = false
    let fiber: Fiber | undefined
    const reportFailure = (error: unknown): void => {
      failure = error
      if (failureReported) return
      failureReported = true
      // 单点失败不影响其他 preset，也不影响插件其余功能。
      this.log('warn', `attaching the gate to preset "${presetId}" failed: ${errorText(error)}`)
    }
    // 先建 entry 再挂子插件：cordis 的 apply 可能在 `plugin()` 返回之后才执行，
    // control 必须在 apply 里回填到**同一个对象**上，invalidate 才能看到它。
    const entry: InjectedEntry = {
      presetId,
      // 子 fiber 拥有这次注册：销毁它即注销 provider 并失效注册表缓存。
      dispose: () => {
        try {
          providerDispose?.()
        } catch {
          // provider 注册可能已随 preset revision 一起销毁。
        }
        return fiber?.dispose()
      },
    }
    try {
      // 宿主的 scoped ctx 自己不能取 `skills`（它的 fiber 没有声明 inject，
      // 且 skills 服务不在它的祖先链上）。挂一个只声明 inject:['skills'] 的
      // 子插件：子 ctx 既继承宿主的 scope tag，又能解析 skills，于是
      // registerProvider 会落进该 preset 的 layer。
      fiber = mount.ctx.plugin({
        inject: ['skills'],
        apply: (scoped: Context) => {
          try {
            // 注册前先看 global 里有没有同名残留（另一个 hub 实例 / 旧代码留下的）。
            const before = gateLayerOf(scoped.skills, key)
            providerDispose = scoped.skills.registerProvider((given) => {
              entry.control = given
              return provider
            })
            const after = gateLayerOf(scoped.skills, key)
            if (after === 'global' && before !== 'global') {
              // 本次注册落错层：立刻撤销。留在 global 会让 gate 的 list() 与
              // 目录快照互相等待，整个进程无报错挂死。
              try {
                providerDispose?.()
              } catch {
                // 回滚失败也只是多一个 provider；至少不再由本实例继续叠加。
              }
              providerDispose = undefined
              throw new Error(`gate "${GATE_PROVIDER_NAME}" was registered into the GLOBAL skill layer instead of the preset scope; rolled back`)
            }
            if (before === 'global') this.warnGlobalGateOnce()
            if (after === undefined && before === undefined) this.warnUnverifiableOnce()
          } catch (error) {
            reportFailure(error)
            this.injected.delete(key)
            queueMicrotask(() => { void fiber?.dispose() })
          }
        },
      })
    } catch (error) {
      reportFailure(error)
    }

    if (failure !== undefined) {
      if (fiber !== undefined) void fiber.dispose()
      return
    }
    this.injected.set(key, entry)
    this.log('info', `gate attached to preset "${presetId}"`)
  }

  /** 拆掉一条注入：只注销 hub 自己的子 fiber，宿主 preset 的 scope 不动。 */
  private async disposeEntry(entry: InjectedEntry): Promise<void> {
    try {
      await entry.dispose()
      this.log('info', `gate detached from preset "${entry.presetId}"`)
    } catch (error) {
      this.log('warn', `detaching the gate from preset "${entry.presetId}" failed: ${errorText(error)}`)
    }
  }

  private activeIds(): string[] {
    return [...new Set([...this.injected.values()].map((entry) => entry.presetId))].sort()
  }

  private async mountedIds(runtime: RuntimeBindings): Promise<string[]> {
    try {
      return [...new Set((await runtime.livePresetMounts(this.deps.ctx.root.fiber))
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

/** 一条借出的 revision 租约（只取接线需要的 `key`）。 */
interface RevisionLease {
  /** 该 revision 的 standing scope key。 */
  readonly key?: unknown
}

/** `ctx.agentPresets` 的结构视图：接线只需要这两项（外加内部的 revision 表）。 */
interface AgentPresetsServiceLike {
  /** 全部已声明的 preset，含激活失败的（`list` 自己不抛错）。 */
  list: () => Promise<readonly { id?: unknown }[]>
  /** 借出某个**已挂载** preset 的 standing scope key。 */
  acquireScope: (id?: string) => Promise<unknown>
}

/** 注册表内部的一条 revision 记录（0.1.7 / 0.2.x 形状一致，只取接线需要的部分）。 */
interface GenerationLike {
  /** 宿主 `createScope` mint 出来的作用域；`ctx` 已带该 revision 的 scope tag。 */
  scope?: { ctx?: Context }
}

/**
 * 用注册表服务合成 `livePresetMounts`：逐个探测 preset 的挂载状态，并带上
 * 宿主 mint 的 scoped context。
 *
 * `acquireScope(id)` 对**已挂载**的 preset 借出一个 revision 租约，租约里的
 * `key` 就是该 preset 的 standing scope key；未挂载或激活失败的 preset 会抛
 * `agent-preset/invalid`，据此判定"挂载中"。
 *
 * scoped context 取自注册表内部按同一个 key 索引的 revision 记录：那个 ctx 是
 * **宿主的** `createScope` 创建的，tag 与宿主 `scopeOf()` 同源。绝不能用插件自己
 * import 的 dsh-scope 去 mint scope —— 副本不同 → Symbol 不同 → 注册落进 global
 * layer → 与 ScopeView 的回读形成死锁（见文件头）。
 *
 * 只借读数、立即归还租约：长期持有会顶住注册表的引用计数，让已退休的 revision
 * 无法回收；而只要 preset 仍在挂载中，那个 standing key 就一直有效。
 * @param service - `ctx.agentPresets`（缺席或形状不符时返回 undefined）。
 * @returns 枚举函数，或服务不可用时的 undefined。
 */
export function serviceMounts(service: unknown): RuntimeBindings['livePresetMounts'] | undefined {
  const candidate = service as Partial<AgentPresetsServiceLike> | null | undefined
  if (candidate === null || candidate === undefined) return undefined
  if (typeof candidate.list !== 'function' || typeof candidate.acquireScope !== 'function') return undefined
  // 注册表的 revision 表是普通字段（TS private 不产生 #private）。拿不到就
  // 宁可不接线：没有宿主 scoped ctx 的 gate 只可能落到 global layer。
  const generations = (candidate as { generations?: unknown }).generations
  if (!(generations instanceof Map)) return undefined
  const scopedCtx = (key: object): Context | undefined => {
    const generation = generations.get(key) as GenerationLike | undefined
    return generation?.scope?.ctx
  }
  return async () => {
    let declared: readonly { id?: unknown }[]
    try {
      declared = await candidate.list!()
    } catch {
      return []
    }
    if (!Array.isArray(declared)) return []
    const mounts: PresetMountLike[] = []
    for (const preset of declared) {
      const id = preset?.id
      if (typeof id !== 'string' || id === '') continue
      try {
        const lease = await candidate.acquireScope!(id) as (RevisionLease & Partial<AsyncDisposable>) | undefined
        let mount: PresetMountLike | undefined
        try {
          const key = lease?.key
          if (typeof key === 'object' && key !== null) {
            const ctx = scopedCtx(key)
            mount = { presetId: id, key, ...(ctx !== undefined ? { ctx } : {}) }
          }
        } finally {
          // 先读 ctx 再归还租约：revision 仍挂载时 ctx 一直有效。
          await lease?.[Symbol.asyncDispose]?.()
        }
        if (mount !== undefined) mounts.push(mount)
      } catch {
        // 未挂载／激活失败的 preset：retain 抛错，本就不是可接线的对象。
      }
    }
    return mounts
  }
}

/**
 * 读取宿主提供的接线能力。**不再 import 任何 dsh 包**：所有数据都来自
 * `ctx.agentPresets`（软注入，每次现读，服务晚到或热重载都能跟上）。
 *
 * 服务缺席、形状不符或拿不到内部 revision 表时返回 undefined，接线器整体降级为
 * "策略仅预览"——绝不冒把 provider 注册进 global layer 的风险。
 * @param options.presets - `ctx.agentPresets` 软注入的读取器。
 * @returns 可用的运行时绑定，或 undefined。
 */
export async function loadScopeRuntime(options: { presets: () => unknown }): Promise<RuntimeBindings | undefined> {
  const mounts = serviceMounts(options.presets())
  return mounts === undefined ? undefined : { livePresetMounts: mounts }
}
