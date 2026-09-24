/**
 * Gemeinsames Datenmodell der Planer-Entwuerfe (Szenen + Wochenplan) fuer den
 * Rolllaeden-Tab — NUR Dev-Vorschau.
 *
 * Echt vom Pi: Geraeteliste (Widget-Konfiguration), aktuelle Stellung je
 * Antrieb (core:ClosureState, 0 = offen / 100 = zu) und die Sonnenzeiten von
 * heute (javascript.0.variables.astro.*).
 * Lokal gerechnet: Sonnenzeiten der anderen Wochentage (fuer Mühlacker, gegen
 * die Pi-Werte von heute abgeglichen) und die Feiertage. feiertage.0 ist auf
 * dem Pi seit Mai 2026 abgeschaltet und meldet noch Pfingstmontag.
 * Szenen und Zeitpunkte gibt es auf dem Pi noch nicht — ohne Haken
 * „Beispieldaten" sind die Listen deshalb leer. Nichts wird geschrieben.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from '../types';

// ── Grundtypen ─────────────────────────────────────────────────────────

/** Montag = 0 … Sonntag = 6 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WD_LETTER = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
export const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export type SceneIcon = 'sunrise' | 'sun' | 'sunset' | 'moon' | 'home' | 'heat' | 'tv';

export interface SceneTarget {
    key: string;
    /** Prozent zu, wie im Rollladen-Popup (0 = offen, 100 = zu). */
    closed: number;
    /** Nur Raffstore: Lamelle in Prozent (0 = waagerecht, 90 = geschlossen). */
    slat?: number;
}

export interface Scene {
    id: string;
    name: string;
    icon: SceneIcon;
    targets: SceneTarget[];
    /** Favorit = erscheint als Schnellknopf auf der Kachel; alle anderen nur im Popup. */
    favorite?: boolean;
}

export type TriggerKind = 'time' | 'sunrise' | 'sunset';

export interface Trigger {
    kind: TriggerKind;
    /** Nur bei kind = time, "HH:MM" */
    time: string;
    /** Minuten Versatz zur Sonnenzeit (negativ = vorher). */
    offset: number;
    /** Optionale Klammer, "HH:MM" oder null. */
    earliest: string | null;
    latest: string | null;
}

export type PlanTarget = { kind: 'scene'; sceneId: string } | { kind: 'device'; key: string; closed: number };

export interface PlanEntry {
    id: string;
    days: boolean[]; // Länge 7, Mo … So
    trigger: Trigger;
    target: PlanTarget;
    enabled: boolean;
}

export type HolidayMode = 'sunday' | 'normal' | 'skip';

export interface PlanDevice {
    key: string;
    label: string;
    kind: ShutterFloorDeviceDef['kind'];
    floor: string;
    hasSlat: boolean;
    /** Aktuelle Stellung vom Pi (Prozent zu) oder null, solange unbekannt. */
    closed: number | null;
}

export interface Occurrence {
    /** Minuten seit Mitternacht (Ortszeit) */
    min: number;
    entry: PlanEntry;
    /** Wurde die Zeit durch frühestens/spätestens verschoben? */
    clamped: boolean;
}

// ── Zeit-Helfer ────────────────────────────────────────────────────────

export function hhmm(min: number): string {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseHhmm(s: string | null | undefined): number | null {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

export function weekdayOf(d: Date): Weekday {
    return ((d.getDay() + 6) % 7) as Weekday;
}

export function addDays(d: Date, n: number): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
    return x;
}

export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function fmtDate(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

export function fmtDateLong(d: Date): string {
    return `${WD_LONG[weekdayOf(d)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function dayLabel(d: Date, today: Date): string {
    if (sameDay(d, today)) return 'Heute';
    if (sameDay(d, addDays(today, 1))) return 'Morgen';
    return `${WD_SHORT[weekdayOf(d)]} ${fmtDate(d)}`;
}

export function daysText(days: boolean[]): string {
    const on = WEEKDAYS.filter((d) => days[d]);
    if (on.length === 7) return 'täglich';
    if (on.length === 0) return 'kein Tag';
    if (on.length === 5 && on.every((d) => d < 5)) return 'Mo–Fr';
    if (on.length === 2 && days[5] && days[6]) return 'Sa/So';
    return on.map((d) => WD_SHORT[d]).join(' · ');
}

// ── Sonne (SunCalc-Verfahren, für Mühlacker) ───────────────────────────

export const LAT = 48.9519924;
export const LON = 8.8328485;

const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const OBL = RAD * 23.4397;
const J0 = 0.0009;

const toDays = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

function sunTimesAt(date: Date, h: number): { rise: Date; set: Date } {
    const lw = RAD * -LON;
    const phi = RAD * LAT;
    const d = toDays(date);
    const n = Math.round(d - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = RAD * (357.5291 + 0.98560028 * ds);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(OBL) * Math.sin(L));
    const jNoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const w = Math.acos((Math.sin(h * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    const jSet = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const jRise = jNoon - (jSet - jNoon);
    return { rise: fromJulian(jRise), set: fromJulian(jSet) };
}

const toMin = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

export interface SunDay {
    sunrise: number;
    sunset: number;
    dawn: number;
    dusk: number;
    /** true = Wert kommt vom Pi, false = lokal gerechnet */
    fromPi: boolean;
}

export function calcSun(date: Date): SunDay {
    const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const s = sunTimesAt(noon, -0.833);
    const c = sunTimesAt(noon, -6);
    return { sunrise: toMin(s.rise), sunset: toMin(s.set), dawn: toMin(c.rise), dusk: toMin(c.set), fromPi: false };
}

// ── Feiertage (Baden-Württemberg, wie in feiertage.0 angehakt) ─────────

function easter(y: number): Date {
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day, 12);
}

export function holidaysOf(y: number): { date: Date; name: string }[] {
    const e = easter(y);
    const fix = (m: number, d: number, name: string) => ({ date: new Date(y, m - 1, d, 12), name });
    const rel = (n: number, name: string) => ({ date: addDays(e, n), name });
    return [
        fix(1, 1, 'Neujahr'),
        fix(1, 6, 'Heilige Drei Könige'),
        rel(-2, 'Karfreitag'),
        rel(1, 'Ostermontag'),
        fix(5, 1, 'Tag der Arbeit'),
        rel(39, 'Christi Himmelfahrt'),
        rel(50, 'Pfingstmontag'),
        rel(60, 'Fronleichnam'),
        fix(10, 3, 'Tag der Deutschen Einheit'),
        fix(11, 1, 'Allerheiligen'),
        fix(12, 24, 'Heiligabend'),
        fix(12, 25, '1. Weihnachtstag'),
        fix(12, 26, '2. Weihnachtstag'),
        fix(12, 31, 'Silvester'),
    ];
}

export function holidayName(d: Date): string | null {
    return holidaysOf(d.getFullYear()).find((h) => sameDay(h.date, d))?.name ?? null;
}

export function nextHoliday(from: Date): { date: Date; name: string } {
    const list = [...holidaysOf(from.getFullYear()), ...holidaysOf(from.getFullYear() + 1)];
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    return list.find((h) => h.date >= start) ?? list[0];
}

// ── Plan auswerten ─────────────────────────────────────────────────────

export function triggerMinutes(t: Trigger, sun: SunDay): { min: number; clamped: boolean } {
    let min: number;
    if (t.kind === 'time') min = parseHhmm(t.time) ?? 0;
    else min = (t.kind === 'sunrise' ? sun.sunrise : sun.sunset) + t.offset;
    let clamped = false;
    const lo = parseHhmm(t.earliest);
    const hi = parseHhmm(t.latest);
    if (t.kind !== 'time' && lo !== null && min < lo) {
        min = lo;
        clamped = true;
    }
    if (t.kind !== 'time' && hi !== null && min > hi) {
        min = hi;
        clamped = true;
    }
    return { min: Math.round(min), clamped };
}

export function triggerText(t: Trigger): string {
    if (t.kind === 'time') return `${t.time} Uhr`;
    const base = t.kind === 'sunrise' ? 'Sonnenaufgang' : 'Sonnenuntergang';
    const off = t.offset === 0 ? '' : ` ${t.offset > 0 ? '+' : '−'} ${Math.abs(t.offset)} min`;
    const clamp = [t.earliest && `frühestens ${t.earliest}`, t.latest && `spätestens ${t.latest}`].filter(Boolean).join(', ');
    return `${base}${off}${clamp ? ` (${clamp})` : ''}`;
}

/** Kurzform ohne Klammer, für Zeilen und Kacheln. */
export function triggerShort(t: Trigger): string {
    if (t.kind === 'time') return 'feste Zeit';
    const base = t.kind === 'sunrise' ? 'Sonnenaufgang' : 'Sonnenuntergang';
    return t.offset === 0 ? base : `${base} ${t.offset > 0 ? '+' : '−'} ${Math.abs(t.offset)} min`;
}

/** Welcher Plan-Wochentag gilt an diesem Datum? null = heute fährt nichts. */
export function effectiveWeekday(d: Date, mode: HolidayMode): Weekday | null {
    const hol = holidayName(d);
    if (hol && mode === 'skip') return null;
    if (hol && mode === 'sunday') return 6;
    return weekdayOf(d);
}

// ── Beispieldaten (nur mit Haken) ──────────────────────────────────────

const t = (time: string): Trigger => ({ kind: 'time', time, offset: 0, earliest: null, latest: null });

function sampleScenes(devices: PlanDevice[]): Scene[] {
    const has = (k: string) => devices.some((d) => d.key === k);
    const pick = (list: SceneTarget[]) => list.filter((x) => has(x.key));
    const eg = devices.filter((d) => d.floor === 'Erdgeschoss').map((d) => d.key);
    return [
        { id: 's-morgen', name: 'Guten Morgen', icon: 'sunrise', targets: eg.map((key) => ({ key, closed: 0 })) },
        {
            id: 's-kinder',
            name: 'Kinder wach',
            icon: 'sun',
            targets: pick([
                { key: 'Kinderzimmer', closed: 50 },
                { key: 'Kinderzimmer_2', closed: 50 },
            ]),
        },
        {
            id: 's-eltern',
            name: 'Elternbereich auf',
            icon: 'home',
            targets: pick(['Eltern_links', 'Eltern_rechts', 'Ankleide', 'Bad', 'Bad_Dachfenster', 'Flur_DG'].map((key) => ({ key, closed: 0 }))),
        },
        {
            id: 's-hitze',
            name: 'Hitzeschutz',
            icon: 'heat',
            targets: pick([
                { key: 'Raffstore_(Garten)', closed: 100, slat: 50 },
                { key: 'Raffstore_(Nachbar)', closed: 100, slat: 50 },
                { key: 'Wohnz_gross', closed: 70 },
                { key: 'Wohnz_klein', closed: 70 },
            ]),
        },
        {
            id: 's-tv',
            name: 'Fernsehen',
            icon: 'tv',
            targets: pick([
                { key: 'Wohnz_gross', closed: 100 },
                { key: 'Wohnz_klein', closed: 100 },
            ]),
        },
        { id: 's-abend', name: 'Gute Nacht', icon: 'moon', targets: devices.map((d) => ({ key: d.key, closed: 100 })) },
        // Weitere Beispiele, damit es mehr Szenen als Platz auf der Kachel gibt
        { id: 's-mittag', name: 'Mittagsruhe', icon: 'moon', targets: pick(['Kinderzimmer', 'Kinderzimmer_2'].map((key) => ({ key, closed: 100 }))) },
        {
            id: 's-terrasse',
            name: 'Terrasse offen',
            icon: 'sun',
            targets: pick([
                { key: 'Raffstore_(Garten)', closed: 0, slat: 0 },
                { key: 'Raffstore_(Nachbar)', closed: 0, slat: 0 },
            ]),
        },
        { id: 's-bad', name: 'Sichtschutz Bad', icon: 'home', targets: pick(['Bad', 'Bad_Dachfenster'].map((key) => ({ key, closed: 75 }))) },
        { id: 's-lueften', name: 'Lüften OG', icon: 'home', targets: devices.filter((d) => d.floor !== 'Erdgeschoss').map((d) => ({ key: d.key, closed: 0 })) },
        {
            id: 's-essen',
            name: 'Abendessen',
            icon: 'sunset',
            targets: pick([
                { key: 'Küchenfenster', closed: 100 },
                { key: 'Wohnz_gross', closed: 50 },
                { key: 'Wohnz_klein', closed: 50 },
            ]),
        },
        { id: 's-eltern-zu', name: 'Eltern schlafen', icon: 'moon', targets: pick(['Eltern_links', 'Eltern_rechts', 'Ankleide'].map((key) => ({ key, closed: 100 }))) },
    ].map((sc) => ({ ...sc, favorite: FAVORITES.includes(sc.id) })) as Scene[];
}

const FAVORITES = ['s-morgen', 's-kinder', 's-hitze', 's-tv', 's-abend', 's-mittag'];

const WK = [true, true, true, true, true, false, false];
const WE = [false, false, false, false, false, true, true];
const ALL = [true, true, true, true, true, true, true];

function sampleEntries(): PlanEntry[] {
    return [
        { id: 'e1', days: WK, trigger: t('06:30'), target: { kind: 'scene', sceneId: 's-morgen' }, enabled: true },
        { id: 'e2', days: WE, trigger: t('08:00'), target: { kind: 'scene', sceneId: 's-morgen' }, enabled: true },
        { id: 'e3', days: WK, trigger: t('07:30'), target: { kind: 'scene', sceneId: 's-kinder' }, enabled: true },
        { id: 'e4', days: WE, trigger: t('09:00'), target: { kind: 'scene', sceneId: 's-kinder' }, enabled: true },
        { id: 'e5', days: WE, trigger: t('09:30'), target: { kind: 'scene', sceneId: 's-eltern' }, enabled: true },
        {
            id: 'e6',
            days: ALL,
            trigger: { kind: 'sunset', time: '19:00', offset: 5, earliest: '17:30', latest: null },
            target: { kind: 'scene', sceneId: 's-abend' },
            enabled: true,
        },
        {
            id: 'e7',
            days: [false, false, false, false, false, true, false],
            trigger: { kind: 'sunrise', time: '07:00', offset: 30, earliest: '07:30', latest: null },
            target: { kind: 'device', key: 'Küchenfenster', closed: 0 },
            enabled: false,
        },
    ];
}

// ── Modell-Hook ────────────────────────────────────────────────────────

export interface PlanModel {
    now: Date;
    today: Date;
    devices: PlanDevice[];
    floors: string[];
    scenes: Scene[];
    entries: PlanEntry[];
    master: boolean;
    pausedToday: boolean;
    holidayMode: HolidayMode;
    samples: boolean;
    sunFor: (d: Date) => SunDay;
    occurrences: (d: Date) => Occurrence[];
    /** Alle Ausführungen ab jetzt, maximal `limit`, über bis zu 8 Tage. */
    upcoming: (limit: number) => { date: Date; occ: Occurrence }[];
    nextRunOf: (entry: PlanEntry) => { date: Date; min: number } | null;
    sceneOf: (id: string) => Scene | undefined;
    deviceOf: (key: string) => PlanDevice | undefined;
    targetName: (t: PlanTarget) => string;
    targetCount: (t: PlanTarget) => number;
    entriesOfScene: (sceneId: string) => PlanEntry[];
    setMaster: (v: boolean) => void;
    setPausedToday: (v: boolean) => void;
    setHolidayMode: (m: HolidayMode) => void;
    saveScene: (s: Scene) => void;
    deleteScene: (id: string) => void;
    toggleFavorite: (id: string) => void;
    saveEntry: (e: PlanEntry) => void;
    deleteEntry: (id: string) => void;
    toggleEntry: (id: string) => void;
    runScene: (id: string) => void;
    toast: string | null;
    showToast: (text: string) => void;
}

export function newId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function usePlanModel(
    floorsCfg: ShutterFloorDef[],
    positions: Record<string, number | null>,
    piSun: { sunrise: string | null; sunset: string | null; dawn: string | null; dusk: string | null },
    samples: boolean,
): PlanModel {
    // Minutentakt für "jetzt" und "als Nächstes"
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(id);
    }, []);
    const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), [now]);

    const devices = useMemo<PlanDevice[]>(
        () =>
            floorsCfg.flatMap((f) =>
                f.devices.map((d) => ({
                    key: d.key,
                    label: d.label,
                    kind: d.kind,
                    floor: f.name,
                    hasSlat: !!d.slatDp,
                    closed: positions[d.key] ?? null,
                })),
            ),
        [floorsCfg, positions],
    );
    const floors = useMemo(() => floorsCfg.map((f) => f.name), [floorsCfg]);

    const [scenes, setScenes] = useState<Scene[]>([]);
    const [entries, setEntries] = useState<PlanEntry[]>([]);
    const [master, setMaster] = useState(true);
    const [pausedToday, setPausedToday] = useState(false);
    const [holidayMode, setHolidayMode] = useState<HolidayMode>('sunday');
    const [toast, setToast] = useState<string | null>(null);

    // Beispieldaten ein/aus setzt die Listen neu auf. Erst füllen, wenn die
    // Geräteliste da ist, sonst entstünden leere Szenen.
    const devKeyList = devices.map((d) => d.key).join('|');
    useEffect(() => {
        if (samples && devices.length) {
            setScenes(sampleScenes(devices));
            setEntries(sampleEntries());
        } else if (!samples) {
            setScenes([]);
            setEntries([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [samples, devKeyList]);

    const piToday = useMemo(() => {
        const sr = parseHhmm(piSun.sunrise);
        const ss = parseHhmm(piSun.sunset);
        if (sr === null || ss === null) return null;
        return {
            sunrise: sr,
            sunset: ss,
            dawn: parseHhmm(piSun.dawn) ?? sr - 30,
            dusk: parseHhmm(piSun.dusk) ?? ss + 30,
            fromPi: true,
        } as SunDay;
    }, [piSun.sunrise, piSun.sunset, piSun.dawn, piSun.dusk]);

    const sunFor = useCallback((d: Date) => (sameDay(d, today) && piToday ? piToday : calcSun(d)), [today, piToday]);

    const occurrences = useCallback(
        (d: Date): Occurrence[] => {
            const wd = effectiveWeekday(d, holidayMode);
            if (wd === null) return [];
            const sun = sunFor(d);
            return entries
                .filter((e) => e.enabled && e.days[wd])
                .map((e) => {
                    const r = triggerMinutes(e.trigger, sun);
                    return { min: r.min, clamped: r.clamped, entry: e };
                })
                .sort((a, b) => a.min - b.min);
        },
        [entries, holidayMode, sunFor],
    );

    const nowMin = now.getHours() * 60 + now.getMinutes();

    const upcoming = useCallback(
        (limit: number) => {
            const out: { date: Date; occ: Occurrence }[] = [];
            if (!master) return out;
            for (let i = 0; i < 8 && out.length < limit; i++) {
                const d = addDays(today, i);
                if (i === 0 && pausedToday) continue;
                for (const occ of occurrences(d)) {
                    if (i === 0 && occ.min <= nowMin) continue;
                    out.push({ date: d, occ });
                    if (out.length >= limit) break;
                }
            }
            return out;
        },
        [master, pausedToday, occurrences, today, nowMin],
    );

    const nextRunOf = useCallback(
        (entry: PlanEntry) => {
            for (let i = 0; i < 8; i++) {
                const d = addDays(today, i);
                const wd = effectiveWeekday(d, holidayMode);
                if (wd === null || !entry.days[wd]) continue;
                const { min } = triggerMinutes(entry.trigger, sunFor(d));
                if (i === 0 && min <= nowMin) continue;
                return { date: d, min };
            }
            return null;
        },
        [today, holidayMode, sunFor, nowMin],
    );

    const sceneOf = useCallback((id: string) => scenes.find((s) => s.id === id), [scenes]);
    const deviceOf = useCallback((key: string) => devices.find((d) => d.key === key), [devices]);
    const targetName = useCallback(
        (tg: PlanTarget) =>
            tg.kind === 'scene' ? (scenes.find((s) => s.id === tg.sceneId)?.name ?? 'Szene gelöscht') : (devices.find((d) => d.key === tg.key)?.label ?? tg.key),
        [scenes, devices],
    );
    const targetCount = useCallback(
        (tg: PlanTarget) => (tg.kind === 'scene' ? (scenes.find((s) => s.id === tg.sceneId)?.targets.length ?? 0) : 1),
        [scenes],
    );
    const entriesOfScene = useCallback(
        (sceneId: string) => entries.filter((e) => e.target.kind === 'scene' && e.target.sceneId === sceneId),
        [entries],
    );

    const showToast = useCallback((text: string) => {
        setToast(text);
        window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 2600);
    }, []);

    const saveScene = useCallback((s: Scene) => {
        setScenes((prev) => (prev.some((x) => x.id === s.id) ? prev.map((x) => (x.id === s.id ? s : x)) : [...prev, s]));
    }, []);
    const toggleFavorite = useCallback((id: string) => {
        setScenes((prev) => prev.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)));
    }, []);
    const deleteScene = useCallback((id: string) => {
        setScenes((prev) => prev.filter((x) => x.id !== id));
        setEntries((prev) => prev.filter((e) => !(e.target.kind === 'scene' && e.target.sceneId === id)));
    }, []);
    const saveEntry = useCallback((e: PlanEntry) => {
        setEntries((prev) => (prev.some((x) => x.id === e.id) ? prev.map((x) => (x.id === e.id ? e : x)) : [...prev, e]));
    }, []);
    const deleteEntry = useCallback((id: string) => setEntries((prev) => prev.filter((x) => x.id !== id)), []);
    const toggleEntry = useCallback(
        (id: string) => setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x))),
        [],
    );
    const runScene = useCallback(
        (id: string) => {
            const s = scenes.find((x) => x.id === id);
            if (!s) return;
            showToast(`Nur simuliert: „${s.name}" würde ${s.targets.length} Rollläden fahren`);
        },
        [scenes, showToast],
    );

    return {
        now,
        today,
        devices,
        floors,
        scenes,
        entries,
        master,
        pausedToday,
        holidayMode,
        samples,
        sunFor,
        occurrences,
        upcoming,
        nextRunOf,
        sceneOf,
        deviceOf,
        targetName,
        targetCount,
        entriesOfScene,
        setMaster,
        setPausedToday,
        setHolidayMode,
        saveScene,
        deleteScene,
        toggleFavorite,
        saveEntry,
        deleteEntry,
        toggleEntry,
        runScene,
        toast,
        showToast,
    };
}
