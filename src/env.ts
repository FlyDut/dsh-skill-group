/**
 * 进程环境路径：DSH 主目录与 agents 目录。
 *
 * 只依赖 node 内置模块，位于依赖图最底层——发现层（skillfs/）、策展层
 * （store/）与组装点（index.ts）都要解析这两个目录。此前 `dshHome` 定义在
 * `store/paths.ts`，逼得 skillfs 反向去引 store 的聚合 barrel。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Resolve the agents home directory (the user-agents root base). */
export function agentsHome(): string {
  return process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
}
