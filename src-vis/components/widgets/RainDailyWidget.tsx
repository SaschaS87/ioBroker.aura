import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, CloudRain, LayoutGrid } from 'lucide-react';
import { getHistoryDirect } from '../../hooks/useIoBroker';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { formatNum } from '../../utils/formatValue';
import type { RainStationDef } from './RainStationWidget';

type RangeKey = '7d' | '14d' | 'month' | 'day';

const RANGE_LABELS: Record<RangeKey, string> = { '7d': '7 Tage', '14d': '14 Tage', month: 'Monat', day: 'Tag' };

// One calendar day in the visible window. `total` carries the honest tri-state:
// number (incl. 0 = dry) / null = no data recorded for that day.
interface DayCell {
    start: number;
    end: number;
    date: Date;
    total: number | null;
    isToday: boolean;
    isFuture: boolean;
}

function startOfDay(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// Daily totals from RAW rain_today history (aggregate 'none'). The counter is
// monotonic within a day and resets at midnight, so the LAST value of a day is
// the day total — immune to the adapter's pre-value logging, which can stamp
// yesterday's value with a just-after-midnight timestamp (max() would be wrong).
// Days without any log entry: the counter cannot have changed — if the last
// known value is 0 the day was measured dry (0), otherwise we genuinely don't
// know (station gap) and report null. Server-side `total` aggregation is
// deliberately avoided: InfluxDB's fill(previous) invents phantom buckets.
function computeDayTotals(entries: { ts: number; val: number }[], days: DayCell[]): void {
    const firstStart = days[0].start;
    let carry: number | null = null;
    for (const p of entries) {
        if (p.ts < firstStart) carry = p.val;
        else break;
    }
    let i = 0;
    for (const day of days) {
        if (day.isFuture) {
            day.total = null;
            continue;
        }
        let last: number | null = null;
        while (i < entries.length && entries[i].ts < day.end) {
            if (entries[i].ts >= day.start) last = entries[i].val;
            i++;
        }
        if (last !== null) {
            day.total = last;
            carry = last;
        } else {
            day.total = carry === 0 ? 0 : null;
        }
    }
}

// Exact 0 renders as a bare "0" — a dry day is a statement, not a measurement
// artifact. Whole numbers drop the trailing ".0"; everything else keeps its
// configured precision (never round away real millimetres).
function fmtTotal(v: number, decimals: number): string {
    if (v === 0) return '0';
    if (Number.isInteger(v)) return formatNum(v, 0);
    return formatNum(v, decimals);
}

const chipCls = 'nodrag shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity';
const chipStyle = (active: boolean): CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--app-border)',
    color: active ? '#fff' : 'var(--text-secondary)',
});

export function RainDailyWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const stations = (o.stations as RainStationDef[] | undefined) ?? [];
    const instance = (o.historyInstance as string) ?? 'influxdb.0';
    const decimals = (o.decimals as number) ?? 1;

    const [stationIdx, setStationIdx] = useState(0);
    const [range, setRange] = useState<RangeKey>(((o.raindailyDefaultRange as RangeKey) ?? '7d'));
    // Month view style: calendar grid (patterns at a glance) or day bars (compare amounts).
    const [monthStyle, setMonthStyle] = useState<'grid' | 'bars'>(
        ((o.raindailyMonthStyle as 'grid' | 'bars') ?? 'grid'),
    );
    const [offset, setOffset] = useState(0);
    const [days, setDays] = useState<DayCell[] | null>(null);
    // Raw counter entries of the visible single day — only kept in day mode,
    // where the hourly bars are derived from the counter's jumps.
    const [dayPts, setDayPts] = useState<{ ts: number; val: number }[] | null>(null);
    const [loading, setLoading] = useState(false);
    const fetchGenRef = useRef(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const n = stations.length;
    const safeIdx = n > 0 ? Math.min(stationIdx, n - 1) : 0;
    const station = stations[safeIdx] ?? {};
    const dp = station.todayDp ?? '';
    const { value: liveVal } = useDatapoint(dp);

    // Visible window: 7/14 days ending today (offset pages in whole windows),
    // or a calendar month (offset pages in months).
    const windowDays = useMemo((): DayCell[] => {
        const today0 = startOfDay(new Date());
        const mk = (date: Date): DayCell => {
            const start = date.getTime();
            const end = addDays(date, 1).getTime();
            return {
                start,
                end,
                date,
                total: null,
                isToday: start === today0.getTime(),
                isFuture: start > today0.getTime(),
            };
        };
        if (range === 'day') {
            return [mk(addDays(today0, offset))];
        }
        if (range === 'month') {
            const first = new Date(today0.getFullYear(), today0.getMonth() + offset, 1);
            const out: DayCell[] = [];
            for (let d = new Date(first); d.getMonth() === first.getMonth(); d = addDays(d, 1)) {
                out.push(mk(new Date(d)));
            }
            return out;
        }
        const len = range === '7d' ? 7 : 14;
        const lastStart = addDays(today0, offset * len);
        const out: DayCell[] = [];
        for (let k = len - 1; k >= 0; k--) out.push(mk(addDays(lastStart, -k)));
        return out;
    }, [range, offset]);

    useEffect(() => {
        if (!dp) {
            setDays(null);
            return;
        }
        const gen = ++fetchGenRef.current;
        setLoading(true);
        const cells = windowDays.map((d) => ({ ...d }));
        // 45 days of look-back anchor the carry state ("last known counter value")
        // far enough that 0-vs-no-data does not flip between the 7/14/month views:
        // after rain the midnight reset logs a 0, so any realistic dry spell still
        // has an anchor inside the margin. Raw rain_today entries are sparse —
        // the extra window costs at most a few hundred points.
        const fetchStart = addDays(new Date(cells[0].start), -45).getTime();
        const fetchEnd = Math.min(cells[cells.length - 1].end, Date.now());
        getHistoryDirect(dp, {
            instance,
            start: fetchStart,
            end: fetchEnd,
            aggregate: 'none',
            count: 25000,
        })
            .then((entries) => {
                if (!mountedRef.current || gen !== fetchGenRef.current) return;
                const pts = entries
                    .filter((e): e is { ts: number; val: number } => typeof e.val === 'number')
                    .map((e) => ({ ts: e.ts, val: e.val }))
                    .filter((e) => e.ts < cells[cells.length - 1].end)
                    .sort((a, b) => a.ts - b.ts);
                computeDayTotals(pts, cells);
                setDayPts(cells.length === 1 ? pts.filter((p) => p.ts >= cells[0].start) : null);
                setDays(cells);
                setLoading(false);
            })
            .catch(() => {
                if (!mountedRef.current || gen !== fetchGenRef.current) return;
                setDays(cells);
                setLoading(false);
            });
    }, [dp, instance, windowDays]);

    // Today's bar keeps growing with the live counter — history alone lags one log entry behind.
    const viewDays = useMemo(() => {
        if (!days) return null;
        return days.map((d) =>
            d.isToday && typeof liveVal === 'number' ? { ...d, total: liveVal } : d,
        );
    }, [days, liveVal]);

    // Day mode: hourly cells from the counter's jumps. The counter starts at 0
    // after the midnight reset, so the running baseline starts at 0; each hour's
    // rain is "last counter value in the hour minus the baseline", and hours
    // without a log entry are genuinely dry (an unchanged counter means no rain —
    // the crawler writes every ~5 min while it rains). The live value acts as a
    // virtual last entry so the current hour's bar grows in real time.
    const hourCells = useMemo((): DayCell[] | null => {
        if (range !== 'day' || !viewDays || viewDays.length !== 1) return null;
        const day = viewDays[0];
        const now = Date.now();
        const hours = Math.round((day.end - day.start) / 3_600_000);
        const cells: DayCell[] = [];
        const pts = [...(dayPts ?? [])];
        if (day.isToday && typeof liveVal === 'number') pts.push({ ts: now, val: liveVal });
        pts.sort((a, b) => a.ts - b.ts);
        let baseline = 0;
        let i = 0;
        for (let h = 0; h < hours; h++) {
            const hs = day.start + h * 3_600_000;
            const he = hs + 3_600_000;
            let last: number | null = null;
            while (i < pts.length && pts[i].ts < he) {
                if (pts[i].ts >= hs) last = pts[i].val;
                i++;
            }
            let total: number | null;
            if (day.total === null || hs > now) {
                total = null;
            } else if (last === null) {
                total = 0;
            } else {
                total = Math.max(0, Math.round((last - baseline) * 1000) / 1000);
                baseline = last;
            }
            cells.push({
                start: hs,
                end: he,
                date: new Date(hs),
                total,
                isToday: day.isToday && now >= hs && now < he,
                isFuture: hs > now,
            });
        }
        return cells;
    }, [range, viewDays, dayPts, liveVal]);

    const stats = useMemo(() => {
        if (!viewDays) return null;
        if (range === 'day') {
            const t = viewDays[0]?.total;
            if (t === null || t === undefined) return { sum: null as number | null, rainUnits: 0 };
            const rainHours = (hourCells ?? []).filter((c) => (c.total ?? 0) > 0).length;
            return { sum: t as number | null, rainUnits: rainHours };
        }
        const known = viewDays.filter((d) => d.total !== null);
        const sum = known.reduce((a, d) => a + (d.total as number), 0);
        const rainDays = known.filter((d) => (d.total as number) > 0).length;
        return { sum: sum as number | null, rainUnits: rainDays };
    }, [viewDays, range, hourCells]);

    // Drill-down: a tap on a day (bar or month cell) jumps into that day's hourly view.
    const gotoDay = (cell: DayCell) => {
        const today0 = startOfDay(new Date()).getTime();
        setRange('day');
        setOffset(Math.round((cell.start - today0) / 86_400_000));
    };

    // ── Chart area measuring (SVG is laid out in real pixels, no viewBox scaling) ──
    const chartRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = chartRef.current;
        if (!el) return;
        const ro = new ResizeObserver((es) => {
            const r = es[0].contentRect;
            setSize({ w: Math.round(r.width), h: Math.round(r.height) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [range, monthStyle]);

    const fmtDay = (d: Date) =>
        d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const periodLabel =
        range === 'day'
            ? windowDays[0].date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
            : range === 'month'
              ? windowDays[0].date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
              : `${fmtDay(windowDays[0].date)} – ${fmtDay(windowDays[windowDays.length - 1].date)}`;

    if (n === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
                <CloudRain size={24} strokeWidth={1.5} />
                <span className="text-xs">Stationen im Editor konfigurieren (rain_today je Station)</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0" data-widget-interactive>
            {/* Header: icon + title left, period stats right */}
            <div className="flex items-center gap-1.5 shrink-0 mb-1 min-w-0">
                <CloudRain size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {config.title || 'Regenmenge pro Tag'}
                </span>
                {stats && (
                    <span className="ml-auto flex items-baseline gap-2 shrink-0 text-[12px] font-semibold">
                        {stats.sum === null ? (
                            <span style={{ color: 'var(--text-secondary)' }}>keine Daten</span>
                        ) : (
                            <>
                                <span style={{ color: 'var(--accent)' }}>Σ {fmtTotal(stats.sum, decimals)} mm</span>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {stats.rainUnits}{' '}
                                    {range === 'day'
                                        ? stats.rainUnits === 1
                                            ? 'Regenstunde'
                                            : 'Regenstunden'
                                        : stats.rainUnits === 1
                                          ? 'Regentag'
                                          : 'Regentage'}
                                </span>
                            </>
                        )}
                    </span>
                )}
            </div>

            {/* Range chips + period pager */}
            <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
                <div className="nodrag flex gap-1 min-w-0 overflow-x-auto aura-no-scrollbar">
                    {(Object.keys(RANGE_LABELS) as RangeKey[]).map((r) => (
                        <button
                            key={r}
                            className={chipCls}
                            style={chipStyle(range === r)}
                            onClick={() => {
                                setRange(r);
                                setOffset(0);
                            }}
                        >
                            {RANGE_LABELS[r]}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <span className="text-[10px] font-medium mr-1 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {periodLabel}
                    </span>
                    <button
                        className={chipCls}
                        style={chipStyle(false)}
                        title={range === 'month' ? 'Einen Monat zurück' : range === 'day' ? 'Einen Tag zurück' : 'Zeitraum zurück'}
                        onClick={() => setOffset((v) => v - 1)}
                    >
                        <ChevronLeft size={12} />
                    </button>
                    <button
                        className={chipCls}
                        style={chipStyle(offset === 0)}
                        title="Zum aktuellen Zeitraum"
                        onClick={() => setOffset(0)}
                    >
                        Heute
                    </button>
                    <button
                        className={`${chipCls} disabled:opacity-40`}
                        style={chipStyle(false)}
                        title={range === 'month' ? 'Einen Monat vor' : range === 'day' ? 'Einen Tag vor' : 'Zeitraum vor'}
                        disabled={offset >= 0}
                        onClick={() => setOffset((v) => (v < 0 ? v + 1 : v))}
                    >
                        <ChevronRight size={12} />
                    </button>
                </div>
            </div>

            {/* Station chips */}
            {n > 1 && (
                <div className="nodrag flex gap-3 shrink-0 mb-1 overflow-x-auto aura-no-scrollbar">
                    {stations.map((st, i) => (
                        <button
                            key={i}
                            className="nodrag shrink-0 flex items-center gap-1.5 text-[11px] hover:opacity-80 transition-opacity"
                            style={{ background: 'transparent', color: i === safeIdx ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            onClick={() => setStationIdx(i)}
                        >
                            <span
                                className="rounded-full"
                                style={{ width: 8, height: 8, background: i === safeIdx ? 'var(--accent)' : 'var(--app-border)' }}
                            />
                            {st.name || `Station ${i + 1}`}
                        </button>
                    ))}
                </div>
            )}

            {/* Body: bar chart or month grid. In month mode a grid/bars toggle floats
                in the top-right corner; pt-5 reserves a clear strip for it so it never
                overlaps the weekday header or the tallest bar. */}
            <div className={`flex-1 min-h-0 flex flex-col relative ${range === 'month' ? 'pt-5' : ''}`}>
            {range === 'month' && (
                <div
                    className="nodrag absolute top-0 right-0 z-10 flex gap-0.5 rounded-md p-0.5"
                    style={{ background: 'var(--app-bg)' }}
                >
                    <button
                        className="rounded px-1.5 py-0.5 leading-none"
                        style={chipStyle(monthStyle === 'grid')}
                        title="Kalender-Raster"
                        aria-label="Kalender-Raster"
                        onClick={() => setMonthStyle('grid')}
                    >
                        <LayoutGrid size={13} />
                    </button>
                    <button
                        className="rounded px-1.5 py-0.5 leading-none"
                        style={chipStyle(monthStyle === 'bars')}
                        title="Tagesbalken"
                        aria-label="Tagesbalken"
                        onClick={() => setMonthStyle('bars')}
                    >
                        <BarChart3 size={13} />
                    </button>
                </div>
            )}
            {range === 'month' && monthStyle === 'grid' ? (
                <MonthGrid days={viewDays} decimals={decimals} loading={loading} onSelectDay={gotoDay} />
            ) : (
                <div ref={chartRef} className="flex-1 min-h-0 relative">
                    {range === 'day' && viewDays && viewDays[0].total === null ? (
                        <div
                            className="absolute inset-2 flex items-center justify-center rounded-lg text-xs"
                            style={{
                                color: 'var(--text-secondary)',
                                border: '1px dashed var(--app-border)',
                            }}
                        >
                            keine Daten für diesen Tag
                        </div>
                    ) : (
                        (range === 'day' ? hourCells : viewDays) &&
                        size.w > 40 &&
                        size.h > 40 && (
                            <BarChart
                                days={(range === 'day' ? hourCells : viewDays) as DayCell[]}
                                w={size.w}
                                h={size.h}
                                decimals={decimals}
                                hourMode={range === 'day'}
                                onSelectDay={range === 'day' ? undefined : gotoDay}
                            />
                        )
                    )}
                    {!viewDays && (
                        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {loading ? '…' : 'Keine Daten'}
                        </div>
                    )}
                </div>
            )}
            </div>
        </div>
    );
}

function niceMax(v: number): number {
    if (v <= 1) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) {
        if (m * p >= v) return m * p;
    }
    return 10 * p;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function BarChart({
    days,
    w,
    h,
    decimals,
    hourMode,
    onSelectDay,
}: {
    days: DayCell[];
    w: number;
    h: number;
    decimals: number;
    hourMode?: boolean;
    onSelectDay?: (cell: DayCell) => void;
}) {
    const padL = 26;
    const padT = 14;
    const padB = 16;
    const innerW = w - padL - 4;
    const innerH = h - padT - padB;
    const rawMax = Math.max(0, ...days.map((d) => d.total ?? 0));
    const maxVal = niceMax(rawMax);
    const y = (v: number) => padT + innerH - (v / maxVal) * innerH;
    const slotW = innerW / days.length;
    const barW = Math.max(hourMode ? 4 : 6, Math.min(slotW * 0.62, 34));
    const showValues = slotW >= 22;
    // Narrow slots (14/30-day views on mobile) thin out the x labels instead of
    // letting them collide; every bar keeps its tooltip.
    const labelEvery = slotW >= 34 ? 1 : slotW >= 17 ? 2 : 5;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);
    const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : formatNum(v, 1));
    // "Heute" always gets a label; suppress a regular label right next to it so the
    // two don't collide (e.g. "So 19" and "Di 21" in a 30-slot month bar view).
    const todayIdx = days.findIndex((d) => d.isToday);

    return (
        <svg width={w} height={h} className="block nodrag">
            {ticks.map((tv) => (
                <g key={tv}>
                    <line x1={padL} x2={w - 2} y1={y(tv)} y2={y(tv)} stroke="var(--app-border)" strokeWidth={1} />
                    <text x={padL - 4} y={y(tv) + 3} textAnchor="end" fontSize={9} fill="var(--text-secondary)">
                        {fmtTick(tv)}
                    </text>
                </g>
            ))}
            {hourMode &&
                [0, 6, 12, 18, 24].map((hh) => (
                    <text
                        key={hh}
                        x={padL + (hh / days.length) * innerW}
                        y={h - 4}
                        textAnchor={hh === 0 ? 'start' : hh === 24 ? 'end' : 'middle'}
                        fontSize={9}
                        fill="var(--text-secondary)"
                    >
                        {String(hh).padStart(2, '0')}
                    </text>
                ))}
            {days.map((d, i) => {
                const cx = padL + i * slotW + slotW / 2;
                const bx = cx - barW / 2;
                // Thinned-out views (14/30-day) drop the weekday and keep just the day
                // number, so labels stay narrow enough not to collide with a neighbour.
                const label = slotW < 34 ? `${d.date.getDate()}.` : `${WD[d.date.getDay()]} ${d.date.getDate()}.`;
                const hh = d.date.getHours();
                const tip = hourMode
                    ? `${d.date.toLocaleDateString('de-DE')}, ${String(hh).padStart(2, '0')}–${String(hh + 1).padStart(2, '0')} Uhr: ${
                          d.total === null ? '' : `${fmtTotal(d.total, decimals)} mm${d.isToday ? ' (läuft)' : ''}`
                      }`
                    : `${d.date.toLocaleDateString('de-DE')}: ${
                          d.total === null ? 'keine Daten' : `${fmtTotal(d.total, decimals)} mm${d.isToday ? ' (läuft)' : ''}`
                      }`;
                const showXLabel =
                    !hourMode &&
                    (d.isToday ||
                        (i % labelEvery === 0 && (todayIdx < 0 || Math.abs(i - todayIdx) >= 2)));
                // Narrow bars (hour mode, 30-day view) are too tight for labels
                // everywhere — always mark at least the period's peak. Hour mode
                // never labels dry hours (24 zeros would be pure noise).
                const showValue =
                    d.total !== null &&
                    !d.isFuture &&
                    (hourMode
                        ? d.total > 0 && (showValues || d.total === rawMax)
                        : showValues || (d.total === rawMax && rawMax > 0));
                const clickable = !!onSelectDay && !d.isFuture;
                return (
                    <g
                        key={d.start}
                        onClick={clickable ? () => onSelectDay(d) : undefined}
                        style={clickable ? { cursor: 'pointer' } : undefined}
                    >
                        <title>{tip}</title>
                        {clickable && (
                            <rect x={padL + i * slotW} y={padT} width={slotW} height={innerH + padB} fill="transparent" />
                        )}
                        {d.isFuture ? null : d.total === null ? (
                            <>
                                <rect
                                    x={bx}
                                    y={padT}
                                    width={barW}
                                    height={innerH}
                                    rx={3}
                                    fill="none"
                                    stroke="var(--text-secondary)"
                                    strokeOpacity={0.35}
                                    strokeWidth={1}
                                    strokeDasharray="4 3"
                                />
                                <text x={cx} y={padT + innerH / 2 + 4} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                                    –
                                </text>
                            </>
                        ) : d.total === 0 ? (
                            <line
                                x1={bx}
                                x2={bx + barW}
                                y1={y(0) - 1}
                                y2={y(0) - 1}
                                stroke="var(--accent)"
                                strokeWidth={2.5}
                            />
                        ) : (
                            <rect
                                x={bx}
                                y={Math.min(y(d.total), y(0) - 2)}
                                width={barW}
                                height={Math.max(2, y(0) - y(d.total))}
                                rx={3}
                                fill="var(--accent)"
                                fillOpacity={d.isToday ? 0.45 : 1}
                                stroke={d.isToday ? 'var(--accent)' : 'none'}
                                strokeWidth={d.isToday ? 1.5 : 0}
                                strokeDasharray={d.isToday ? '4 3' : undefined}
                            />
                        )}
                        {showValue && d.total !== null && (
                            <text
                                x={cx}
                                y={(d.total === 0 ? y(0) : Math.min(y(d.total), y(0) - 2)) - 4}
                                textAnchor="middle"
                                fontSize={9.5}
                                fontWeight={d.isToday ? 600 : 400}
                                fill={d.isToday ? 'var(--accent)' : 'var(--text-secondary)'}
                            >
                                {fmtTotal(d.total, decimals)}
                            </text>
                        )}
                        {showXLabel && (
                            <text
                                x={cx}
                                y={h - 4}
                                textAnchor="middle"
                                fontSize={9}
                                fontWeight={d.isToday ? 600 : 400}
                                fill={d.isToday ? 'var(--accent)' : 'var(--text-secondary)'}
                            >
                                {label}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

function MonthGrid({
    days,
    decimals,
    loading,
    onSelectDay,
}: {
    days: DayCell[] | null;
    decimals: number;
    loading: boolean;
    onSelectDay?: (cell: DayCell) => void;
}) {
    if (!days) {
        return (
            <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                {loading ? '…' : 'Keine Daten'}
            </div>
        );
    }
    const known = days.filter((d) => d.total !== null && !d.isFuture);
    const maxVal = Math.max(0.1, ...known.map((d) => d.total as number));
    const leading = (days[0].date.getDay() + 6) % 7;
    const cells: (DayCell | null)[] = [...Array<null>(leading).fill(null), ...days];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="grid shrink-0 mb-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
                    <div key={d} className="text-center text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {d}
                    </div>
                ))}
            </div>
            <div
                className="flex-1 min-h-0 grid"
                style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', gap: 4 }}
            >
                {cells.map((d, i) => {
                    if (d === null || d.isFuture) return <div key={i} />;
                    const intensity = d.total !== null && d.total > 0 ? 0.2 + 0.8 * Math.min(1, (d.total as number) / maxVal) : 0;
                    const title = `${d.date.toLocaleDateString('de-DE')}: ${
                        d.total === null ? 'keine Daten' : `${fmtTotal(d.total, decimals)} mm${d.isToday ? ' (läuft)' : ''}`
                    }`;
                    return (
                        <div
                            key={i}
                            className="nodrag relative rounded-md flex items-center justify-center min-h-0 overflow-hidden"
                            style={{
                                background: d.total === null ? 'transparent' : 'var(--app-border)',
                                border: d.isToday
                                    ? '1.5px dashed var(--accent)'
                                    : d.total === null
                                      ? '1px dashed var(--app-border)'
                                      : 'none',
                                cursor: onSelectDay ? 'pointer' : undefined,
                            }}
                            title={title}
                            onClick={onSelectDay ? () => onSelectDay(d) : undefined}
                        >
                            {intensity > 0 && (
                                <div
                                    className="absolute inset-0"
                                    style={{ background: 'var(--accent)', opacity: intensity }}
                                />
                            )}
                            <span
                                className="relative text-[10px] leading-none"
                                style={{
                                    color:
                                        intensity > 0.55
                                            ? '#fff'
                                            : d.total === null
                                              ? 'var(--text-secondary)'
                                              : d.total === 0
                                                ? 'var(--text-secondary)'
                                                : 'var(--text-primary)',
                                    fontWeight: d.isToday ? 600 : 400,
                                }}
                            >
                                {d.total === null ? '–' : fmtTotal(d.total as number, decimals)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
