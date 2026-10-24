/**
 * Reine Rechnung der Klappbox „Energie" im Heizung-Tab (kein React, kein Socket, testbar).
 *
 * Eingang: Rohpunkte [ts, kWh] der vier Tageszaehler der Stiebel-Eltron-Waermepumpe
 *   P_HEIZUNG_TAG / P_WW_TAG (Strom) und WM_HEIZEN_TAG / WM_WW_TAG (Waerme).
 *
 * Stolpersteine (alle an echten Daten gemessen):
 *  - Tageszaehler steigen ueber den Tag und springen um ~23:54 auf einen kleinen Restwert
 *    zurueck. Der Tageswert ist darum der HOECHSTWERT der Rohpunkte am lokalen Tag, nicht
 *    der letzte Punkt. Der Rest nach dem Ruecksprung (0–1 kWh) ist kleiner als der Max.
 *  - Ein Tag ohne Punkt ist 0. Nie den Vortag uebernehmen (Influx fuellt gebuendelte
 *    Abfragen mit fill(previous), darum werden die Zaehler roh geholt).
 *  - Der Adapter schreibt gelegentlich Wiederholungspunkte (derselbe Wert, auch nach
 *    einem Ruecksprung). Ein einzelner Wiederholungspunkt ist KEIN Anstieg: zaehlen darf nur
 *    ein Anstieg 0 < neu-alt < 3 kWh zwischen zwei aufeinanderfolgenden Punkten desselben
 *    lokalen Tages, vor dem an diesem Tag noch kein Ruecksprung kam.
 *  - Heiztag = Strom UND Waerme Heizen steigen beide echt. Sonst sind hs = hw = 0 (auch
 *    wenn Punkte vorliegen). Kein festes Datum im Code.
 *  - Tagesgrenzen NUR ueber new Date(y, m, d±n) — nie n × 86_400_000 (am 25.10.2026 hat der
 *    Tag 25 h, am 29.03. nur 23 h). Die doppelte Stunde 02 bei der Zeitumstellung landet
 *    in derselben Zelle.
 *  - WM_NE (Zusatzheizung) wird NICHT zur Waerme gerechnet, nur als Fussnote gezeigt.
 */

export type RawPoint = [number, number];

/** Obergrenze eines einzelnen Anstiegs (kWh) zwischen zwei Rohpunkten; darueber = Artefakt. */
export const MAX_STEP_KWH = 3;

/** Ein Wert unter diesem Anteil des Vorwerts gilt als Ruecksprung (Tageswechsel), alles darueber als Lesefehler. */
export const RESET_RATIO = 0.5;

export interface LocalDay {
    key: string;
    /** Lokale Mitternacht (ms). */
    start: number;
    /** Lokale Mitternacht des Folgetags (ms). */
    end: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in lokaler Zeit. */
export function dayKey(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lokale Stunde 0–23. */
export function hourOf(ts: number): number {
    return new Date(ts).getHours();
}

/** Letzte `count` lokale Kalendertage inkl. heute, aelteste zuerst. */
export function localDays(now: number, count = 30): LocalDay[] {
    const n = new Date(now);
    const y = n.getFullYear();
    const m = n.getMonth();
    const d = n.getDate();
    const out: LocalDay[] = [];
    for (let i = count - 1; i >= 0; i--) {
        const s = new Date(y, m, d - i);
        const e = new Date(y, m, d - i + 1);
        out.push({ key: dayKey(s.getTime()), start: s.getTime(), end: e.getTime() });
    }
    return out;
}

/** Fenster [start, end) ueber alle Tage. */
export function energyWindow(now: number, count = 30): { start: number; end: number } {
    const days = localDays(now, count);
    return { start: days[0].start, end: days[days.length - 1].end };
}

function inWindow(points: RawPoint[], days: LocalDay[]): RawPoint[] {
    const start = days[0].start;
    const end = days[days.length - 1].end;
    return points
        .filter(
            (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= start && p[0] < end,
        )
        .sort((a, b) => a[0] - b[0]);
}

/** Tageswert je Tag: Hoechstwert der Rohpunkte am lokalen Tag, ohne Punkt 0. */
export function dailyFromCounter(points: RawPoint[], days: LocalDay[]): number[] {
    const idx = new Map(days.map((d, i) => [d.key, i]));
    const out = days.map(() => 0);
    for (const [ts, v] of inWindow(points, days)) {
        const i = idx.get(dayKey(ts));
        if (i === undefined) continue;
        if (v > out[i]) out[i] = v;
    }
    return out;
}

export interface Increment {
    /** Index des Tages. */
    day: number;
    /** Zeitstempel des spaeteren Punktes. */
    ts: number;
    kwh: number;
}

/** Alle echten Anstiege (Regel 4) eines Zaehlers. */
export function realIncrements(points: RawPoint[], days: LocalDay[]): Increment[] {
    const idx = new Map(days.map((d, i) => [d.key, i]));
    const pts = inWindow(points, days);
    const out: Increment[] = [];
    let reset = false;
    if (pts.length === 0) return out;
    let [pt, pv] = pts[0];
    for (let i = 1; i < pts.length; i++) {
        const [t1, v1] = pts[i];
        if (dayKey(pt) !== dayKey(t1)) {
            reset = false;
            [pt, pv] = pts[i];
            continue;
        }
        const di = idx.get(dayKey(t1));
        if (di === undefined) continue;
        const diff = v1 - pv;
        if (diff < 0) {
            // Echter Ruecksprung (Zaehler faellt auf unter RESET_RATIO des Vorwerts): ab hier zaehlt der Tag nicht mehr.
            // Ein kleiner Einbruch mitten am Tag (z. B. 5,886 -> 5,006 -> 6,006) ist ein Lesefehler: der Punkt wird
            // uebergangen, der Vorwert bleibt Bezugswert, damit der Rueckweg nicht doppelt zaehlt.
            if (v1 < pv * RESET_RATIO) {
                reset = true;
                [pt, pv] = pts[i];
            }
            continue;
        }
        [pt, pv] = pts[i];
        if (reset) continue;
        if (diff > 0 && diff < MAX_STEP_KWH) out.push({ day: di, ts: t1, kwh: diff });
    }
    return out;
}

/** Je Tag: steigt der Zaehler echt? */
export function risingDays(points: RawPoint[], days: LocalDay[]): boolean[] {
    const r = days.map(() => false);
    for (const inc of realIncrements(points, days)) r[inc.day] = true;
    return r;
}

/**
 * Heatmap-Zellen [Tag][Stunde] in kWh: echte Anstiege der angegebenen Zaehler auf die Stunde des
 * spaeteren Punktes. `allowDay(dayIndex)` filtert (z. B. Heizen nur an Heiztagen).
 */
export function hourlyIncrements(
    points: RawPoint[],
    days: LocalDay[],
    allowDay: (dayIndex: number) => boolean = () => true,
): number[][] {
    const grid = days.map(() => new Array<number>(24).fill(0));
    for (const inc of realIncrements(points, days)) {
        if (!allowDay(inc.day)) continue;
        grid[inc.day][hourOf(inc.ts)] += inc.kwh;
    }
    return grid;
}

export interface EnergySeries {
    pHeizen: RawPoint[];
    pWw: RawPoint[];
    wmHeizen: RawPoint[];
    wmWw: RawPoint[];
}

export interface DayEnergy {
    key: string;
    start: number;
    hs: number;
    ws: number;
    hw: number;
    ww: number;
    s: number;
    w: number;
    az: number | null;
    heatDay: boolean;
    partial: boolean;
}

export interface EnergyTotals {
    S: number;
    W: number;
    HS: number;
    HW: number;
    WS: number;
    WWw: number;
    azGesamt: number | null;
    azHeizen: number | null;
    azWw: number | null;
    /** Anteil Warmwasser am Strom in Prozent. */
    wwAnteil: number | null;
    heatDays: number;
}

export interface EnergyResult {
    days: DayEnergy[];
    hourly: number[][];
    totals: EnergyTotals;
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function buildEnergy(series: EnergySeries, now: number, count = 30): EnergyResult {
    const ld = localDays(now, count);
    const pH = dailyFromCounter(series.pHeizen, ld);
    const pW = dailyFromCounter(series.pWw, ld);
    const wH = dailyFromCounter(series.wmHeizen, ld);
    const wW = dailyFromCounter(series.wmWw, ld);
    const riseP = risingDays(series.pHeizen, ld);
    const riseW = risingDays(series.wmHeizen, ld);
    const risePw = risingDays(series.pWw, ld);
    const riseWw = risingDays(series.wmWw, ld);
    const todayKey = dayKey(now);

    const days: DayEnergy[] = ld.map((d, i) => {
        const heatDay = riseP[i] && riseW[i];
        const hs = heatDay ? pH[i] : 0;
        const hw = heatDay ? wH[i] : 0;
        // Warmwasser wie Heizen: Strom und Waerme zaehlen nur gemeinsam (steigt nur einer, sind beide 0),
        // sonst verfaelscht ein einseitiger Tag die Arbeitszahl.
        const wwDay = risePw[i] && riseWw[i];
        const ws = wwDay ? pW[i] : 0;
        const ww = wwDay ? wW[i] : 0;
        const s = hs + ws;
        const w = hw + ww;
        return {
            key: d.key,
            start: d.start,
            hs,
            ws,
            hw,
            ww,
            s,
            w,
            az: s > 0 ? w / s : null,
            heatDay,
            partial: d.key === todayKey,
        };
    });

    const hHeat = hourlyIncrements(series.pHeizen, ld, (i) => days[i].heatDay);
    // Warmwasser wie in den Tageswerten: nur an Tagen, an denen Strom UND Waerme steigen.
    const hWw = hourlyIncrements(series.pWw, ld, (i) => risePw[i] && riseWw[i]);
    const hourly = hHeat.map((row, i) => row.map((v, h) => v + hWw[i][h]));

    const sum = (f: (d: DayEnergy) => number) => days.reduce((a, d) => a + f(d), 0);
    const HS = sum((d) => d.hs);
    const HW = sum((d) => d.hw);
    const WS = sum((d) => d.ws);
    const WWw = sum((d) => d.ww);
    const S = HS + WS;
    const W = HW + WWw;
    const totals: EnergyTotals = {
        S,
        W,
        HS,
        HW,
        WS,
        WWw,
        azGesamt: ratio(W, S),
        azHeizen: ratio(HW, HS),
        azWw: ratio(WWw, WS),
        wwAnteil: S > 0 ? (WS / S) * 100 : null,
        heatDays: days.filter((d) => d.heatDay).length,
    };
    return { days, hourly, totals };
}

export interface LifetimeInput {
    /** Alle Werte in MWh. */
    pHeizen: number | null;
    pWw: number | null;
    wmHeizen: number | null;
    wmWw: number | null;
}

export interface LifetimeTable {
    azHeizen: number | null;
    azWw: number | null;
    azGesamt: number | null;
}

/** Gesamttabelle (Regel 9): WM_NE wird nicht hinzugerechnet. */
export function lifetimeTable(v: LifetimeInput): LifetimeTable {
    const n = (x: number | null) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const ph = n(v.pHeizen);
    const pw = n(v.pWw);
    const wh = n(v.wmHeizen);
    const ww = n(v.wmWw);
    const azHeizen = ph !== null && wh !== null && ph > 0 ? wh / ph : null;
    const azWw = pw !== null && ww !== null && pw > 0 ? ww / pw : null;
    const azGesamt =
        ph !== null && pw !== null && wh !== null && ww !== null && ph + pw > 0 ? (wh + ww) / (ph + pw) : null;
    return { azHeizen, azWw, azGesamt };
}
