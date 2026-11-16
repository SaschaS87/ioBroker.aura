import { useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../hooks/useMultiSeriesData';
import { formatNum } from '../../utils/formatValue';
import { ChartPeriodNav } from './ChartPeriodNav';
import { HeizungPeriodNav } from './heating/HeizungPeriodNav';
import { useHeizungDraft } from './heating/heizungDraft';
import { periodWindow, type PeriodMode } from '../../utils/chartPeriod';
import { SensorCheckDetails } from './heating/SensorCheckChart';
import { EnergyDetails } from './heating/EnergyDetails';
import type { EnergyDps } from './heating/energyModel';
import { useChartInk } from './heating/chartInk';
import { HZ_SOLL_COLOR, HzDetailFrame, useHzSubpage, type HzStat } from './heating/HzSubpage';
import { useChartZoom } from './heating/chartZoom';
import { circuitStats, operationStats, waterStats } from './heating/heatingStats';

/**
 * Collapsible-box charts for the heating widget (STIEBEL LWZ 304 Trend).
 *
 * Two variants, both fed by useMultiSeriesData (raw history) and sharing the
 * ChartPeriodNav pager (Tag / 7 Tage / Monat + wheel date-jump):
 *
 *  • 'circuit'  – "Heizkreis": the red flow/return SPREAD BAND plus the HK1
 *                 target (Soll). One temperature axis.
 *  • 'operation'– "Betrieb": the same spread band on top, and a compact on/off
 *                 timeline strip below it (compressor + circuit pump).
 *
 * Data note: the flow/return helpers (javascript.0.LWZ.HKP_*) are only logged
 * ~1×/min and are 0 whenever the pump is off — so they are fetched RAW (no
 * bucket averaging, which flattened the sharp ramps into a staircase).
 *
 * ECharts renders to canvas → series colours are literal hex (CSS vars don't
 * resolve there). Axis, grid and label colours follow the theme (useChartInk,
 * since 14.11.2026; before that fixed #888/#444/#333, nearly black in light mode).
 *
 * The flow/return helpers write 0 while the circuit pump is off (checked against
 * InfluxDB, 14.11.2026). 0 is no temperature, so it is drawn as a gap.
 */

const C = {
    // Heizen rötlich statt grün (Sascha, 14.11.2026), passend zum Kopf der Heizungs-Seite
    vorlauf: '#b8321f', // dark red (flow, band top)
    ruecklauf: '#ee8b73', // light red (return, band bottom)
    band: 'rgba(208,73,46,0.2)', // spread fill between flow and return
    soll: '#e0922f', // orange (HK1 target flow)
    verdichter: '#eab308', // yellow (compressor)
    pumpe: '#9ca3af', // grey (circuit pump)
    heizen: '#d0492e', // red (space-heating run — matches the Heizung page head)
    warmwasser: '#2f7fd6', // blue (hot-water run — matches the widget's "Warmwasser" chip)
    wwIst: '#e8873a', // orange (hot-water actual temp — the hero line)
    wwSoll: '#2f7fd6', // blue (hot-water target)
    wwBand: 'rgba(47,127,214,0.16)', // light-blue hysteresis fill
    wwHys: '#5aa0e0', // light-blue dashed band edges
};

/** Legenden-Name der grauen Streifen (Facelift-Unterseite) */
const PUMP_OFF = 'Pumpe aus';

/** Spreizung in der Legende und im Tooltip: kräftiger als die Fläche, sonst kaum zu sehen. */
const SPREAD_KEY = 'rgba(208,73,46,0.45)';
/** Legenden-Eintrag der Spreizung (Fläche, kein Strich: die Reihe selbst hat Linienbreite 0). */
const SPREAD_LEGEND = { name: 'Spreizung', icon: 'rect', itemStyle: { color: SPREAD_KEY } };

type Pt = [number, number | null];

/** 0 from the flow/return helper means "pump off, nothing measured" → gap. */
const pumpGaps = (pts: Pt[]): Pt[] => pts.map(([t, v]) => [t, v === 0 ? null : v]);

/** Step value of a sorted series at time t (last point with ts ≤ t). */
function valueAt(sorted: Pt[], t: number): number | null {
    let lo = 0;
    let hi = sorted.length - 1;
    let res = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid][0] <= t) {
            res = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return res >= 0 ? sorted[res][1] : null;
}

/**
 * Build the spread band as a stacked pair sampled at the return timestamps:
 *   base  = return value      (invisible baseline)
 *   delta = max(0, flow-ret)  (the red band on top)
 * The flow is step-interpolated onto each return timestamp; the crisp flow and
 * return lines are drawn separately on top.
 */
function buildBand(vl: Pt[], rl: Pt[]): { base: Pt[]; delta: Pt[] } {
    const base: Pt[] = [];
    const delta: Pt[] = [];
    for (const [t, r] of rl) {
        const v = valueAt(vl, t);
        if (v === null || r === null) continue;
        base.push([t, r]);
        delta.push([t, Math.max(0, v - r)]);
    }
    return { base, delta };
}

/** Fixed temperature-axis max: `base` by default, grown to the next 10° step only if data exceeds it. */
function scaleMax(base: number, ...series: Pt[][]): number {
    let m = 0;
    for (const s of series) for (const p of s) if (p[1] !== null && p[1] > m) m = p[1];
    return m > base ? Math.ceil(m / 10) * 10 : base;
}

/** Contiguous on-intervals (value ≥ 0.5) from a 0/1 series; an open run closes at windowEnd. */
function onIntervals(pts: Pt[], windowEnd: number): [number, number, number][] {
    const iv: [number, number, number][] = [];
    let start: number | null = null;
    for (const [t, v] of pts) {
        const on = v !== null && v >= 0.5;
        if (on && start === null) start = t;
        else if (!on && start !== null) {
            iv.push([start, t, 0]);
            start = null;
        }
    }
    if (start !== null) iv.push([start, windowEnd, 0]);
    return iv;
}

export interface HeatingDetailsProps {
    variant: 'circuit' | 'operation' | 'water' | 'sensor' | 'energy';
    historyInstance: string;
    vorlaufDp?: string;
    ruecklaufDp?: string;
    sollDp?: string;
    verdichterDp?: string;
    pumpeDp?: string;
    // 'operation' variant: which mode the run was (space heating vs. hot water).
    heizenDp?: string;
    warmwasserDp?: string;
    // Hot-water ('water') variant:
    wwIstDp?: string;
    wwSollDp?: string;
    /** Sollwerte Tag- und Nachtprogramm (nur Kennzahlen der Facelift-Unterseite) */
    wwSollTagDp?: string;
    wwSollNachtDp?: string;
    wwHysObenDp?: string;
    wwHysUntenDp?: string;
    // Außenfühler-Check ('sensor') variant: Fühler, Netatmo-Stationen, Sonnensensor.
    aussenDp?: string;
    netatmoDps?: string[];
    luxDp?: string;
    // Energie ('energy') variant: Tageszähler, Gesamtzähler, Laufzeiten.
    energyDps?: EnergyDps;
    initialMode?: PeriodMode;
    chartHeight?: number;
}

/** The 'sensor' and 'energy' variants have their own data models (heating/); the others share the charts below. */
export function HeatingDetails(props: HeatingDetailsProps) {
    if (props.variant === 'energy' && props.energyDps) {
        return <EnergyDetails historyInstance={props.historyInstance} dps={props.energyDps} />;
    }
    if (props.variant === 'sensor') {
        return (
            <SensorCheckDetails
                historyInstance={props.historyInstance}
                aussenDp={props.aussenDp ?? ''}
                netatmoDps={props.netatmoDps ?? []}
                luxDp={props.luxDp ?? ''}
            />
        );
    }
    return <HeatingDetailsCharts {...props} />;
}

/** Höchstzahl Rohpunkte für ein Fenster: bis zu einem Eintrag je Minute, mit Reserve. */
const rawCap = (start: number, end: number) => Math.ceil(((end - start) / 60_000) * 1.5) + 500;

/** Betrieb: linker Rand beider Raster, Höhe der Balkenzeilen, Platz für Zeitachse und Legende (px). */
const OP_LEFT = 62;
const OP_ROWS_H = 84;
const OP_BOTTOM = 40;

function HeatingDetailsCharts({
    variant,
    historyInstance,
    vorlaufDp = '',
    ruecklaufDp = '',
    sollDp = '',
    verdichterDp = '',
    pumpeDp = '',
    heizenDp = '',
    warmwasserDp = '',
    wwIstDp = '',
    wwSollDp = '',
    wwSollTagDp = '',
    wwSollNachtDp = '',
    wwHysObenDp = '',
    wwHysUntenDp = '',
    initialMode = 'day',
    chartHeight = 200,
}: HeatingDetailsProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const [mode, setMode] = useState<PeriodMode>(initialMode);
    const [offset, setOffset] = useState(0);
    // UI-Facelift (nur Dev-Vorschau, sonst null): Zeitraum-Wahl in zwei Zeilen
    const PeriodNav = useHeizungDraft() ? HeizungPeriodNav : ChartPeriodNav;
    // Unterseite im Facelift (sonst null): Begleittext, Kennzahlen, Variante der Soll-Linie
    const sub = useHzSubpage();
    const inkRef = useRef<HTMLDivElement>(null);
    const ink = useChartInk(inkRef);
    // Facelift-Unterseite: Soll türkis, damit sie sich vom hellroten Rücklauf abhebt (Sascha, 14.11.2026)
    const sollColor = sub ? HZ_SOLL_COLOR : C.soll;

    const viewWindow = useMemo(() => periodWindow(mode, offset), [mode, offset]);
    const tagSoll = useDatapoint(sub ? wwSollTagDp : '').value;
    const nachtSoll = useDatapoint(sub ? wwSollNachtDp : '').value;
    // Hineinzoomen (Facelift-Unterseite: Antippen, Schieber oder Zeitabschnitte; sonst nur zwei Finger)
    const zoom = useChartZoom(viewWindow, !!sub, ink, variant === 'operation' ? [0, 1] : [0], variant === 'circuit' && sub?.pumpOff === 'stripes' ? 2 : 1);
    const bottom = 40 + zoom.extraBottom;

    // `raw` fetches every logged point (no bucketing) — the flow/return/pump/
    // compressor helpers are only ~1/min, so the default averaging flattened
    // their sharp ramps into a jagged staircase. Soll stays bucketed.
    const win = (
        id: string,
        dp: string,
        color: string,
        opts: { raw?: boolean; aggregate?: EChartSeriesConfig['aggregate'] } = {},
    ): EChartSeriesConfig => ({
        id,
        name: id,
        datapointId: dp,
        chartType: 'line',
        color,
        historyInstance,
        aggregate: opts.aggregate ?? 'average',
        // Obergrenze nach Fensterlänge: Der Adapter liefert die ÄLTESTEN Punkte zuerst. Mit fest 6000 brach der
        // Monat am 9. Tag ab (Vorlauf ~17.600 Punkte im November, im Winter bis 1/min). 1,5 je Minute + Reserve.
        ...(opts.raw ? { historyStepMs: 0, historyMaxCount: rawCap(viewWindow.start, viewWindow.end) } : {}),
        historyStart: viewWindow.start,
        historyEnd: viewWindow.end,
    });

    const echartSeries: EChartSeriesConfig[] = useMemo(() => {
        if (variant === 'water') {
            const list: EChartSeriesConfig[] = [];
            // WW actual temp is dense (~1/2 min); raw keeps the sawtooth on day/week,
            // month falls back to bucketing (overview) to stay under the point cap.
            if (wwIstDp) list.push(win('wwIst', wwIstDp, C.wwIst, { raw: mode !== 'month' }));
            // roh (~100 Werte/Tag): gemittelt entstanden an den Umschaltzeiten Zwischenwerte zwischen Tag und Nacht
            if (wwSollDp) list.push(win('wwSoll', wwSollDp, C.wwSoll, { raw: true }));
            if (wwHysObenDp) list.push(win('wwOben', wwHysObenDp, C.wwHys));
            if (wwHysUntenDp) list.push(win('wwUnten', wwHysUntenDp, C.wwHys));
            return list;
        }
        const list: EChartSeriesConfig[] = [
            win('vl', vorlaufDp, C.vorlauf, { raw: true }),
            win('rl', ruecklaufDp, C.ruecklauf, { raw: true }),
        ];
        if (variant === 'circuit') {
            if (sollDp) list.push(win('soll', sollDp, C.soll));
            // nur für die Kennzahlen der Facelift-Unterseite (Warmwasser-Zeiten ausnehmen)
            if (sub && warmwasserDp) list.push(win('ww', warmwasserDp, C.warmwasser, { raw: true }));
            // nur für die Streifen „Pumpe aus" der Facelift-Unterseite
            if (sub && pumpeDp) list.push(win('pump', pumpeDp, C.pumpe, { raw: true }));
        } else {
            if (verdichterDp) list.push(win('verd', verdichterDp, C.verdichter, { raw: true }));
            if (pumpeDp) list.push(win('pump', pumpeDp, C.pumpe, { raw: true }));
            if (heizenDp) list.push(win('heiz', heizenDp, C.heizen, { raw: true }));
            if (warmwasserDp) list.push(win('ww', warmwasserDp, C.warmwasser, { raw: true }));
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!sub, variant, vorlaufDp, ruecklaufDp, sollDp, verdichterDp, pumpeDp, heizenDp, warmwasserDp, wwIstDp, wwSollDp, wwHysObenDp, wwHysUntenDp, mode, historyInstance, viewWindow]);

    const dataMap = useMultiSeriesData(echartSeries, connected, subscribe, getState);
    const get = (id: string): Pt[] => dataMap.get(id)?.data ?? [];
    const anyLoading = echartSeries.some((s) => dataMap.get(s.id)?.loading);

    const rawVl = dataMap.get('vl')?.data;
    const rawRl = dataMap.get('rl')?.data;
    const vl = useMemo(() => pumpGaps(rawVl ?? []), [rawVl]);
    const rl = useMemo(() => pumpGaps(rawRl ?? []), [rawRl]);
    const band = useMemo(() => buildBand(vl, rl), [vl, rl]);
    // Hot-water hysteresis band (reheat trigger zone): fill between UNTEN and OBEN.
    const hysBand = useMemo(() => buildBand(get('wwOben'), get('wwUnten')), [dataMap]);
    const hasData =
        variant === 'water' ? get('wwIst').length > 0 || get('wwOben').length > 0 : vl.length > 0 || rl.length > 0;

    const xMin = viewWindow.start;
    const xMax = viewWindow.end;
    // Close an open run at "now" (current period) rather than at the future edge.
    const intervalEnd = Math.min(viewWindow.end, Date.now());

    const commonAxisLabel = { color: ink.axis, fontSize: 10 };
    const tooltipBase = {
        backgroundColor: 'var(--app-surface, #1e1e1e)',
        borderColor: 'var(--app-border, #333)',
        textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
    };

    // Facelift-Unterseite: Zeiten mit Pumpe aus als graue Streifen hinter den Linien (Entwurf, HZ_SUB_PICK).
    // Vorlauf/Rücklauf haben dort Lücken (Hilfswert 0); die Streifen zeigen, warum. Erst ab dem ersten
    // Pumpen-Eintrag im Fenster, davor ist der Zustand unbekannt.
    const pumpOffSeries = useMemo(() => {
        if (sub?.pumpOff !== 'stripes') return [];
        const pts = get('pump');
        if (!pts.length) return [];
        const off: [number, number][] = [];
        let since: number | null = null;
        for (const [t, v] of pts) {
            const isOff = v !== null && v < 0.5;
            if (isOff && since === null) since = t;
            else if (!isOff && since !== null) {
                off.push([since, t]);
                since = null;
            }
        }
        if (since !== null) off.push([since, intervalEnd]);
        return [
            {
                name: PUMP_OFF,
                type: 'line',
                data: [],
                itemStyle: { color: ink.shade },
                silent: true,
                markArea: {
                    silent: true,
                    itemStyle: { color: ink.shade },
                    data: off.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
                },
            },
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sub?.pumpOff, dataMap, intervalEnd, ink.shade]);
    const pumpLegend = pumpOffSeries.length ? [{ name: PUMP_OFF, icon: 'rect', itemStyle: { color: ink.axisLine } }] : [];

    const bandSeries = [
        {
            name: '_base',
            type: 'line',
            stack: 'band',
            data: band.base,
            lineStyle: { width: 0 },
            areaStyle: { color: 'transparent' },
            showSymbol: false,
            silent: true,
        },
        {
            // in der Legende ein- und ausschaltbar (Sascha, 14.11.2026); die Basis darunter bleibt unsichtbar
            name: 'Spreizung',
            type: 'line',
            stack: 'band',
            data: band.delta,
            itemStyle: { color: SPREAD_KEY },
            lineStyle: { width: 0 },
            areaStyle: { color: C.band },
            showSymbol: false,
            silent: true,
        },
        {
            name: 'Vorlauf',
            type: 'line',
            data: vl,
            itemStyle: { color: C.vorlauf },
            lineStyle: { color: C.vorlauf, width: 2 },
            showSymbol: false,
        },
        {
            name: 'Rücklauf',
            type: 'line',
            data: rl,
            itemStyle: { color: C.ruecklauf },
            lineStyle: { color: C.ruecklauf, width: 1.5 },
            showSymbol: false,
        },
    ];

    const circuitOption = useMemo(() => {
        const series: Record<string, unknown>[] = [...pumpOffSeries, ...bandSeries];
        const legend: (string | typeof SPREAD_LEGEND)[] = ['Vorlauf', 'Rücklauf', SPREAD_LEGEND, ...pumpLegend];
        if (sollDp) {
            series.push({
                name: 'HK1-Soll',
                type: 'line',
                step: 'end',
                data: get('soll'),
                itemStyle: { color: sollColor },
                lineStyle: { color: sollColor, width: 1.5, type: 'dashed' },
                showSymbol: false,
            });
            legend.push('HK1-Soll');
        }

        // Default temperature scale 0–60 °C; grow only if the data exceeds it.
        const yMax = scaleMax(60, vl, rl, sollDp ? get('soll') : []);

        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 40, right: 12, top: 10, bottom },
            legend: { data: legend, selected: zoom.legendSelected, inactiveColor: ink.axisLine, bottom: 0, textStyle: { color: ink.axis, fontSize: 10 }, itemWidth: 14, itemHeight: 8 },
            xAxis: {
                type: 'time' as const,
                axisLabel: commonAxisLabel,
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: false },
                min: xMin,
                max: xMax,
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                max: yMax,
                axisLabel: { ...commonAxisLabel, formatter: '{value}°' },
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: true, lineStyle: { color: ink.grid } },
            },
            dataZoom: zoom.dataZoom,
            tooltip: {
                trigger: 'axis' as const,
                ...tooltipBase,
                formatter: (params: unknown) => {
                    const items = (params as { seriesName: string; value: [number, number]; marker: string }[]).filter(
                        (p) => p.seriesName && !p.seriesName.startsWith('_'),
                    );
                    if (!items.length) return '';
                    const t = new Date(items[0].value[0]).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const lines = items
                        .map((p) => {
                            const v = p.value[1];
                            if (p.seriesName === 'Spreizung') return `${p.marker} Spreizung: <b>${formatNum(v, 1)} K</b>`;
                            return `${p.marker} ${p.seriesName}: ${typeof v === 'number' ? `<b>${formatNum(v, 1)}°C</b>` : 'Pumpe aus'}`;
                        })
                        .join('<br/>');
                    return `${t}<br/>${lines}`;
                },
            },
            series: zoom.frame(series, vl),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vl, rl, band, dataMap, sollDp, xMin, xMax, ink.axis, ink.axisLine, ink.grid, sollColor, pumpOffSeries, zoom.dataZoom, zoom.legendSelected, bottom]);

    const operationOption = useMemo(() => {
        const verd = onIntervals(get('verd'), intervalEnd).map((iv) => [iv[0], iv[1], 1]);
        const pump = onIntervals(get('pump'), intervalEnd).map((iv) => [iv[0], iv[1], 0]);
        const heiz = onIntervals(get('heiz'), intervalEnd).map((iv) => [iv[0], iv[1], 2]);
        const ww = onIntervals(get('ww'), intervalEnd).map((iv) => [iv[0], iv[1], 3]);
        // Default temperature scale 0–60 °C; grow only if the data exceeds it.
        const yMax = scaleMax(60, vl, rl);

        const rowRect = (color: string) => ({
            type: 'custom' as const,
            // im Zoom ragten die Balken sonst über den linken Rand auf die Beschriftung
            clip: true,
            xAxisIndex: 1,
            yAxisIndex: 1,
            renderItem: (
                _params: unknown,
                api: { value: (i: number) => number; coord: (d: [number, number]) => [number, number]; size: (d: [number, number]) => [number, number] },
            ) => {
                const cat = api.value(2);
                const start = api.coord([api.value(0), cat]);
                const end = api.coord([api.value(1), cat]);
                const h = api.size([0, 1])[1] * 0.6;
                const x = start[0];
                const w = Math.max(1.5, end[0] - start[0]);
                return {
                    type: 'rect',
                    shape: { x, y: start[1] - h / 2, width: w, height: h },
                    style: { fill: color },
                };
            },
            itemStyle: { color },
            encode: { x: [0, 1], y: 2 },
            data: [] as number[][],
        });

        const verdSeries = { ...rowRect(C.verdichter), name: 'Verdichter', data: verd };
        const pumpSeries = { ...rowRect(C.pumpe), name: 'Pumpe', data: pump };
        const heizSeries = { ...rowRect(C.heizen), name: 'Heizen', data: heiz };
        const wwSeries = { ...rowRect(C.warmwasser), name: 'Warmwasser', data: ww };

        return {
            backgroundColor: 'transparent',
            animation: false,
            // Die Balken sind an der Achse beschriftet; die Legende nennt nur die Linien und bleibt einzeilig
            // (vorher sechs Einträge, zweizeilig und auf den Achsenbeschriftungen).
            legend: {
                data: ['Vorlauf', 'Rücklauf', SPREAD_LEGEND, ...pumpLegend],
                selected: zoom.legendSelected,
                inactiveColor: ink.axisLine,
                bottom: 0,
                textStyle: { color: ink.axis, fontSize: 10 },
                itemWidth: 14,
                itemHeight: 8,
            },
            // Feste Pixel statt Prozent, beide Raster gleich weit links (Platz für „Warmwasser"), damit die
            // Zeitachsen oben und unten bündig stehen. Unten: 4 Zeilen à 20 px, darunter Zeit und Legende.
            grid: [
                { left: OP_LEFT, right: 12, top: 8, bottom: OP_BOTTOM + zoom.extraBottom + OP_ROWS_H + 18 },
                { left: OP_LEFT, right: 12, bottom: OP_BOTTOM + zoom.extraBottom, height: OP_ROWS_H },
            ],
            xAxis: [
                {
                    type: 'time' as const,
                    gridIndex: 0,
                    axisLabel: { show: false },
                    axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                    splitLine: { show: false },
                    min: xMin,
                    max: xMax,
                },
                {
                    type: 'time' as const,
                    gridIndex: 1,
                    axisLabel: commonAxisLabel,
                    axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                    splitLine: { show: false },
                    min: xMin,
                    max: xMax,
                },
            ],
            yAxis: [
                {
                    type: 'value' as const,
                    gridIndex: 0,
                    min: 0,
                    max: yMax,
                    axisLabel: { ...commonAxisLabel, formatter: '{value}°' },
                    axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                    splitLine: { show: true, lineStyle: { color: ink.grid } },
                },
                {
                    type: 'category' as const,
                    gridIndex: 1,
                    data: ['Pumpe', 'Verdichter', 'Heizen', 'Warmwasser'],
                    axisLabel: { color: ink.axis, fontSize: 9 },
                    axisTick: { show: false },
                    axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                    splitLine: { show: false },
                },
            ],
            dataZoom: zoom.dataZoom,
            tooltip: {
                trigger: 'axis' as const,
                ...tooltipBase,
                formatter: (params: unknown) => {
                    const items = (params as { seriesName: string; value: unknown; marker: string }[]).filter(
                        (p) => p.seriesName && !p.seriesName.startsWith('_') && Array.isArray(p.value) && (p.value as unknown[]).length === 2,
                    );
                    if (!items.length) return '';
                    const first = items[0].value as [number, number];
                    const t = new Date(first[0]).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const lines = items
                        .map((p) => {
                            const v = (p.value as [number, number])[1];
                            if (p.seriesName === 'Spreizung') return `${p.marker} Spreizung: <b>${formatNum(v, 1)} K</b>`;
                            return `${p.marker} ${p.seriesName}: ${typeof v === 'number' ? `<b>${formatNum(v, 1)}°C</b>` : 'Pumpe aus'}`;
                        })
                        .join('<br/>');
                    return `${t}<br/>${lines}`;
                },
            },
            series: zoom.frame([...pumpOffSeries, ...bandSeries, verdSeries, pumpSeries, heizSeries, wwSeries], vl),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vl, rl, band, dataMap, intervalEnd, xMin, xMax, ink.axis, ink.axisLine, ink.grid, chartHeight, pumpOffSeries, zoom.dataZoom, zoom.extraBottom, zoom.legendSelected]);

    const waterOption = useMemo(() => {
        const wwIst = get('wwIst');
        const oben = get('wwOben');
        const unten = get('wwUnten');

        // Default temperature scale 0–60 °C; grow only if the data exceeds it.
        const yMax = scaleMax(60, wwIst, oben);

        const series: Record<string, unknown>[] = [];
        const legend: string[] = [];
        // Hysteresis band (reheat trigger zone): two stacked series spanning
        // UNTEN..OBEN, BOTH named 'Hysterese' so the single legend entry toggles
        // the whole band (fill + both dashed edges) on and off together.
        if (oben.length || unten.length) {
            series.push(
                { name: 'Hysterese', type: 'line', stack: 'hys', data: hysBand.base, itemStyle: { color: C.wwHys }, areaStyle: { color: 'transparent' }, lineStyle: { color: C.wwHys, width: 1, type: 'dashed' }, showSymbol: false },
                { name: 'Hysterese', type: 'line', stack: 'hys', data: hysBand.delta, itemStyle: { color: C.wwHys }, areaStyle: { color: C.wwBand }, lineStyle: { color: C.wwHys, width: 1, type: 'dashed' }, showSymbol: false },
            );
            legend.push('Hysterese');
        }
        if (wwSollDp) {
            series.push({ name: 'WW-Soll', type: 'line', step: 'end', data: get('wwSoll'), itemStyle: { color: C.wwSoll }, lineStyle: { color: C.wwSoll, width: 1.5 }, showSymbol: false });
            legend.push('WW-Soll');
        }
        // WW actual temp — the hero line, drawn last (on top).
        series.push({ name: 'WW-Ist', type: 'line', data: wwIst, itemStyle: { color: C.wwIst }, lineStyle: { color: C.wwIst, width: 2 }, showSymbol: false });
        legend.push('WW-Ist');

        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 40, right: 12, top: 10, bottom },
            legend: { data: legend, selected: zoom.legendSelected, inactiveColor: ink.axisLine, bottom: 0, textStyle: { color: ink.axis, fontSize: 10 }, itemWidth: 14, itemHeight: 8 },
            xAxis: {
                type: 'time' as const,
                axisLabel: commonAxisLabel,
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: false },
                min: xMin,
                max: xMax,
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                max: yMax,
                axisLabel: { ...commonAxisLabel, formatter: '{value}°' },
                axisLine: { show: true, lineStyle: { color: ink.axisLine } },
                splitLine: { show: true, lineStyle: { color: ink.grid } },
            },
            dataZoom: zoom.dataZoom,
            tooltip: {
                trigger: 'axis' as const,
                ...tooltipBase,
                formatter: (params: unknown) => {
                    const all = (params as { seriesName: string; value: [number, number]; marker: string }[]).filter(
                        (p) => p.seriesName && !p.seriesName.startsWith('_') && Array.isArray(p.value),
                    );
                    if (!all.length) return '';
                    const t = new Date(all[0].value[0]).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const lines: string[] = [];
                    for (const p of all.filter((p) => p.seriesName !== 'Hysterese')) {
                        const v = p.value[1];
                        lines.push(`${p.marker} ${p.seriesName}: <b>${typeof v === 'number' ? formatNum(v, 1) : v}°C</b>`);
                    }
                    // Collapse the two 'Hysterese' series (UNTEN + delta) into one range line.
                    const hys = all
                        .filter((p) => p.seriesName === 'Hysterese')
                        .map((p) => p.value[1])
                        .filter((v) => typeof v === 'number') as number[];
                    if (hys.length >= 2) {
                        const lo = Math.max(hys[0], hys[1]);
                        const width = Math.min(hys[0], hys[1]);
                        lines.push(
                            `<span style="display:inline-block;margin-right:4px;width:9px;height:9px;background:${C.wwHys}"></span>Hysterese: <b>${formatNum(lo, 1)}–${formatNum(lo + width, 1)}°C</b>`,
                        );
                    }
                    return `${t}<br/>${lines.join('<br/>')}`;
                },
            },
            series: zoom.frame(series, wwIst),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataMap, hysBand, wwSollDp, xMin, xMax, ink.axis, ink.axisLine, ink.grid, zoom.dataZoom, zoom.legendSelected, bottom]);

    const activeOption = variant === 'circuit' ? circuitOption : variant === 'operation' ? operationOption : waterOption;

    // Kennzahlen des gewählten Zeitraums, aus den Rohwerten gerechnet (nur Facelift-Unterseite)
    const stats: HzStat[] | null = useMemo(() => {
        if (!sub || !hasData) return null;
        const w = { start: viewWindow.start, end: intervalEnd };
        if (variant === 'circuit') return circuitStats(vl, rl, get('soll'), get('ww'), w);
        if (variant === 'operation') return operationStats({ verd: get('verd'), pump: get('pump'), heiz: get('heiz'), ww: get('ww') }, w, { heat: C.heizen, water: C.warmwasser });
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        return waterStats(get('wwIst'), get('wwSoll'), w, { tag: num(tagSoll), nacht: num(nachtSoll) });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sub, hasData, variant, vl, rl, dataMap, viewWindow.start, intervalEnd, tagSoll, nachtSoll]);

    return (
        <HzDetailFrame innerRef={inkRef} stats={stats} nav={<PeriodNav mode={mode} offset={offset} onMode={(m) => { setMode(m); setOffset(0); }} onOffset={setOffset} />}>

            <div className="relative w-full" style={{ height: chartHeight + zoom.extraBottom }}>
                {anyLoading && !hasData && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!anyLoading && !hasData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">Keine Daten</span>
                    </div>
                )}
                {hasData && (
                    <ReactECharts
                        key={`${mode}-${offset}`}
                        option={activeOption}
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
