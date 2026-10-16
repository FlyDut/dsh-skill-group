/**
 * Scenes tab: user tag groups (one card per scene with the tri-state switch
 * and edit entry) plus the new-scene form. Scenes are the user's own
 * enable/disable units (e.g. a Godot scene vs a Java scene); upstream repos
 * are managed in the sources tab.
 */
import { type JSX } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export declare function ScenesView(props: {
    hub: SkillHubState;
}): JSX.Element;
