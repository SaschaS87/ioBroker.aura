/**
 * Reine Rechenfunktionen fuer den „Aussenfuehler-Check" im Heizung-Tab
 * (Waermepumpen-Aussenfuehler gegen Netatmo-Stationen und Sonnensensor).
 *
 * Alles liegt auf einem festen Zeitraster aus gleich langen Abschnitten. Ein
 * Abschnitt traegt entweder einen Wert oder `null` (= Luecke, im Diagramm eine
 * Unterbrechung der Linie). Es gibt keine Zeitreihe mit eigenen Zeitstempeln:
 * Fuehler, Stationen, Mittel, Abweichung und Helligkeit sind damit immer
 * Abschnitt fuer Abschnitt vergleichbar.
 */

export type Pt = [number, number];
export type Grid = (number | null)[];
export type PeriodKind = 'day' | 'week' | 'month';

/** Abschnittslaenge je Ansicht: Tag 10 min, 7 Tage 30 min, Monat 2 h. */
export function stepForMode(mode: PeriodKind): number {
    if (mode === 'day') return 600_000;
    if (mode === 'week') return 1_800_000;
    return 7_200_000;
}

/** Anzahl Abschnitte des Fensters [start, end). */
export function sectionCount(start: number, end: number, stepMs: number): number {
    return Math.max(0, Math.ceil((end - start) / stepMs));
}

/**
 * Legt eine Zeitreihe auf das Raster.
 *
 * Je Abschnitt [s, s+step):
 *  1. liegen Punkte darin -> deren Mittel,
 *  2. sonst der letzte Punkt VOR dem Abschnitt, wenn er hoechstens `holdMs`
 *     vor dem Abschnittsbeginn liegt (der Adapter schreibt unveraenderte Werte
 *     nicht neu, eine kurze Stille ist also kein Ausfall),
 *  3. sonst `null`.
 * Abschnitte, die in der Zukunft beginnen (`>= now`), bleiben `null`.
 *
 * Die Abschnittsnummer eines Punkts ist floor((ts - start) / step).
 */
export function toGrid(
    points: Pt[],
    start: number,
    end: number,
    stepMs: number,
    holdMs: number,
    now: number = Date.now(),
): Grid {
    const n = sectionCount(start, end, stepMs);
    const sums = new Array<number>(n).fill(0);
    const cnt = new Array<number>(n).fill(0);
    // Letzter Punkt vor Fensterbeginn / vor dem jeweiligen Abschnitt.
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    for (const [ts, v] of sorted) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const i = Math.floor((ts - start) / stepMs);
        if (i < 0 || i >= n) continue;
        sums[i] += v;
        cnt[i] += 1;
    }
    const out: Grid = new Array(n).fill(null);
    let p = 0; // Zeiger: erster Punkt mit ts >= Abschnittsbeginn
    let lastTs: number | null = null;
    let lastVal: number | null = null;
    for (let i = 0; i < n; i++) {
        const s = start + i * stepMs;
        while (p < sorted.length && sorted[p][0] < s) {
            if (typeof sorted[p][1] === 'number' && Number.isFinite(sorted[p][1])) {
                lastTs = sorted[p][0];
                lastVal = sorted[p][1];
            }
            p++;
        }
        if (s >= now) continue; // Zukunft
        if (cnt[i] > 0) out[i] = sums[i] / cnt[i];
        else if (lastTs !== null && lastVal !== null && s - lastTs <= holdMs) out[i] = lastVal;
    }
    return out;
}

/** Mittel der Rasterreihen je Abschnitt, nur ueber Reihen mit Wert; `n` = Anzahl dieser Reihen. */
export function meanOfAvailable(grids: Grid[]): { mean: Grid; n: number[] } {
    const len = grids.reduce((m, g) => Math.max(m, g.length), 0);
    const mean: Grid = new Array(len).fill(null);
    const n: number[] = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
        let sum = 0;
        let c = 0;
        for (const g of grids) {
            const v = g[i];
            if (typeof v === 'number') {
                sum += v;
                c += 1;
            }
        }
        n[i] = c;
        if (c > 0) mean[i] = sum / c;
    }
    return { mean, n };
}

/** Abweichung = Fuehler minus Mittel, nur wo beide Werte da sind. */
export function deviation(fuehler: Grid, mean: Grid): Grid {
    const len = Math.max(fuehler.length, mean.length);
    const out: Grid = new Array(len).fill(null);
    for (let i = 0; i < len; i++) {
        const f = fuehler[i];
        const m = mean[i];
        if (typeof f === 'number' && typeof m === 'number') out[i] = f - m;
    }
    return out;
}

/** Rasterreihe als Diagrammpunkte, Zeitstempel = Abschnittsmitte, `null` = Luecke. */
export function gridToSeries(grid: Grid, start: number, stepMs: number): [number, number | null][] {
    return grid.map((v, i): [number, number | null] => [start + i * stepMs + stepMs / 2, v]);
}

export interface NiceRange {
    min: number;
    max: number;
    interval: number;
}

/**
 * Feste, „schoene" Achse: Grenzen auf Vielfache von `unit` (Temperatur 5 °C,
 * Abweichung 1 K) und IMMER ein expliziter `interval` — ECharts rundet min/max
 * selbst nicht schoen (siehe Gelernte Fallstricke, Abschnitt ECharts).
 * `symmetric` legt die Achse symmetrisch um 0 (fuer die Abweichung).
 */
export function niceRange(
    values: (number | null | undefined)[],
    opts: { unit: number; symmetric?: boolean; minSpan?: number; maxTicks?: number },
): NiceRange {
    const { unit, symmetric = false, minSpan = unit * 2, maxTicks = 6 } = opts;
    const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    let lo = nums.length ? Math.min(...nums) : 0;
    let hi = nums.length ? Math.max(...nums) : minSpan;
    if (symmetric) {
        const m = Math.max(Math.abs(lo), Math.abs(hi), minSpan / 2);
        lo = -m;
        hi = m;
    } else if (hi - lo < minSpan) {
        const mid = (hi + lo) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
    }
    let interval = unit;
    const spanOf = () => Math.ceil(hi / interval) * interval - Math.floor(lo / interval) * interval;
    while (spanOf() / interval > maxTicks) interval += unit;
    let min = Math.floor(lo / interval) * interval;
    let max = Math.ceil(hi / interval) * interval;
    if (symmetric) {
        const m = Math.max(Math.abs(min), Math.abs(max));
        min = -m;
        max = m;
    }
    if (max <= min) max = min + interval;
    return { min, max, interval };
}
