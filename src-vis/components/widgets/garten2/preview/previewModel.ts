/**
 * Garten2 — Design-Entwuerfe (NUR Dev-Vorschau, 22.09.2026).
 *
 * Sascha waehlt hier zwischen mehreren Gestaltungen des Steuerpults, und zwar
 * in der echten App mit echten Werten, nicht in einem Artefakt. Die gewaehlte
 * Variante wird danach zum eigentlichen Garten2-Aufbau, die anderen fliegen
 * raus — dieser Ordner ist also ein Provisorium.
 *
 * In der Dev-Vorschau sind Schreibbefehle gesperrt (devWriteGuard). Damit sich
 * die Entwuerfe trotzdem anfuehlen wie echt, laufen Moduswechsel und
 * „Jetzt gießen" hier gegen einen LOKALEN Zustand: nichts davon erreicht den
 * Pi. Gelesen werden echte Datenpunkte.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TimerWeekday } from '../../../../types';
import { clampMinutes } from '../../garten/gartenConstants';
import type { CircleProbeData } from '../Garten2Widget';
import type { SprinkleWeather } from '../useSprinkleWeather';

export const WEEKDAY_ORDER: TimerWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_SHORT: Record<TimerWeekday, string> = {
    mon: 'Mo',
    tue: 'Di',
    wed: 'Mi',
    thu: 'Do',
    fri: 'Fr',
    sat: 'Sa',
    sun: 'So',
};
export const WEEKDAY_LETTER: Record<TimerWeekday, string> = {
    mon: 'M',
    tue: 'D',
    wed: 'M',
    thu: 'D',
    fri: 'F',
    sat: 'S',
    sun: 'S',
};
const JS_DAY: Record<TimerWeekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export type G2Mode = 'evaporation' | 'schedule' | 'unknown';

export interface G2Plan {
    days: Set<TimerWeekday>;
    /** "06:00" — Startzeit des ersten aktiven Termins. */
    time: string | null;
    /** "Mi 06:00" oder null, wenn nichts ansteht. */
    next: string | null;
    nextAt: number | null;
    /** Nur fuer die Vorschau erfundene Termine? (Toggle „Beispieltermine") */
    sample: boolean;
}

export interface G2Circle {
    name: string;
    label: string;
    mode: G2Mode;
    moisture: number | null;
    lastOn: string;
    lastRunningTime: string;
    lastConsumed: number | null;
    weekConsumed: number | null;
    plan: G2Plan;
}

export interface G2Run {
    name: string;
    label: string;
    totalSec: number;
    remainingSec: number;
    simulated: boolean;
}

export interface G2Model {
    circles: G2Circle[];
    running: G2Run | null;
    weather: SprinkleWeather;
    /** Juengster Lauf ueber alle Kreise (aus history.lastOn). */
    lastRun: G2Circle | null;
    /** Naechster geplanter Lauf ueber alle Kreise im Zeitplan-Modus. */
    nextRun: { circle: G2Circle; text: string } | null;
    weekLiters: number | null;
    /** Toggle „Beispieldaten" der Umschaltleiste. */
    samples: boolean;
    setMode: (name: string, mode: 'evaporation' | 'schedule') => void;
    start: (name: string, minutes: number) => void;
    stop: () => void;
    openSettings: () => void;
}

export interface G2Extras {
    lastRunningTime: string;
    lastConsumed: number | null;
    weekConsumed: number | null;
}

// ── Hilfen ──────────────────────────────────────────────────────────────────

export function fmtNum(v: number | null, digits = 1): string {
    return v === null ? '—' : v.toLocaleString('de-DE', { maximumFractionDigits: digits });
}

export function fmtMm(v: number | null, digits = 1): string {
    return v === null ? '—' : `${fmtNum(v, digits)} mm`;
}

export function fmtClock(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "15.09 06:10" -> Date im laufenden (bzw. Vor-)Jahr. */
function parseLastOn(text: string): Date | null {
    const m = /^(\d{1,2})\.(\d{1,2})\.?\s+(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!m) return null;
    const now = new Date();
    const d = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]), Number(m[3]), Number(m[4]));
    if (d.getTime() > now.getTime() + 86400000) d.setFullYear(d.getFullYear() - 1);
    return d;
}

/** "15.09 06:10" -> "15.09., 06:10 Uhr" bzw. "heute, 06:10 Uhr". */
export function fmtLastOn(text: string): string {
    const d = parseLastOn(text);
    if (!d) return text || '—';
    const today = new Date();
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === today.toDateString()) return `heute, ${hm} Uhr`;
    if (d.toDateString() === y.toDateString()) return `gestern, ${hm} Uhr`;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}., ${hm} Uhr`;
}

/** "09:00" / "01:20:43" -> "9 min" / "81 min". */
export function fmtRunTime(text: string): string {
    const parts = text.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return text;
    const min = parts.length === 3 ? parts[0] * 60 + parts[1] : parts[0];
    return `${min} min`;
}

interface NextHit {
    at: number;
    text: string;
}

function nextHit(days: Set<TimerWeekday>, hour: number, minute: number, now = new Date()): NextHit | null {
    let hit: NextHit | null = null;
    for (const d of days) {
        const at = new Date(now);
        at.setHours(hour, minute, 0, 0);
        let delta = (JS_DAY[d] - now.getDay() + 7) % 7;
        if (delta === 0 && at.getTime() <= now.getTime()) delta = 7;
        at.setDate(at.getDate() + delta);
        if (!hit || at.getTime() < hit.at) {
            const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            hit = { at: at.getTime(), text: `${delta === 0 ? 'heute' : delta === 1 ? 'morgen' : WEEKDAY_SHORT[d]} ${hm}` };
        }
    }
    return hit;
}

/** Erfundene Termine, nur damit die Entwuerfe nicht leer aussehen — auf dem
 *  Pi sind (Stand 22.09.) keine Termine hinterlegt. */
const SAMPLE_PLANS: { days: TimerWeekday[]; hour: number; minute: number }[] = [
    { days: ['mon', 'wed', 'fri'], hour: 6, minute: 0 },
    { days: ['tue', 'thu', 'sat'], hour: 6, minute: 15 },
    { days: ['wed', 'sun'], hour: 7, minute: 0 },
];

function buildPlan(p: CircleProbeData, index: number, useSamples: boolean): G2Plan {
    const events = p.schedule.enabled ? p.schedule.events.filter((e) => e.enabled && e.trigger.kind === 'time') : [];
    if (events.length > 0) {
        const days = new Set<TimerWeekday>();
        for (const e of events) for (const d of e.weekdays) days.add(d);
        const first = events[0].trigger as { hour: number; minute: number };
        let next: NextHit | null = null;
        for (const e of events) {
            const t = e.trigger as { hour: number; minute: number };
            const n = nextHit(new Set(e.weekdays), t.hour, t.minute);
            if (n && (!next || n.at < next.at)) next = n;
        }
        const time = `${String(first.hour).padStart(2, '0')}:${String(first.minute).padStart(2, '0')}`;
        return { days, time, next: next?.text ?? null, nextAt: next?.at ?? null, sample: false };
    }
    if (useSamples) {
        const s = SAMPLE_PLANS[index % SAMPLE_PLANS.length];
        const days = new Set(s.days);
        const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
        const n = nextHit(days, s.hour, s.minute);
        return { days, time, next: n?.text ?? null, nextAt: n?.at ?? null, sample: true };
    }
    return { days: new Set(), time: null, next: null, nextAt: null, sample: false };
}

// ── Wasserverbrauch (Beispieldaten) ─────────────────────────────────────────

/** Platzhalter — Saschas echter Preis (inkl. oder ohne Abwasser?) steht aus. */
export const WATER_PRICE_EUR_PER_M3 = 4;

export interface WaterRun {
    circle: string;
    ts: number;
    minutes: number;
    liters: number;
}

/** Deterministischer Zufall je Tag und Kreis, damit Blaettern stabil bleibt. */
function rand(a: number, b: number): number {
    const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return x - Math.floor(x);
}

/**
 * Erfundene Laeufe fuer die Verbrauchsansicht: auf dem Pi wird der Verbrauch
 * pro Lauf nicht mitgeschrieben (lastConsumed ueberschreibt sich, InfluxDB
 * speichert nur Aenderungen — zwei gleich grosse Laeufe waeren einer).
 * Durchfluss ~25 l/min wie beim echten Lauf Terasse am 15.09. (225 l, 9 min).
 */
export function sampleWaterRuns(circles: G2Circle[], start: number, end: number): WaterRun[] {
    const out: WaterRun[] = [];
    const baseMin = [10, 34, 24, 18];
    const d0 = new Date(start);
    d0.setHours(0, 0, 0, 0);
    for (let d = d0; d.getTime() < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const month = d.getMonth();
        if (month < 3 || month > 8) continue; // Saison April–September
        const dayNo = Math.floor(d.getTime() / 86_400_000);
        const wd = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as TimerWeekday[])[d.getDay()];
        circles.forEach((c, i) => {
            const plan = SAMPLE_PLANS[i % SAMPLE_PLANS.length];
            if (!plan.days.includes(wd)) return;
            if (rand(dayNo, i) < 0.22) return; // Regensperre
            const minutes = Math.round(baseMin[i % baseMin.length] * (0.8 + rand(dayNo, i + 7) * 0.4));
            const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), plan.hour, plan.minute).getTime();
            if (ts < start || ts >= end) return;
            out.push({ circle: c.name, ts, minutes, liters: Math.round(minutes * (24 + rand(dayNo, i + 3) * 4)) });
        });
    }
    return out;
}

/** Die naechsten Laeufe ueber alle Kreise im Zeitplan-Modus (fuer Variante L). */
export function upcomingRuns(circles: G2Circle[], limit: number): { circle: G2Circle; at: number }[] {
    const out: { circle: G2Circle; at: number }[] = [];
    const now = new Date();
    for (const c of circles) {
        if (c.mode !== 'schedule' || !c.plan.time) continue;
        const [h, m] = c.plan.time.split(':').map(Number);
        for (let k = 0; k < 8; k++) {
            const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, h, m);
            const wd = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as TimerWeekday[])[at.getDay()];
            if (at.getTime() > now.getTime() && c.plan.days.has(wd)) out.push({ circle: c, at: at.getTime() });
        }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, limit);
}

/** "heute 06:00" / "morgen 06:15" / "Fr 07:00" */
export function fmtWhen(at: number): string {
    const d = new Date(at);
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const delta = Math.floor((d.getTime() - t0.getTime()) / 86_400_000);
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const wd = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as TimerWeekday[])[d.getDay()];
    return `${delta === 0 ? 'heute' : delta === 1 ? 'morgen' : WEEKDAY_SHORT[wd]} ${hm}`;
}

function countdownToSeconds(countdown: string): number | null {
    const m = /^(\d+):(\d{2})$/.exec(countdown.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ── Das Modell ──────────────────────────────────────────────────────────────

interface SimRun {
    name: string;
    totalSec: number;
    endsAt: number;
}

export function useG2PreviewModel(
    probes: CircleProbeData[],
    extras: Record<string, G2Extras>,
    weather: SprinkleWeather,
    useSamples: boolean,
    openSettings: () => void,
): G2Model {
    const [modeOverride, setModeOverride] = useState<Record<string, 'evaporation' | 'schedule'>>({});
    const [sim, setSim] = useState<SimRun | null>(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!sim) return;
        const t = window.setInterval(() => {
            const n = Date.now();
            setNow(n);
            if (n >= sim.endsAt) setSim(null);
        }, 1000);
        return () => window.clearInterval(t);
    }, [sim]);

    const circles = useMemo<G2Circle[]>(
        () =>
            probes.map((p, i) => {
                const x = extras[p.sprinkleName];
                const mode: G2Mode = modeOverride[p.sprinkleName] ?? p.state.mode;
                const plan = buildPlan(p, i, useSamples);
                return {
                    name: p.sprinkleName,
                    label: p.label,
                    mode,
                    moisture: p.state.soilMoisture,
                    lastOn: p.state.lastOn,
                    lastRunningTime: x?.lastRunningTime ?? '',
                    lastConsumed: x?.lastConsumed ?? null,
                    weekConsumed: x?.weekConsumed ?? null,
                    plan: mode === 'schedule' ? plan : { ...plan, next: null, nextAt: null },
                };
            }),
        [probes, extras, modeOverride, useSamples],
    );

    let running: G2Run | null = null;
    if (sim) {
        const c = circles.find((x) => x.name === sim.name);
        running = {
            name: sim.name,
            label: c?.label ?? sim.name,
            totalSec: sim.totalSec,
            remainingSec: Math.max(0, (sim.endsAt - now) / 1000),
            simulated: true,
        };
    } else {
        const real = probes.find((p) => p.state.valveOn === true);
        if (real) {
            const total = clampMinutes(real.state.runningTime) * 60;
            running = {
                name: real.sprinkleName,
                label: real.label,
                totalSec: total,
                remainingSec: countdownToSeconds(real.state.countdown) ?? total,
                simulated: false,
            };
        }
    }

    let lastRun: G2Circle | null = null;
    let lastAt = 0;
    for (const c of circles) {
        const d = parseLastOn(c.lastOn);
        if (d && d.getTime() > lastAt) {
            lastAt = d.getTime();
            lastRun = c;
        }
    }

    let nextRun: G2Model['nextRun'] = null;
    let nextAt = Number.POSITIVE_INFINITY;
    for (const c of circles) {
        if (!c.plan.next || c.plan.nextAt === null || c.plan.nextAt >= nextAt) continue;
        nextAt = c.plan.nextAt;
        nextRun = { circle: c, text: c.plan.next };
    }

    // Mit Beispieldaten passen Kopf, Kreis-Fenster und Verbrauchsfenster
    // zusammen: dann stammt auch „diese Woche" aus den erfundenen Laeufen.
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sampleWeek = useSamples ? sampleWaterRuns(circles, monday.getTime(), Date.now()) : null;
    const circlesOut = sampleWeek
        ? circles.map((c) => ({ ...c, weekConsumed: sampleWeek.filter((r) => r.circle === c.name).reduce((s, r) => s + r.liters, 0) }))
        : circles;
    const weekVals = circlesOut.map((c) => c.weekConsumed).filter((v): v is number => v !== null);
    const weekLiters = weekVals.length ? weekVals.reduce((a, b) => a + b, 0) : null;

    const setMode = useCallback((name: string, mode: 'evaporation' | 'schedule') => {
        setModeOverride((prev) => ({ ...prev, [name]: mode }));
    }, []);
    const start = useCallback((name: string, minutes: number) => {
        const n = Date.now();
        setNow(n);
        setSim({ name, totalSec: minutes * 60, endsAt: n + minutes * 60 * 1000 });
    }, []);
    const stop = useCallback(() => setSim(null), []);

    return { circles: circlesOut, running, weather, lastRun, nextRun, weekLiters, samples: useSamples, setMode, start, stop, openSettings };
}
