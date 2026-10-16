/**
 * Sources tab: the flat skill list or the grouped view — one card per upstream
 * collection with check/sync actions and the tri-state switch, plus the
 * uncategorized "personal" card for skills that no source record claims.
 */
import { type JSX } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function SourcesView(props: {
    hub: SkillHubState;
}): JSX.Element;
