/**
 * skill-hub — host half，也是整个插件的组装点。
 *
 * 插件要完成的任务只有一句：**策展本地技能在 DSH 里的呈现与可用性**。
 * 代码按四条职责链分层，数据只向下流：
 *
 *   ① 发现 Discovery     技能事实从哪来                    skillfs/ · provider.ts
 *                        只读扫描，不产生任何副作用。
 *   ② 策展 Curation      用户希望技能世界长什么样           store/ · domain/ · protocol/
 *                        纯数据 + 纯函数（展开与判定可穷举单测）。
 *   ③ 执行 Enforcement   把策展意图落到运行时               enforcement/
 *                        副作用全部集中在这里：
 *                        · Disabled  = 重命名发现文件（全局硬禁用，routes/catalog.ts）
 *                        · Scope     = 往 preset 的 standing 作用域注入闸门（模式级软屏蔽）
 *   ④ 呈现 Surface       让用户表达与看见                   routes/ · client/
 *
 * 本文件只做组装：把 store（②）装配进 ScopeView（②的判定），把 ScopeView 与
 * 运行时能力装配成 PresetWiring（③），再把二者作为路由依赖交给 makeRoutes（④）。
 * 它自己不实现任何业务规则，具体装配分别放在
 * 同目录的 config.ts（配置面）、scope-assembly.ts（模式隔离）、stats-wiring.ts
 * （调用统计）与 startup.ts（启动期对账）。
 *
 * 浏览器半边（./client）渲染设置页里的面板与侧栏入口。全部能力都走官方 NPM
 * SDK 包，不改 dsh 源码，也不写用户的 preset 文件。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.ts';
export { Config, ENTRY_ID } from './config.ts';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "skill-hub";
/**
 * Services required before the skill-hub surfaces can mount. `settings` 刻意
 * **不在这里**：0.1.7 的配置读数走插件自己的 volatile 引用，只有真要读写设置
 * 服务时才软取（`ctx.get('settings')`）——部署没有该服务时插件照常运行。
 * `systemPrompt` 同样不在：本插件不向系统提示注入任何内容。
 */
export declare const inject: string[];
/**
 * Mount the skill hub routes and its skill provider.
 * @param ctx - host plugin context carrying webServer/skills.
 * @param config - the Loader entry's volatile config refs (dsh 0.1.7 settings model).
 */
export declare function apply(ctx: Context, config?: Config): void;
