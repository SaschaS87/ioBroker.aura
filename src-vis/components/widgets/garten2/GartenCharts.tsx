/**
 * UI-Facelift, Garten (nur Dev-Vorschau, Entwurf E): Auswertungen auf eigenen Unterseiten, nach denselben
 * Regeln wie die Heizungs-Unterseiten (Sascha, 17.11.2026). Gleiche Bausteine: Zeitraum-Wahl
 * (HeizungPeriodNav), Karte mit Diagramm, Begleittext und „Im gewählten Zeitraum" (HzDetailFrame),
 * Theme-Farben (useChartInk), Zoom-Schieber auf Zeitachsen (useChartZoom).
 *
 *   GartenWeatherChart  Verdunstung und Regen
 *   GartenSoilChart     Bodenfeuchte eines Kreises, Gießen als Streifen, Schaltpunkt als Linie
 *
 * Woher die Werte kommen (geprüft 17.11.2026, siehe Vault „Sprinklecontrol Adapter – Verdunstungsberechnung",
 * Abschnitt „Aufzeichnung für Garten-Charts"):
 *   - `<inst>.evaporation.ETpToday` ist Verdunstung MINUS gemessener Regen des Tages (der Adapter zieht jeden
 *     Anstieg von `alias.0.Wetterdaten.regenHeute` ab). Verdunstung = ETpToday + regenHeute, je Zeitpunkt
 *     bzw. je Tag mit dem letzten Wert vor Mitternacht.
 *   - `regenHeute` ist ein Tageszähler (Netatmo), Tagessumme = letzter Wert des Tages (wie RainDailyWidget).
 *   - `actualSoilMoisture` ist die Wasserbilanz je Kreis (minus Verdunstung, plus Regen, plus Gießen).
 *   - `valveOn` wird erst seit 17.11.2026 aufgezeichnet; frühere Läufe fehlen im Diagramm.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { getHistoryDirect, type HistoryEntry } from '../../../hooks/useIoBroker';
import { formatNum } from '../../../utils/formatValue';
import { periodWindow, type PeriodMode } from '../../../utils/chartPeriod';
import { HeizungPeriodNav } from '../heating/HeizungPeriodNav';
import { useChartInk } from '../heating/chartInk';
import { useChartZoom } from '../heating/chartZoom';
import { HzDetailFrame, type HzStat } from '../heating/HzSubpage';
// Zeitraum-Wahl, Diagramm-Karte und Kennzahl-Zeilen nutzen die hz-*-Klassen dieser Datei (wie Wetter)
import '../heating/HeizungFacelift.css';

const HISTORY = 'influxdb.0';
const RAIN_DP = 'alias.0.Wetterdaten.regenHeute';
/** Seit wann `valveOn` aufgezeichnet wird (Freigabe Sascha, 17.11.2026) */
const VALVE_LOG_SINCE = new Date(2026, 10, 17, 21, 0).getTime();

/** Farben wie auf den anderen Seiten: Verdunstung orange (Sonne), Regen blau, Bodenfeuchte türkis. */
const C = {
    evap: '#eb6834',
    rain: '#2a78d6',
    net: '#898781',
    soil: '#1baf7a',
    water: '#2a78d6',
};

const CHART_H = 220;

type Pt = [number, number | null];
const num = (v: HistoryEntry['val']): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mm = (v: number | null, d = 1) => (v === null ? '–' : `${formatNum(v, d)} mm`);
const signedMm = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatNum(Math.abs(v), 1)} mm`;
const pct = (v: number | null) => (v === null ? '–' : `${formatNum(v, 0)} %`);
const dayLabel = (t: number) =>
    new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const timeLabel = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const stampLabel = (t: number, mode: PeriodMode) =>
    mode === 'day' ? `${timeLabel(t)} Uhr` : `${dayLabel(t)} ${timeLabel(t)}`;

function raw(id: string, start: number, end: number, count = 20000): Promise<HistoryEntry[]> {
    return getHistoryDirect(id, { instance: HISTORY, start, end, aggregate: 'none', count }).then((r) =>
        [...r].sort((a, b) => a.ts - b.ts),
    );
}

/** Tage des Fensters [start, end) als Mitternachts-Zeitpunkte. */
function daysOf(w: { start: number; end: number }): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    const d = new Date(w.start);
    while (d.getTime() < w.end) {
        const s = d.getTime();
        d.setDate(d.getDate() + 1);
        out.push({ start: s, end: d.getTime() });
    }
    return out;
}

/** Zeitraum-Zustand mit derselben Wahl wie auf den Heizungs-Unterseiten. */
function usePeriod(initial: PeriodMode) {
    const [mode, setMode] = useState<PeriodMode>(initial);
    const [offset, setOffset] = useState(0);
    const win = useMemo(() => periodWindow(mode, offset), [mode, offset]);
    const nav = (
        <HeizungPeriodNav
            mode={mode}
            offset={offset}
            onMode={(m) => {
                setMode(m);
                setOffset(0);
            }}
            onOffset={setOffset}
        />
    );
    return { mode, offset, win, nav };
}

function Empty({ loading }: { loading: boolean }) {
    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ color: 'var(--text-secondary)' }}
        >
            {loading ? (
                <Loader size={20} className="animate-spin" />
            ) : (
                <>
                    <BarChart2 size={28} strokeWidth={1.5} />
                    <span className="text-xs">Keine Daten</span>
                </>
            )}
        </div>
    );
}

const tooltipBase = {
    backgroundColor: 'var(--app-surface, #1e1e1e)',
    borderColor: 'var(--app-border, #333)',
    textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
};

// ── Verdunstung und Regen ────────────────────────────────────────────────────

interface DayRow {
    start: number;
    evap: number | null;
    rain: number | null;
    net: number | null;
}

export function GartenWeatherChart({ instance }: { instance: string }) {
    const { mode, offset, win, nav } = usePeriod('week');
    const inkRef = useRef<HTMLDivElement>(null);
    const ink = useChartInk(inkRef);
    const netDp = `${instance}.evaporation.ETpToday`;

    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState<DayRow[]>([]);
    const [line, setLine] = useState<{ evap: Pt[]; rain: Pt[]; net: Pt[] } | null>(null);
    const zoom = useChartZoom(win, mode === 'day', ink);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void (async () => {
            const now = Date.now();
            // Regen: Rohwerte ab zwei Tage vorher, damit ein Tag ohne Eintrag den letzten Stand kennt
            const rain = await raw(RAIN_DP, win.start - 2 * 86_400_000, Math.min(win.end, now));
            if (mode === 'day') {
                const net = await raw(netDp, win.start, Math.min(win.end, now), 5000);
                // Der Regenzähler beginnt um Mitternacht bei 0; Werte vom Vortag zählen nicht
                let ri = 0;
                let r: number | null = null;
                const evap: Pt[] = [];
                const netPts: Pt[] = [];
                const rainPts: Pt[] = [];
                const inDay = rain.filter((e) => e.ts >= win.start);
                for (const e of net) {
                    while (ri < inDay.length && inDay[ri].ts <= e.ts) r = num(inDay[ri++].val);
                    const n = num(e.val);
                    netPts.push([e.ts, n]);
                    evap.push([e.ts, n === null ? null : n + (r ?? 0)]);
                }
                for (const e of inDay) rainPts.push([e.ts, num(e.val)]);
                if (!cancelled) {
                    setLine({ evap, rain: rainPts, net: netPts });
                    setDays([]);
                    setLoading(false);
                }
                return;
            }
            // 7 Tage / Monat: je Tag der letzte Wert vor Mitternacht (kurze Abfrage der letzten 30 Minuten)
            const list = daysOf(win).filter((d) => d.start < now);
            const nets = await Promise.all(
                list.map((d) => raw(netDp, Math.min(d.end, now) - 30 * 60_000, Math.min(d.end, now), 200)),
            );
            let carry: number | null = null;
            let ri = 0;
            const rows: DayRow[] = list.map((d, i) => {
                let last: number | null = null;
                let seen = false;
                while (ri < rain.length && rain[ri].ts < d.end) {
                    if (rain[ri].ts >= d.start) {
                        last = num(rain[ri].val);
                        seen = true;
                    } else carry = num(rain[ri].val);
                    ri++;
                }
                // Tag ohne Eintrag: Zähler hat sich nicht bewegt; bei 0 trocken, sonst unbekannt (Stationslücke)
                const rainDay = seen ? last : carry === 0 ? 0 : null;
                if (seen) carry = last;
                const n = nets[i].length ? num(nets[i][nets[i].length - 1].val) : null;
                return { start: d.start, rain: rainDay, net: n, evap: n === null ? null : n + (rainDay ?? 0) };
            });
            if (!cancelled) {
                setDays(rows);
                setLine(null);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // Fenster über start/end, zoom über seine Einzelwerte (wie HeatingDetails)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, win.start, win.end, netDp]);

    const hasData =
        mode === 'day' ? !!line && line.net.length > 0 : days.some((d) => d.evap !== null || d.rain !== null);

    const option = useMemo(() => {
        const axisLabel = { color: ink.axis, fontSize: 10 };
        const yAxis = {
            type: 'value' as const,
            axisLabel: { ...axisLabel, formatter: '{value}' },
            axisLine: { show: true, lineStyle: { color: ink.axisLine } },
            splitLine: { show: true, lineStyle: { color: ink.grid } },
            name: 'mm',
            nameTextStyle: { color: ink.axis, fontSize: 10, align: 'right' as const },
        };
        const legend = {
            bottom: 0,
            textStyle: { color: ink.axis, fontSize: 10 },
            itemWidth: 14,
            itemHeight: 8,
            inactiveColor: ink.axisLine,
            selected: zoom.legendSelected,
        };
        if (mode === 'day' && line) {
            return {
                backgroundColor: 'transparent',
                animation: false,
                grid: { left: 36, right: 12, top: 22, bottom: 40 + zoom.extraBottom },
                legend: { ...legend, data: ['Verdunstung', 'Regen', 'Bilanz'] },
                xAxis: {
                    type: 'time' as const,
                    min: win.start,
                    max: win.end,
                    axisLabel,
                    axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                    splitLine: { show: false },
                },
                yAxis,
                dataZoom: zoom.dataZoom,
                tooltip: {
                    trigger: 'axis' as const,
                    ...tooltipBase,
                    formatter: (params: unknown) => {
                        const items = (params as { seriesName: string; value: Pt; marker: string }[]).filter(
                            (p) => !p.seriesName.startsWith('_') && Array.isArray(p.value),
                        );
                        if (!items.length) return '';
                        const lines = items.map((p) => `${p.marker} ${p.seriesName}: <b>${mm(p.value[1], 2)}</b>`);
                        return `${timeLabel(items[0].value[0])} Uhr<br/>${lines.join('<br/>')}`;
                    },
                },
                series: zoom.frame(
                    [
                        {
                            name: 'Verdunstung',
                            type: 'line',
                            data: line.evap,
                            showSymbol: false,
                            itemStyle: { color: C.evap },
                            lineStyle: { color: C.evap, width: 2 },
                        },
                        {
                            name: 'Regen',
                            type: 'line',
                            step: 'end',
                            data: line.rain,
                            showSymbol: false,
                            itemStyle: { color: C.rain },
                            lineStyle: { color: C.rain, width: 2 },
                            areaStyle: { color: C.rain, opacity: 0.1 },
                        },
                        {
                            name: 'Bilanz',
                            type: 'line',
                            data: line.net,
                            showSymbol: false,
                            itemStyle: { color: C.net },
                            lineStyle: { color: C.net, width: 1.5, type: 'dashed' },
                        },
                    ],
                    line.net,
                ),
            };
        }
        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 36, right: 12, top: 22, bottom: 40 },
            legend: { ...legend, data: ['Verdunstung', 'Regen'] },
            xAxis: {
                type: 'category' as const,
                data: days.map((d) => d.start),
                axisLabel: {
                    ...axisLabel,
                    formatter: (v: string) => {
                        const t = new Date(Number(v));
                        return mode === 'week'
                            ? t.toLocaleDateString('de-DE', { weekday: 'short' })
                            : String(t.getDate());
                    },
                },
                axisTick: { show: false },
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
            },
            yAxis,
            tooltip: {
                trigger: 'axis' as const,
                ...tooltipBase,
                formatter: (params: unknown) => {
                    const i = (params as { dataIndex: number }[])[0]?.dataIndex;
                    const d = days[i];
                    if (!d) return '';
                    const bal = d.evap !== null && d.rain !== null ? d.rain - d.evap : null;
                    return [
                        dayLabel(d.start),
                        `Verdunstung: <b>${mm(d.evap, 2)}</b>`,
                        `Regen: <b>${mm(d.rain)}</b>`,
                        `Bilanz: <b>${bal === null ? '–' : signedMm(bal)}</b>`,
                    ].join('<br/>');
                },
            },
            series: [
                {
                    name: 'Verdunstung',
                    type: 'bar',
                    data: days.map((d) => d.evap),
                    itemStyle: { color: C.evap, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 12,
                    barGap: '15%',
                },
                {
                    name: 'Regen',
                    type: 'bar',
                    data: days.map((d) => d.rain),
                    itemStyle: { color: C.rain, borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 12,
                },
            ],
        };
        // Fenster über start/end, zoom über seine Einzelwerte (wie HeatingDetails)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mode,
        line,
        days,
        win.start,
        win.end,
        ink.axis,
        ink.axisLine,
        ink.grid,
        zoom.dataZoom,
        zoom.extraBottom,
        zoom.legendSelected,
    ]);

    const stats: HzStat[] | null = useMemo(() => {
        if (!hasData) return null;
        let evap: number | null = null;
        let rain: number | null = null;
        let rainDays = 0;
        let wet: DayRow | null = null;
        if (mode === 'day' && line) {
            const lastNet = [...line.net].reverse().find((p) => p[1] !== null)?.[1] ?? null;
            const lastRain = [...line.rain].reverse().find((p) => p[1] !== null)?.[1] ?? 0;
            rain = lastRain;
            evap = lastNet === null ? null : lastNet + lastRain;
        } else {
            for (const d of days) {
                if (d.evap !== null) evap = (evap ?? 0) + d.evap;
                if (d.rain !== null) rain = (rain ?? 0) + d.rain;
                if ((d.rain ?? 0) >= 0.2) rainDays++;
                if (d.rain !== null && (!wet || d.rain > (wet.rain ?? 0))) wet = d;
            }
        }
        const out: HzStat[] = [
            { label: 'Verdunstung', value: mm(evap), color: C.evap },
            { label: 'Regen', value: mm(rain), sub: 'gemessen, Netatmo', color: C.rain },
        ];
        if (evap !== null && rain !== null)
            out.push({ label: 'Bilanz', value: signedMm(rain - evap), sub: 'Regen minus Verdunstung, ohne Gießen' });
        if (mode !== 'day') {
            out.push({ label: 'Tage mit Regen', value: String(rainDays), sub: 'ab 0,2 mm' });
            if (wet && (wet.rain ?? 0) > 0)
                out.push({ label: 'Nassester Tag', value: mm(wet.rain), sub: dayLabel(wet.start) });
        }
        return out;
    }, [hasData, mode, line, days]);

    return (
        <HzDetailFrame innerRef={inkRef} stats={stats} nav={nav}>
            <div className="relative w-full" style={{ height: CHART_H + (mode === 'day' ? zoom.extraBottom : 0) }}>
                {!hasData && <Empty loading={loading} />}
                {hasData && (
                    <ReactECharts
                        key={`${mode}-${offset}`}
                        option={option}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge
                        onEvents={zoom.onEvents}
                        onChartReady={zoom.onChartReady}
                    />
                )}
            </div>
        </HzDetailFrame>
    );
}

// ── Bodenfeuchte eines Kreises ───────────────────────────────────────────────

export function GartenSoilChart({ instance, circle }: { instance: string; circle: string }) {
    const { mode, offset, win, nav } = usePeriod('week');
    const inkRef = useRef<HTMLDivElement>(null);
    const ink = useChartInk(inkRef);
    const base = `${instance}.sprinkle.${circle}`;
    const zoom = useChartZoom(win, true, ink);

    const [loading, setLoading] = useState(true);
    const [soil, setSoil] = useState<Pt[]>([]);
    const [runs, setRuns] = useState<[number, number][]>([]);
    const [trigger, setTrigger] = useState<Pt[]>([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        void (async () => {
            const now = Date.now();
            const to = Math.min(win.end, now);
            // Tag: Rohwerte (ein Wert je Minute). 7 Tage / Monat: Mittel je 30 Minuten, die Linie bleibt glatt
            const soilP =
                mode === 'day'
                    ? raw(`${base}.actualSoilMoisture`, win.start, to, 5000)
                    : getHistoryDirect(`${base}.actualSoilMoisture`, {
                          instance: HISTORY,
                          start: win.start,
                          end: to,
                          step: 30 * 60_000,
                          aggregate: 'average',
                          count: 5000,
                      }).then((r) => [...r].sort((a, b) => a.ts - b.ts));
            const [s, v, t] = await Promise.all([
                soilP,
                raw(`${base}.valveOn`, win.start - 7 * 86_400_000, to, 5000),
                raw(`${base}.triggerPoint`, win.start - 400 * 86_400_000, to, 2000),
            ]);
            // Gießen: Ventil an bis aus; ein Lauf, der noch läuft, endet „jetzt"
            const r: [number, number][] = [];
            let on: number | null = null;
            for (const e of v) {
                if (e.val === true && on === null) on = e.ts;
                else if (e.val === false && on !== null) {
                    if (e.ts > win.start) r.push([Math.max(on, win.start), e.ts]);
                    on = null;
                }
            }
            if (on !== null) r.push([Math.max(on, win.start), to]);
            // Schaltpunkt als Stufe: letzter Wert vor dem Fenster, dann die Änderungen
            let tp: number | null = null;
            const tPts: Pt[] = [];
            for (const e of t) {
                if (e.ts < win.start) tp = num(e.val);
                else tPts.push([e.ts, num(e.val)]);
            }
            const trig: Pt[] =
                tp !== null || tPts.length
                    ? [[win.start, tp ?? tPts[0][1]], ...tPts, [to, tPts.at(-1)?.[1] ?? tp]]
                    : [];
            if (!cancelled) {
                // Mittelwerte je 30 Minuten tragen den Zeitstempel des Abschnitts, der letzte kann nach „jetzt"
                // liegen (17.11.2026: 22:09 Uhr um 21:39 Uhr); was nach dem Fensterende liegt, fällt weg
                setSoil(s.filter((e) => e.ts <= to).map((e) => [e.ts, num(e.val)]));
                setRuns(r);
                setTrigger(trig);
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, win.start, win.end, base]);

    const hasData = soil.some((p) => p[1] !== null);

    const option = useMemo(() => {
        const axisLabel = { color: ink.axis, fontSize: 10 };
        const max = Math.max(120, ...soil.map((p) => p[1] ?? 0));
        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 40, right: 12, top: 12, bottom: 40 + zoom.extraBottom },
            legend: {
                data: ['Bodenfeuchte', 'Schaltpunkt', 'Gießen'],
                selected: zoom.legendSelected,
                inactiveColor: ink.axisLine,
                bottom: 0,
                textStyle: { color: ink.axis, fontSize: 10 },
                itemWidth: 14,
                itemHeight: 8,
            },
            xAxis: {
                type: 'time' as const,
                min: win.start,
                max: win.end,
                axisLabel,
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                max: Math.ceil(max / 20) * 20,
                axisLabel: { ...axisLabel, formatter: '{value} %' },
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: true, lineStyle: { color: ink.grid } },
            },
            dataZoom: zoom.dataZoom,
            tooltip: {
                trigger: 'axis' as const,
                ...tooltipBase,
                formatter: (params: unknown) => {
                    const items = (params as { seriesName: string; value: Pt; marker: string }[]).filter(
                        (p) =>
                            (p.seriesName === 'Bodenfeuchte' || p.seriesName === 'Schaltpunkt') &&
                            Array.isArray(p.value),
                    );
                    if (!items.length) return '';
                    const t = items[0].value[0];
                    const watering = runs.some(([a, b]) => t >= a && t <= b);
                    const lines = items.map((p) => `${p.marker} ${p.seriesName}: <b>${pct(p.value[1])}</b>`);
                    if (watering) lines.push('Gießen läuft');
                    return `${stampLabel(t, mode)}<br/>${lines.join('<br/>')}`;
                },
            },
            series: zoom.frame(
                [
                    {
                        // Gießen als blaue Streifen hinter der Linie (wie „Pumpe aus" bei der Heizung)
                        name: 'Gießen',
                        type: 'line',
                        data: [],
                        itemStyle: { color: C.water },
                        lineStyle: { opacity: 0 },
                        markArea: {
                            silent: true,
                            itemStyle: { color: C.water, opacity: 0.16 },
                            data: runs.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
                        },
                    },
                    {
                        name: 'Schaltpunkt',
                        type: 'line',
                        step: 'end',
                        data: trigger,
                        showSymbol: false,
                        itemStyle: { color: ink.axis },
                        lineStyle: { color: ink.axis, width: 1, type: 'dashed' },
                    },
                    {
                        name: 'Bodenfeuchte',
                        type: 'line',
                        data: soil,
                        showSymbol: false,
                        itemStyle: { color: C.soil },
                        lineStyle: { color: C.soil, width: 2 },
                        areaStyle: { color: C.soil, opacity: 0.1 },
                    },
                ],
                soil,
            ),
        };
        // Fenster über start/end, zoom über seine Einzelwerte (wie HeatingDetails)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mode,
        soil,
        runs,
        trigger,
        win.start,
        win.end,
        ink.axis,
        ink.axisLine,
        ink.grid,
        zoom.dataZoom,
        zoom.extraBottom,
        zoom.legendSelected,
    ]);

    const stats: HzStat[] | null = useMemo(() => {
        if (!hasData) return null;
        const vals = soil.filter((p): p is [number, number] => p[1] !== null);
        const last = vals[vals.length - 1];
        const lo = vals.reduce((a, b) => (b[1] < a[1] ? b : a));
        const hi = vals.reduce((a, b) => (b[1] > a[1] ? b : a));
        const minutes = Math.round(runs.reduce((s, [a, b]) => s + (b - a), 0) / 60_000);
        const out: HzStat[] = [
            { label: 'Bodenfeuchte zuletzt', value: pct(last[1]), sub: stampLabel(last[0], mode), color: C.soil },
            { label: 'Tiefster Wert', value: pct(lo[1]), sub: stampLabel(lo[0], mode) },
            { label: 'Höchster Wert', value: pct(hi[1]), sub: stampLabel(hi[0], mode) },
            {
                label: 'Gießen',
                value: runs.length === 0 ? 'keins' : `${runs.length}× · ${minutes} min`,
                sub: win.start < VALVE_LOG_SINCE ? 'aufgezeichnet erst seit 17.11.2026' : undefined,
                color: runs.length ? C.water : undefined,
            },
        ];
        return out;
    }, [hasData, soil, runs, mode, win.start]);

    return (
        <HzDetailFrame innerRef={inkRef} stats={stats} nav={nav}>
            <div className="relative w-full" style={{ height: CHART_H + zoom.extraBottom }}>
                {!hasData && <Empty loading={loading} />}
                {hasData && (
                    <ReactECharts
                        key={`${mode}-${offset}`}
                        option={option}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge
                        onEvents={zoom.onEvents}
                        onChartReady={zoom.onChartReady}
                    />
                )}
            </div>
        </HzDetailFrame>
    );
}
