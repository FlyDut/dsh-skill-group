/**
 * Shared chrome for the plugin settings card, aligned with the official
 * dsh-client-ui-settings-plugins PluginCard design language: the same tokens,
 * disclosure header, field rhythm, and copy. Renders nothing while the
 * namespace is unavailable — a deployment that does not compose the owning
 * plugin should show no trace of it.
 */
import { type ReactElement } from 'react';
import type { HubKey } from './locales.ts';
import type { CardShell } from './settings-form.ts';
/** Card-level chrome props. */
interface PluginSettingsCardProps {
    /** Locale translator for the owning plugin's namespace (its own key domain). */
    t: (key: HubKey) => string;
    /** Locale key of the card title. */
    titleKey: HubKey;
    /** Locale key of the card description. */
    descriptionKey: HubKey;
    /** 插件自身版本（可选）：显示在标题旁的小徽标；缺省不渲染。 */
    version?: string;
    /** The form shell state. */
    state: CardShell;
    onSave: () => void;
    onDiscard: () => void;
    children?: ReactElement | ReactElement[];
}
/**
 * Render one plugin settings card.
 * @param props - the plugin's copy keys, its form state, and its controls.
 * @returns the card, or nothing while the namespace is still loading.
 */
export declare function PluginSettingsCard(props: PluginSettingsCardProps): ReactElement | null;
/** Fields every staged control shares: copy, draft text, override state and actions. */
interface FieldBaseProps {
    label: string;
    hint: string;
    overriddenLabel: string;
    resetLabel: string;
    disabled: boolean;
    /** Draft text; '' means the field inherits its default. */
    text: string;
    overridden: boolean;
    onEdit: (text: string) => void;
    onReset: () => void;
}
/**
 * A compact sliding switch for the card's master enable/disable control.
 * An empty text value means the field inherits its default; the switch still
 * reflects the effective default and becomes an explicit override on click.
 */
type SwitchFieldProps = FieldBaseProps;
export declare function SwitchField(props: SwitchFieldProps): ReactElement;
/** One staged color field: a native color picker plus the hex draft text. */
interface ColorFieldProps extends FieldBaseProps {
    id: string;
    inheritLabel: string;
    /** The default color the picker shows while inheriting (per-field). */
    defaultColor: string;
}
export declare function ColorField(props: ColorFieldProps): ReactElement;
/**
 * One staged secret field: a password input that never echoes the stored
 * value. Shows a "set" state via the overridden badge; Reset unsets it.
 */
interface SecretFieldProps extends FieldBaseProps {
    id: string;
    /** Placeholder shown while empty (never the stored token). */
    placeholder: string;
    invalid?: boolean;
}
export declare function SecretField(props: SecretFieldProps): ReactElement;
/** One staged numeric field: a numeric draft text input with inherit/reset semantics. */
interface NumberFieldProps extends FieldBaseProps {
    id: string;
    /** Placeholder shown while the field inherits its default. */
    inheritLabel: string;
    invalid?: boolean;
}
export declare function NumberField(props: NumberFieldProps): ReactElement;
export {};
