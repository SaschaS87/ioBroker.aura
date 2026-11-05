// Feature 30 (Runde 1): Beispieldaten fuer die Rolllaeden-Entwuerfe, ohne Pi.
// Nur Dev und nur ueber screenshotApi.ts (`/?shot=1&rolllaeden=1`). Alles erfunden und als
// "(Beispiel)" markiert: Antriebe unter dem erfundenen Namensraum `demo.0.rollladen.*`.
// Die Planer-Wurzel ist im Dev-Build immer `0_userdata.0.Rollladen_Dev` (ShutterFloorsWidget.tsx).
// Nichts davon wird gespeichert oder an ioBroker geschickt.

import type { DashboardLayout } from '../store/dashboardStore';

export interface SeedApi {
    mock(map: Record<string, boolean | number | string | null>): void;
    seed(p: { layouts: DashboardLayout[] }): void;
    setDeviceThemeMode(): void;
}

type Kind = 'fenster' | 'dachfenster' | 'raffstore';
interface Demo {
    floor: string;
    key: string;
    label: string;
    kind: Kind;
    slow: boolean;
    pos: number;
    rssi: number;
}

const GROUND = 'Erdgeschoss (Beispiel)';
const UPPER = 'Obergeschoss (Beispiel)';
const DEMOS: Demo[] = [
    { floor: GROUND, key: 'Wohnz_gross', label: 'Wohnzimmer groß', kind: 'fenster', slow: true, pos: 0, rssi: 84 },
    { floor: GROUND, key: 'Kueche', label: 'Küche', kind: 'fenster', slow: true, pos: 0, rssi: 76 },
    { floor: GROUND, key: 'Gaeste_WC', label: 'Gäste-WC', kind: 'fenster', slow: true, pos: 100, rssi: 58 },
    { floor: GROUND, key: 'Speisekammer', label: 'Speisekammer', kind: 'fenster', slow: true, pos: 84, rssi: 61 },
    {
        floor: GROUND,
        key: 'Raffstore_Garten',
        label: 'Raffstore Garten',
        kind: 'raffstore',
        slow: false,
        pos: 100,
        rssi: 70,
    },
    {
        floor: UPPER,
        key: 'Schlafen_links',
        label: 'Schlafzimmer links',
        kind: 'fenster',
        slow: true,
        pos: 50,
        rssi: 66,
    },
    { floor: UPPER, key: 'Kind', label: 'Kinderzimmer', kind: 'fenster', slow: true, pos: 30, rssi: 42 },
    { floor: UPPER, key: 'Bad_Dach', label: 'Bad Dachfenster', kind: 'dachfenster', slow: false, pos: 0, rssi: 72 },
    { floor: UPPER, key: 'Flur_Dach', label: 'Flur Dachfenster', kind: 'dachfenster', slow: false, pos: 100, rssi: 55 },
];

const ROOT = '0_userdata.0.Rollladen_Dev';
const ALL = DEMOS.map((d) => d.key);
const GROUND_KEYS = DEMOS.filter((d) => d.floor === GROUND).map((d) => d.key);
const target = (key: string, closed: number, slat?: number) => ({
    key,
    closed,
    ...(slat !== undefined ? { slat } : {}),
});
const hasSlat = (key: string) => DEMOS.find((d) => d.key === key)?.kind === 'raffstore';

export function seedRolllaeden(api: SeedApi): void {
    const mock: Record<string, boolean | number | string | null> = {};
    const floors = [GROUND, UPPER].map((name) => ({
        name,
        devices: DEMOS.filter((d) => d.floor === name).map((d) => {
            const base = `demo.0.rollladen.${d.key}`;
            const dev: Record<string, unknown> = {
                key: d.key,
                label: d.label,
                kind: d.kind,
                posDp: `${base}.states.core:ClosureState`,
                invertPosition: true,
                upDp: `${base}.commands.up`,
                downDp: `${base}.commands.down`,
                stopDp: `${base}.commands.stop`,
                activityDp: `${base}.states.core:MovingState`,
            };
            if (d.kind === 'raffstore') dev.slatDp = `${base}.states.core:SlateOrientationState`;
            if (d.slow) dev.slowPosDp = `${base}.states.core:TargetClosureState:slow`;
            mock[`${base}.states.core:ClosureState`] = d.pos;
            mock[`${base}.states.core:MovingState`] = false;
            mock[`${base}.states.core:SlateOrientationState`] = 45;
            mock[`${base}.states.core:StatusState`] = 'available';
            mock[`${base}.states.core:RSSILevelState`] = d.rssi;
            mock[`${base}.states.core:DiscreteRSSILevelState`] =
                d.rssi >= 70 ? 'good' : d.rssi >= 45 ? 'normal' : 'low';
            return dev;
        }),
    }));

    mock['demo.0.rollladen.info.connection'] = true;
    mock['system.adapter.demo.0.alive'] = true;
    mock['javascript.0.variables.astro.sunrise'] = '07:21';
    mock['javascript.0.variables.astro.sunset'] = '16:58';
    mock['javascript.0.variables.astro.dawn'] = '06:48';
    mock['javascript.0.variables.astro.dusk'] = '17:31';
    mock[`${ROOT}.Befehl`] = '';

    const scenes = [
        {
            id: 's-bsp-1',
            name: 'Alles runter',
            icon: 'moon',
            favorite: true,
            targets: ALL.map((k) => (hasSlat(k) ? target(k, 100, 90) : target(k, 100))),
        },
        {
            id: 's-bsp-2',
            name: 'Morgens Erdgeschoss',
            icon: 'sunrise',
            favorite: true,
            targets: GROUND_KEYS.map((k) => (hasSlat(k) ? target(k, 0, 0) : target(k, 0))),
        },
        {
            id: 's-bsp-3',
            name: 'Kino im Wohnzimmer',
            icon: 'tv',
            targets: [target('Wohnz_gross', 100), target('Raffstore_Garten', 100, 90)],
        },
    ];
    const everyDay = [true, true, true, true, true, true, true];
    const entries = [
        {
            id: 'e-bsp-1',
            days: [true, true, true, true, true, false, false],
            trigger: { kind: 'time', time: '06:20', offset: 0, earliest: null, latest: null },
            target: { kind: 'scene', sceneId: 's-bsp-2' },
            enabled: true,
            quiet: true,
        },
        {
            id: 'e-bsp-2',
            days: [false, false, false, false, false, true, true],
            trigger: { kind: 'sunrise', time: '07:00', offset: 30, earliest: '08:00', latest: null },
            target: { kind: 'device', key: 'Raffstore_Garten', closed: 50 },
            enabled: true,
        },
        {
            id: 'e-bsp-3',
            days: everyDay,
            trigger: { kind: 'sunset', time: '07:00', offset: 35, earliest: '19:45', latest: null },
            target: { kind: 'scene', sceneId: 's-bsp-1' },
            enabled: true,
        },
        {
            id: 'e-bsp-4',
            days: [true, true, true, true, true, false, false],
            trigger: { kind: 'time', time: '12:30', offset: 0, earliest: null, latest: null },
            target: { kind: 'scene', sceneId: 's-bsp-3' },
            enabled: false,
        },
    ];
    mock[`${ROOT}.Szenen`] = JSON.stringify(scenes);
    mock[`${ROOT}.Wochenplan`] = JSON.stringify(entries);
    mock[`${ROOT}.Einstellungen`] = JSON.stringify({ master: true, pausedTodayDate: null, holidayMode: 'sunday' });
    // Wirkt nur mit Pi-Verbindung (ohne Socket gilt der Favoriten-Datenpunkt als nicht verfuegbar).
    mock[`${ROOT}.Favoriten`] = JSON.stringify(['Wohnz_gross', 'Kueche', 'Kind']);

    const widget = {
        id: 'w-rollos',
        type: 'shutterfloors',
        title: 'Rollläden',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 42, h: 40 },
        options: {
            transparent: true,
            showTitle: false,
            floors,
            connectionDp: 'demo.0.rollladen.info.connection',
            aliveDp: 'system.adapter.demo.0.alive',
            instanceLabel: 'TaHoma (Beispiel)',
            showFooter: true,
            showSignalBox: true,
            showPlanner: true,
        },
    };
    const layout = {
        id: 'l-dev',
        name: 'Home',
        slug: 'default',
        settings: { layoutDrawerEnabled: true, layoutDrawerPlacement: 'top' },
        activeSectionId: 'sec-home',
        sections: [
            {
                id: 'sec-home',
                name: 'Home',
                slug: 'home',
                activeTabId: 'tab-rollos',
                tabs: [{ id: 'tab-rollos', name: 'Rollläden (Beispiel)', slug: 'rollos', widgets: [widget] }],
            },
        ],
    } as unknown as DashboardLayout;

    api.mock(mock);
    api.seed({ layouts: [layout] });
    api.setDeviceThemeMode();
    window.location.hash = '#/view/default/s/home/tab/rollos';
}
