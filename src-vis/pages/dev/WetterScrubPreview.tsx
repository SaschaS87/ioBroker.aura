import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import { Clock, Thermometer, Droplet, Umbrella } from 'lucide-react';
import {
    C,
    buildCoreSeries,
    buildSingleGridOption,
    CHART_HEIGHT,
    GRID_TOP0_SINGLE,
    GRID_H0_SINGLE,
    type Pt,
} from '../../components/widgets/WeatherForecastStripWidget';
import { formatNum } from '../../utils/formatValue';

/**
 * DEV-only preview, Runde 2 (08.09.2026): zehn Anzeige-Ideen für die "Heute"-
 * Karte, aufbauend auf Saschas Favoriten aus Runde 1 (Var. 5 "Titel wird
 * Anzeige" und Var. 6 "Legende wird Anzeige"). Diesmal mit einem Ein-Grid-
 * Chart statt zwei: die separate Regenwahrscheinlichkeits-Leiste unter dem
 * Chart ist weg, ihr Wert taucht nur noch in der jeweiligen Anzeige selbst
 * auf. Die Regenmenge (mm) bleibt als Balken im Hauptchart, wie bisher.
 * Sonnenaufgang/-untergang (Symbole + graue Nachtzonen) bleiben unverändert.
 * Variante 11 (Runde 3, 08.09.2026): Saschas Favorit aus Runde 2 (Var. 4,
 * Legende → Icons), aber einseitig wie Var. 1 — die Icons ersetzen "Heute"
 * statt die Legende, die Legende bleibt in Ruhe stehen und verschwindet nur
 * während des Ziehens.
 *
 * Renders the SAME chart-building logic the real widget uses (buildCoreSeries
 * + the new buildSingleGridOption from WeatherForecastStripWidget.tsx, same
 * colors, same night bands/sun-moon markers) against a fixed, fake "Heute" —
 * only the tooltip's own floating box is neutralised. Not wired into the real
 * Wetter-Tab and not reachable in production — see the `import.meta.env.DEV`
 * guard in main.tsx.
 */

// ---- fake "Heute" (24 stunden), 07.09.2026 — nur für diese Vorschau ----
const DAY = '2026-09-07';
const TEMP = [15, 14.6, 14.3, 14.1, 14, 13.9, 14, 14.4, 15.2, 17, 19.3, 21.8, 24.2, 26.3, 28, 29.4, 30.3, 30.8, 30.5, 29, 26.8, 23.9, 20.8, 18];
const RAIN = [0.6, 0.4, 0.2, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.4];
const PROB = [78, 68, 52, 38, 28, 18, 12, 8, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 10, 16, 22, 32, 42, 42];
const NOW_IDX = 9; // 09:00 — wie im Screenshot der Anfrage

const POINTS: Pt[] = TEMP.map((t, i) => ({
    t: new Date(`${DAY}T${String(i).padStart(2, '0')}:00:00`).getTime(),
    temp: t,
    rain: RAIN[i],
    prob: PROB[i],
}));
const NOW_TS = POINTS[NOW_IDX].t;
const CORE = buildCoreSeries(POINTS, `${DAY}T06:39:00`, `${DAY}T19:53:00`, true, 0, NOW_TS);

// Echte Chart-Aufbaulogik des Wetter-Tabs, nur ohne die zweite Grid/Serie —
// die eigene Tooltip-Box wird zusätzlich unsichtbar gemacht, damit jede
// Variante ihre eigene Anzeige zeichnen kann.
const BASE_OPTION = buildSingleGridOption(CORE, () => '');
const OPTION = {
    ...BASE_OPTION,
    tooltip: {
        ...(BASE_OPTION as { tooltip: Record<string, unknown> }).tooltip,
        formatter: () => '',
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        extraCssText: 'box-shadow:none; pointer-events:none;',
    },
};

const fmtTime = (i: number) => `${String(i).padStart(2, '0')}:00`;

// ── shared scrub plumbing ────────────────────────────────────────────────
function useScrubChart(initialIdx: number) {
    const chartRef = useRef<any>(null);
    const [idx, setIdx] = useState(initialIdx);
    const [scrubbing, setScrubbing] = useState(false);

    // On first mount chartRef.current is still null while ECharts initialises,
    // so the very first xPx()/tempPx() read (during that same render) falls
    // back to 0/edge values — the resting state (before anyone has touched
    // the chart) would show the readout pinned at the left edge. One extra
    // render after paint, once the instance definitely exists, fixes the
    // resting position without needing a real interaction first.
    const [, forceRerender] = useState(0);
    useEffect(() => {
        const id1 = requestAnimationFrame(() => {
            const id2 = requestAnimationFrame(() => forceRerender((n) => n + 1));
            return () => cancelAnimationFrame(id2);
        });
        return () => cancelAnimationFrame(id1);
    }, []);

    const onEvents = useMemo(
        () => ({
            updateAxisPointer: (params: { axesInfo?: { value: number }[] }) => {
                const info = params?.axesInfo?.[0];
                if (!info) return;
                const val = info.value;
                let bestI = 0;
                let bestD = Infinity;
                for (let i = 0; i < POINTS.length; i++) {
                    const d = Math.abs(POINTS[i].t - val);
                    if (d < bestD) {
                        bestD = d;
                        bestI = i;
                    }
                }
                setIdx(bestI);
            },
        }),
        [],
    );

    const xPx = (i: number): number => {
        const inst = chartRef.current?.getEchartsInstance?.();
        const p = inst?.convertToPixel?.({ xAxisIndex: 0, yAxisIndex: 0 }, [POINTS[i].t, POINTS[i].temp]);
        return Array.isArray(p) ? p[0] : 0;
    };
    const tempPx = (i: number): number => {
        const inst = chartRef.current?.getEchartsInstance?.();
        const p = inst?.convertToPixel?.({ xAxisIndex: 0, yAxisIndex: 0 }, [POINTS[i].t, POINTS[i].temp]);
        return Array.isArray(p) ? p[1] : GRID_TOP0_SINGLE + GRID_H0_SINGLE / 2;
    };
    const rainTopPx = (i: number): number => {
        const inst = chartRef.current?.getEchartsInstance?.();
        const p = inst?.convertToPixel?.({ xAxisIndex: 0, yAxisIndex: 1 }, [POINTS[i].t, POINTS[i].rain]);
        return Array.isArray(p) ? p[1] : GRID_TOP0_SINGLE + GRID_H0_SINGLE;
    };

    const pointerHandlers = {
        onPointerDown: () => setScrubbing(true),
        onPointerUp: () => setScrubbing(false),
        onPointerLeave: () => setScrubbing(false),
    };

    return { chartRef, idx, scrubbing, onEvents, pointerHandlers, xPx, tempPx, rainTopPx };
}

function Chart({ chartRef, onEvents }: { chartRef: React.MutableRefObject<any>; onEvents: Record<string, (...a: never[]) => void> }) {
    return <ReactECharts ref={chartRef} option={OPTION} notMerge lazyUpdate style={{ height: CHART_HEIGHT, width: '100%' }} onEvents={onEvents} />;
}

function Crosshair({ x }: { x: number }) {
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: GRID_TOP0_SINGLE - 4,
                bottom: 20,
                width: 0,
                borderLeft: '1px dashed var(--text-secondary)',
                opacity: 0.45,
                pointerEvents: 'none',
            }}
        />
    );
}

function Dot({ x, y, color = C.temp }: { x: number; y: number; color?: string }) {
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: color,
                boxShadow: '0 0 0 2px var(--app-surface, #1e1e1e)',
                transform: 'translate(-50%,-50%)',
                pointerEvents: 'none',
                transition: 'left 40ms linear, top 40ms linear',
            }}
        />
    );
}

// ── legend row shared by every "Legende wird Anzeige"-style variant ────────
function LegendSwatches() {
    return (
        <span className="inline-flex items-center gap-2" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
            <span className="inline-flex items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.temp, display: 'inline-block' }} />
                gemessen
            </span>
            <span className="inline-flex items-center gap-1">
                <span style={{ width: 10, height: 6, borderRadius: 2, background: C.band, display: 'inline-block' }} />
                Prognose
            </span>
        </span>
    );
}

// ── card shell ───────────────────────────────────────────────────────────
function Card({ num, tag, title, desc, children }: { num: number; tag: string; title: string; desc: ReactNode; children: ReactNode }) {
    return (
        <div
            className="rounded-xl"
            style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                borderRadius: 'var(--widget-radius, 14px)',
                padding: '14px 14px 16px',
                marginBottom: 18,
            }}
        >
            <div className="flex items-baseline gap-2" style={{ marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {String(num).padStart(2, '0')}
                </span>
                <h2 style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
                <span
                    style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        background: 'var(--app-bg)',
                        border: '1px solid var(--app-border)',
                        borderRadius: 20,
                        padding: '2px 9px',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {tag}
                </span>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 10px' }}>{desc}</p>
            {children}
        </div>
    );
}

// ── 1. Titel → Anzeige, kompakt einzeilig (Zeit · Temp · mm · %) ──────────
function Variant1() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div style={{ height: 20, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {s.scrubbing ? (
                    <>
                        <span style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmtTime(s.idx)}</span>
                        <span style={{ fontSize: 14.5, fontWeight: 650, color: C.temp }}>{formatNum(p.temp, 0)}°</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{formatNum(p.rain, 1)}mm</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{p.prob}%</span>
                    </>
                ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Crosshair x={x} />}
            </div>
        </div>
    );
}

// ── 2. Titel → Anzeige, zweizeilig (mehr Platz für vier Werte) ────────────
function Variant2() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div style={{ minHeight: 34, marginBottom: 6 }}>
                {s.scrubbing ? (
                    <>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmtTime(s.idx)}</div>
                        <div className="flex items-center" style={{ gap: 10, marginTop: 2 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.temp }}>{formatNum(p.temp, 1)}°C</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{formatNum(p.rain, 1)} mm</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{p.prob}%</span>
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)', lineHeight: '34px' }}>Heute</div>
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Crosshair x={x} />}
            </div>
        </div>
    );
}

// ── 3. Legende → Anzeige, einzeilig rechts oben ───────────────────────────
function Variant3() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                {s.scrubbing ? (
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtTime(s.idx)}</span>
                        <span style={{ color: C.temp, fontWeight: 600 }}>{formatNum(p.temp, 1)}°</span>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{formatNum(p.rain, 1)}mm</span>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{p.prob}%</span>
                    </span>
                ) : (
                    <LegendSwatches />
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 4. Legende → Anzeige mit Mini-Icons statt Text ────────────────────────
function Variant4() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                {s.scrubbing ? (
                    <span className="inline-flex items-center gap-2.5" style={{ fontSize: 11 }}>
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                            <Clock size={11} /> {fmtTime(s.idx)}
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.temp, fontWeight: 600 }}>
                            <Thermometer size={11} /> {formatNum(p.temp, 0)}°
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.rain, fontWeight: 600 }}>
                            <Droplet size={11} /> {formatNum(p.rain, 1)}
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.rain, fontWeight: 600 }}>
                            <Umbrella size={11} /> {p.prob}%
                        </span>
                    </span>
                ) : (
                    <LegendSwatches />
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 5. Kombination: Titel zeigt Zeit+Temp, Legende zeigt Regen ───────────
function Variant5() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                {s.scrubbing ? (
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmtTime(s.idx)}</span>
                        <span style={{ fontSize: 14.5, fontWeight: 650, color: C.temp }}>{formatNum(p.temp, 1)}°</span>
                    </span>
                ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                )}
                {s.scrubbing ? (
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{formatNum(p.rain, 1)}mm</span>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{p.prob}%</span>
                    </span>
                ) : (
                    <LegendSwatches />
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 6. Legende → Anzeige, Regenmenge+Wahrscheinlichkeit als eine Gruppe ──
function Variant6() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                {s.scrubbing ? (
                    <span className="inline-flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtTime(s.idx)}</span>
                        <span style={{ color: C.temp, fontWeight: 600 }}>{formatNum(p.temp, 1)}°</span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.rain, fontWeight: 600 }}>
                            <Droplet size={11} /> {formatNum(p.rain, 1)}mm · {p.prob}%
                        </span>
                    </span>
                ) : (
                    <LegendSwatches />
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 7. Titel → Anzeige mit groß hervorgehobener Temperatur ────────────────
function Variant7() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div style={{ height: 24, marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {s.scrubbing ? (
                    <>
                        <span style={{ fontSize: 20, fontWeight: 750, color: C.temp, lineHeight: 1 }}>{formatNum(p.temp, 0)}°</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fmtTime(s.idx)}</span>
                        <span style={{ fontSize: 11.5, color: C.rain }}>
                            {formatNum(p.rain, 1)}mm · {p.prob}%
                        </span>
                    </>
                ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Crosshair x={x} />}
            </div>
        </div>
    );
}

// ── 8. Titel → Anzeige, weicher Crossfade statt hartem Wechsel ───────────
function Variant8() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div style={{ height: 20, marginBottom: 6, position: 'relative' }}>
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        fontSize: 13.5,
                        fontWeight: 650,
                        color: 'var(--text-primary)',
                        opacity: s.scrubbing ? 0 : 1,
                        transition: 'opacity 160ms ease',
                    }}
                >
                    Heute
                </span>
                <span
                    className="flex items-baseline gap-2"
                    style={{ position: 'absolute', inset: 0, opacity: s.scrubbing ? 1 : 0, transition: 'opacity 160ms ease' }}
                >
                    <span style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmtTime(s.idx)}</span>
                    <span style={{ fontSize: 14.5, fontWeight: 650, color: C.temp }}>{formatNum(p.temp, 0)}°</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{formatNum(p.rain, 1)}mm</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: C.rain }}>{p.prob}%</span>
                </span>
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                <div style={{ opacity: s.scrubbing ? 1 : 0, transition: 'opacity 160ms ease' }}>
                    <Crosshair x={x} />
                </div>
            </div>
        </div>
    );
}

// ── 9. Legende → Anzeige als abgesetzte Pille (Chip statt Fließtext) ─────
function Variant9() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                {s.scrubbing ? (
                    <span
                        className="inline-flex items-center gap-2"
                        style={{
                            fontSize: 11,
                            fontFamily: 'monospace',
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            borderRadius: 20,
                            padding: '2px 9px',
                        }}
                    >
                        <span style={{ color: 'var(--text-secondary)' }}>{fmtTime(s.idx)}</span>
                        <span style={{ color: C.temp, fontWeight: 600 }}>{formatNum(p.temp, 1)}°</span>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{formatNum(p.rain, 1)}mm</span>
                        <span style={{ color: C.rain, fontWeight: 600 }}>{p.prob}%</span>
                    </span>
                ) : (
                    <LegendSwatches />
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 10. Dezenteste Variante: Titel bleibt, kleines Live-Badge daneben ────
function Variant10() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const y = s.tempPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="flex items-baseline gap-2">
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                    {s.scrubbing && (
                        <span
                            className="inline-flex items-center gap-1"
                            style={{
                                fontSize: 10.5,
                                fontFamily: 'monospace',
                                color: 'var(--text-secondary)',
                                background: 'var(--app-bg)',
                                border: '1px solid var(--app-border)',
                                borderRadius: 6,
                                padding: '1px 6px',
                            }}
                        >
                            {fmtTime(s.idx)} · <span style={{ color: C.temp, fontWeight: 600 }}>{formatNum(p.temp, 0)}°</span> ·{' '}
                            <span style={{ color: C.rain, fontWeight: 600 }}>
                                {formatNum(p.rain, 1)}mm/{p.prob}%
                            </span>
                        </span>
                    )}
                </span>
                <LegendSwatches />
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Dot x={x} y={y} />}
            </div>
        </div>
    );
}

// ── 11. Dein Favorit (4), aber einseitig: Icons ersetzen "Heute" statt die
// Legende. Die Legende rechts bleibt im Ruhezustand stehen (Standard) und
// verschwindet nur während des Ziehens, statt selbst zur Anzeige zu werden. ─
function Variant11() {
    const s = useScrubChart(NOW_IDX);
    const x = s.xPx(s.idx);
    const p = POINTS[s.idx];
    return (
        <div {...s.pointerHandlers}>
            <div className="flex items-center justify-between" style={{ height: 20, marginBottom: 6 }}>
                {s.scrubbing ? (
                    <span className="inline-flex items-center gap-2.5" style={{ fontSize: 12.5 }}>
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                            <Clock size={12} /> {fmtTime(s.idx)}
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.temp, fontWeight: 600 }}>
                            <Thermometer size={12} /> {formatNum(p.temp, 0)}°
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.rain, fontWeight: 600 }}>
                            <Droplet size={12} /> {formatNum(p.rain, 1)}
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: C.rain, fontWeight: 600 }}>
                            <Umbrella size={12} /> {p.prob}%
                        </span>
                    </span>
                ) : (
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>Heute</span>
                )}
                {!s.scrubbing && <LegendSwatches />}
            </div>
            <div style={{ position: 'relative' }}>
                <Chart chartRef={s.chartRef} onEvents={s.onEvents} />
                {s.scrubbing && <Crosshair x={x} />}
            </div>
        </div>
    );
}

const VARIANTS: { tag: string; title: string; desc: string; Comp: () => ReactNode }[] = [
    { tag: 'Titel, kompakt', title: 'Titel → Anzeige, einzeilig', desc: 'Wie dein Favorit „Heute wird zur Anzeige", jetzt mit Regenmenge UND Regenwahrscheinlichkeit statt nur einem Regenwert.', Comp: Variant1 },
    { tag: 'Titel, zweizeilig', title: 'Titel → Anzeige, mit mehr Platz', desc: 'Uhrzeit fett oben, die drei Wetterwerte als kleine Reihe darunter — luftiger bei vier Werten statt einer Zeile.', Comp: Variant2 },
    { tag: 'Legende, kompakt', title: 'Legende → Anzeige, einzeilig', desc: 'Dein zweiter Favorit, jetzt ebenfalls mit Regenmenge UND -wahrscheinlichkeit statt nur einem Wert.', Comp: Variant3 },
    { tag: 'Legende + Icons', title: 'Legende → Anzeige mit Mini-Icons', desc: 'Wie Variante 3, aber mit kleinen Symbolen (Uhr/Thermometer/Tropfen/Schirm) statt reinem Text.', Comp: Variant4 },
    { tag: 'Titel + Legende', title: 'Beide wechseln gleichzeitig', desc: 'Titel zeigt Uhrzeit und Temperatur, Legende rechts zeigt Regenmenge und -wahrscheinlichkeit — die Last auf zwei Ecken verteilt.', Comp: Variant5 },
    { tag: 'Legende, gruppiert', title: 'Regenmenge und -wahrscheinlichkeit als ein Wert', desc: '„3mm · 40%" hinter einem gemeinsamen Tropfen-Symbol statt zwei getrennter Zahlen.', Comp: Variant6 },
    { tag: 'Titel, große Zahl', title: 'Temperatur groß, Rest klein daneben', desc: 'Die Temperatur bekommt die optische Hauptrolle, Uhrzeit und Regen laufen klein mit.', Comp: Variant7 },
    { tag: 'Titel, sanft', title: 'Weicher Übergang statt hartem Wechsel', desc: 'Wie Variante 1, aber „Heute" und die Werte blenden sich sanft über- statt hart umzuschalten.', Comp: Variant8 },
    { tag: 'Legende, Chip', title: 'Anzeige als abgesetzte Pille', desc: 'Wie Variante 3, aber mit eigenem Hintergrund/Rahmen — wirkt mehr wie ein eigenständiges Element als Fließtext.', Comp: Variant9 },
    { tag: 'Am dezentesten', title: '„Heute" bleibt stehen, kleines Badge ergänzt', desc: 'Die Überschrift wird nicht ersetzt, sondern bekommt beim Ziehen ein kleines Zusatz-Badge daneben. Die Legende bleibt die ganze Zeit sichtbar.', Comp: Variant10 },
    { tag: 'Dein Favorit, einseitig', title: 'Icons ersetzen „Heute" statt die Legende', desc: 'Wie Variante 4 (Icons, etwas größere Schrift), aber „Heute" selbst wird zur Anzeige. Die Legende rechts bleibt im Ruhezustand stehen und verschwindet nur während des Ziehens.', Comp: Variant11 },
];

export function WetterScrubPreview() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--app-bg)', padding: '20px 14px 60px' }}>
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
                <p style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.temp, margin: '0 0 6px', fontWeight: 600 }}>
                    Dev-Vorschau · Runde 3 · nicht Teil der App
                </p>
                <h1 style={{ fontSize: 19, fontWeight: 750, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Elf Ideen — jetzt mit einem Chart-Grid
                </h1>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                    Baut auf deinen Favoriten aus Runde 1 auf (Titel- und Legende-Anzeige). Die separate
                    Regenwahrscheinlichkeits-Leiste unter dem Chart ist weg — Regenmenge (mm) bleibt als Balken im
                    Hauptchart, die Regenwahrscheinlichkeit (%) steckt jetzt nur noch in der Anzeige selbst. Sonne/Mond
                    und die grauen Nachtzonen sind unverändert. Auf jedem Chart ziehen, um es auszuprobieren.
                </p>
                {VARIANTS.map((v, i) => (
                    <Card key={i} num={i + 1} tag={v.tag} title={v.title} desc={v.desc}>
                        <v.Comp />
                    </Card>
                ))}
            </div>
        </div>
    );
}
