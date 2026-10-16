/**
 * Source check-status badges (up-to-date / updated / deleted / error /
 * throttled / unverified). Shared by the panel's source-group headers and
 * the skill detail view.
 *
 * In the group headers the badge doubles as the re-check affordance: it
 * shows a clickable "检查更新" badge before the first check, "检查中…" while
 * checking, and the status badge (clickable again to re-check) afterwards.
 */
import type { JSX } from 'react';
import type { SourceCheckResult } from '../../protocol.ts';
export declare function SourceStatusBadge(props: {
    check: SourceCheckResult | undefined;
    /** 正在检查该来源（显示「检查中…」）。 */
    checking?: boolean;
    /** 提供后徽章区域可点击触发检查（组头用；详情页有自己的检查按钮）。 */
    onCheck?: () => void;
}): JSX.Element | null;
