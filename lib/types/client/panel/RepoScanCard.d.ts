/**
 * RepoScanCard — 扫描结果归属卡片：扫描中/错误/就绪（搜索+过滤+分页+
 * 勾选导入+进度+结果）都包在这里。搜索/过滤/分页是卡片级本地状态，
 * 随卡片挂载而生、关闭而灭。从 MarketView.tsx 原样搬出，渲染逻辑不变。
 */
import { type JSX } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function RepoScanCard(props: {
    hub: SkillHubState;
}): JSX.Element | null;
