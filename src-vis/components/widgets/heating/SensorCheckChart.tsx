/**
 * Klappbox „Aussenfuehler-Check" (Heizung-Tab): Fuehler der Waermepumpe gegen
 * Netatmo-Stationen und Sonnensensor. Oben Linien + Helligkeitsflaeche, darunter
 * die Abweichung als Balken, ganz unten ein Streudiagramm Helligkeit gegen
 * Abweichung. Die Rechnung steckt in utils/sensorCheck.ts.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatNum } from '../../../utils/formatValue';
import { periodLabel, periodWindow, type PeriodMode } from '../../../utils/chartPeriod';
import { gridToSeries, type Grid } from '../../../utils/sensorCheck';
import type { SensorCheckModel } from './sensorCheckModel';
import {
    C as COL,
    STATION_COLORS,
    SensorFrame,
    axisLabelOf,
    axisLineOf,
    axisTooltip,
    legendFor,
    devAxis,
    luxAxis,
    signed,
    tempAxis,
    tooltipBase,
    toKlx,
} from './sensorCheckParts';
import type { ChartInk } from './chartInk';
import { HzSection, useHzSubpage } from './HzSubpage';

type Opt = Record<string, unknown>;

const line = (id: string, grid: Grid, m: SensorCheckModel, color: string, width: number, extra: Opt = {}): Opt => ({
    id,
    type: 'line',
    data: gridToSeries(grid, m.start, m.stepMs),
    showSymbol: false,
    connectNulls: false,
    itemStyle: { color },
    lineStyle: { color, width },
    ...extra,
});

const luxSeries = (m: SensorCheckModel, xAxisIndex: number, yAxisIndex: number): Opt => ({
    id: 'lux',
    type: 'line',
    xAxisIndex,
    yAxisIndex,
    data: gridToSeries(toKlx(m.lux), m.start, m.stepMs),
    showSymbol: false,
    connectNulls: false,
    itemStyle: { color: COL.luxEdge },
    lineStyle: { color: COL.luxEdge, width: 0.5 },
    areaStyle: { color: COL.luxFill },
    z: 1,
});

const timeAxis = (m: SensorCheckModel, gridIndex: number, showLabels: boolean, ink: ChartInk): Opt => ({
    type: 'time',
    gridIndex,
    min: m.start,
    max: m.end,
    axisLabel: showLabels ? axisLabelOf(ink) : { show: false },
    axisLine: axisLineOf(ink),
    splitLine: { show: false },
});

const tempY = (m: SensorCheckModel, gridIndex: number, ink: ChartInk): Opt => {
    const a = tempAxis(m);
    return {
        type: 'value',
        gridIndex,
        min: a.min,
        max: a.max,
        interval: a.interval,
        axisLabel: { ...axisLabelOf(ink), formatter: '{value}°' },
        axisLine: axisLineOf(ink),
        splitLine: { show: true, lineStyle: { color: ink.grid } },
    };
};

const luxY = (m: SensorCheckModel, gridIndex: number, ink: ChartInk): Opt => {
    const a = luxAxis(m.lux);
    return {
        type: 'value',
        gridIndex,
        position: 'right',
        min: a.min,
        max: a.max,
        interval: a.interval,
        axisLabel: { ...axisLabelOf(ink), formatter: '{value}k' },
        axisLine: axisLineOf(ink),
        splitLine: { show: false },
    };
};

/** Linien-Serien von Temperaturen (Stationen dünn, Fühler fett). */
function tempLines(m: SensorCheckModel, yAxisIndex: number, xAxisIndex: number): Opt[] {
    const pos = { xAxisIndex, yAxisIndex };
    return [
        ...m.stationen.map((g, i) => line(`st${i + 1}`, g, m, STATION_COLORS[i], 1, { ...pos, z: 3 })),
        line('fuehler', m.fuehler, m, COL.fuehler, 2.5, { ...pos, z: 5 }),
    ];
}

/* ── Streifen: Linien oben, Abweichung unten ─────────────────────────────────────────────────── */

function stripsOption(m: SensorCheckModel, mode: PeriodMode, ink: ChartInk): EChartsOption {
    const da = devAxis(m.abweichung);
    const bars = gridToSeries(m.abweichung, m.start, m.stepMs).map(([t, v]) =>
        v === null ? [t, null] : { value: [t, v], itemStyle: { color: v >= 0 ? COL.plus : COL.minus } },
    );
    return {
        backgroundColor: 'transparent',
        animation: false,
        grid: [
            { left: 40, right: 40, top: 6, height: 165 },
            { left: 40, right: 40, top: 186, height: 66 },
        ],
        xAxis: [timeAxis(m, 0, false, ink), timeAxis(m, 1, true, ink)],
        yAxis: [
            tempY(m, 0, ink),
            luxY(m, 0, ink),
            {
                type: 'value',
                gridIndex: 1,
                min: da.min,
                max: da.max,
                interval: da.interval,
                axisLabel: { ...axisLabelOf(ink), formatter: (v: number) => `${v > 0 ? '+' : ''}${v} K` },
                axisLine: axisLineOf(ink),
                splitLine: { show: true, lineStyle: { color: ink.grid } },
            },
        ],
        tooltip: axisTooltip(m, mode),
        series: [
            luxSeries(m, 0, 1),
            ...tempLines(m, 0, 0),
            {
                id: 'abweichung',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 2,
                data: bars,
                barMinWidth: 1,
                markLine: {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: { color: ink.zero, width: 1, type: 'solid' },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    } as unknown as EChartsOption;
}

function StripsChart({ m, mode, ink }: { m: SensorCheckModel; mode: PeriodMode; ink: ChartInk }) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const option = useMemo(() => stripsOption(m, mode, ink), [m, mode, ink.axis, ink.axisLine, ink.grid, ink.zero]);
    return (
        <ReactECharts
            option={option}
            style={{ width: '100%', height: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
        />
    );
}

/* ── Streudiagramm ──────────────────────────────────────── */

interface ScatterPt {
    klx: number;
    dev: number;
    idx: number;
}

function scatterPoints(m: SensorCheckModel): ScatterPt[] {
    const out: ScatterPt[] = [];
    for (let i = 0; i < m.count; i++) {
        const l = m.lux[i];
        const d = m.abweichung[i];
        if (typeof l === 'number' && typeof d === 'number') out.push({ klx: l / 1000, dev: d, idx: i });
    }
    return out;
}

function scatterOption(m: SensorCheckModel, mode: PeriodMode, pts: ScatterPt[], ink: ChartInk): EChartsOption {
    const la = luxAxis(m.lux);
    const da = devAxis(pts.map((p) => p.dev));
    const t = (ts: number) => {
        const d = new Date(ts);
        const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return mode === 'day' ? hm : `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`;
    };
    return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 44, right: 16, top: 10, bottom: 36 },
        xAxis: {
            type: 'value',
            min: 0,
            max: la.max,
            interval: la.interval,
            name: 'Helligkeit (klx)',
            nameLocation: 'middle',
            nameGap: 22,
            nameTextStyle: { color: ink.axis, fontSize: 10 },
            axisLabel: { ...axisLabelOf(ink), formatter: '{value}k' },
            axisLine: axisLineOf(ink),
            splitLine: { show: true, lineStyle: { color: ink.grid } },
        },
        yAxis: {
            type: 'value',
            min: da.min,
            max: da.max,
            interval: da.interval,
            axisLabel: { ...axisLabelOf(ink), formatter: (v: number) => `${v > 0 ? '+' : ''}${v} K` },
            axisLine: axisLineOf(ink),
            splitLine: { show: true, lineStyle: { color: ink.grid } },
        },
        tooltip: {
            trigger: 'item',
            ...tooltipBase,
            formatter: (p: unknown) => {
                const v = (p as { value?: number[] }).value;
                if (!v) return '';
                const ts = m.start + v[2] * m.stepMs;
                return `${t(ts)}<br/>Helligkeit: <b>${formatNum(v[0], 1)} klx</b><br/>Abweichung: <b>${signed(v[1])} K</b>`;
            },
        },
        series: [
            {
                id: 'streu',
                type: 'scatter',
                symbolSize: 5,
                data: pts.map((p) => ({
                    value: [p.klx, p.dev, p.idx],
                    itemStyle: { color: p.dev >= 0 ? COL.plus : COL.minus, opacity: 0.75 },
                })),
                markLine: {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: { color: ink.zero, width: 1, type: 'solid' },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    } as unknown as EChartsOption;
}

function ScatterBlock({
    m,
    mode,
    offset,
    ink,
}: {
    m: SensorCheckModel;
    mode: PeriodMode;
    offset: number;
    ink: ChartInk;
}) {
    const pts = useMemo(() => scatterPoints(m), [m]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const option = useMemo(() => scatterOption(m, mode, pts, ink), [m, mode, pts, ink.axis, ink.axisLine, ink.grid, ink.zero]);
    const w = periodWindow(mode, offset);
    const sub = useHzSubpage();
    const caption = `${pts.length} Abschnitte mit beiden Werten · ${periodLabel(mode, w)}`;
    const chart = (
            <div style={{ height: 180 }}>
                {pts.length > 0 ? (
                    <ReactECharts
                        key={`${mode}-${offset}`}
                        option={option}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge
                    />
                ) : (
                    <div
                        className="flex items-center justify-center h-full text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Keine Abschnitte mit Helligkeit und Abweichung
                    </div>
                )}
            </div>
    );
    // UI-Facelift: eigener Abschnitt mit Titel, Erklärung als Begleittext darunter
    if (sub)
        return (
            <HzSection
                title="Helligkeit und Abweichung"
                foot={`Jeder Punkt ist ein Abschnitt: weiter rechts heller, weiter oben misst der Fühler wärmer als die Stationen. ${caption}.`}
            >
                <div className="aura-fl-card hz-detail">{chart}</div>
            </HzSection>
        );
    return (
        <div className="flex flex-col gap-1">
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{caption}</div>
            {chart}
        </div>
    );
}

export function SensorCheckDetails({
    historyInstance,
    aussenDp,
    netatmoDps,
    luxDp,
}: {
    historyInstance: string;
    aussenDp: string;
    netatmoDps: string[];
    luxDp: string;
}) {
    const netatmoKey = netatmoDps.filter(Boolean).join('|');
    const dps = useMemo(
        () => ({ fuehlerDp: aussenDp, netatmoDps: netatmoKey ? netatmoKey.split('|') : [], luxDp }),
        [aussenDp, netatmoKey, luxDp],
    );
    return (
        <SensorFrame
            props={{ historyInstance, dps }}
            height={280}
            legend={legendFor(dps.netatmoDps.length)}
            chart={(m, mode, offset, ink) => <StripsChart key={`${mode}-${offset}`} m={m} mode={mode} ink={ink} />}
            below={(m, mode, offset, ink) => <ScatterBlock m={m} mode={mode} offset={offset} ink={ink} />}
        />
    );
}
