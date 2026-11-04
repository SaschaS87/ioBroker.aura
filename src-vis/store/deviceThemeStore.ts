import { create } from 'zustand';

// ── Hell/Dunkel pro Gerät ────────────────────────────────────────────────────
// Rein lokaler Zustand: bewusst ohne den Persist-Manager und ohne Eintrag in
// IOBROKER_STATE_MAP, damit die Wahl weder in ioBroker landet noch das Dashboard
// als "geändert" markiert. Der Wert steht als schlichter String ('auto' |
// 'light' | 'dark') unter DEVICE_THEME_KEY – das liest auch das Boot-Skript in
// index.html (ES5, kein JSON).

export type DeviceThemePref = 'auto' | 'light' | 'dark';

export const DEVICE_THEME_KEY = 'aura-device-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPref(): DeviceThemePref {
    try {
        const v = localStorage.getItem(DEVICE_THEME_KEY);
        return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
        return 'auto';
    }
}

function writePref(pref: DeviceThemePref): void {
    try {
        if (pref === 'auto') localStorage.removeItem(DEVICE_THEME_KEY);
        else localStorage.setItem(DEVICE_THEME_KEY, pref);
    } catch {
        /* quota / private mode */
    }
}

function getMq(): MediaQueryList | null {
    try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia(DARK_QUERY)
            : null;
    } catch {
        return null;
    }
}

const mq = getMq();

interface DeviceThemeState {
    pref: DeviceThemePref;
    /** Gerät meldet gerade den Dunkelmodus (prefers-color-scheme). */
    systemDark: boolean;
    /** Dev screenshot harness only: per-device mode switched on (re-render trigger, see themeModeCache). */
    harnessOn: boolean;
    setPref: (pref: DeviceThemePref) => void;
}

export const useDeviceThemeStore = create<DeviceThemeState>((set) => ({
    pref: readPref(),
    systemDark: mq ? mq.matches : false,
    harnessOn: false,
    setPref: (pref) => {
        writePref(pref);
        set({ pref });
    },
}));

if (mq) {
    const onChange = () => useDeviceThemeStore.setState({ systemDark: mq.matches });
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange); // altes iOS Safari
}

if (typeof window !== 'undefined') {
    // Andere Tabs/Fenster desselben Browsers
    window.addEventListener('storage', (e) => {
        if (e.key === DEVICE_THEME_KEY || e.key === null) useDeviceThemeStore.setState({ pref: readPref() });
    });
}
