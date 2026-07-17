import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, ChevronLeft, ChevronRight, Droplets, Loader, TrendingDown, TrendingUp } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig, type EChartTimeRange } from '../../hooks/useMultiSeriesData';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { RANGE_LABELS } from '../../hooks/useChartHistory';

// Same default window set as the rain tab (no 1h).
const DEFAULT_RANGES: EChartTimeRange[] = ['6h', '24h', '7d', '30d'];

// Muted accents (soft coral / blue-gray) — deliberately calmer than the theme's
// signal colors. ECharts renders to canvas, so the chart colors must be literal
// hex anyway (CSS variables don't resolve there); axis colors below match
// EChartWidget exactly (#888 labels, #444 axis line, #333 grid lines).
const TEMP_COLOR = '#e8927c';
const TEMP_FILL_TOP = 'rgba(232,146,124,0.16)';
const TEMP_FILL_BOTTOM = 'rgba(232,146,124,0.03)';
const HUM_COLOR = '#8aa8c8';
const MIN_COLOR = '#7cbfa9';

export interface RoomClimateDetailsProps {
    temperatureDp: string;
    humidityDp?: string;
    historyInstance?: string;
    title?: string;
    decimals?: number;
    /** Big current temp + humidity header (popup: yes, inline expand: no). */
    showCurrentHeader?: boolean;
    initialRange?: EChartTimeRange;
    enableDayNav?: boolean;
    chartHeight?: number;
}

export function RoomClimateDetails({
    temperatureDp,
    humidityDp = '',
    historyInstance = 'history.0',
    title = 'Temperatur',
    decimals: decimalsProp,
    showCurrentHeader = true,
    initialRange = '24h',
    enableDayNav = true,
    chartHeight = 192,
}: RoomClimateDetailsProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = decimalsProp ?? defaultDecimals;

    const { value: rawTemp } = useDatapoint(temperatureDp);
    const { value: rawHumidity } = useDatapoint(humidityDp);
    const temp = typeof rawTemp === 'number' ? rawTemp : null;
    const humidity = typeof rawHumidity === 'number' ? rawHumidity : null;

    const [activeRange, setActiveRange] = useState<EChartTimeRange>(initialRange);
    const [dayOffset, setDayOffset] = useState<number | null>(null);

    const dayWindow = useMemo(() => {
        if (!enableDayNav || dayOffset === null) return null;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + dayOffset);
        const e = new Date(d);
        e.setDate(e.getDate() + 1);
        return { start: d.getTime(), end: e.getTime() };
    }, [enableDayNav, dayOffset]);

    const echartSeries: EChartSeriesConfig[] = useMemo(
        () => [
            {
                id: `temp-${temperatureDp}`,
                name: title,
                datapointId: temperatureDp,
                chartType: 'line',
                color: TEMP_COLOR,
                historyInstance,
                aggregate: 'average',
                yAxisIndex: 0,
                smooth: true,
                lineWidth: 2,
                ...(dayWindow
                    ? { historyStart: dayWindow.start, historyEnd: dayWindow.end }
                    : { historyRange: activeRange }),
            },
        ],
        [temperatureDp, title, historyInstance, activeRange, dayWindow],
    );

    const seriesDataMap = useMultiSeriesData(echartSeries, connected, subscribe, getState);
    const seriesData = seriesDataMap.get(echartSeries[0]?.id || '');
    const chartData = seriesData?.data ?? [];
    const isLoading = seriesData?.loading ?? false;
    const hasData = chartData.length > 0;

    const statsTemp = useMemo(() => {
        const values = chartData.map((p) => p[1]).filter((v) => typeof v === 'number');
        if (values.length === 0) return { min: null, max: null, avg: null };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return { min, max, avg };
    }, [chartData]);

    // Axis/grid styling copied 1:1 from EChartWidget (canvas needs literal hex).
    const echartsOption = useMemo(() => {
        return {
            backgroundColor: 'transparent',
            grid: { left: 44, right: 12, top: 8, bottom: 24 },
            // Same axis as EChartWidget: no custom label formatter — ECharts'
            // automatic time-axis labels show hours for short ranges and the day
            // number at midnight boundaries (a hand-rolled formatter printed the
            // date even on 6h/24h views).
            xAxis: {
                type: 'time' as const,
                axisLabel: {
                    color: '#888',
                    fontSize: 10,
                    // Same as EChartWidget: in day mode force hour labels (right
                    // edge = 24:00) instead of ECharts' day numbers at midnight
                    // edges; explicit null on leave (merge would keep it).
                    formatter: dayWindow
                        ? (val: number) =>
                              val === dayWindow.end
                                  ? '24:00'
                                  : new Date(val).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                        : null,
                },
                axisTick: { show: true },
                axisLine: { show: true, lineStyle: { color: '#444' } },
                splitLine: { show: false },
                min: dayWindow ? dayWindow.start : null,
                max: dayWindow ? dayWindow.end : null,
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: '#888', fontSize: 10, formatter: '{value} °C' },
                axisTick: { show: true },
                axisLine: { show: true, lineStyle: { color: '#444' } },
                splitLine: { show: true, lineStyle: { color: '#333' } },
            },
            series: [
                {
                    name: title,
                    type: 'line',
                    smooth: true,
                    smoothMonotone: 'x',
                    data: chartData,
                    itemStyle: { color: TEMP_COLOR },
                    lineStyle: { color: TEMP_COLOR, width: 2 },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: TEMP_FILL_TOP },
                                { offset: 1, color: TEMP_FILL_BOTTOM },
                            ],
                        },
                    },
                    showSymbol: false,
                },
            ],
            legend: { show: false },
            // Same tooltip as EChartWidget: axis trigger shows the nearest point
            // on tap anywhere; tooltip is HTML, so CSS variables work here.
            tooltip: {
                trigger: 'axis' as const,
                backgroundColor: 'var(--app-surface, #1e1e1e)',
                borderColor: 'var(--app-border, #333)',
                textStyle: { color: 'var(--text-primary, #ccc)', fontSize: 11 },
                formatter: (params: unknown) => {
                    const items = params as { axisValue: number; value: [number, number]; marker: string }[];
                    if (!items?.length) return '';
                    const date = new Date(items[0].axisValue);
                    const timeStr = date.toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const raw = items[0].value[1];
                    const dispVal = typeof raw === 'number' ? formatNum(raw, decimals) : raw;
                    return `${timeStr}<br/>${items[0].marker} <b>${dispVal} °C</b>`;
                },
            },
        };
    }, [chartData, dayWindow, title, decimals]);

    // Same button styling as EChartWidget's range chips / day nav.
    const navBtnStyle = (active: boolean): React.CSSProperties => ({
        background: active ? 'var(--accent)' : 'var(--app-border)',
        color: active ? '#fff' : 'var(--text-secondary)',
    });

    return (
        <div className="flex flex-col gap-2 w-full">
            {showCurrentHeader && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Temperatur
                        </div>
                        <div className="text-3xl font-bold" style={{ color: TEMP_COLOR }}>
                            {temp !== null ? `${formatNum(temp, decimals)}°C` : '–'}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Luftfeuchte
                        </div>
                        <div className="text-3xl font-bold" style={{ color: HUM_COLOR }}>
                            {humidity !== null ? `${formatNum(humidity, decimals)}%` : '–'}
                        </div>
                    </div>
                </div>
            )}

            {/* Humidity + min/max/avg (icons carry the accent, values stay neutral) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-primary)' }}>
                {!showCurrentHeader && humidityDp && (
                    <span className="flex items-center gap-1">
                        <Droplets size={12} style={{ color: HUM_COLOR }} />
                        {humidity !== null ? `${formatNum(humidity, decimals)}%` : '–'}
                    </span>
                )}
                {statsTemp.min !== null && (
                    <span className="flex items-center gap-1">
                        <TrendingDown size={12} style={{ color: MIN_COLOR }} />
                        {formatNum(statsTemp.min, decimals)}°C
                    </span>
                )}
                {statsTemp.max !== null && (
                    <span className="flex items-center gap-1">
                        <TrendingUp size={12} style={{ color: TEMP_COLOR }} />
                        {formatNum(statsTemp.max, decimals)}°C
                    </span>
                )}
                {statsTemp.avg !== null && (
                    <span style={{ color: 'var(--text-secondary)' }}>Ø {formatNum(statsTemp.avg, decimals)}°C</span>
                )}
            </div>

            {/* Range chips left, day nav right — one line, identical to EChartWidget:
                chips scroll horizontally on narrow widgets instead of wrapping. */}
            <div className="shrink-0 flex items-center justify-between gap-2 min-w-0">
                <div className="flex gap-1 min-w-0 overflow-x-auto aura-no-scrollbar">
                    {DEFAULT_RANGES.map((r) => {
                        const active = dayOffset === null && activeRange === r;
                        return (
                            <button
                                key={r}
                                className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                                style={navBtnStyle(active)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDayOffset(null);
                                    setActiveRange(r);
                                }}
                            >
                                {RANGE_LABELS[r]}
                            </button>
                        );
                    })}
                </div>
                {enableDayNav && (
                    <div className="flex items-center gap-1 shrink-0">
                        {/* Date label sits LEFT of the buttons (same as EChartWidget) */}
                        {dayWindow && (
                            <span
                                className="text-[10px] font-medium mr-1 whitespace-nowrap"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {new Date(dayWindow.start).toLocaleDateString('de-DE', {
                                    weekday: 'short',
                                    day: '2-digit',
                                    month: '2-digit',
                                })}
                            </span>
                        )}
                        <button
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                            style={navBtnStyle(false)}
                            title="Einen Tag zurück"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDayOffset((prev) => (prev ?? 0) - 1);
                            }}
                        >
                            <ChevronLeft size={12} />
                        </button>
                        <button
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity"
                            style={navBtnStyle(dayOffset === 0)}
                            title="Zum aktuellen Tag"
                            onClick={(e) => {
                                e.stopPropagation();
                                setDayOffset(0);
                            }}
                        >
                            Heute
                        </button>
                        <button
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
                            style={navBtnStyle(false)}
                            title="Einen Tag vor"
                            disabled={dayOffset === null || dayOffset >= 0}
                            onClick={(e) => {
                                e.stopPropagation();
                                setDayOffset((prev) => (prev !== null && prev < 0 ? prev + 1 : prev));
                            }}
                        >
                            <ChevronRight size={12} />
                        </button>
                    </div>
                )}
            </div>

            {/* Chart — loader/empty states like EChartWidget */}
            <div className="relative w-full" style={{ height: chartHeight }}>
                {isLoading && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!isLoading && !hasData && (
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">Keine Daten</span>
                    </div>
                )}
                {hasData && (
                    <ReactECharts
                        option={echartsOption}
                        style={{ width: '100%', height: '100%' }}
                        opts={{ renderer: 'canvas' }}
                    />
                )}
            </div>
        </div>
    );
}
