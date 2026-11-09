import { useDeviceThemeStore, type DeviceThemePref } from '../../../store/deviceThemeStore';
import { useThemeModeStore, resolveActiveMode } from '../../../utils/themeModeCache';
import { useT } from '../../../i18n';
import { IosFootnote } from '../../common/ios';
import { PickList } from './parts';

const KEYS = {
    auto: 'deviceTheme.auto',
    light: 'deviceTheme.light',
    dark: 'deviceTheme.dark',
} as const;
const ORDER: DeviceThemePref[] = ['auto', 'light', 'dark'];

/** Aktuelle Wahl als Wort (Wert in der Übersichtszeile), z. B. "Automatisch". */
export function useAppearanceValue(): string {
    const t = useT();
    const pref = useDeviceThemeStore((s) => s.pref);
    return t(KEYS[pref]);
}

/** Unterseite "Darstellung": Automatisch / Hell / Dunkel, mit Hinweis unter der Gruppe. */
export function AppearancePage({ inert }: { inert: boolean }) {
    const t = useT();
    const pref = useDeviceThemeStore((s) => s.pref);
    const systemDark = useDeviceThemeStore((s) => s.systemDark);
    const setPref = useDeviceThemeStore((s) => s.setPref);
    const dpMode = useThemeModeStore((s) => s.mode);

    const modeName = (dark: boolean) => t(dark ? 'deviceTheme.dark' : 'deviceTheme.light');
    // Unabhängig vom Screenshot-Modus: hier zählt, was das Gerät melden würde.
    const dpName = dpMode ? modeName(dpMode === 'dark') : null;
    const deviceMode = resolveActiveMode('auto', null, systemDark, false);

    const hint =
        pref === 'auto'
            ? dpName
                ? t('deviceTheme.dpActive', { mode: dpName })
                : t('deviceTheme.autoHint', { mode: modeName(deviceMode === 'dark') })
            : null;

    return (
        <>
            <PickList
                label={t('deviceTheme.title')}
                options={ORDER.map((key) => ({ key, label: t(KEYS[key]) }))}
                value={pref}
                onPick={setPref}
                inert={inert}
            />
            <IosFootnote desc={t('deviceTheme.desc')} hint={hint} />
        </>
    );
}
