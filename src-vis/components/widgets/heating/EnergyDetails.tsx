/**
 * Klappbox „Energie" (Heizung-Tab): Strom, erzeugte Waerme und Arbeitszahl der letzten 30 Tage, dazu die
 * Gesamtzaehler der Anlage. Die Rechnung steckt in utils/heatingEnergy.ts, die Daten in energyModel.ts.
 *
 * Reihenfolge: Zeitraum, Kennzahlen, Balken Strom/Tag, Linie Arbeitszahl/Tag, Heatmap Tag x Uhrzeit, Tabelle.
 * Feste 30 Tage, keine Zeitraum-Navigation. Der laufende Tag ist schwaecher gezeichnet.
 *
 * UI-Facelift (Unterseite, useHzSubpage): gleiche Zahlen und Diagramme, aber als Abschnitte mit Titel,
 * Kennzahlen und Lebenszeit-Tabelle als Zeilen (aura-fl-row), jedes Diagramm in eigener Karte.
 */
import { useMemo, useRef, type ReactNode } from 'react';
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
    axisLabelOf,
    axisLineOf,
    dm,
    dot,
    num,
    splitLineOf,
    tooltipBase,
} from './energyParts';
import { formatNum } from '../../../utils/formatValue';
import { useChartInk, type ChartInk } from './chartInk';
import { HzSection, HzStatRows, useHzSubpage, type HzStat } from './HzSubpage';

type Opt = Record<string, unknown>;

const GRID = { left: 38, right: 10, top: 10, bottom: 24 };

/** X-Achse mit einem Tag je Kategorie; Beschriftung TT.MM. */
function dayAxis(m: EnergyModel, ink: ChartInk, show = true): Opt {
    return {
        type: 'category',
        data: m.days.map((d) => d.key),
        axisLabel: {
            ...axisLabelOf(ink),
            show,
            interval: 4,
            formatter: (v: string) => {
                const d = m.days.find((x) => x.key === v);
                return d ? dm(d.start).slice(0, 5) : v;
            },
        },
        axisLine: axisLineOf(ink),
        axisTick: { show: false },
        splitLine: { show: false },
    };
}

const dayHead = (m: EnergyModel, i: number): string => {
    const d = m.days[i];
    return `${dm(d.start)}${d.partial ? ' · läuft noch' : ''}`;
};

function barOption(m: EnergyModel, ink: ChartInk): EChartsOption {
    const item = (v: number, color: string, partial: boolean) => ({
        value: v,
        itemStyle: { color, opacity: partial ? PARTIAL_OPACITY : 1 },
    });
    return {
        animation: false,
        grid: GRID,
        xAxis: dayAxis(m, ink),
        yAxis: {
            type: 'value',
            axisLabel: axisLabelOf(ink),
            axisLine: axisLineOf(ink),
            splitLine: splitLineOf(ink),
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

function azOption(m: EnergyModel, ink: ChartInk): EChartsOption {
    return {
        animation: false,
        grid: GRID,
        xAxis: dayAxis(m, ink),
        // Zweite, versteckte Achse 0..1 nur fuer die Heiztag-Hinterlegung (eine markArea auf einer
        // Kategorie-Achse wird 0 px breit).
        yAxis: [
            {
                type: 'value',
                min: 0,
                axisLabel: axisLabelOf(ink),
                axisLine: axisLineOf(ink),
                splitLine: splitLineOf(ink),
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

function heatOption(m: EnergyModel, ink: ChartInk): EChartsOption {
    const cells: [number, number, number, number][] = [];
    m.hourly.forEach((row, di) => row.forEach((v, h) => cells.push([di, h, Math.min(v, HEAT_MAX), v])));
    return {
        animation: false,
        grid: { left: 30, right: 10, top: 6, bottom: 52 },
        xAxis: { ...dayAxis(m, ink), splitArea: { show: false } },
        yAxis: {
            type: 'category',
            data: Array.from({ length: 24 }, (_, h) => String(h)),
            inverse: true,
            axisLabel: { ...axisLabelOf(ink), interval: 2 },
            axisLine: axisLineOf(ink),
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
            textStyle: { color: ink.axis, fontSize: 10 },
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
                emphasis: { itemStyle: { borderColor: ink.zero, borderWidth: 1 } },
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

/** Lebenszeit-Werte als Facelift-Zeilen: Kopfzeile Heizen/Warmwasser, je Größe eine Zeile mit zwei Werten. */
function LifetimeRows({ m }: { m: EnergyModel }) {
    const l = m.lifetime;
    const rows: { label: string; sub?: string; heizen: string; ww: string }[] = [
        { label: 'Strom', sub: 'in MWh', heizen: num(l.pHeizen, 2), ww: num(l.pWw, 2) },
        { label: 'Wärme', sub: 'erzeugt, in MWh', heizen: num(l.wmHeizen, 2), ww: num(l.wmWw, 2) },
        { label: 'Arbeitszahl', heizen: num(l.table.azHeizen, 2), ww: num(l.table.azWw, 2) },
        { label: 'Verdichter', sub: 'Laufzeit in h', heizen: num(l.lzVerdHeizen, 0), ww: num(l.lzVerdWw, 0) },
        { label: 'Zusatzheizung', sub: 'Laufzeit in h', heizen: num(l.lzNeHeizen, 0), ww: num(l.lzNeWw, 0) },
    ];
    return (
        <>
            <div className="aura-fl-card hz-lt">
                <div className="hz-lt-head" aria-hidden>
                    <span />
                    <span style={{ color: C.heizen }}>Heizen</span>
                    <span style={{ color: C.warmwasser }}>Warmwasser</span>
                </div>
                {rows.map((r) => (
                    <div key={r.label} className="aura-fl-row hz-valrow hz-valrow--plain hz-lt-row">
                        <span className="aura-fl-row-main">
                            <span className="aura-fl-row-title hz-row-title">{r.label}</span>
                            {r.sub && <span className="aura-fl-row-sub">{r.sub}</span>}
                        </span>
                        <span className="hz-lt-val" aria-label={`Heizen ${r.heizen}`}>
                            {r.heizen}
                        </span>
                        <span className="hz-lt-val" aria-label={`Warmwasser ${r.ww}`}>
                            {r.ww}
                        </span>
                    </div>
                ))}
            </div>
            <HzStatRows
                stats={[
                    { label: 'Arbeitszahl gesamt', value: num(l.table.azGesamt, 2), color: C.az },
                    { label: 'Verdichterstarts', value: num(l.verdStarts, 0) },
                ]}
            />
        </>
    );
}

function ChartCard({ height, legend, option }: { height: number; legend?: ReactNode; option: EChartsOption }) {
    return (
        <div className="aura-fl-card hz-detail">
            <div className="flex flex-col gap-2 w-full">
                {legend}
                <div style={{ height }}>
                    <ReactECharts option={option} style={{ width: '100%', height: '100%' }} opts={{ renderer: 'canvas' }} notMerge />
                </div>
            </div>
        </div>
    );
}

export function EnergyDetails({ historyInstance, dps }: { historyInstance: string; dps: EnergyDps }) {
    const m = useEnergyData(historyInstance, dps);
    const inkRef = useRef<HTMLDivElement>(null);
    const ink = useChartInk(inkRef);
    const inkKey = `${ink.axis}|${ink.axisLine}|${ink.grid}|${ink.zero}`;
    /* eslint-disable react-hooks/exhaustive-deps */
    const barOpt = useMemo(() => barOption(m, ink), [m, inkKey]);
    const azOpt = useMemo(() => azOption(m, ink), [m, inkKey]);
    const heatOpt = useMemo(() => heatOption(m, ink), [m, inkKey]);
    /* eslint-enable react-hooks/exhaustive-deps */
    const sub = useHzSubpage();
    const t = m.totals;
    const first = m.days[0];
    const last = m.days[m.days.length - 1];

    if (sub) {
        if (!m.hasData)
            return (
                <div ref={inkRef} className="aura-fl-card hz-detail">
                    <EnergyFrame loading={m.loading} hasData={false}>
                        {null}
                    </EnergyFrame>
                </div>
            );
        const kz: HzStat[] = [
            { label: 'Stromaufnahme', value: num(t.S, 1, ' kWh'), sub: `davon Heizen ${num(t.HS, 1, ' kWh')}` },
            { label: 'Erzeugte Wärme', value: num(t.W, 1, ' kWh') },
            { label: 'Arbeitszahl gesamt', value: num(t.azGesamt, 2), color: C.az },
            {
                label: 'Arbeitszahl Heizen',
                value: num(t.azHeizen, 2),
                sub: `${t.heatDays} ${t.heatDays === 1 ? 'Heiztag' : 'Heiztage'}`,
                color: C.heizen,
            },
            { label: 'Arbeitszahl Warmwasser', value: num(t.azWw, 2), color: C.warmwasser },
            { label: 'Warmwasser-Anteil am Strom', value: num(t.wwAnteil, 0, ' %'), color: C.warmwasser },
        ];
        return (
            <div ref={inkRef} className="hz-energy">
                <HzSection
                    title="Letzte 30 Tage"
                    foot={`${dm(first.start)}–${dm(last.start)}, der heutige Tag läuft noch und ist in den Diagrammen blasser.`}
                >
                    <HzStatRows stats={kz} />
                </HzSection>
                <HzSection title="Strom pro Tag" foot="Kilowattstunden je Tag, aufgeteilt auf Heizen und Warmwasser.">
                    <ChartCard
                        height={190}
                        option={barOpt}
                        legend={
                            <Legend
                                items={[
                                    { label: 'Heizen', color: C.heizen, kind: 'area' },
                                    { label: 'Warmwasser', color: C.warmwasser, kind: 'area' },
                                ]}
                            />
                        }
                    />
                </HzSection>
                <HzSection
                    title="Arbeitszahl pro Tag"
                    foot="Erzeugte Wärme geteilt durch Strom. Rötlich hinterlegt sind Heiztage."
                >
                    <ChartCard
                        height={170}
                        option={azOpt}
                        legend={
                            <Legend
                                items={[
                                    { label: 'Arbeitszahl', color: C.az, kind: 'thick' },
                                    { label: 'Heiztag', color: C.heizen, kind: 'area' },
                                ]}
                            />
                        }
                    />
                </HzSection>
                <HzSection
                    title="Wann wird Strom verbraucht"
                    foot="Kilowattstunden je Stunde: eine Spalte je Tag, oben Mitternacht. Je kräftiger die Farbe, desto mehr."
                >
                    <ChartCard height={300} option={heatOpt} />
                </HzSection>
                <HzSection
                    title="Seit Inbetriebnahme"
                    foot={`Die Wärme der Zusatzheizung (Heizen ${num(m.lifetime.wmNeHeizen, 2)} MWh, Warmwasser ${num(
                        m.lifetime.wmNeWw,
                        2,
                    )} MWh) ist in diesen Zahlen nicht enthalten.`}
                >
                    <LifetimeRows m={m} />
                </HzSection>
            </div>
        );
    }

    return (
        <EnergyFrame loading={m.loading} hasData={m.hasData}>
            <div ref={inkRef} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
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
