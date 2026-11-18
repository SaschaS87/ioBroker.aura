/**
 * UI-Facelift, Heizung: Hineinzoomen in die Zeitdiagramme der Unterseiten (Heizkreis, Betrieb, Warmwasser).
 *
 * Sascha (14.11.2026): Mit zwei Fingern geht es zu schnell, man landet nie auf dem Zeitpunkt, den man sucht
 * (z. B. 6:30 Uhr). Zur Wahl standen Antippen, Schieber und Zeitabschnitte; Sascha hat am 16.11.2026 den
 * Schieber gewählt. Unter dem Diagramm liegt ein Schieber (ECharts dataZoom „slider"), Anfang und Ende zieht
 * man mit dem Finger, ein Tipp daneben verschiebt den Ausschnitt dorthin, ein Doppeltipp in den Schieber
 * zeigt wieder alles. Auswahl gelb durchscheinend, Griffe kräftig gelb (Sascha, 16.11.2026). Die Leiste mit
 * dem Ausschnitt über dem Diagramm ist auf Saschas Wunsch wieder weg (16.11.2026), die Zeitachse zeigt den
 * Bereich. Zwei Finger gehen weiter, mit kleinstem Ausschnitt 20 Minuten.
 *
 * Vorschau-Kurve im Schieber: ECharts streckt sie über die Zeitspanne der ersten Reihe, die Griffe rechnen
 * aber mit der ganzen Achse. Am laufenden Tag (Werte nur bis jetzt) lag der Anstieg von 8 Uhr deshalb bei
 * 14:30 (Sascha, 16.11.2026). frame() stellt eine unsichtbare Vorschau-Reihe nach vorn (ECharts nimmt die
 * erste Linie), mit je einem leeren Punkt an Anfang und Ende des Fensters; dann decken sich Kurve und Achse.
 * Eine eigene Reihe, weil die erste Linie oft Teil eines Stapels ist (Spreizung, Hysterese).
 *
 * Der Ausschnitt liegt im React-Zustand und geht in die Diagramm-Option. Vorher ging ein Zoom beim nächsten
 * Live-Wert wieder verloren, weil die Option neu gesetzt wird (notMerge). Ebenso merkt sich der Hook, was in
 * der Legende abgeschaltet ist (legendSelected).
 * Ohne Unterseiten-Kontext (enabled = false) bleibt alles wie bisher: nur zwei Finger, kein Schieber.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartInk } from './chartInk';
import type { EChartsType } from 'echarts';

type Range = [number, number];
interface Win {
    start: number;
    end: number;
}
type Chart = EChartsType;
type DzState = { startValue?: number; endValue?: number };
type Series = Record<string, unknown>;

/** Kleinster Ausschnitt (sonst schießt man mit zwei Fingern ins Leere). */
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

/** Höchster Abstand zweier Tipps für einen Doppeltipp (ms) und Lage des Schiebers (px vom unteren Rand). */
const DOUBLE_TAP_MS = 400;
const SLIDER_BOTTOM = 24;
const LEGEND_LINE = 16;
const SLIDER_HEIGHT = 26;

export interface ChartZoom {
    /** in die Option: dataZoom-Liste */
    dataZoom: Series[];
    /** zusätzlicher Platz unten für den Schieber (px), sonst 0 */
    extraBottom: number;
    /** Reihen für die Option: Vorschau-Reihe `_shadow` (Kurve im Schieber) vorn dazu */
    frame: (series: Series[], shadow: [number, number | null][]) => Series[];
    onEvents: Record<string, (params: unknown, chart: Chart) => void>;
    /** Doppeltipp in den Schieber: wieder alles zeigen */
    onChartReady: (chart: Chart) => void;
    /** in die Option: legend.selected (abgeschaltete Linien bleiben beim nächsten Live-Wert aus) */
    legendSelected: Record<string, boolean>;
}

export function useChartZoom(win: Win, enabled: boolean, ink: ChartInk, xAxisIndex: number[] = [0], legendLines = 1): ChartZoom {
    // zweizeilige Legende (Heizkreis mit „Pumpe aus"): Schieber eine Zeile höher
    const sliderBottom = SLIDER_BOTTOM + (legendLines - 1) * LEGEND_LINE;
    const [zoom, setZoom] = useState<Range | null>(null);
    const [legendSelected, setLegendSelected] = useState<Record<string, boolean>>({});
    // neues Fenster (anderer Tag, Zeitraum): wieder alles zeigen
    useEffect(() => setZoom(null), [win.start, win.end]);

    const live = useRef({ zoom, win, enabled, sliderBottom });
    live.current = { zoom, win, enabled, sliderBottom };
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const apply = (r: Range | null) => {
        const w = live.current.win;
        if (!r) return setZoom(null);
        const c = clamp(r, w);
        setZoom(isAll(c, w) ? null : c);
    };

    const dataZoom = useMemo(() => {
        const range = zoom ? { startValue: zoom[0], endValue: zoom[1] } : {};
        const list: Series[] = [
            {
                type: 'inside',
                xAxisIndex,
                filterMode: 'none',
                zoomOnMouseWheel: false,
                moveOnMouseMove: false,
                moveOnMouseWheel: false,
                ...(enabled ? { minValueSpan: MIN_SPAN } : {}),
                ...range,
            },
        ];
        if (enabled)
            list.push({
                type: 'slider',
                xAxisIndex,
                filterMode: 'none',
                bottom: sliderBottom,
                height: SLIDER_HEIGHT,
                minValueSpan: MIN_SPAN,
                brushSelect: false,
                borderColor: ink.axisLine,
                backgroundColor: 'transparent',
                fillerColor: ink.zoomFill,
                handleSize: '110%',
                handleStyle: { color: ink.zoomHandle, borderColor: ink.zoomHandle },
                emphasis: { handleStyle: { color: ink.zoomHandle, borderColor: ink.zoomHandle } },
                moveHandleSize: 0,
                dataBackground: { lineStyle: { color: ink.axisLine }, areaStyle: { color: ink.grid } },
                selectedDataBackground: { lineStyle: { color: ink.axis }, areaStyle: { color: ink.axisLine } },
                showDetail: false, // die Zeitachse darüber zeigt den Bereich
                ...range,
            });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, enabled, ink.axis, ink.axisLine, ink.grid, ink.zoomFill, ink.zoomHandle, xAxisIndex.join(), sliderBottom]);

    const frame = (series: Series[], shadow: [number, number | null][]): Series[] => {
        if (!enabled) return series;
        return [
            {
                name: '_shadow',
                type: 'line',
                data: [[win.start, null], ...shadow, [win.end, null]],
                lineStyle: { opacity: 0 },
                itemStyle: { opacity: 0 },
                showSymbol: false,
                silent: true,
                tooltip: { show: false },
            },
            ...series,
        ];
    };

    const onEvents = useMemo(
        () => ({
            legendselectchanged: (p: unknown) => setLegendSelected({ ...(p as { selected: Record<string, boolean> }).selected }),
            // Schieber oder zwei Finger: Ausschnitt übernehmen, kurz nach dem Ende der Bewegung
            datazoom: (_p: unknown, chart: Chart) => {
                if (!live.current.enabled) return;
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

    // Doppeltipp in den Schieber: wieder alles. Eigene Erkennung aus zwei Tipps, weil iOS beim Tippen kein
    // dblclick zuverlässig meldet. Der erste Tipp kann den Ausschnitt schon verschoben haben; dessen
    // verzögerte Übernahme (timer) wird verworfen.
    const lastTap = useRef(0);
    const onChartReady = (chart: Chart) => {
        chart.getZr().on('click', (e: { offsetY: number }) => {
            if (!live.current.enabled) return;
            const h = chart.getHeight();
            const inSlider = e.offsetY >= h - live.current.sliderBottom - SLIDER_HEIGHT - 4 && e.offsetY <= h - live.current.sliderBottom + 4;
            if (!inSlider) return;
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
                lastTap.current = 0;
                if (timer.current) clearTimeout(timer.current);
                chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
                setZoom(null);
            } else lastTap.current = now;
        });
    };

    return { dataZoom, extraBottom: enabled ? SLIDER_SPACE + (legendLines - 1) * LEGEND_LINE : 0, frame, onEvents, onChartReady, legendSelected };
}
