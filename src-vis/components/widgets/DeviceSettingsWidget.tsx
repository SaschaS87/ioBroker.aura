import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Monitor, Moon, Sun, SunMoon } from 'lucide-react';
import { useDeviceThemeStore, type DeviceThemePref } from '../../store/deviceThemeStore';
import { useThemeModeStore, resolveActiveMode } from '../../utils/themeModeCache';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';

// Entwurfs-Umschalter: nur im Dev-Build. Im Pi-Build faellt der Ausdruck zur
// Kompilierzeit auf null, der Import verschwindet samt Ordner preview/.
const DeviceSettingsPreview = import.meta.env.DEV
    ? React.lazy(() => import('./devicesettings/preview/DeviceSettingsPreview'))
    : null;

/**
 * Geräte-Einstellungen: Hell/Dunkel für genau dieses Gerät (Feature 28).
 * Die Wahl steht nur im Browser-Speicher (deviceThemeStore) und wandert nie nach
 * ioBroker. Im Editor und im Admin ist das Widget eine reine Vorschau (wie das
 * Menü-Widget), damit dort nichts versehentlich umgestellt wird.
 */
export function DeviceSettingsWidget({ editMode }: WidgetProps) {
    const inAdmin = useLocation().pathname.startsWith('/admin');
    const inert = editMode || inAdmin;
    if (DeviceSettingsPreview) {
        return (
            <Suspense fallback={<IstAufbau inert={inert} />}>
                <DeviceSettingsPreview inert={inert} ist={<IstAufbau inert={inert} />} />
            </Suspense>
        );
    }
    return <IstAufbau inert={inert} />;
}

/** Heutiger Aufbau, unveraendert (Dreier-Schalter in einer Karte). */
function IstAufbau({ inert }: { inert: boolean }) {
    const t = useT();

    const pref = useDeviceThemeStore((s) => s.pref);
    const systemDark = useDeviceThemeStore((s) => s.systemDark);
    const setPref = useDeviceThemeStore((s) => s.setPref);
    const dpMode = useThemeModeStore((s) => s.mode);

    const modeName = (dark: boolean) => t(dark ? 'deviceTheme.dark' : 'deviceTheme.light');
    // Unabhängig vom Screenshot-Modus: hier zählt, was das Gerät melden würde.
    const dpName = dpMode ? modeName(dpMode === 'dark') : null;
    const deviceMode = resolveActiveMode('auto', null, systemDark, false);

    const options: { key: DeviceThemePref; label: string; icon: React.ReactNode }[] = [
        { key: 'auto', label: t('deviceTheme.auto'), icon: <SunMoon size={16} /> },
        { key: 'light', label: t('deviceTheme.light'), icon: <Sun size={16} /> },
        { key: 'dark', label: t('deviceTheme.dark'), icon: <Moon size={16} /> },
    ];

    return (
        <div className="flex flex-col gap-3 h-full min-w-0" data-testid="device-settings">
            <div>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Monitor size={16} style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-sm font-semibold">{t('deviceTheme.title')}</span>
                </div>
                <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {t('deviceTheme.desc')}
                </p>
            </div>
            <div
                role="group"
                aria-label={t('deviceTheme.title')}
                className="grid grid-cols-3 gap-1 p-1 rounded-xl"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            >
                {options.map((o) => {
                    const active = pref === o.key;
                    return (
                        <button
                            key={o.key}
                            type="button"
                            aria-pressed={active}
                            data-pref={o.key}
                            disabled={inert}
                            onClick={() => setPref(o.key)}
                            className="flex flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors"
                            style={{
                                minHeight: 44,
                                padding: '6px 4px',
                                cursor: inert ? 'default' : 'pointer',
                                background: active ? 'var(--accent)' : 'transparent',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: 'none',
                            }}
                        >
                            {o.icon}
                            <span>{o.label}</span>
                        </button>
                    );
                })}
            </div>
            {pref === 'auto' && (
                <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {dpName
                        ? t('deviceTheme.dpActive', { mode: dpName })
                        : t('deviceTheme.autoHint', { mode: modeName(deviceMode === 'dark') })}
                </p>
            )}
        </div>
    );
}
