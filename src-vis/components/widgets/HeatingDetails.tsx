import { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../hooks/useMultiSeriesData';
import { formatNum } from '../../utils/formatValue';
import { ChartPeriodNav } from './ChartPeriodNav';
import { periodWindow, type PeriodMode } from '../../utils/chartPeriod';

/**
 * Collapsible-box charts for the heating widget (STIEBEL LWZ 304 Trend).
 *
 * Two variants, both fed by useMultiSeriesData (raw history) and sharing the
 * ChartPeriodNav pager (Tag / 7 Tage / Monat + wheel date-jump):
 *
 *  • 'circuit'  – "Heizkreis": the green flow/return SPREAD BAND plus the HK1
 *                 target (Soll). One temperature axis.
 *  • 'operation'– "Betrieb": the same spread band on top, and a compact on/off
 *                 timeline strip below it (compressor + circuit pump).
 *
 * Data note: the flow/return helpers (javascript.0.LWZ.HKP_*) are only logged
 * ~1×/min and are 0 whenever the pump is off — so they are fetched RAW (no
 * bucket averaging, which flattened the sharp ramps into a staircase).
 *
 * ECharts renders to canvas → colours must be literal hex (CSS vars don't
 * resolve there); axis colours match EChartWidget (#888 / #444 / #333).
 */

const C = {
    vorlauf: '#2f8f3e', // dark green (flow, band top)
    ruecklauf: '#7cc47f', // light green (return, band bottom)
    band: 'rgba(74,158,47,0.22)', // spread fill between flow and return
    soll: '#e0922f', // orange (HK1 target flow)
    verdichter: '#eab308', // yellow (compressor)
    pumpe: '#9ca3af', // grey (circuit pump)
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
};

type Pt = [number, number];

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
 *   delta = max(0, flow-ret)  (the green band on top)
 * The flow is step-interpolated onto each return timestamp; the crisp flow and
 * return lines are drawn separately on top.
 */
function buildBand(vl: Pt[], rl: Pt[]): { base: Pt[]; delta: Pt[] } {
    const base: Pt[] = [];
    const delta: Pt[] = [];
    for (const [t, r] of rl) {
        const v = valueAt(vl, t);
        if (v === null) continue;
        base.push([t, r]);
        delta.push([t, Math.max(0, v - r)]);
    }
    return { base, delta };
}

/** Contiguous on-intervals (value ≥ 0.5) from a 0/1 series; an open run closes at windowEnd. */
function onIntervals(pts: Pt[], windowEnd: number): [number, number, number][] {
    const iv: [number, number, number][] = [];
    let start: number | null = null;
    for (const [t, v] of pts) {
        const on = v >= 0.5;
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
    variant: 'circuit' | 'operation';
    historyInstance: string;
    vorlaufDp: string;
    ruecklaufDp: string;
    sollDp?: string;
    verdichterDp?: string;
    pumpeDp?: string;
    initialMode?: PeriodMode;
    chartHeight?: number;
}

export function HeatingDetails({
    variant,
    historyInstance,
    vorlaufDp,
    ruecklaufDp,
    sollDp = '',
    verdichterDp = '',
    pumpeDp = '',
    initialMode = 'day',
    chartHeight = 200,
}: HeatingDetailsProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const [mode, setMode] = useState<PeriodMode>(initialMode);
    const [offset, setOffset] = useState(0);

    const viewWindow = useMemo(() => periodWindow(mode, offset), [mode, offset]);

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
        ...(opts.raw ? { historyStepMs: 0, historyMaxCount: 6000 } : {}),
        historyStart: viewWindow.start,
        historyEnd: viewWindow.end,
    });

    const echartSeries: EChartSeriesConfig[] = useMemo(() => {
        const list: EChartSeriesConfig[] = [
            win('vl', vorlaufDp, C.vorlauf, { raw: true }),
            win('rl', ruecklaufDp, C.ruecklauf, { raw: true }),
        ];
        if (variant === 'circuit') {
            if (sollDp) list.push(win('soll', sollDp, C.soll));
        } else {
            if (verdichterDp) list.push(win('verd', verdichterDp, C.verdichter, { raw: true }));
            if (pumpeDp) list.push(win('pump', pumpeDp, C.pumpe, { raw: true }));
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant, vorlaufDp, ruecklaufDp, sollDp, verdichterDp, pumpeDp, historyInstance, viewWindow]);

    const dataMap = useMultiSeriesData(echartSeries, connected, subscribe, getState);
    const get = (id: string): Pt[] => dataMap.get(id)?.data ?? [];
    const anyLoading = echartSeries.some((s) => dataMap.get(s.id)?.loading);

    const vl = get('vl');
    const rl = get('rl');
    const band = useMemo(() => buildBand(vl, rl), [vl, rl]);
    const hasData = vl.length > 0 || rl.length > 0;

    const xMin = viewWindow.start;
    const xMax = viewWindow.end;
    // Close an open run at "now" (current period) rather than at the future edge.
    const intervalEnd = Math.min(viewWindow.end, Date.now());

    const commonAxisLabel = { color: C.axis, fontSize: 10 };
    const tooltipBase = {
        backgroundColor: 'var(--app-surface, #1e1e1e)',
        borderColor: 'var(--app-border, #333)',
        textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
    };

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
            name: '_band',
            type: 'line',
            stack: 'band',
            data: band.delta,
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
        const series: Record<string, unknown>[] = [...bandSeries];
        const legend = ['Vorlauf', 'Rücklauf'];
        if (sollDp) {
            series.push({
                name: 'HK1-Soll',
                type: 'line',
                step: 'end',
                data: get('soll'),
                itemStyle: { color: C.soll },
                lineStyle: { color: C.soll, width: 1.5, type: 'dashed' },
                showSymbol: false,
            });
            legend.push('HK1-Soll');
        }

        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 40, right: 12, top: 10, bottom: 40 },
            legend: { data: legend, bottom: 0, textStyle: { color: C.axis, fontSize: 10 }, itemWidth: 14, itemHeight: 8 },
            xAxis: {
                type: 'time' as const,
                axisLabel: commonAxisLabel,
                axisLine: { show: true, lineStyle: { color: C.axisLine } },
                splitLine: { show: false },
                min: xMin,
                max: xMax,
            },
            yAxis: {
                type: 'value' as const,
                scale: true,
                axisLabel: { ...commonAxisLabel, formatter: '{value}°' },
                axisLine: { show: true, lineStyle: { color: C.axisLine } },
                splitLine: { show: true, lineStyle: { color: C.grid } },
            },
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
                            return `${p.marker} ${p.seriesName}: <b>${typeof v === 'number' ? formatNum(v, 1) : v}°C</b>`;
                        })
                        .join('<br/>');
                    return `${t}<br/>${lines}`;
                },
            },
            series,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vl, rl, band, dataMap, sollDp, xMin, xMax]);

    const operationOption = useMemo(() => {
        const verd = onIntervals(get('verd'), intervalEnd).map((iv) => [iv[0], iv[1], 1]);
        const pump = onIntervals(get('pump'), intervalEnd).map((iv) => [iv[0], iv[1], 0]);

        const rowRect = (color: string) => ({
            type: 'custom' as const,
            xAxisIndex: 1,
            yAxisIndex: 1,
            renderItem: (
                _params: unknown,
                api: { value: (i: number) => number; coord: (d: [number, number]) => [number, number]; size: (d: [number, number]) => [number, number] },
            ) => {
                const cat = api.value(2);
                const start = api.coord([api.value(0), cat]);
                const end = api.coord([api.value(1), cat]);
                const h = api.size([0, 1])[1] * 0.5;
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

        return {
            backgroundColor: 'transparent',
            animation: false,
            legend: {
                data: ['Vorlauf', 'Rücklauf', 'Verdichter', 'Pumpe'],
                bottom: 0,
                textStyle: { color: C.axis, fontSize: 10 },
                itemWidth: 14,
                itemHeight: 8,
            },
            grid: [
                { left: 40, right: 12, top: 8, height: '52%' },
                { left: 40, right: 12, top: '66%', height: '20%' },
            ],
            xAxis: [
                {
                    type: 'time' as const,
                    gridIndex: 0,
                    axisLabel: { show: false },
                    axisLine: { show: true, lineStyle: { color: C.axisLine } },
                    splitLine: { show: false },
                    min: xMin,
                    max: xMax,
                },
                {
                    type: 'time' as const,
                    gridIndex: 1,
                    axisLabel: commonAxisLabel,
                    axisLine: { show: true, lineStyle: { color: C.axisLine } },
                    splitLine: { show: false },
                    min: xMin,
                    max: xMax,
                },
            ],
            yAxis: [
                {
                    type: 'value' as const,
                    gridIndex: 0,
                    scale: true,
                    axisLabel: { ...commonAxisLabel, formatter: '{value}°' },
                    axisLine: { show: true, lineStyle: { color: C.axisLine } },
                    splitLine: { show: true, lineStyle: { color: C.grid } },
                },
                {
                    type: 'category' as const,
                    gridIndex: 1,
                    data: ['Pumpe', 'Verdichter'],
                    axisLabel: { color: C.axis, fontSize: 9 },
                    axisTick: { show: false },
                    axisLine: { show: true, lineStyle: { color: C.axisLine } },
                    splitLine: { show: false },
                },
            ],
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
                            return `${p.marker} ${p.seriesName}: <b>${typeof v === 'number' ? formatNum(v, 1) : v}°C</b>`;
                        })
                        .join('<br/>');
                    return `${t}<br/>${lines}`;
                },
            },
            series: [...bandSeries, verdSeries, pumpSeries],
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vl, rl, band, dataMap, intervalEnd, xMin, xMax]);

    return (
        <div className="flex flex-col gap-2 w-full">
            <ChartPeriodNav mode={mode} offset={offset} onMode={(m) => { setMode(m); setOffset(0); }} onOffset={setOffset} />

            <div className="relative w-full" style={{ height: chartHeight }}>
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
                        option={variant === 'circuit' ? circuitOption : operationOption}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge
                    />
                )}
            </div>
        </div>
    );
}
