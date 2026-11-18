/**
 * Kennzahlen der Heizungs-Unterseiten (UI-Facelift), aus den Rohwerten des gewählten Zeitraums gerechnet –
 * nicht aus gemittelten Diagrammpunkten (Regel aus Wohnklima).
 *
 * Mittelwerte sind zeitgewichtet: Der Adapter schreibt ungefähr einmal je Minute, bei gleichem Wert aber
 * auch seltener. Jeder Wert gilt bis zum nächsten Eintrag, höchstens 10 Minuten (längere Lücken sind
 * fehlende Daten, kein Dauerzustand). Werte `null` (Pumpe aus) zählen nicht mit.
 */
import { formatNum } from '../../../utils/formatValue';
import type { HzStat } from './HzSubpage';

type Pt = [number, number | null];
export interface StatWindow {
    start: number;
    /** Ende des Fensters, beim laufenden Zeitraum „jetzt" */
    end: number;
}

const CAP_MS = 10 * 60_000;

interface Summary {
    mean: number | null;
    min: number | null;
    minT: number;
    max: number | null;
    maxT: number;
    last: number | null;
    lastT: number;
}

export function summarize(pts: Pt[], w: StatWindow): Summary {
    let sum = 0;
    let dur = 0;
    const s: Summary = { mean: null, min: null, minT: 0, max: null, maxT: 0, last: null, lastT: 0 };
    for (let i = 0; i < pts.length; i++) {
        const [t, v] = pts[i];
        if (t < w.start || t >= w.end || v === null) continue;
        const next = i + 1 < pts.length ? Math.min(pts[i + 1][0], w.end) : w.end;
        const d = Math.min(Math.max(0, next - t), CAP_MS);
        sum += v * d;
        dur += d;
        if (s.min === null || v < s.min) {
            s.min = v;
            s.minT = t;
        }
        if (s.max === null || v > s.max) {
            s.max = v;
            s.maxT = t;
        }
        s.last = v;
        s.lastT = t;
    }
    s.mean = dur > 0 ? sum / dur : null;
    return s;
}

/** Uhrzeit, bei mehr als einem Tag mit Datum. */
export function when(t: number, w: StatWindow): string {
    const d = new Date(t);
    const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (w.end - w.start <= 86_400_000 + 3_600_000) return `um ${hm} Uhr`;
    return `am ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} um ${hm} Uhr`;
}

const deg = (v: number | null) => (v === null ? '–' : `${formatNum(v, 1)} °C`);

/** Laufzeit als „5 h 12 min" bzw. „12 min". */
export function duration(ms: number): string {
    const min = Math.round(ms / 60_000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
}

/** Schrittwert an t (letzter Punkt ≤ t), sonst null. */
function stepAt(sorted: Pt[], t: number): number | null {
    let lo = 0;
    let hi = sorted.length - 1;
    let res = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid][0] <= t) {
            res = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return res >= 0 ? sorted[res][1] : null;
}

const WW_TAIL_MS = 5 * 60_000;

/** Ein-Abschnitte einer 0/1-Reihe als [Beginn, Ende]; ein offener Abschnitt endet bei `end`. */
function runs(pts: Pt[], end: number): [number, number][] {
    const out: [number, number][] = [];
    let since: number | null = null;
    for (const [t, v] of pts) {
        const on = v !== null && v >= 0.5;
        if (on && since === null) since = t;
        else if (!on && since !== null) {
            out.push([since, t]);
            since = null;
        }
    }
    if (since !== null) out.push([since, end]);
    return out;
}

/**
 * Heizkreis: Vorlauf im Mittel und höchstens, Spreizung im Mittel, HK1-Soll. Während der Warmwasser-
 * Bereitung messen dieselben Fühler das Ladewasser (über 50 °C); diese Zeiten zählen nicht mit (`ww`).
 */
export function circuitStats(vl: Pt[], rl: Pt[], soll: Pt[], ww: Pt[], w: StatWindow): HzStat[] {
    // Warmwasser-Abschnitte plus Nachlauf: Nach dem Umschalten zeigt der Fühler noch 1–2 Minuten das heiße
    // Ladewasser (02.11.2026: Warmwasser aus 01:39 UTC, Vorlauf 01:40 noch 57,4 °C, 01:41 28,6 °C).
    const wwRuns = runs(ww, w.end).map(([a, b]): [number, number] => [a, b + WW_TAIL_MS]);
    const heating = (t: number) => !wwRuns.some(([a, b]) => t >= a && t < b);
    const vlH: Pt[] = vl.map(([t, x]) => [t, heating(t) ? x : null]);
    const v = summarize(vlH, w);
    const spread: Pt[] = rl.map(([t, r]) => {
        const f = stepAt(vl, t);
        return [t, r === null || f === null || !heating(t) ? null : f - r];
    });
    const sp = summarize(spread, w);
    const so = summarize(soll, w);
    const out: HzStat[] = [
        { label: 'Vorlauf im Mittel', value: deg(v.mean), sub: 'ohne Warmwasser' },
        { label: 'Höchster Vorlauf', value: deg(v.max), sub: v.max !== null ? when(v.maxT, w) : undefined },
        { label: 'Spreizung im Mittel', value: sp.mean === null ? '–' : `${formatNum(sp.mean, 1)} K` },
    ];
    if (soll.length)
        out.push({
            label: 'HK1-Soll im Mittel',
            value: deg(so.mean),
            sub:
                so.min !== null && so.max !== null && Math.abs(so.max - so.min) >= 0.1
                    ? `von ${formatNum(so.min, 1)} bis ${formatNum(so.max, 1)} °C`
                    : undefined,
        });
    return out;
}

/** Ein/Aus-Reihe → Laufzeit im Fenster und Zahl der Starts (Wechsel von aus auf ein). */
export function onTime(pts: Pt[], w: StatWindow): { ms: number; starts: number } {
    let ms = 0;
    let starts = 0;
    let since: number | null = null;
    let prevOn: boolean | null = null;
    for (const [t, v] of pts) {
        const on = v !== null && v >= 0.5;
        if (on && since === null) since = t;
        else if (!on && since !== null) {
            ms += Math.max(0, Math.min(t, w.end) - Math.max(since, w.start));
            since = null;
        }
        if (on && prevOn === false && t >= w.start && t < w.end) starts++;
        prevOn = on;
    }
    if (since !== null) ms += Math.max(0, w.end - Math.max(since, w.start));
    return { ms, starts };
}

/** Betrieb: Laufzeiten von Verdichter, Heizen, Warmwasser und Pumpe. */
export function operationStats(
    s: { verd: Pt[]; pump: Pt[]; heiz: Pt[]; ww: Pt[] },
    w: StatWindow,
    colors: { heat: string; water: string },
): HzStat[] {
    const v = onTime(s.verd, w);
    const h = onTime(s.heiz, w);
    const ww = onTime(s.ww, w);
    const p = onTime(s.pump, w);
    return [
        {
            label: 'Verdichter',
            value: duration(v.ms),
            sub: `${v.starts} ${v.starts === 1 ? 'Start' : 'Starts'}`,
        },
        { label: 'Heizen', value: duration(h.ms), color: colors.heat },
        { label: 'Warmwasser', value: duration(ww.ms), color: colors.water },
        { label: 'Heizkreispumpe', value: duration(p.ms) },
    ];
}

/** Sollwerte der Schaltprogramme (ISG: WW SOLL TAG / WW SOLL NACHT), null wenn unbekannt. */
export interface WaterPrograms {
    tag: number | null;
    nacht: number | null;
}

/**
 * WW-Soll nach Programm: Der Soll springt mit dem Schaltprogramm zwischen Tag- und Nachtwert (14.11.2026 in
 * InfluxDB: 48 °C ab etwa 06:55, 35 °C ab etwa 20:55 bzw. 21:55 Uhr). Jeder Wert gilt bis zum nächsten
 * Eintrag. Zugeordnet wird über den heute eingestellten Tag- bzw. Nachtwert; alles andere (Bereitschaft,
 * Handbetrieb, früherer Wert) ist „anderer Sollwert".
 */
function sollByProgram(soll: Pt[], w: StatWindow, prog: WaterPrograms): HzStat[] | null {
    if (prog.tag === null || prog.nacht === null || Math.abs(prog.tag - prog.nacht) < 0.25) return null;
    type Cls = 'tag' | 'nacht' | 'sonst';
    const cls = (v: number): Cls =>
        Math.abs(v - prog.tag!) < 0.25 ? 'tag' : Math.abs(v - prog.nacht!) < 0.25 ? 'nacht' : 'sonst';
    // zusammenhängende Abschnitte je Programm, auf das Fenster geschnitten
    const spans: { c: Cls; a: number; b: number; v: number }[] = [];
    for (let i = 0; i < soll.length; i++) {
        const [t, v] = soll[i];
        if (v === null) continue;
        // Der Adapter schreibt den Soll etwa alle 15 min auch ohne Änderung: Der erste Wert im Fenster galt
        // schon zu Fensterbeginn, wenn er höchstens 30 min danach kommt (sonst begann der Tag bei 00:10).
        const a = !spans.length && t - w.start <= 30 * 60_000 ? w.start : Math.max(t, w.start);
        const b = Math.min(i + 1 < soll.length ? soll[i + 1][0] : w.end, w.end);
        if (b <= a) continue;
        const c = cls(v);
        const last = spans[spans.length - 1];
        if (last && last.c === c && last.b >= a - 1000) last.b = b;
        else spans.push({ c, a, b, v });
    }
    if (!spans.length) return null;
    const oneDay = w.end - w.start <= 86_400_000 + 3_600_000;
    const hm = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    // Ende am Fensterrand: ganzer Tag „bis 24:00", laufender Tag „seit 06:55 Uhr"
    const running = w.end - w.start < 86_400_000 - 60_000;
    const span = (s: { a: number; b: number }) =>
        s.b >= w.end ? (running ? `seit ${hm(s.a)} Uhr` : `${hm(s.a)} – 24:00 Uhr`) : `${hm(s.a)} – ${hm(s.b)} Uhr`;
    const sub = (c: Cls) => {
        const mine = spans.filter((s) => s.c === c);
        if (oneDay) return mine.map(span).join(' und ');
        return `zusammen ${duration(mine.reduce((n, s) => n + (s.b - s.a), 0))}`;
    };
    const out: HzStat[] = [];
    if (spans.some((s) => s.c === 'tag')) out.push({ label: 'WW-Soll Tagprogramm', value: deg(prog.tag), sub: sub('tag') });
    if (spans.some((s) => s.c === 'nacht')) out.push({ label: 'WW-Soll Nachtprogramm', value: deg(prog.nacht), sub: sub('nacht') });
    const other = spans.filter((s) => s.c === 'sonst');
    if (other.length) {
        const lo = Math.min(...other.map((s) => s.v));
        const hi = Math.max(...other.map((s) => s.v));
        out.push({
            label: 'Anderer WW-Soll',
            value: hi - lo >= 0.1 ? `${formatNum(lo, 0)}–${formatNum(hi, 0)} °C` : deg(lo),
            sub: sub('sonst'),
        });
    }
    return out;
}

/** Warmwasser: zuletzt, tiefster und höchster Wert, Sollwert (nach Programm, wenn bekannt). */
export function waterStats(ist: Pt[], soll: Pt[], w: StatWindow, prog?: WaterPrograms): HzStat[] {
    const i = summarize(ist, w);
    const so = summarize(soll, w);
    const out: HzStat[] = [
        // „Speicher zuletzt" war missverständlich (Sascha, 14.11.2026)
        { label: 'Warmwasser zuletzt', value: deg(i.last), sub: i.last !== null ? when(i.lastT, w) : undefined },
        { label: 'Tiefster Wert', value: deg(i.min), sub: i.min !== null ? when(i.minT, w) : undefined },
        { label: 'Höchster Wert', value: deg(i.max), sub: i.max !== null ? when(i.maxT, w) : undefined },
    ];
    const byProg = prog ? sollByProgram(soll, w, prog) : null;
    if (byProg) out.push(...byProg);
    else if (soll.length)
        out.push({
            label: 'WW-Soll',
            value:
                so.min !== null && so.max !== null && Math.abs(so.max - so.min) >= 0.1
                    ? `${formatNum(so.min, 0)}–${formatNum(so.max, 0)} °C`
                    : deg(so.last),
            sub: so.min !== null && so.max !== null && Math.abs(so.max - so.min) >= 0.1 ? 'wechselt im Zeitraum' : undefined,
        });
    return out;
}
