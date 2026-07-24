import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, Droplets, Loader, TrendingDown, TrendingUp } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../hooks/useMultiSeriesData';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { ChartPeriodNav } from './ChartPeriodNav';
import { periodWindow, type PeriodMode } from '../../utils/chartPeriod';

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
    initialMode?: PeriodMode;
    chartHeight?: number;
}

export function RoomClimateDetails({
    temperatureDp,
    humidityDp = '',
    historyInstance = 'history.0',
    title = 'Temperatur',
    decimals: decimalsProp,
    showCurrentHeader = true,
    initialMode = 'day',
    chartHeight = 192,
}: RoomClimateDetailsProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = decimalsProp ?? defaultDecimals;

    const { value: rawTemp } = useDatapoint(temperatureDp);
    const { value: rawHumidity } = useDatapoint(humidityDp);
    const temp = typeof rawTemp === 'number' ? rawTemp : null;
    const humidity = typeof rawHumidity === 'number' ? rawHumidity : null;

    const [mode, setMode] = useState<PeriodMode>(initialMode);
    const [offset, setOffset] = useState(0);
    const viewWindow = useMemo(() => periodWindow(mode, offset), [mode, offset]);

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
                historyStart: viewWindow.start,
                historyEnd: viewWindow.end,
            },
        ],
        [temperatureDp, title, historyInstance, viewWindow],
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
            animation: false,
            grid: { left: 44, right: 12, top: 8, bottom: 24 },
            xAxis: {
                type: 'time' as const,
                axisLabel: { color: '#888', fontSize: 10 },
                axisTick: { show: true },
                axisLine: { show: true, lineStyle: { color: '#444' } },
                splitLine: { show: false },
                min: viewWindow.start,
                max: viewWindow.end,
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
    }, [chartData, viewWindow, title, decimals]);

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

            <ChartPeriodNav mode={mode} offset={offset} onMode={(m) => { setMode(m); setOffset(0); }} onOffset={setOffset} />

            {/* Chart — loader/empty states like EChartWidget */}
            <div className="relative w-full" style={{ height: chartHeight }}>
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                        <Loader size={20} className="animate-spin" />
                    </div>
                )}
                {!isLoading && !hasData && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <BarChart2 size={28} strokeWidth={1.5} />
                        <span className="text-xs">Keine Daten</span>
                    </div>
                )}
                {hasData && (
                    <ReactECharts option={echartsOption} style={{ width: '100%', height: '100%' }} opts={{ renderer: 'canvas' }} />
                )}
            </div>
        </div>
    );
}
