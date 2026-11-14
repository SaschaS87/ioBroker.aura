/**
 * Gemeinsame Bausteine der Klappbox „Aussenfuehler-Check": Farben, Tooltip, Achsen-Helfer und der Rahmen mit
 * Perioden-Navigation, Lade- und Leerzustand.
 *
 * ECharts zeichnet in ein Canvas: Reihenfarben sind darum feste Hex-/rgba-Werte
 * (CSS-Variablen loest das Canvas nicht auf). Achsen, Gitter und Beschriftung folgen seit 14.11.2026 dem
 * Theme (useChartInk, Rueckfall #888 / #444 / #333); die Diagramme bekommen sie als `ink` uebergeben.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart2, Loader } from 'lucide-react';
import { ChartPeriodNav } from '../ChartPeriodNav';
import { HeizungPeriodNav } from './HeizungPeriodNav';
import { useHeizungDraft } from './heizungDraft';
import { formatNum } from '../../../utils/formatValue';
import type { PeriodMode } from '../../../utils/chartPeriod';
import { niceRange, type Grid } from '../../../utils/sensorCheck';
import { useSensorCheckData, type SensorCheckDps, type SensorCheckModel } from './sensorCheckModel';
import { useChartInk, type ChartInk } from './chartInk';
import { HzDetailFrame, useHzSubpage, type HzStat } from './HzSubpage';

export const C = {
    fuehler: '#e8873a',
    st1: '#7cc47f',
    st2: '#5aa0e0',
    st3: '#9ca3af',
    mittel: '#cbd5e1',
    luxFill: 'rgba(234,179,8,0.18)',
    luxEdge: '#eab308',
    plus: '#e8873a',
    minus: '#2f7fd6',
    plusFill: 'rgba(232,135,58,0.38)',
    minusFill: 'rgba(47,127,214,0.38)',
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
} as const;

export const STATION_COLORS = [C.st1, C.st2, C.st3] as const;

export interface SensorCheckProps {
    historyInstance: string;
    dps: SensorCheckDps;
}

export const axisLabelOf = (ink: ChartInk) => ({ color: ink.axis, fontSize: 10 });
export const axisLineOf = (ink: ChartInk) => ({ show: true, lineStyle: { color: ink.axisLine } });

export const tooltipBase = {
    backgroundColor: 'var(--app-surface, #1e1e1e)',
    borderColor: 'var(--app-border, #333)',
    textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
    confine: true,
};

/** Lux-Achse rechts: 0 bis auf volle 10 klx aufgerundet, immer mit explizitem interval. */
export function luxAxis(luxGrid: Grid): { min: number; max: number; interval: number } {
    let m = 0;
    for (const v of luxGrid) if (typeof v === 'number' && v / 1000 > m) m = v / 1000;
    if (m <= 10) return { min: 0, max: 10, interval: 5 };
    if (m <= 20) return { min: 0, max: 20, interval: 10 };
    if (m <= 40) return { min: 0, max: Math.ceil(m / 10) * 10, interval: 10 };
    return { min: 0, max: Math.ceil(m / 20) * 20, interval: 20 };
}

/** Temperatur-Achse links: feste Grenzen auf 5 °C. */
export function tempAxis(m: SensorCheckModel): { min: number; max: number; interval: number } {
    return niceRange([...m.fuehler, ...m.stationen.flat(), ...m.mittel], {
        unit: 5,
        minSpan: 10,
        maxTicks: 6,
    });
}

/** Abweichungs-Achse: symmetrisch um 0, ganze Kelvin. */
export function devAxis(g: Grid): { min: number; max: number; interval: number } {
    return niceRange(g, { unit: 1, symmetric: true, minSpan: 2, maxTicks: 4 });
}

/** Rasterreihe in klx. */
export const toKlx = (g: Grid): Grid => g.map((v) => (typeof v === 'number' ? v / 1000 : null));

export const signed = (v: number, d = 1) => `${v > 0 ? '+' : ''}${formatNum(v, d)}`;

function timeLabel(ts: number, mode: PeriodMode): string {
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (mode === 'day') return hm;
    return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

const dot = (color: string) =>
    `<span style="display:inline-block;margin-right:5px;width:8px;height:8px;border-radius:50%;background:${color}"></span>`;

/** Tooltip-Text eines Abschnitts (aus dem Modell, nicht aus den Serienwerten). */
export function tooltipFor(m: SensorCheckModel, mode: PeriodMode, idx: number): string {
    if (idx < 0 || idx >= m.count) return '';
    const dash = '–';
    const t = (v: number | null) => (typeof v === 'number' ? `<b>${formatNum(v, 1)} °C</b>` : dash);
    const from = m.start + idx * m.stepMs;
    const lines: string[] = [`${timeLabel(from, mode)} – ${timeLabel(from + m.stepMs, mode).slice(-5)}`];
    lines.push(`${dot(C.fuehler)}Fühler: ${t(m.fuehler[idx])}`);
    m.stationen.forEach((g, i) => lines.push(`${dot(STATION_COLORS[i])}Station ${i + 1}: ${t(g[idx])}`));
    const n = m.n[idx] ?? 0;
    lines.push(
        `${dot(C.mittel)}Mittel${n > 0 ? ` (${n} ${n === 1 ? 'Station' : 'Stationen'})` : ''}: ${t(m.mittel[idx])}`,
    );
    const dv = m.abweichung[idx];
    lines.push(
        typeof dv === 'number'
            ? `${dot(dv >= 0 ? C.plus : C.minus)}Abweichung: <b>${signed(dv)} K</b>`
            : `${dot(C.axis)}Abweichung: ${dash}`,
    );
    const lx = m.lux[idx];
    lines.push(
        `${dot(C.luxEdge)}Helligkeit: ${typeof lx === 'number' ? `<b>${formatNum(lx / 1000, 1)} klx</b>` : dash}`,
    );
    return lines.join('<br/>');
}

/** Gemeinsamer Tooltip fuer alle Zeitachsen-Diagramme (trigger axis). */
export function axisTooltip(m: SensorCheckModel, mode: PeriodMode) {
    return {
        trigger: 'axis' as const,
        ...tooltipBase,
        axisPointer: { type: 'line' as const, link: [{ xAxisIndex: 'all' as const }] },
        formatter: (params: unknown) => {
            const p = (params as { dataIndex?: number }[]) ?? [];
            if (!p.length || typeof p[0].dataIndex !== 'number') return '';
            return tooltipFor(m, mode, p[0].dataIndex);
        },
    };
}

export type LegendItem = { label: string; color: string; kind?: 'line' | 'thick' | 'dash' | 'area' | 'dot' };

export function Legend({ items, center }: { items: LegendItem[]; center?: boolean }) {
    return (
        <div
            className={`flex flex-wrap items-center${center ? ' justify-center' : ''}`}
            style={{ gap: '3px 10px', fontSize: 10, color: 'var(--text-secondary)' }}
        >
            {items.map((it) => (
                <span key={it.label} className="inline-flex items-center" style={{ gap: 4 }}>
                    <span
                        style={{
                            display: 'inline-block',
                            width: 12,
                            height: it.kind === 'area' ? 8 : it.kind === 'dot' ? 8 : it.kind === 'thick' ? 3 : 2,
                            borderRadius: it.kind === 'dot' ? 4 : 1,
                            background: it.kind === 'dash' ? 'transparent' : it.color,
                            borderTop: it.kind === 'dash' ? `2px dashed ${it.color}` : undefined,
                            opacity: it.kind === 'area' ? 0.7 : 1,
                        }}
                    />
                    {it.label}
                </span>
            ))}
        </div>
    );
}

/** Legende: nur so viele Netatmo-Stationen, wie konfiguriert sind. */
export function legendFor(stationCount: number): LegendItem[] {
    return [
        { label: 'Helligkeit (klx)', color: C.luxEdge, kind: 'area' },
        ...STATION_COLORS.slice(0, stationCount).map((color, i) => ({ label: `Netatmo ${i + 1}`, color })),
        { label: 'Fühler', color: C.fuehler, kind: 'thick' as const },
        { label: 'Abweichung zu warm', color: C.plus, kind: 'dot' as const },
        { label: 'zu kalt', color: C.minus, kind: 'dot' as const },
    ];
}

/**
 * Rahmen der Klappbox: Perioden-Navigation, Lade-/Leerzustand (wie in
 * HeatingDetails) und ein Render-Callback fuer das eigentliche Diagramm.
 */
export function SensorFrame({
    props,
    height,
    legend,
    chart,
    below,
}: {
    props: SensorCheckProps;
    height: number;
    legend: LegendItem[];
    chart: (m: SensorCheckModel, mode: PeriodMode, offset: number, ink: ChartInk) => ReactNode;
    below?: (m: SensorCheckModel, mode: PeriodMode, offset: number, ink: ChartInk) => ReactNode;
}) {
    const [mode, setMode] = useState<PeriodMode>('day');
    const [offset, setOffset] = useState(0);
    const m = useSensorCheckData(mode, offset, props.historyInstance, props.dps);
    const inkRef = useRef<HTMLDivElement>(null);
    const ink = useChartInk(inkRef);
    const body = m.hasData ? chart(m, mode, offset, ink) : null;
    // UI-Facelift (nur Dev-Vorschau, sonst null): Zeitraum-Wahl in zwei Zeilen
    const PeriodNav = useHeizungDraft() ? HeizungPeriodNav : ChartPeriodNav;
    const sub = useHzSubpage();
    const stats = useMemo(() => (sub && m.hasData ? sensorStats(m) : null), [sub, m]);
    return (
        <HzDetailFrame
            innerRef={inkRef}
            stats={stats}
            after={m.hasData && below ? below(m, mode, offset, ink) : null}
            nav={
                <PeriodNav
                mode={mode}
                offset={offset}
                onMode={(x) => {
                    setMode(x);
                    setOffset(0);
                }}
                onOffset={setOffset}
            />
            }
        >
            {/* Facelift: Legende unter dem Diagramm wie bei den anderen Auswertungen (Sascha, 14.11.2026) */}
            {!sub && <Legend items={legend} />}
            <div className="relative w-full" style={{ height }}>
                {m.loading && !m.hasData && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!m.loading && !m.hasData && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">Keine Daten</span>
                    </div>
                )}
                {body}
            </div>
            {sub && <Legend items={legend} center />}
        </HzDetailFrame>
    );
}

/** Kennzahlen der Unterseite (Facelift): Abweichung im Mittel und am größten, aus den Abschnitten des Modells. */
function sensorStats(m: SensorCheckModel): HzStat[] {
    let sum = 0;
    let n = 0;
    let big: number | null = null;
    let bigI = -1;
    for (let i = 0; i < m.count; i++) {
        const d = m.abweichung[i];
        if (typeof d !== 'number') continue;
        sum += d;
        n++;
        if (big === null || Math.abs(d) > Math.abs(big)) {
            big = d;
            bigI = i;
        }
    }
    const col = (v: number | null) => (v === null ? undefined : v >= 0 ? C.plus : C.minus);
    const mean = n ? sum / n : null;
    const word = (v: number | null) => (v === null ? undefined : v >= 0 ? 'Fühler zu warm' : 'Fühler zu kalt');
    const at = bigI >= 0 ? new Date(m.start + bigI * m.stepMs) : null;
    const atText =
        at &&
        (m.end - m.start <= 90_000_000
            ? `um ${at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
            : `am ${at.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`);
    return [
        { label: 'Abweichung im Mittel', value: mean === null ? '–' : `${signed(mean)} K`, sub: word(mean), color: col(mean) },
        {
            label: 'Größte Abweichung',
            value: big === null ? '–' : `${signed(big)} K`,
            sub: atText ? `${word(big)}, ${atText}` : undefined,
            color: col(big),
        },
    ];
}
