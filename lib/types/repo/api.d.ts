/**
 * GitHub 仓库读取：仓库树、发布标签、星标/下载量、分支与提交查询。
 * 统一走 repo/github-client.ts 的请求层（鉴权、ETag 缓存、错误映射）。
 * 从 repo.ts 抽出。
 */
import type { RepoTreeItem } from './types.ts';
export declare function loadRepoTree(repo: string, ref?: string, fetchImpl?: typeof fetch): Promise<{
    ref: string;
    tree: RepoTreeItem[];
    truncated: boolean;
}>;
/**
 * The latest non-prerelease release tag of a repo, or undefined when the
 * repo has no releases (GitHub's /releases/latest skips prereleases/drafts).
 */
export declare function getLatestReleaseTag(repo: string, fetchImpl?: typeof fetch): Promise<string | undefined>;
/** Stars + release-asset downloads of a repo (two GitHub API requests). */
export declare function getRepoStats(repo: string, fetchImpl?: typeof fetch): Promise<{
    stars: number;
    downloads: number;
}>;
/** Release tags of a repo, newest first (skips drafts, keeps prereleases). */
export declare function listRepoReleases(repo: string, fetchImpl?: typeof fetch): Promise<string[]>;
/** Branch names of a repo, default branch first (one GitHub API request). */
export declare function listRepoBranches(repo: string, fetchImpl?: typeof fetch): Promise<string[]>;
/**
 * Fetch the latest commit of a repo (explicit ref or default branch) with
 * its tree SHA. One GitHub API request; the tree SHA is used to diff the
 * upstream tree on change (one extra request).
 */
export declare function getLatestCommit(repo: string, ref?: string, fetchImpl?: typeof fetch): Promise<{
    commitSha: string;
    treeSha: string;
}>;
/** Load the recursive git tree at an explicit tree SHA (one API request). */
export declare function loadRepoTreeAt(repo: string, treeSha: string, fetchImpl?: typeof fetch): Promise<RepoTreeItem[]>;
