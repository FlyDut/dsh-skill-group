/**
 * Group-header usage summary: total invocation count chip + the group's most
 * recent last-used time. Honours the showGroupSummary config switch.
 */
import type { JSX } from 'react';
import type { HubConfig } from '../../protocol.ts';
/** The narrowed hub surface one group summary consumes. */
interface GroupSummaryProps {
    /** The group's member skill names. */
    members: readonly string[];
    /** skillName → usage stats. */
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    /** Effective hub config; null while it has not loaded. */
    hubConfig: HubConfig | null;
}
export declare function GroupSummary(props: GroupSummaryProps): JSX.Element;
export {};
