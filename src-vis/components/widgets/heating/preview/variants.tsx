/**
 * Entwuerfe A–C des „Aussenfuehler-Checks" (nur Dev-Vorschau, Runde 1).
 *
 *  A „Zwei Streifen"            oben Linien + Helligkeitsflaeche, unten Abweichung als Balken
 *  B „Eingefuellte Flaeche"     ein Diagramm, Flaeche zwischen Fuehler und Netatmo-Mittel
 *  C „Streifen + Streudiagramm" A plus Helligkeit gegen Abweichung
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatNum } from '../../../../utils/formatValue';
import { periodLabel, periodWindow, type PeriodMode } from '../../../../utils/chartPeriod';
import { gridToSeries, type Grid } from '../../../../utils/sensorCheck';
import type { SensorCheckModel } from './previewModel';
import {
    C as COL,
    LEGEND_BASE,
    STATION_COLORS,
    SensorFrame,
    axisLabel,
    axisLineStyle,
    axisTooltip,
    devAxis,
    luxAxis,
    signed,
    tempAxis,
    tooltipBase,
    toKlx,
    type LegendItem,
    type VariantProps,
} from './parts';

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

const timeAxis = (m: SensorCheckModel, gridIndex: number, showLabels: boolean): Opt => ({
    type: 'time',
    gridIndex,
    min: m.start,
    max: m.end,
    axisLabel: showLabels ? axisLabel : { show: false },
    axisLine: axisLineStyle,
    splitLine: { show: false },
});

const tempY = (m: SensorCheckModel, gridIndex: number): Opt => {
    const a = tempAxis(m);
    return {
        type: 'value',
        gridIndex,
        min: a.min,
        max: a.max,
        interval: a.interval,
        axisLabel: { ...axisLabel, formatter: '{value}°' },
        axisLine: axisLineStyle,
        splitLine: { show: true, lineStyle: { color: COL.grid } },
    };
};

const luxY = (m: SensorCheckModel, gridIndex: number): Opt => {
    const a = luxAxis(m.lux);
    return {
        type: 'value',
        gridIndex,
        position: 'right',
        min: a.min,
        max: a.max,
        interval: a.interval,
        axisLabel: { ...axisLabel, formatter: '{value}k' },
        axisLine: axisLineStyle,
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

/* ── A: Zwei Streifen ─────────────────────────────────────────────────── */

function stripsOption(m: SensorCheckModel, mode: PeriodMode): EChartsOption {
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
        xAxis: [timeAxis(m, 0, false), timeAxis(m, 1, true)],
        yAxis: [
            tempY(m, 0),
            luxY(m, 0),
            {
                type: 'value',
                gridIndex: 1,
                min: da.min,
                max: da.max,
                interval: da.interval,
                axisLabel: { ...axisLabel, formatter: (v: number) => `${v > 0 ? '+' : ''}${v} K` },
                axisLine: axisLineStyle,
                splitLine: { show: true, lineStyle: { color: COL.grid } },
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
                    lineStyle: { color: COL.axis, width: 1, type: 'solid' },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    } as unknown as EChartsOption;
}

function StripsChart({ m, mode }: { m: SensorCheckModel; mode: PeriodMode }) {
    const option = useMemo(() => stripsOption(m, mode), [m, mode]);
    return (
        <ReactECharts
            option={option}
            style={{ width: '100%', height: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
        />
    );
}

const LEGEND_A: LegendItem[] = [
    ...LEGEND_BASE,
    { label: 'Abweichung zu warm', color: COL.plus, kind: 'dot' },
    { label: 'zu kalt', color: COL.minus, kind: 'dot' },
];

export function VariantA(props: VariantProps) {
    return (
        <SensorFrame
            props={props}
            height={280}
            legend={LEGEND_A}
            chart={(m, mode, offset) => <StripsChart key={`${mode}-${offset}`} m={m} mode={mode} />}
        />
    );
}

/* ── B: Eingefaerbte Flaeche ──────────────────────────────────────────── */

function fillOption(m: SensorCheckModel, mode: PeriodMode): EChartsOption {
    const warmBase: Grid = [];
    const warmDelta: Grid = [];
    const coldBase: Grid = [];
    const coldDelta: Grid = [];
    for (let i = 0; i < m.count; i++) {
        const f = m.fuehler[i];
        const mi = m.mittel[i];
        if (typeof f === 'number' && typeof mi === 'number') {
            warmBase.push(mi);
            warmDelta.push(Math.max(0, f - mi));
            coldBase.push(f);
            coldDelta.push(Math.max(0, mi - f));
        } else {
            warmBase.push(null);
            warmDelta.push(null);
            coldBase.push(null);
            coldDelta.push(null);
        }
    }
    const band = (id: string, stack: string, g: Grid, fill: string | null): Opt =>
        line(id, g, m, 'transparent', 0, {
            stack,
            silent: true,
            z: 2,
            areaStyle: { color: fill ?? 'transparent' },
        });
    return {
        backgroundColor: 'transparent',
        animation: false,
        grid: { left: 40, right: 40, top: 8, bottom: 26 },
        xAxis: timeAxis(m, 0, true),
        yAxis: [tempY(m, 0), luxY(m, 0)],
        tooltip: axisTooltip(m, mode),
        series: [
            luxSeries(m, 0, 1),
            band('_warmBase', 'warm', warmBase, null),
            band('_warmDelta', 'warm', warmDelta, COL.plusFill),
            band('_coldBase', 'cold', coldBase, null),
            band('_coldDelta', 'cold', coldDelta, COL.minusFill),
            ...m.stationen.map((g, i) => line(`st${i + 1}`, g, m, STATION_COLORS[i], 1, { yAxisIndex: 0, z: 3 })),
            line('mittel', m.mittel, m, COL.mittel, 1.2, {
                yAxisIndex: 0,
                z: 4,
                lineStyle: { color: COL.mittel, width: 1.2, type: 'dashed' },
            }),
            line('fuehler', m.fuehler, m, COL.fuehler, 2.5, { yAxisIndex: 0, z: 5 }),
        ],
    } as unknown as EChartsOption;
}

function FillChart({ m, mode }: { m: SensorCheckModel; mode: PeriodMode }) {
    const option = useMemo(() => fillOption(m, mode), [m, mode]);
    return (
        <ReactECharts
            option={option}
            style={{ width: '100%', height: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge
        />
    );
}

const LEGEND_B: LegendItem[] = [
    ...LEGEND_BASE,
    { label: 'Netatmo-Mittel', color: COL.mittel, kind: 'dash' },
    { label: 'Fühler zu warm', color: COL.plus, kind: 'area' },
    { label: 'zu kalt', color: COL.minus, kind: 'area' },
];

export function VariantB(props: VariantProps) {
    return (
        <SensorFrame
            props={props}
            height={240}
            legend={LEGEND_B}
            chart={(m, mode, offset) => <FillChart key={`${mode}-${offset}`} m={m} mode={mode} />}
        />
    );
}

/* ── C: Streifen + Streudiagramm ──────────────────────────────────────── */

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

function scatterOption(m: SensorCheckModel, mode: PeriodMode, pts: ScatterPt[]): EChartsOption {
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
            nameTextStyle: { color: COL.axis, fontSize: 10 },
            axisLabel: { ...axisLabel, formatter: '{value}k' },
            axisLine: axisLineStyle,
            splitLine: { show: true, lineStyle: { color: COL.grid } },
        },
        yAxis: {
            type: 'value',
            min: da.min,
            max: da.max,
            interval: da.interval,
            axisLabel: { ...axisLabel, formatter: (v: number) => `${v > 0 ? '+' : ''}${v} K` },
            axisLine: axisLineStyle,
            splitLine: { show: true, lineStyle: { color: COL.grid } },
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
                    lineStyle: { color: COL.axis, width: 1, type: 'solid' },
                    data: [{ yAxis: 0 }],
                },
            },
        ],
    } as unknown as EChartsOption;
}

function ScatterBlock({ m, mode, offset }: { m: SensorCheckModel; mode: PeriodMode; offset: number }) {
    const pts = useMemo(() => scatterPoints(m), [m]);
    const option = useMemo(() => scatterOption(m, mode, pts), [m, mode, pts]);
    const w = periodWindow(mode, offset);
    return (
        <div className="flex flex-col gap-1">
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {pts.length} Abschnitte mit beiden Werten · {periodLabel(mode, w)}
            </div>
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
        </div>
    );
}

export function VariantC(props: VariantProps) {
    return (
        <SensorFrame
            props={props}
            height={280}
            legend={LEGEND_A}
            chart={(m, mode, offset) => <StripsChart key={`${mode}-${offset}`} m={m} mode={mode} />}
            below={(m, mode, offset) => <ScatterBlock m={m} mode={mode} offset={offset} />}
        />
    );
}

export const VARIANTS: { key: string; name: string; C: (p: VariantProps) => JSX.Element }[] = [
    { key: 'A', name: 'Zwei Streifen', C: VariantA },
    { key: 'B', name: 'Eingefärbte Fläche', C: VariantB },
    { key: 'C', name: 'Streifen + Streudiagramm', C: VariantC },
];
