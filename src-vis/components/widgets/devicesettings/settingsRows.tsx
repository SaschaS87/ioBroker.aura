import type { ComponentType } from 'react';
import { SunMoon, type LucideIcon } from 'lucide-react';
import type { TranslationKey } from '../../../i18n';
import { AppearancePage, useAppearanceValue } from './AppearancePage';

/** Eine Zeile der Übersicht samt ihrer Unterseite. Weitere Einstellungen: hier eintragen. */
export interface SettingsRow {
    key: string;
    icon: LucideIcon;
    iconColor: string;
    /** i18n-Schlüssel: Name der Zeile und Titel der Unterseite. */
    label: TranslationKey;
    /** Hook: Wert rechts in der Zeile (aktuelle Wahl als Wort). */
    useValue: () => string;
    Page: ComponentType<{ inert: boolean }>;
}

const appearanceRow: SettingsRow = {
    key: 'appearance',
    icon: SunMoon,
    iconColor: '#0a84ff',
    label: 'deviceTheme.title',
    useValue: useAppearanceValue,
    Page: AppearancePage,
};

export const SETTINGS_ROWS: SettingsRow[] = [appearanceRow];
