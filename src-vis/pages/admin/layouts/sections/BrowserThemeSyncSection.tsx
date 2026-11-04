import { useThemeStore } from '../../../../store/themeStore';
import { THEMES } from '../../../../themes';
import { useT } from '../../../../i18n';

/** Anchor id so other cards can point the user at this switch. */
export const BROWSER_SYNC_ANCHOR = 'browser-theme-sync';

export function BrowserThemeSyncSection() {
    const t = useT();
    const { browserDarkThemeId, browserLightThemeId, setBrowserDarkThemeId, setBrowserLightThemeId } = useThemeStore();

    const selSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        padding: '4px 8px',
        fontSize: 12,
    };

    return (
        <div
            id={BROWSER_SYNC_ANCHOR}
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.pair.title')}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('theme.pair.desc')}
                </p>
            </div>
            <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Dunkel-Theme
                    </label>
                    <select
                        value={browserDarkThemeId}
                        style={selSty}
                        className="w-full focus:outline-none"
                        onChange={(e) => setBrowserDarkThemeId(e.target.value)}
                    >
                        {THEMES.filter((t) => t.dark).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-0">
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Hell-Theme
                    </label>
                    <select
                        value={browserLightThemeId}
                        style={selSty}
                        className="w-full focus:outline-none"
                        onChange={(e) => setBrowserLightThemeId(e.target.value)}
                    >
                        {THEMES.filter((t) => !t.dark).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
