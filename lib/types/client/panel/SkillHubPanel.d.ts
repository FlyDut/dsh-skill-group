/**
 * The skill hub panel: catalog grouped by tags + source collections, search
 * and filter in one row, per-group tri-state switches with conflict dialogs,
 * upstream source tracking (check / sync; upstream deletions are only
 * reported), market sources, switched-off skills with a one-click re-enable,
 * detail inspection, and the new-skill scaffold dialog — opened from the
 * header row, in the same action cluster as the edit toggle.
 *
 * Thin shell: state and flows live in useSkillHub, the tab contents live in
 * SourcesView / ScenesView / MarketView, the dialog family lives in
 * dialogs.tsx, and their wiring lives in PanelDialogs.tsx. This component
 * owns only the shared chrome (header, banners, filter bar, shared sections)
 * and the view routing. It keeps a single piece of local state (the
 * filter-panel toggle); every flow hook runs unconditionally at the top of
 * useSkillHub, so the detail / tag-editor / scope-editor / workspace-editor
 * early returns below stay inside the rules of hooks.
 */
import type { SkillHubApi } from '../api.ts';
export interface SkillHubPanelProps {
    api: SkillHubApi;
}
export declare function SkillHubPanel(props: SkillHubPanelProps): React.JSX.Element;
