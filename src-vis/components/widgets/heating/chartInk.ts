/**
 * Achsen-, Gitter- und Beschriftungsfarben der Heizungs-Diagramme, passend zum aktiven Theme.
 *
 * Bis 14.11.2026 waren das feste Werte (#888 / #444 / #333) für einen dunklen Hintergrund. Im hellen Modus
 * lagen dadurch fast schwarze Gitterlinien auf Weiß. ECharts zeichnet in ein Canvas und kann keine
 * CSS-Variablen lesen; die Werte werden deshalb am Element aufgelöst (useResolvedColors, wie im
 * Diagramm-Widget) und die Linien aus der Schriftfarbe mit Deckkraft gemischt – wie --fl-line /
 * --fl-line-strong im Facelift. Die alten Festwerte bleiben als Rückfall.
 */
import type { RefObject } from 'react';
import { useResolvedColors } from '../../../hooks/useResolvedColors';

export interface ChartInk {
    /** Achsenbeschriftung, Legende */
    axis: string;
    /** Achsenlinie */
    axisLine: string;
    /** Gitterlinie hinter den Reihen */
    grid: string;
    /** Nulllinie / Hervorhebung (etwas kräftiger als das Gitter) */
    zero: string;
}

export const INK_FALLBACK: ChartInk = { axis: '#888', axisLine: '#444', grid: '#333', zero: '#888' };

/** #rgb, #rrggbb oder rgb()/rgba() → [r, g, b]; sonst null. */
function rgbOf(c: string | undefined): [number, number, number] | null {
    if (!c) return null;
    const s = c.trim();
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
    m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
    m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
}

const mix = (rgb: [number, number, number] | null, a: number, fb: string) =>
    rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : fb;

/** Theme-Farben für ein Diagramm, gelesen am Element `ref` (folgt dem Theme-Wechsel). */
export function useChartInk(ref: RefObject<HTMLElement | null>): ChartInk {
    const [primary, secondary] = useResolvedColors(ref, ['var(--text-primary)', 'var(--text-secondary)']);
    const p = rgbOf(primary);
    return {
        axis: rgbOf(secondary) ? (secondary as string) : INK_FALLBACK.axis,
        axisLine: mix(p, 0.24, INK_FALLBACK.axisLine),
        grid: mix(p, 0.1, INK_FALLBACK.grid),
        zero: mix(p, 0.4, INK_FALLBACK.zero),
    };
}
