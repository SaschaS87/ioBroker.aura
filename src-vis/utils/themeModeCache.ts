import { create } from 'zustand';
import { getTheme } from '../themes';
import { useDeviceThemeStore, type DeviceThemePref } from '../store/deviceThemeStore';
import { isScreenshotMode } from '../store/persistManager';

export type ThemeMode = 'dark' | 'light';

// ── Datapoint-driven dark/light mode ─────────────────────────────────────────
// Rangfolge des aktiven Modus (resolveActiveMode):
//   1. lokale Wahl dieses Geräts (Hell/Dunkel, deviceThemeStore)
//   2. Datenpunkt `<ns>.config.themeMode.frontend` (nur bei "Automatisch")
//   3. Gerät (prefers-color-scheme), bei "Automatisch" und leerem Datenpunkt
//   4. darunter das Admin-Design; der Modus ersetzt es nur bei falscher
//      Helligkeit (resolveThemeModeId)
// `useThemeModeStore` hält ausschließlich Stufe 2, den Datenpunkt-Modus.
//
// `<ns>.config.themeMode.frontend` carries a *mode*, not a theme: it says
// "show something dark now", it does not pick the design. Kept in its own
// (non-persisted) store so every consumer re-renders when it changes without
// the mode ever touching the saved themeId — writing it into themeStore used to
// overwrite the design chosen in the admin, so a device that had ever used the
// header sun/moon button ignored every theme preset from then on (#573).
interface ThemeModeState {
    mode: ThemeMode | null;
    setMode: (mode: ThemeMode | null) => void;
}

export const useThemeModeStore = create<ThemeModeState>((set) => ({
    mode: null,
    setMode: (mode) => set({ mode }),
}));

/** Non-React accessor for the active mode (effects, event handlers, boot code). */
export const themeModeOverride = {
    get value(): ThemeMode | null {
        return useThemeModeStore.getState().mode;
    },
    set value(mode: ThemeMode | null) {
        useThemeModeStore.getState().setMode(mode);
    },
};

/**
 * Resolve a saved theme id against an active dark/light mode.
 *
 * A design whose polarity already matches the requested mode is kept as is — a
 * dark mode does not have to mean the plain `dark` preset. Only when the design
 * has the wrong polarity does the configured counterpart (the same pair the
 * browser sync uses) step in.
 */
export function resolveThemeModeId(
    themeId: string,
    mode: ThemeMode | null,
    darkThemeId: string,
    lightThemeId: string,
): string {
    if (!mode) return themeId;
    const wantDark = mode === 'dark';
    if (getTheme(themeId).dark === wantDark) return themeId;
    return wantDark ? darkThemeId : lightThemeId;
}

// Last value seen on <ns>.config.themeMode.frontend, remembered per device.
// The DP only reaches the app once the socket is connected and the initial
// getState pass has run — several hundred ms after the first paint. Until then
// the frontend renders whatever theme localStorage / the remote config carry,
// which is why a tablet reloading at night flashed the daytime theme before
// snapping to dark. Seeding from this cache makes the first paint already
// correct; the DP value still has the final say once it arrives.
const CACHE_KEY = 'aura-theme-mode';

// Colours of the theme last rendered on this device, written by ThemeProvider
// and read by the inline boot script in index.html so the pre-React splash
// matches the theme instead of always being dark.
export const BOOT_COLORS_KEY = 'aura-boot-colors';
// Per-mode variants, so the boot splash can match the mode this device is about
// to show (local choice / datapoint / system) rather than the last one rendered.
// The un-suffixed key stays as the fallback for devices that have not written
// the pair yet.
export const BOOT_COLORS_KEY_DARK = 'aura-boot-colors-dark';
export const BOOT_COLORS_KEY_LIGHT = 'aura-boot-colors-light';

// ── Active mode (device choice → datapoint → system) ─────────────────────────
// Screenshot mode (?shot=1) must not depend on the machine running the shots,
// so it yields `null` (= use the saved design as is) unless the harness opted in
// via setScreenshotDeviceTheme().
let screenshotDeviceTheme = false;
export function setScreenshotDeviceTheme(on: boolean): void {
    screenshotDeviceTheme = on;
    useDeviceThemeStore.setState({ harnessOn: on }); // makes subscribers re-render
}

/**
 * Pure rule for the mode currently shown. No React, no stores — everything comes
 * in as arguments (except the harness opt-in, which only matters when
 * `screenshot` is true).
 */
export function resolveActiveMode(
    pref: DeviceThemePref,
    dpMode: ThemeMode | null,
    systemDark: boolean,
    screenshot: boolean,
): ThemeMode | null {
    if (screenshot && !screenshotDeviceTheme) return null;
    if (pref !== 'auto') return pref;
    if (dpMode) return dpMode;
    return systemDark ? 'dark' : 'light';
}

/** Hook form of resolveActiveMode — re-renders when any of the inputs change. */
export function useActiveThemeMode(): ThemeMode | null {
    const pref = useDeviceThemeStore((s) => s.pref);
    const systemDark = useDeviceThemeStore((s) => s.systemDark);
    useDeviceThemeStore((s) => s.harnessOn); // re-render when the harness opts in
    const dpMode = useThemeModeStore((s) => s.mode);
    return resolveActiveMode(pref, dpMode, systemDark, isScreenshotMode());
}

export function readCachedThemeMode(): ThemeMode | null {
    try {
        const v = localStorage.getItem(CACHE_KEY);
        return v === 'dark' || v === 'light' ? v : null;
    } catch {
        return null;
    }
}

export function writeCachedThemeMode(mode: ThemeMode | null): void {
    try {
        if (mode) localStorage.setItem(CACHE_KEY, mode);
        else localStorage.removeItem(CACHE_KEY);
    } catch {
        /* quota / private mode */
    }
}

/**
 * Apply the cached DP mode (stage 2 of the order above) — call before React mounts so the very first paint
 * uses it. Only the mode store is touched, so a stale cache can no longer
 * outlive the datapoint: as soon as the DP arrives (or turns out to be empty)
 * the mode is corrected and the saved design reappears untouched.
 */
export function applyCachedThemeMode(): void {
    const mode = readCachedThemeMode();
    if (mode) useThemeModeStore.setState({ mode });
}
