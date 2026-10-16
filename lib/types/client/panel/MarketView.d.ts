/**
 * Market tab: one unified market list — built-in catalog entries (add
 * button while not yet added) and the user's market sources (full state
 * badges + actions once added, plus custom sources), with check-all and
 * update-all actions and the repo scan result with the importable checklist.
 * 行渲染在 MarketSourceRow，扫描卡片在 RepoScanCard，数字格式在 market-format。
 */
import { type JSX } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function MarketView(props: {
    hub: SkillHubState;
}): JSX.Element;
