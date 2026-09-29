import { useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { useConfigStore } from './store/configStore';
import { useGlobalThemeId } from './hooks/useEffectiveSettings';
import { getTheme } from './themes';
import { BOOT_COLORS_KEY } from './utils/themeModeCache';
import { bumpThemeEpoch } from './store/themeEpoch';

/** theme-color takes a plain colour only — a gradient background yields its first hex stop. */
function solidColor(bg: string | undefined): string | null {
    if (!bg) return null;
    if (!bg.includes('gradient')) return bg.trim();
    const stop = bg.match(/#[0-9a-fA-F]{3,8}\b/);
    return stop ? stop[0] : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const customVars = useThemeStore((s) => s.customVars);
    const fontScale = useConfigStore((s) => s.frontend.fontScale ?? 1);
    // Global theme with the dark/light-mode datapoint applied — the saved
    // themeId itself is never rewritten by the mode (#573).
    const theme = getTheme(useGlobalThemeId());

    useEffect(() => {
        const root = document.documentElement;
        const vars = { ...theme.vars, ...customVars };
        Object.entries(vars).forEach(([k, v]) => {
            if (v) root.style.setProperty(k, v);
        });
        root.style.setProperty('--font-scale', String(fontScale));
        root.classList.toggle('dark', theme.dark);
        // iOS status bar icons (clock/Wi-Fi/battery): white on dark themes. Set here,
        // once the theme is known — index.html only seeds the value from the last run.
        const statusBarStyle = theme.dark ? 'black-translucent' : 'default';
        const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (statusMeta && statusMeta.getAttribute('content') !== statusBarStyle) {
            statusMeta.setAttribute('content', statusBarStyle);
        }
        // Dark hint for iOS (theme-color + color-scheme metas, index.html): follow
        // the theme so a light Aura design does not keep announcing "dark". Both
        // metas exist on iOS only — index.html removes them elsewhere.
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        const themeColor = solidColor(vars['--app-bg']);
        if (themeColorMeta && themeColor && themeColorMeta.getAttribute('content') !== themeColor) {
            themeColorMeta.setAttribute('content', themeColor);
        }
        const schemeMeta = document.querySelector('meta[name="color-scheme"]');
        const scheme = theme.dark ? 'dark' : 'light';
        if (schemeMeta && schemeMeta.getAttribute('content') !== scheme) {
            schemeMeta.setAttribute('content', scheme);
        }
        // Match native form-control chrome to the theme (like AdminLayout does).
        // Without this, dark themes keep color-scheme:light, so a native
        // <input type=range> gets a WHITE UA background — the semi-transparent
        // dimmer rail then composites over white and looks far brighter than the
        // admin backend (which sets color-scheme:dark). Also fixes scrollbars /
        // selects / date pickers to render dark in dark themes.
        root.style.colorScheme = theme.dark ? 'dark' : 'light';
        // Hand the current colours to the pre-React boot splash (inline script in
        // index.html). Without this the splash is always dark, so a light-theme
        // device flashes dark → light on every reload.
        try {
            const bg = vars['--app-bg'];
            const fg = vars['--text-secondary'];
            if (bg && fg) localStorage.setItem(BOOT_COLORS_KEY, `${bg}|${fg}`);
            localStorage.setItem('aura-status-dark', theme.dark ? '1' : '0');
        } catch {
            /* quota / private mode */
        }
        // The variables are in the DOM now — whoever has to read one in
        // JavaScript (a canvas colour) can do it from here on (store/themeEpoch).
        bumpThemeEpoch();
    }, [theme, customVars, fontScale]);

    return <>{children}</>;
}
