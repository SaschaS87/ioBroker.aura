/**
 * Klappbox „Energie" (Heizung-Tab): Strom, erzeugte Waerme und Arbeitszahl der letzten 30 Tage, dazu die
 * Gesamtzaehler der Anlage. Die Rechnung steckt in utils/heatingEnergy.ts, die Daten in energyModel.ts.
 *
 * Reihenfolge: Zeitraum, Kennzahlen, Balken Strom/Tag, Linie Arbeitszahl/Tag, Heatmap Tag x Uhrzeit, Tabelle.
 * Feste 30 Tage, keine Zeitraum-Navigation. Der laufende Tag ist schwaecher gezeichnet.
 */
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Legend } from './sensorCheckParts';
import { useEnergyData, type EnergyDps, type EnergyModel } from './energyModel';
import {
    C,
    EnergyFrame,
    HEAT_MAX,
    PARTIAL_OPACITY,
    SectionTitle,
    Tile,
    axisLabel,
    axisLineStyle,
    dm,
    dot,
    num,
    splitLineStyle,
    tooltipBase,
} from './energyParts';
import { formatNum } from '../../../utils/formatValue';

type Opt = Record<string, unknown>;

const GRID = { left: 38, right: 10, top: 10, bottom: 24 };

/** X-Achse mit einem Tag je Kategorie; Beschriftung TT.MM. */
function dayAxis(m: EnergyModel, show = true): Opt {
    return {
        type: 'category',
        data: m.days.map((d) => d.key),
        axisLabel: {
            ...axisLabel,
            show,
            interval: 4,
            formatter: (v: string) => {
                const d = m.days.find((x) => x.key === v);
                return d ? dm(d.start).slice(0, 5) : v;
            },
        },
        axisLine: axisLineStyle,
        axisTick: { show: false },
        splitLine: { show: false },
    };
}

const dayHead = (m: EnergyModel, i: number): string => {
    const d = m.days[i];
    return `${dm(d.start)}${d.partial ? ' · läuft noch' : ''}`;
};

function barOption(m: EnergyModel): EChartsOption {
    const item = (v: number, color: string, partial: boolean) => ({
        value: v,
        itemStyle: { color, opacity: partial ? PARTIAL_OPACITY : 1 },
    });
    return {
        animation: false,
        grid: GRID,
        xAxis: dayAxis(m),
        yAxis: {
            type: 'value',
            axisLabel: axisLabel,
            axisLine: axisLineStyle,
            splitLine: splitLineStyle,
        },
        tooltip: {
            trigger: 'axis',
            ...tooltipBase,
            axisPointer: { type: 'shadow' },
            formatter: (params: unknown) => {
                const p = (params as { dataIndex?: number }[]) ?? [];
                if (!p.length || typeof p[0].dataIndex !== 'number') return '';
                const i = p[0].dataIndex;
                const d = m.days[i];
                return [
                    `<b>${dayHead(m, i)}</b>`,
                    `${dot(C.heizen)}Heizen: <b>${formatNum(d.hs, 1)} kWh</b>`,
                    `${dot(C.warmwasser)}Warmwasser: <b>${formatNum(d.ws, 1)} kWh</b>`,
                    `Gesamt: <b>${formatNum(d.s, 1)} kWh</b>`,
                ].join('<br/>');
            },
        },
        series: [
            {
                id: 'ws',
                type: 'bar',
                stack: 'strom',
                data: m.days.map((d) => item(d.ws, C.warmwasser, d.partial)),
                barMaxWidth: 14,
            },
            {
                id: 'hs',
                type: 'bar',
                stack: 'strom',
                data: m.days.map((d) => item(d.hs, C.heizen, d.partial)),
                barMaxWidth: 14,
            },
        ],
    } as unknown as EChartsOption;
}

function azOption(m: EnergyModel): EChartsOption {
    return {
        animation: false,
        grid: GRID,
        xAxis: dayAxis(m),
        // Zweite, versteckte Achse 0..1 nur fuer die Heiztag-Hinterlegung (eine markArea auf einer
        // Kategorie-Achse wird 0 px breit).
        yAxis: [
            {
                type: 'value',
                min: 0,
                axisLabel: axisLabel,
                axisLine: axisLineStyle,
                splitLine: splitLineStyle,
            },
            { type: 'value', show: false, min: 0, max: 1 },
        ],
        tooltip: {
            trigger: 'axis',
            ...tooltipBase,
            formatter: (params: unknown) => {
                // Die Hintergrund-Reihe 'heatDay' ist kein eigener Eintrag: der Text kommt aus dem Modell.
                const p = ((params as { dataIndex?: number; seriesId?: string }[]) ?? []).filter(
                    (x) => x.seriesId !== 'heatDay',
                );
                if (!p.length || typeof p[0].dataIndex !== 'number') return '';
                const i = p[0].dataIndex;
                const d = m.days[i];
                return [
                    `<b>${dayHead(m, i)}</b>`,
                    `${dot(C.az)}Arbeitszahl: <b>${num(d.az, 2)}</b>`,
                    `Strom ${formatNum(d.s, 1)} kWh · Wärme ${formatNum(d.w, 1)} kWh`,
                    d.heatDay ? 'Heiztag' : 'kein Heiztag',
                ].join('<br/>');
            },
        },
        series: [
            {
                id: 'heatDay',
                type: 'bar',
                yAxisIndex: 1,
                silent: true,
                barWidth: '100%',
                z: 0,
                itemStyle: { color: C.heatDay },
                data: m.days.map((d) => (d.heatDay ? 1 : null)),
            },
            {
                id: 'az',
                type: 'line',
                connectNulls: false,
                showSymbol: true,
                symbolSize: 5,
                itemStyle: { color: C.az },
                lineStyle: { color: C.az, width: 2 },
                data: m.days.map((d) => ({
                    value: d.az,
                    itemStyle: { color: C.az, opacity: d.partial ? PARTIAL_OPACITY : 1 },
                })),
            },
        ],
    } as unknown as EChartsOption;
}

function heatOption(m: EnergyModel): EChartsOption {
    const cells: [number, number, number, number][] = [];
    m.hourly.forEach((row, di) => row.forEach((v, h) => cells.push([di, h, Math.min(v, HEAT_MAX), v])));
    return {
        animation: false,
        grid: { left: 30, right: 10, top: 6, bottom: 52 },
        xAxis: { ...dayAxis(m), splitArea: { show: false } },
        yAxis: {
            type: 'category',
            data: Array.from({ length: 24 }, (_, h) => String(h)),
            inverse: true,
            axisLabel: { ...axisLabel, interval: 2 },
            axisLine: axisLineStyle,
            axisTick: { show: false },
            splitLine: { show: false },
        },
        visualMap: {
            type: 'continuous',
            min: 0,
            max: HEAT_MAX,
            dimension: 2,
            orient: 'horizontal',
            left: 'center',
            bottom: 0,
            itemWidth: 10,
            itemHeight: 110,
            calculable: false,
            text: [`${formatNum(HEAT_MAX, 1)} kWh`, '0'],
            textStyle: { color: C.axis, fontSize: 10 },
            inRange: { color: ['rgba(136,136,136,0.12)', '#f2c879', '#e8873a', '#c0392b'] },
        },
        tooltip: {
            ...tooltipBase,
            trigger: 'item',
            formatter: (params: unknown) => {
                const v = (params as { value?: number[] }).value;
                if (!v) return '';
                const day = m.days[v[0]];
                return `${dm(day.start)}, ${v[1]}–${v[1] + 1} Uhr: <b>${formatNum(v[3], 2)} kWh</b>${
                    day.partial ? ' (läuft noch)' : ''
                }`;
            },
        },
        series: [
            {
                id: 'heat',
                type: 'heatmap',
                data: cells,
                itemStyle: { borderColor: 'rgba(0,0,0,0)', borderWidth: 1 },
                emphasis: { itemStyle: { borderColor: C.axis, borderWidth: 1 } },
            },
        ],
    } as unknown as EChartsOption;
}

const cellStyle = { padding: '4px 6px', textAlign: 'right' as const };

function LifetimeTable({ m }: { m: EnergyModel }) {
    const l = m.lifetime;
    const rows: { label: string; heizen: string; ww: string }[] = [
        { label: 'Strom (MWh)', heizen: num(l.pHeizen, 2), ww: num(l.pWw, 2) },
        { label: 'Erzeugte Wärme (MWh)', heizen: num(l.wmHeizen, 2), ww: num(l.wmWw, 2) },
        { label: 'Arbeitszahl', heizen: num(l.table.azHeizen, 2), ww: num(l.table.azWw, 2) },
        { label: 'Verdichter-Laufzeit (h)', heizen: num(l.lzVerdHeizen, 0), ww: num(l.lzVerdWw, 0) },
        { label: 'Zusatzheizung (h)', heizen: num(l.lzNeHeizen, 0), ww: num(l.lzNeWw, 0) },
    ];
    return (
        <div className="flex flex-col gap-1">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
                <thead>
                    <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--widget-border)' }}>
                        <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 400 }}> </th>
                        <th style={{ ...cellStyle, fontWeight: 500, color: C.heizen }}>Heizen</th>
                        <th style={{ ...cellStyle, fontWeight: 500, color: C.warmwasser }}>Warmwasser</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.label} style={{ borderBottom: '1px solid var(--widget-border)' }}>
                            <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-secondary)' }}>
                                {r.label}
                            </td>
                            <td style={cellStyle}>{r.heizen}</td>
                            <td style={cellStyle}>{r.ww}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>
                Gesamt: Arbeitszahl {num(l.table.azGesamt, 2)} · {num(l.verdStarts, 0)} Verdichterstarts
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Die Wärme der Zusatzheizung (Heizen {num(l.wmNeHeizen, 2)} MWh, Warmwasser {num(l.wmNeWw, 2)} MWh) ist
                in diesen Zahlen nicht enthalten.
            </div>
        </div>
    );
}

export function EnergyDetails({ historyInstance, dps }: { historyInstance: string; dps: EnergyDps }) {
    const m = useEnergyData(historyInstance, dps);
    const barOpt = useMemo(() => barOption(m), [m]);
    const azOpt = useMemo(() => azOption(m), [m]);
    const heatOpt = useMemo(() => heatOption(m), [m]);
    const t = m.totals;
    const first = m.days[0];
    const last = m.days[m.days.length - 1];

    return (
        <EnergyFrame loading={m.loading} hasData={m.hasData}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {dm(first.start)}–{dm(last.start)} · heute läuft noch
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Tile label="Stromaufnahme" value={num(t.S, 1, ' kWh')} sub={`davon Heizen ${num(t.HS, 1, ' kWh')}`} />
                <Tile label="Erzeugte Wärme" value={num(t.W, 1, ' kWh')} />
                <Tile label="Arbeitszahl gesamt" value={num(t.azGesamt, 2)} color={C.az} />
                <Tile label="Warmwasser-Anteil am Strom" value={num(t.wwAnteil, 0, ' %')} color={C.warmwasser} />
                <Tile label="Arbeitszahl Warmwasser" value={num(t.azWw, 2)} color={C.warmwasser} />
                <Tile
                    label="Arbeitszahl Heizen"
                    value={num(t.azHeizen, 2)}
                    sub={`${t.heatDays} ${t.heatDays === 1 ? 'Heiztag' : 'Heiztage'}`}
                    color={C.heizen}
                />
            </div>

            <SectionTitle>Strom pro Tag (kWh)</SectionTitle>
            <Legend
                items={[
                    { label: 'Heizen', color: C.heizen, kind: 'area' },
                    { label: 'Warmwasser', color: C.warmwasser, kind: 'area' },
                ]}
            />
            <div style={{ height: 190 }}>
                <ReactECharts
                    option={barOpt}
                    style={{ width: '100%', height: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge
                />
            </div>

            <SectionTitle>Arbeitszahl pro Tag</SectionTitle>
            <Legend
                items={[
                    { label: 'Arbeitszahl', color: C.az, kind: 'thick' },
                    { label: 'Heiztag', color: C.heizen, kind: 'area' },
                ]}
            />
            <div style={{ height: 170 }}>
                <ReactECharts
                    option={azOpt}
                    style={{ width: '100%', height: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge
                />
            </div>

            <SectionTitle>Wann wird Strom verbraucht (kWh je Stunde)</SectionTitle>
            <div style={{ height: 300 }}>
                <ReactECharts
                    option={heatOpt}
                    style={{ width: '100%', height: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge
                />
            </div>

            <SectionTitle>Seit Inbetriebnahme</SectionTitle>
            <LifetimeTable m={m} />
        </EnergyFrame>
    );
}
