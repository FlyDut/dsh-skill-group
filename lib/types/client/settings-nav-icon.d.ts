/**
 * The settings shell renders section nav icons from a hard-coded id map and
 * exposes no registrant icon option, so the skill-hub section falls back to
 * the generic gear. This scoped DOM patch swaps in the official skill icon
 * whenever the settings dialog re-renders.
 */
/** Swap the settings nav gear for the skill icon and keep it in sync. */
export declare function applySettingsNavIcon(): () => void;
