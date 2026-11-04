import { useDeviceThemeStore, type DeviceThemePref } from '../../../../store/deviceThemeStore';
import { useThemeModeStore, resolveActiveMode } from '../../../../utils/themeModeCache';
import { useT } from '../../../../i18n';

export interface DeviceThemeModel {
    title: string;
    desc: string;
    pref: DeviceThemePref;
    setPref: (p: DeviceThemePref) => void;
    options: { key: DeviceThemePref; label: string }[];
    /** Aktuelle Wahl als Wort, z. B. "Automatisch" (Wert in der Übersichtszeile). */
    prefLabel: string;
    /** Hinweis unter der Gruppe, nur bei Automatisch (sonst null). */
    hint: string | null;
}

/** Gleiche Quellen und Texte wie das heutige Widget, nur ohne Darstellung. */
export function useDeviceThemeModel(): DeviceThemeModel {
    const t = useT();
    const pref = useDeviceThemeStore((s) => s.pref);
    const systemDark = useDeviceThemeStore((s) => s.systemDark);
    const setPref = useDeviceThemeStore((s) => s.setPref);
    const dpMode = useThemeModeStore((s) => s.mode);

    const modeName = (dark: boolean) => t(dark ? 'deviceTheme.dark' : 'deviceTheme.light');
    const dpName = dpMode ? modeName(dpMode === 'dark') : null;
    const deviceMode = resolveActiveMode('auto', null, systemDark, false);

    const options: DeviceThemeModel['options'] = [
        { key: 'auto', label: t('deviceTheme.auto') },
        { key: 'light', label: t('deviceTheme.light') },
        { key: 'dark', label: t('deviceTheme.dark') },
    ];
    const hint =
        pref === 'auto'
            ? dpName
                ? t('deviceTheme.dpActive', { mode: dpName })
                : t('deviceTheme.autoHint', { mode: modeName(deviceMode === 'dark') })
            : null;

    return {
        title: t('deviceTheme.title'),
        desc: t('deviceTheme.desc'),
        pref,
        setPref,
        options,
        prefLabel: options.find((o) => o.key === pref)?.label ?? '',
        hint,
    };
}
