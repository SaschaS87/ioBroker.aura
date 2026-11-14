/**
 * UI-Facelift, Heizung (nur Dev-Vorschau): Hineinzoomen in die Zeitdiagramme der Unterseiten.
 *
 * Sascha (14.11.2026): Mit zwei Fingern geht es zu schnell, man landet nie auf dem Zeitpunkt, den man sucht
 * (z. B. 6:30 Uhr). Drei Wege zur Wahl (gelbe Auswahl „Zoom", HzZoom); zwei Finger gehen bei allen weiter:
 *   tap     Antippen: ein Tipp ins Diagramm zeigt einen Ausschnitt um diesen Punkt (Tag 2 h, Woche 12 h,
 *           Monat 2 Tage). Darüber eine Leiste mit dem Ausschnitt, ‹ › verschiebt ihn, „Alles" zurück.
 *   slider  Schieber unter dem Diagramm: Anfang und Ende des Ausschnitts mit dem Finger ziehen.
 *   slices  Zeitabschnitte über dem Diagramm: Tag in Vierteln (0–6, 6–12 …), Woche in Tagen, Monat in Wochen.
 *
 * Der Ausschnitt liegt im React-Zustand und geht in die Diagramm-Option. Vorher ging ein Zoom mit zwei
 * Fingern beim nächsten Live-Wert wieder verloren, weil die Option neu gesetzt wurde.
 * Ohne Unterseiten-Kontext (kind = null) bleibt alles wie bisher: nur zwei Finger.
 * Nebenbei merkt sich der Hook, was in der Legende abgeschaltet ist (legendSelected).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PeriodMode } from '../../../utils/chartPeriod';
import type { HzZoom } from './HzSubpage';
import type { ChartInk } from './chartInk';
import type { EChartsType } from 'echarts';

type Range = [number, number];
interface Win {
    start: number;
    end: number;
}
type Chart = EChartsType;
type DzState = { startValue?: number; endValue?: number };

const H = 3_600_000;
const D = 24 * H;
/** Breite des Ausschnitts beim Antippen. */
const TAP_SPAN: Record<PeriodMode, number> = { day: 2 * H, week: 12 * H, month: 2 * D };
/** Kleinster Ausschnitt, auch mit zwei Fingern (dort schießt man sonst ins Leere). */
const MIN_SPAN = 20 * 60_000;
/** Höhe des Schiebers samt Abstand (px), die das Diagramm unten zusätzlich braucht. */
export const SLIDER_SPACE = 36;

const clamp = (r: Range, w: Win): Range => {
    const span = Math.min(r[1] - r[0], w.end - w.start);
    let a = Math.max(w.start, r[0]);
    let b = a + span;
    if (b > w.end) {
        b = w.end;
        a = b - span;
    }
    return [a, b];
};
const isAll = (r: Range, w: Win) => r[0] <= w.start + 60_000 && r[1] >= w.end - 60_000;

const hm = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const dm = (t: number) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
function rangeLabel([a, b]: Range, mode: PeriodMode): string {
    const sameDay = new Date(a).toDateString() === new Date(b - 1).toDateString();
    if (mode === 'day') return `${hm(a)} – ${hm(b)} Uhr`;
    if (sameDay) return `${dm(a)} ${hm(a)} – ${hm(b)}`;
    return `${dm(a)} ${hm(a)} – ${dm(b)} ${hm(b)}`;
}

/** Zeitabschnitte des Fensters: Tag in Vierteln, Woche in Tagen, Monat in Wochen. */
function slicesOf(w: Win, mode: PeriodMode): { label: string; r: Range }[] {
    const out: { label: string; r: Range }[] = [];
    if (mode === 'day') {
        for (let h = 0; h < 24; h += 6) out.push({ label: `${h}–${h + 6}`, r: [w.start + h * H, w.start + (h + 6) * H] });
    } else if (mode === 'week') {
        for (let t = w.start; t < w.end; t += D) {
            const d = new Date(t + H); // Zeitumstellung: Tag über die Mitte bestimmen
            const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
            out.push({ label: d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''), r: [s, e] });
        }
    } else {
        const first = new Date(w.start);
        for (let day = 1; ; day += 7) {
            const s = new Date(first.getFullYear(), first.getMonth(), day).getTime();
            if (s >= w.end) break;
            const e = Math.min(w.end, new Date(first.getFullYear(), first.getMonth(), day + 7).getTime());
            const last = new Date(e - 1).getDate();
            out.push({ label: `${day}.–${last}.`, r: [s, e] });
        }
    }
    return out;
}

export interface ChartZoom {
    /** in die Option: dataZoom-Liste */
    dataZoom: Record<string, unknown>[];
    /** zusätzlicher Platz unten für den Schieber (px), sonst 0 */
    extraBottom: number;
    onEvents: Record<string, (params: unknown, chart: Chart) => void>;
    onChartReady: (chart: Chart) => void;
    /** Bedienung über dem Diagramm (Leiste bzw. Zeitabschnitte), sonst null */
    controls: ReactNode;
    /** in die Option: legend.selected (abgeschaltete Linien bleiben beim nächsten Live-Wert aus) */
    legendSelected: Record<string, boolean>;
}

export function useChartZoom(win: Win, mode: PeriodMode, kind: HzZoom | null, ink: ChartInk, xAxisIndex: number[] = [0]): ChartZoom {
    const [zoom, setZoom] = useState<Range | null>(null);
    // Die Option wird bei jedem Live-Wert neu gesetzt (notMerge); ohne gemerkte Auswahl ging eine in der
    // Legende abgeschaltete Linie dabei wieder an.
    const [legendSelected, setLegendSelected] = useState<Record<string, boolean>>({});
    // neues Fenster (anderer Tag, Zeitraum): wieder alles zeigen
    useEffect(() => setZoom(null), [win.start, win.end]);

    const live = useRef({ zoom, win, mode, kind });
    live.current = { zoom, win, mode, kind };
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const apply = (r: Range | null) => {
        const w = live.current.win;
        if (!r) return setZoom(null);
        const c = clamp(r, w);
        setZoom(isAll(c, w) ? null : c);
    };

    const dataZoom = useMemo(() => {
        const range = zoom ? { startValue: zoom[0], endValue: zoom[1] } : {};
        const list: Record<string, unknown>[] = [
            {
                type: 'inside',
                xAxisIndex,
                filterMode: 'none',
                zoomOnMouseWheel: false,
                moveOnMouseMove: false,
                moveOnMouseWheel: false,
                ...(kind ? { minValueSpan: MIN_SPAN } : {}),
                ...range,
            },
        ];
        if (kind === 'slider')
            list.push({
                type: 'slider',
                xAxisIndex,
                filterMode: 'none',
                bottom: 24,
                height: 26,
                minValueSpan: MIN_SPAN,
                brushSelect: false,
                borderColor: ink.axisLine,
                backgroundColor: 'transparent',
                fillerColor: 'rgba(120,120,120,0.18)',
                handleSize: '110%',
                handleStyle: { color: ink.axis, borderColor: ink.axis },
                moveHandleSize: 0,
                dataBackground: { lineStyle: { color: ink.axisLine }, areaStyle: { color: ink.grid } },
                selectedDataBackground: { lineStyle: { color: ink.axis }, areaStyle: { color: ink.axisLine } },
                showDetail: false, // Anfang und Ende stehen in der Leiste über dem Diagramm
                ...range,
            });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, kind, mode, ink.axis, ink.axisLine, ink.grid, xAxisIndex.join()]);

    const onEvents = useMemo(
        () => ({
            legendselectchanged: (p: unknown) => setLegendSelected({ ...(p as { selected: Record<string, boolean> }).selected }),
            // zwei Finger oder Schieber: Ausschnitt übernehmen, kurz nach dem Ende der Bewegung
            datazoom: (_p: unknown, chart: Chart) => {
                if (!live.current.kind) return;
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                    const dz = (chart.getOption() as { dataZoom?: DzState[] }).dataZoom?.[0];
                    if (dz?.startValue === undefined || dz.endValue === undefined) return;
                    const cur = live.current.zoom;
                    if (cur && Math.abs(cur[0] - dz.startValue) < 1000 && Math.abs(cur[1] - dz.endValue) < 1000) return;
                    apply([dz.startValue, dz.endValue]);
                }, 350);
            },
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const onChartReady = (chart: Chart) => {
        chart.getZr().on('click', (e) => {
            const { kind: k, zoom: z, mode: m } = live.current;
            if (k !== 'tap' || z) return; // im Ausschnitt zeigt ein Tipp nur die Werte
            const p: [number, number] = [e.offsetX, e.offsetY];
            if (!chart.containPixel({ gridIndex: xAxisIndex }, p)) return;
            const t = chart.convertFromPixel({ xAxisIndex: 0 }, e.offsetX) as number;
            if (!Number.isFinite(t)) return;
            // glatte Grenzen (Viertelstunde, ab Woche volle Stunde) statt 05:44 – 07:44
            const span = TAP_SPAN[m];
            const q = m === 'day' ? 15 * 60_000 : H;
            const a = Math.round((t - span / 2) / q) * q;
            apply([a, a + span]);
        });
    };

    let controls: ReactNode = null;
    if (kind === 'slices') {
        const sl = slicesOf(win, mode);
        controls = (
            <div className="hz-seg hz-zoom-slices" role="tablist" aria-label="Zeitabschnitt">
                <button type="button" role="tab" className="hz-seg-btn" data-on={!zoom || undefined} onClick={() => apply(null)}>
                    Alles
                </button>
                {sl.map((s) => {
                    const on = !!zoom && Math.abs(zoom[0] - s.r[0]) < 60_000 && Math.abs(zoom[1] - s.r[1]) < 60_000;
                    return (
                        <button key={s.label} type="button" role="tab" className="hz-seg-btn" data-on={on || undefined} onClick={() => apply(on ? null : s.r)}>
                            {s.label}
                        </button>
                    );
                })}
            </div>
        );
    } else if (kind && zoom) {
        const step = (dir: -1 | 1) => apply([zoom[0] + (dir * (zoom[1] - zoom[0])) / 2, zoom[1] + (dir * (zoom[1] - zoom[0])) / 2]);
        controls = (
            <div className="hz-nav hz-zoom">
                <button type="button" className="hz-nav-arrow" aria-label="Ausschnitt früher" disabled={zoom[0] <= win.start} onClick={() => step(-1)}>
                    <ChevronLeft size={20} />
                </button>
                <span className="hz-zoom-range">{rangeLabel(zoom, mode)}</span>
                <button type="button" className="hz-nav-arrow" aria-label="Ausschnitt später" disabled={zoom[1] >= win.end} onClick={() => step(1)}>
                    <ChevronRight size={20} />
                </button>
                <button type="button" className="hz-nav-today" onClick={() => apply(null)}>
                    Alles
                </button>
            </div>
        );
    } else if (kind === 'tap') {
        controls = <p className="hz-zoom-hint">Tippe ins Diagramm, um diese Stelle zu vergrößern.</p>;
    }

    return {
        dataZoom,
        extraBottom: kind === 'slider' ? SLIDER_SPACE : 0,
        onEvents,
        onChartReady,
        controls,
        legendSelected,
    };
}
