/**
 * Verlaufs-Fenster der Garten2-Entwuerfe (nur Dev-Vorschau, 23.09.2026).
 *
 *   WeatherHistorySheet  Verdunstung / Regen pro Tag — ECharts wie Wohnklima,
 *                        Tag / 7 Tage / Monat mit dem gemeinsamen Pager.
 *   WaterSheet           Wasserverbrauch pro Tag und Kreis, Summe + Euro —
 *                        angelehnt an „Regenmenge pro Tag".
 *
 * Beide Zaehler (ETpToday, regenHeute) laufen tagsueber hoch und springen um
 * Mitternacht auf 0. Der Tageswert ist deshalb der LETZTE Wert des Tages, nicht
 * das Maximum: kurz nach Mitternacht protokolliert der Adapter noch einmal den
 * Vortageswert (am 18.09. z. B. max 4,39 statt 3,10). Fuer die Verdunstung
 * gibt es mit ETpYesterday sogar die offizielle Tagessumme — siehe unten.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Loader } from 'lucide-react';
import { getHistoryDirect } from '../../../../hooks/useIoBroker';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { useCssVar } from '../../../../hooks/useCssVar';
import { ChartPeriodNav } from '../../ChartPeriodNav';
import { addDays, periodWindow, type PeriodMode } from '../../../../utils/chartPeriod';
import { PreviewSheet, Seg } from './parts';
import { fmtNum, sampleWaterRuns, WATER_PRICE_EUR_PER_M3, type G2Model, type WaterRun } from './previewModel';

const ETP_DP = 'sprinklecontrol.0.evaporation.ETpToday';
const ETP_YESTERDAY_DP = 'sprinklecontrol.0.evaporation.ETpYesterday';
const RAIN_DP = 'alias.0.Wetterdaten.regenHeute';
const HISTORY_INSTANCE = 'influxdb.0';
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export type WeatherTab = 'etp' | 'rain';

interface DayCell {
    start: number;
    end: number;
    total: number | null;
    isToday: boolean;
    isFuture: boolean;
}

function dayCells(mode: PeriodMode, offset: number): DayCell[] {
    const w = periodWindow(mode, offset);
    const now = Date.now();
    const out: DayCell[] = [];
    for (let d = new Date(w.start); d.getTime() < w.end; d = addDays(d, 1)) {
        const start = d.getTime();
        const end = addDays(d, 1).getTime();
        out.push({ start, end, total: null, isToday: now >= start && now < end, isFuture: start > now });
    }
    return out;
}

function dayLabel(ts: number, mode: PeriodMode): string {
    const d = new Date(ts);
    return mode === 'month' ? String(d.getDate()) : `${WD[d.getDay()]} ${d.getDate()}.`;
}

/** Accent at alpha (8-digit hex) — echarts malt auf Canvas und kennt keine CSS-Variablen. */
function withAlpha(color: string, alphaHex: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

// ── Daten: Tageswerte aus einem Tageszaehler ─────────────────────────────────

function cleanEntries(entries: { ts: number; val: unknown }[]): { ts: number; val: number }[] {
    return entries
        .filter((e): e is { ts: number; val: number } => typeof e.val === 'number')
        .map((e) => ({ ts: e.ts, val: e.val }))
        .sort((a, b) => a.ts - b.ts);
}

function useCounterHistory(dp: string, mode: PeriodMode, offset: number, live: number | null, liveYesterday: number | null) {
    const [pts, setPts] = useState<{ ts: number; val: number }[] | null>(null);
    const [yPts, setYPts] = useState<{ ts: number; val: number }[] | null>(null);
    const [loading, setLoading] = useState(false);
    const gen = useRef(0);
    const win = useMemo(() => periodWindow(mode, offset), [mode, offset]);
    const isRain = dp === RAIN_DP;

    useEffect(() => {
        const g = ++gen.current;
        setLoading(true);
        const end = Math.min(win.end, Date.now());
        let job: Promise<void>;
        if (isRain) {
            // Regen: sparsam protokolliert (nur Aenderungen) — roh holen, 45 Tage
            // Vorlauf, damit „letzter bekannter Wert = 0" trockene Tage belegt
            // (wie RainDailyWidget).
            job = getHistoryDirect(dp, {
                instance: HISTORY_INSTANCE,
                start: addDays(new Date(win.start), -45).getTime(),
                end,
                aggregate: 'none',
                count: 25000,
            }).then((e) => {
                if (g !== gen.current) return;
                setPts(cleanEntries(e));
                setYPts(null);
            });
        } else if (mode === 'day') {
            // Tageskurve der Verdunstung: 10-Minuten-Raster genuegt fuer die Linie.
            // „last" kennt der InfluxDB-Adapter nicht (liefert still den Mittelwert).
            job = getHistoryDirect(dp, { instance: HISTORY_INSTANCE, start: win.start, end, aggregate: 'max', step: 600_000, count: 500 }).then(
                (e) => {
                    if (g !== gen.current) return;
                    setPts(cleanEntries(e));
                    setYPts(null);
                },
            );
        } else {
            // Tagessummen der Verdunstung aus ETpYesterday: dort steht ab
            // Mitternacht die offizielle Summe des Vortags. Die Stundenbuendel
            // von ETpToday liefern dagegen Mittelwerte (17.09.: 4,36 statt 4,39).
            // „last" versteht der InfluxDB-Adapter nicht und mittelt still —
            // daher „max" je Stunde; ab 02:00 ist der Wert ohnehin konstant.
            job = getHistoryDirect(ETP_YESTERDAY_DP, {
                instance: HISTORY_INSTANCE,
                start: addDays(new Date(win.start), 1).getTime(),
                end: Math.min(addDays(new Date(win.end), 1).getTime(), Date.now()),
                aggregate: 'max',
                step: 3_600_000,
                count: 2000,
            }).then((e) => {
                if (g !== gen.current) return;
                setYPts(cleanEntries(e));
                setPts([]);
            });
        }
        job.then(() => {
            if (g === gen.current) setLoading(false);
        }).catch(() => {
            if (g !== gen.current) return;
            setPts([]);
            setYPts(null);
            setLoading(false);
        });
    }, [dp, isRain, mode, win]);

    const days = useMemo(() => {
        if (!pts) return null;
        const cells = dayCells(mode, offset);
        if (yPts) {
            for (const c of cells) {
                if (c.isFuture) continue;
                if (c.isToday) {
                    c.total = live;
                    continue;
                }
                // Summe von Tag D = ETpYesterday an Tag D+1, erst ab 02:00 (kurz
                // nach Mitternacht steht dort noch der Wert von D-1, und eine
                // Stunde Abstand haelt die Buendelgrenzen sauber).
                const from = c.end + 2 * 3_600_000;
                const to = c.end + 86_400_000;
                let v: number | null = null;
                for (const p of yPts) if (p.ts >= from && p.ts < to) v = p.val;
                if (v === null && Date.now() < to) v = liveYesterday;
                c.total = v;
            }
            return cells;
        }
        let carry: number | null = null;
        let i = 0;
        while (i < pts.length && pts[i].ts < cells[0].start) carry = pts[i++].val;
        for (const c of cells) {
            if (c.isFuture) continue;
            let last: number | null = null;
            while (i < pts.length && pts[i].ts < c.end) {
                if (pts[i].ts >= c.start) last = pts[i].val;
                i++;
            }
            if (c.isToday && live !== null) last = live;
            if (last !== null) {
                c.total = last;
                carry = last;
            } else {
                c.total = isRain && carry === 0 ? 0 : null;
            }
        }
        return cells;
    }, [pts, yPts, mode, offset, live, liveYesterday, isRain]);

    // Tagesansicht: der Zaehlerverlauf selbst (Linie).
    const line = useMemo(() => {
        if (!pts || mode !== 'day') return null;
        const inDay = pts.filter((p) => p.ts >= win.start && p.ts < win.end);
        const today = Date.now() >= win.start && Date.now() < win.end;
        if (today && live !== null) inDay.push({ ts: Date.now(), val: live });
        // Kurz nach Mitternacht steht noch der Vortageswert — der Zaehler steigt
        // sonst nur, also fuehrende Werte ueber ihrem Nachfolger verwerfen.
        while (inDay.length > 1 && inDay[0].val > inDay[1].val) inDay.shift();
        // Regen protokolliert nur Aenderungen: bei 0 beginnen, damit die Linie
        // den Tag ueberspannt statt bei der ersten Aenderung anzufangen.
        if (isRain) {
            inDay.unshift({ ts: win.start, val: 0 });
            // Trockener Tag ohne Eintrag: flache Null-Linie bis jetzt bzw. Tagesende.
            if (inDay.length === 1) inDay.push({ ts: Math.min(win.end, Date.now()), val: 0 });
        }
        return inDay.map((p) => [p.ts, p.val] as [number, number]);
    }, [pts, mode, win, live, isRain]);

    return { days, line, loading, win };
}

// ── Wetter-Verlauf ──────────────────────────────────────────────────────────

const TAB_OPTIONS = [
    { value: 'etp' as const, label: 'Verdunstung' },
    { value: 'rain' as const, label: 'Regen' },
];

export function WeatherHistorySheet({ initialTab, model, onClose }: { initialTab: WeatherTab; model: G2Model; onClose: () => void }) {
    const [tab, setTab] = useState<WeatherTab>(initialTab);
    const [mode, setMode] = useState<PeriodMode>('week');
    const [offset, setOffset] = useState(0);
    const accent = useCssVar('--accent', '#3b82f6');
    const rainLive = useDatapoint(RAIN_DP).value;
    const live = tab === 'etp' ? model.weather.etpToday : typeof rainLive === 'number' ? rainLive : null;
    const { days, line, loading, win } = useCounterHistory(
        tab === 'etp' ? ETP_DP : RAIN_DP,
        mode,
        offset,
        live,
        tab === 'etp' ? model.weather.etpYesterday : null,
    );
    const digits = tab === 'etp' ? 2 : 1;

    const stats = useMemo(() => {
        if (!days) return null;
        const known = days.filter((d) => d.total !== null);
        if (!known.length) return null;
        const sum = known.reduce((a, d) => a + (d.total as number), 0);
        const max = known.reduce((a, d) => ((d.total as number) > (a.total as number) ? d : a), known[0]);
        return { sum, avg: sum / known.length, max, count: known.length, wet: known.filter((d) => (d.total as number) > 0).length };
    }, [days]);

    const option = useMemo(() => {
        const axis = { axisLabel: { color: '#888', fontSize: 10 }, axisLine: { show: true, lineStyle: { color: '#444' } } };
        const tooltip = {
            trigger: 'axis' as const,
            backgroundColor: 'var(--app-surface, #1e1e1e)',
            borderColor: 'var(--app-border, #333)',
            textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
        };
        if (mode === 'day') {
            return {
                backgroundColor: 'transparent',
                animation: false,
                grid: { left: 40, right: 12, top: 10, bottom: 24 },
                xAxis: { type: 'time' as const, min: win.start, max: win.end, ...axis, splitLine: { show: false } },
                yAxis: {
                    type: 'value' as const,
                    min: 0,
                    ...axis,
                    axisLabel: { color: '#888', fontSize: 10, formatter: (v: number) => `${fmtNum(v, 1)} mm` },
                    splitLine: { show: true, lineStyle: { color: '#333' } },
                },
                tooltip: {
                    ...tooltip,
                    formatter: (p: unknown) => {
                        const it = (p as { value: [number, number] }[])[0];
                        if (!it) return '';
                        const t = new Date(it.value[0]).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return `${t} Uhr<br/><b>${fmtNum(it.value[1], digits)} mm</b>`;
                    },
                },
                series: [
                    {
                        type: 'line',
                        data: line ?? [],
                        showSymbol: false,
                        step: tab === 'rain' ? ('end' as const) : undefined,
                        smooth: tab === 'etp',
                        lineStyle: { color: accent, width: 2 },
                        itemStyle: { color: accent },
                        areaStyle: {
                            color: {
                                type: 'linear',
                                x: 0,
                                y: 0,
                                x2: 0,
                                y2: 1,
                                colorStops: [
                                    { offset: 0, color: withAlpha(accent, '33') },
                                    { offset: 1, color: withAlpha(accent, '08') },
                                ],
                            },
                        },
                    },
                ],
            };
        }
        const cells = days ?? [];
        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 40, right: 8, top: 18, bottom: 24 },
            xAxis: {
                type: 'category' as const,
                data: cells.map((c) => dayLabel(c.start, mode)),
                ...axis,
                axisTick: { show: false },
                axisLabel: { color: '#888', fontSize: 10, interval: mode === 'month' ? 4 : 0 },
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                ...axis,
                axisLabel: { color: '#888', fontSize: 10, formatter: (v: number) => `${fmtNum(v, 1)} mm` },
                splitLine: { show: true, lineStyle: { color: '#333' } },
            },
            tooltip: {
                ...tooltip,
                formatter: (p: unknown) => {
                    const it = (p as { dataIndex: number }[])[0];
                    const c = cells[it?.dataIndex ?? -1];
                    if (!c) return '';
                    const d = new Date(c.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                    return `${d}<br/><b>${c.total === null ? 'keine Daten' : `${fmtNum(c.total, digits)} mm`}</b>${c.isToday ? ' (läuft)' : ''}`;
                },
            },
            series: [
                {
                    type: 'bar',
                    barMaxWidth: 26,
                    data: cells.map((c) => ({
                        value: c.total,
                        itemStyle: { color: c.isToday ? withAlpha(accent, '73') : accent, borderRadius: [3, 3, 0, 0] },
                    })),
                    label: {
                        show: mode === 'week',
                        position: 'top' as const,
                        color: '#888',
                        fontSize: 10,
                        formatter: (p: { value: number | null }) => (p.value === null ? '' : fmtNum(p.value, 1)),
                    },
                },
            ],
        };
    }, [mode, days, line, win, accent, tab, digits]);

    // Tag ohne bekannten Tageswert (Stationsluecke) zeigt keine erfundene Null-Linie.
    const hasData = mode === 'day' ? (line?.length ?? 0) > 0 && !!stats : !!stats;

    return (
        <PreviewSheet title="Wetterverlauf" subtitle={tab === 'etp' ? 'Verdunstung pro Tag' : 'Regen pro Tag (Netatmo)'} onClose={onClose}>
            <div className="g2p-hist">
                <Seg value={tab} options={TAB_OPTIONS} onChange={setTab} />
                <div className="g2p-hist-stats">
                    {stats ? (
                        mode === 'day' ? (
                            <span className="g2p-hist-sum">{fmtNum(stats.sum, digits)} mm</span>
                        ) : (
                            <>
                                <span className="g2p-hist-sum">Σ {fmtNum(stats.sum, 1)} mm</span>
                                {tab === 'etp' ? (
                                    <span className="g2p-sub">Ø {fmtNum(stats.avg, 1)} mm pro Tag</span>
                                ) : (
                                    <span className="g2p-sub">
                                        {stats.wet} {stats.wet === 1 ? 'Regentag' : 'Regentage'}
                                    </span>
                                )}
                                <span className="g2p-sub">
                                    max {fmtNum(stats.max.total, 1)} mm ({new Date(stats.max.start).getDate()}.)
                                </span>
                            </>
                        )
                    ) : (
                        <span className="g2p-sub">{loading ? '…' : 'keine Daten'}</span>
                    )}
                </div>
                <ChartPeriodNav
                    mode={mode}
                    offset={offset}
                    onMode={(m) => {
                        setMode(m);
                        setOffset(0);
                    }}
                    onOffset={setOffset}
                />
                <div className="g2p-hist-chart">
                    {loading && !hasData && (
                        <div className="g2p-hist-empty">
                            <Loader size={20} className="animate-spin" />
                        </div>
                    )}
                    {!loading && !hasData && (
                        <div className="g2p-hist-empty">
                            <BarChart2 size={26} strokeWidth={1.5} />
                            <span className="g2p-hint">Keine Daten</span>
                        </div>
                    )}
                    {hasData && (
                        <ReactECharts
                            key={`${tab}-${mode}-${offset}`}
                            option={option}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    )}
                </div>
                {tab === 'etp' && (
                    <div className="g2p-hint">
                        Verdunstung = Wasser, das Rasen und Boden an diesem Tag verloren haben (berechnet vom Adapter).
                    </div>
                )}
            </div>
        </PreviewSheet>
    );
}

// ── Wasserverbrauch ─────────────────────────────────────────────────────────

const SHADES = ['FF', 'A6', '5C', '33'];

function fmtEuro(liters: number): string {
    return ((liters / 1000) * WATER_PRICE_EUR_PER_M3).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function WaterSheet({
    model,
    initialCircles,
    samples,
    onClose,
}: {
    model: G2Model;
    initialCircles?: string[];
    samples: boolean;
    onClose: () => void;
}) {
    const names = model.circles.map((c) => c.name);
    const [sel, setSel] = useState<Set<string>>(() => new Set(initialCircles?.length ? initialCircles : names));
    const [mode, setMode] = useState<PeriodMode>('week');
    const [offset, setOffset] = useState(0);
    const accent = useCssVar('--accent', '#3b82f6');
    const win = useMemo(() => periodWindow(mode, offset), [mode, offset]);

    const runs = useMemo<WaterRun[]>(
        () => (samples ? sampleWaterRuns(model.circles, win.start, Math.min(win.end, Date.now())) : []),
        [samples, model.circles, win],
    );
    const shown = runs.filter((r) => sel.has(r.circle));
    const sum = shown.reduce((a, r) => a + r.liters, 0);
    const minutes = shown.reduce((a, r) => a + r.minutes, 0);
    const allOn = names.every((n) => sel.has(n));

    const toggle = (name: string) => {
        setSel((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                if (next.size > 1) next.delete(name);
            } else next.add(name);
            return next;
        });
    };

    const cells = useMemo(() => dayCells(mode, offset), [mode, offset]);
    const option = useMemo(() => {
        const perCircle = model.circles
            .map((c, idx) => ({ c, idx }))
            .filter(({ c }) => sel.has(c.name))
            .map(({ c, idx }) => ({
                name: c.label,
                type: 'bar' as const,
                stack: 'w',
                barMaxWidth: 26,
                itemStyle: { color: withAlpha(accent, SHADES[idx % SHADES.length]) },
                data: cells.map((d) =>
                    d.isFuture ? null : runs.filter((r) => r.circle === c.name && r.ts >= d.start && r.ts < d.end).reduce((a, r) => a + r.liters, 0),
                ),
            }));
        return {
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 44, right: 8, top: 14, bottom: 24 },
            xAxis: {
                type: 'category' as const,
                data: cells.map((c) => dayLabel(c.start, mode)),
                axisLabel: { color: '#888', fontSize: 10, interval: mode === 'month' ? 4 : 0 },
                axisLine: { show: true, lineStyle: { color: '#444' } },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value' as const,
                min: 0,
                axisLabel: { color: '#888', fontSize: 10, formatter: (v: number) => `${fmtNum(v, 0)} l` },
                axisLine: { show: true, lineStyle: { color: '#444' } },
                splitLine: { show: true, lineStyle: { color: '#333' } },
            },
            tooltip: {
                trigger: 'axis' as const,
                backgroundColor: 'var(--app-surface, #1e1e1e)',
                borderColor: 'var(--app-border, #333)',
                textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
                formatter: (p: unknown) => {
                    const items = p as { dataIndex: number; seriesName: string; value: number | null; marker: string }[];
                    if (!items?.length) return '';
                    const c = cells[items[0].dataIndex];
                    const d = new Date(c.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                    const tot = items.reduce((a, i) => a + (i.value ?? 0), 0);
                    const lines = items.filter((i) => (i.value ?? 0) > 0).map((i) => `${i.marker} ${i.seriesName}: ${fmtNum(i.value, 0)} l`);
                    return `${d}<br/>${lines.join('<br/>')}${lines.length > 1 ? `<br/><b>Σ ${fmtNum(tot, 0)} l</b>` : lines.length ? '' : 'nicht gegossen'}`;
                },
            },
            series: perCircle,
        };
    }, [model.circles, sel, cells, runs, accent, mode]);

    const dayRuns = mode === 'day' ? shown.slice().sort((a, b) => a.ts - b.ts) : [];
    const labelOf = (name: string) => model.circles.find((c) => c.name === name)?.label ?? name;

    return (
        <PreviewSheet title="Wasserverbrauch" subtitle="Bewässerung pro Tag" onClose={onClose}>
            <div className="g2p-hist">
                <div className="g2p-hist-stats">
                    {runs.length || !samples ? (
                        <>
                            <span className="g2p-hist-sum">Σ {fmtNum(sum, 0)} l</span>
                            <span className="g2p-sub">≈ {fmtEuro(sum)}</span>
                            <span className="g2p-sub">
                                {shown.length} {shown.length === 1 ? 'Lauf' : 'Läufe'} · {minutes} min
                            </span>
                        </>
                    ) : (
                        <span className="g2p-sub">keine Läufe</span>
                    )}
                </div>
                <ChartPeriodNav
                    mode={mode}
                    offset={offset}
                    onMode={(m) => {
                        setMode(m);
                        setOffset(0);
                    }}
                    onOffset={setOffset}
                />
                <div className="g2p-water-chips">
                    <button type="button" className={`g2p-wchip${allOn ? ' is-on' : ''}`} onClick={() => setSel(new Set(names))}>
                        Alle
                    </button>
                    {model.circles.map((c, idx) => (
                        <button
                            key={c.name}
                            type="button"
                            className={`g2p-wchip${sel.has(c.name) ? ' is-on' : ''}`}
                            onClick={() => toggle(c.name)}
                        >
                            <span
                                className="g2p-wchip-dot"
                                style={{ background: sel.has(c.name) ? withAlpha(accent, SHADES[idx % SHADES.length]) : 'var(--app-border)' }}
                            />
                            {c.label}
                        </button>
                    ))}
                </div>
                {!samples ? (
                    <div className="g2p-hist-chart">
                        <div className="g2p-hist-empty" style={{ padding: '0 24px', textAlign: 'center' }}>
                            <BarChart2 size={26} strokeWidth={1.5} />
                            <span className="g2p-hint">
                                Noch keine Aufzeichnung: Der Adapter merkt sich nur den letzten Lauf je Kreis. Für diese Ansicht muss der Verbrauch erst mitgeschrieben werden.
                            </span>
                        </div>
                    </div>
                ) : mode === 'day' ? (
                    <div className="g2p-water-day">
                        {dayRuns.length === 0 ? (
                            <div className="g2p-hint" style={{ padding: '18px 0', textAlign: 'center' }}>
                                An diesem Tag wurde nicht gegossen.
                            </div>
                        ) : (
                            dayRuns.map((r) => (
                                <div key={`${r.circle}-${r.ts}`} className="g2p-row" style={{ padding: 0, minHeight: 42 }}>
                                    <span className="g2p-sub" style={{ width: 44, fontVariantNumeric: 'tabular-nums' }}>
                                        {new Date(r.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="g2p-row-main">
                                        <span className="g2p-title">{labelOf(r.circle)}</span>
                                        <span className="g2p-hint">{r.minutes} min</span>
                                    </span>
                                    <span className="g2p-row-value" style={{ fontSize: 15 }}>
                                        {fmtNum(r.liters, 0)} l
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="g2p-hist-chart">
                        <ReactECharts
                            key={`${mode}-${offset}-${[...sel].join()}`}
                            option={option}
                            style={{ width: '100%', height: '100%' }}
                            opts={{ renderer: 'canvas' }}
                        />
                    </div>
                )}
                <div className="g2p-hint">
                    {samples ? 'Beispieldaten · ' : ''}Preis {WATER_PRICE_EUR_PER_M3.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/m³
                    (Platzhalter)
                </div>
            </div>
        </PreviewSheet>
    );
}
