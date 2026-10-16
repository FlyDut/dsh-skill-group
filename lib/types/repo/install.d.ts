/**
 * 技能目录下载与落地：单文件下载（raw 优先、contents 兜底）、整目录
 * 临时目录 + 原子 rename、启动时清理残留导入临时目录。
 * 从 repo.ts 抽出。
 */
import type { RepoSkillEntry } from '../protocol.ts';
import type { RepoFile } from './types.ts';
/**
 * Download one GitHub file as a buffer. Tries raw.githubusercontent.com
 * first (no API quota); on any failure falls back to the api.github.com
 * contents endpoint with the raw media type (rate-limited, but reachable
 * from networks that block the raw host).
 */
export declare function downloadGitHubFile(repo: string, ref: string, path: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<Buffer>;
/**
 * Download a full skill directory into a temporary dir, validate SKILL.md,
 * then atomically rename it into place. The target root is created when missing.
 * Callers pass a target root and a skill entry plus its collected files.
 */
export declare function downloadRepoSkill(repo: string, ref: string, entry: RepoSkillEntry, files: readonly RepoFile[], targetRoot: string, fetchImpl?: typeof fetch, signal?: AbortSignal, onProgress?: (bytes: number, file: string) => void): Promise<{
    targetDir: string;
    skillPath: string;
}>;
/**
 * 启动时扫描并清理残留的 `.*.import-*` 临时目录（Issue #3 第4点）。
 * 越积越多的点前缀目录不会显示为 skill，但会占空间，尽早回收。
 */
export declare function cleanupLeftoverImportDirs(targetRoot: string): Promise<number>;
