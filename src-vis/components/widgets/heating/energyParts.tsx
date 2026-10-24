/**
 * Gemeinsame Bausteine der Klappbox „Energie": Farben, Kachel, Abschnittsueberschrift, Zahlen- und
 * Datumshelfer sowie der Rahmen mit Lade- und Leerzustand.
 *
 * ECharts zeichnet in ein Canvas: Farben sind feste Hex-/rgba-Werte. Heizen gruen und Warmwasser blau
 * entsprechen C.heizen / C.warmwasser in HeatingDetails; Achsen wie dort (#888 / #444 / #333).
 */
import type { ReactNode } from 'react';
import { BarChart2, Loader } from 'lucide-react';
import { formatNum } from '../../../utils/formatValue';

export const C = {
    heizen: '#4a9e2f',
    warmwasser: '#2f7fd6',
    az: '#e8873a',
    heatDay: 'rgba(74,158,47,0.14)',
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
} as const;

/** Der laufende Tag wird schwaecher gezeichnet. */
export const PARTIAL_OPACITY = 0.55;

/** Obergrenze der Heatmap-Farbskala (kWh je Stunde). */
export const HEAT_MAX = 2.6;

export const axisLabel = { color: C.axis, fontSize: 10 };
export const axisLineStyle = { show: true, lineStyle: { color: C.axisLine } };
export const splitLineStyle = { show: true, lineStyle: { color: C.grid } };

export const tooltipBase = {
    backgroundColor: 'var(--app-surface, #1e1e1e)',
    borderColor: 'var(--app-border, #333)',
    textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
    confine: true,
};

export const dot = (color: string) =>
    `<span style="display:inline-block;margin-right:5px;width:8px;height:8px;border-radius:50%;background:${color}"></span>`;

const pad = (n: number) => String(n).padStart(2, '0');

/** TT.MM. aus einem Zeitstempel (lokal). */
export function dm(ts: number): string {
    const d = new Date(ts);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** Zahl oder Gedankenstrich. */
export function num(v: number | null | undefined, decimals: number, unit = ''): string {
    return typeof v === 'number' && Number.isFinite(v) ? `${formatNum(v, decimals)}${unit}` : '–';
}

export function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
        <div
            style={{
                background: 'var(--widget-bg)',
                border: '1px solid var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
                padding: '9px 11px',
            }}
        >
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: color || 'var(--text-primary)', marginTop: 2 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
        </div>
    );
}

export function SectionTitle({ children }: { children: ReactNode }) {
    return <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginTop: 4 }}>{children}</div>;
}

/** Rahmen mit Lade- und Leerzustand (wie SensorFrame). */
export function EnergyFrame({
    loading,
    hasData,
    height = 200,
    children,
}: {
    loading: boolean;
    hasData: boolean;
    height?: number;
    children: ReactNode;
}) {
    if (hasData) return <div className="flex flex-col gap-2 w-full">{children}</div>;
    return (
        <div className="relative w-full" style={{ height }}>
            {loading ? (
                <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Loader size={20} className="animate-spin" />
                </div>
            ) : (
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <BarChart2 size={28} strokeWidth={1.5} />
                    <span className="text-xs">Keine Daten</span>
                </div>
            )}
        </div>
    );
}
