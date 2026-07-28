import { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
    Sun,
    CloudSun,
    Cloud,
    CloudFog,
    CloudDrizzle,
    CloudRain,
    CloudSnow,
    CloudLightning,
    Droplet,
    Sunrise,
    Sunset,
    Clock,
    Hourglass,
    Umbrella,
    ThermometerSun,
    ThermometerSnowflake,
    Zap,
    Droplets,
    type LucideIcon,
} from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { formatNum } from '../../utils/formatValue';
import type { WidgetProps } from '../../types';

/**
 * Second take on the forecast tiles (DWD-app layout, "Variante A" from the
 * mockup round): one slim horizontally-swipeable day strip + a single shared
 * detail panel below, instead of 7 stacked accordion cards. Deliberately a
 * SEPARATE widget type from WeatherForecastWidget.tsx (not a rewrite of it) so
 * both can sit on the Wetter tab side by side until a choice is made — reads
 * the same `javascript.0.Wetter.*` states, but the small helpers below are
 * duplicated rather than imported from that file, to keep this widget fully
 * independent of it.
 */

const DEFAULT_BASE = 'javascript.0.Wetter';

const C = {
    temp: '#e0922f',
    rain: '#2f7fd6',
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
    night: 'rgba(136,136,136,0.14)',
    // Neutral grey confidence-ribbon fill (DWD-style band hugging the future
    // portion of the line) — deliberately NOT tinted with the temperature
    // color, so it reads as "uncertainty", not as an unexplained colored block.
    band: 'rgba(148,158,171,0.3)',
};

// Left/right inset of the chart's plot area (must match `grid.left`/`grid.right`
// below) — the rain-probability row reuses this exact value so its labels land
// under the matching hour on the chart's time axis instead of just being
// spread evenly across the widget's full width.
const CHART_PAD_X = 34;

const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function weatherIcon(code: number | null): LucideIcon {
    if (code === null) return Cloud;
    if (code === 0) return Sun;
    if (code === 1 || code === 2) return CloudSun;
    if (code === 3) return Cloud;
    if (code === 45 || code === 48) return CloudFog;
    if (code >= 51 && code <= 57) return CloudDrizzle;
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
    if (code >= 95) return CloudLightning;
    return Cloud;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function dayLabel(i: number): string {
    if (i === 0) return 'Heute';
    if (i === 1) return 'Morgen';
    const d = new Date();
    d.setDate(d.getDate() + i);
    return WEEKDAYS[d.getDay()];
}
function dayDateStr(i: number): string {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}
function localDateStr(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function timeOnly(iso: string | null): string {
    if (!iso) return '–';
    const idx = iso.indexOf('T');
    return idx >= 0 ? iso.slice(idx + 1, idx + 6) : iso;
}

interface HourlyBlob {
    time: string[];
    temperature_2m?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    [key: string]: unknown;
}
function parseJson<T>(raw: unknown): T | null {
    if (typeof raw !== 'string' || !raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function GroupLabel({ text }: { text: string }) {
    return (
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.7, marginTop: 11 }}>
            {text}
        </div>
    );
}
function DetailRow({ Icon, label, value, dim }: { Icon: LucideIcon; label: string; value: string; dim?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <Icon size={13} style={{ flexShrink: 0, opacity: dim ? 0.5 : 1 }} />
            {label}
            <b style={{ color: 'var(--text-primary)', fontWeight: 500, marginLeft: 'auto' }}>{value}</b>
        </span>
    );
}

// ── One slim cell in the day strip — only the fields needed to render it ───
function StripCell({ index, base, active, onSelect }: { index: number; base: string; active: boolean; onSelect: () => void }) {
    const prefix = `${base}.Taeglich.Tag${index}`;
    const { value: maxV } = useDatapoint(`${prefix}.temperaturMax`);
    const { value: minV } = useDatapoint(`${prefix}.temperaturMin`);
    const { value: codeV } = useDatapoint(`${prefix}.wettercode`);
    const { value: rainSumV } = useDatapoint(`${prefix}.niederschlagSumme`);
    const { value: rainProbV } = useDatapoint(`${prefix}.niederschlagWahrscheinlichkeitMax`);

    const max = asNum(maxV);
    const min = asNum(minV);
    const code = asNum(codeV);
    const rainSum = asNum(rainSumV);
    const rainProb = asNum(rainProbV);
    const Icon = weatherIcon(code);

    return (
        <button
            onClick={onSelect}
            className="flex flex-col items-center"
            style={{
                flex: '0 0 auto',
                width: 64,
                padding: '9px 4px 8px',
                gap: 4,
                background: active ? 'color-mix(in srgb, var(--text-primary) 6%, transparent)' : 'transparent',
                border: 'none',
                borderRight: '1px solid var(--widget-border)',
                cursor: 'pointer',
                scrollSnapAlign: 'start',
            }}
        >
            <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{dayLabel(index)}</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-secondary)', opacity: 0.75 }}>{dayDateStr(index)}</span>
            <Icon size={19} style={{ color: 'var(--text-secondary)', margin: '2px 0' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {max !== null ? `${formatNum(max, 0)}°` : '–'}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}> {min !== null ? `${formatNum(min, 0)}°` : '–'}</span>
            </span>
            {/* Stacked (not inline) so probability + amount both fit the narrow
                64px cell without crowding — a single "40% · 3.2mm" line either
                overflows or forces a tiny font at this width. */}
            <span className="flex flex-col items-center" style={{ fontSize: 9, lineHeight: 1.3, color: C.rain, minHeight: 22 }}>
                {rainProb !== null && rainProb > 0 && <span>{formatNum(rainProb, 0)}%</span>}
                {rainSum !== null && rainSum > 0 && <span>{formatNum(rainSum, 1)}mm</span>}
            </span>
        </button>
    );
}

// ── Chart-building shared by all 3 axis-alignment variants below ───────────
// TEMPORARY: Sascha asked to compare 3 real, working variants side by side
// (not just static mockups) before picking one — once he decides, this
// splits back down to a single option-builder + render block.
type Pt = { t: number; temp: number; rain: number; prob: number };

function buildCoreSeries(points: Pt[], sunrise: string | null, sunset: string | null, isToday: boolean) {
    const nowTs = Date.now();
    const sunriseTs = sunrise ? new Date(sunrise).getTime() : null;
    const sunsetTs = sunset ? new Date(sunset).getTime() : null;
    const chartStart = points[0].t;
    const chartEnd = points[points.length - 1].t;

    const markLineData: Record<string, unknown>[] = [];
    if (sunriseTs) markLineData.push({ xAxis: sunriseTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });
    if (sunsetTs) markLineData.push({ xAxis: sunsetTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });

    // Grey "night" bands (before sunrise / after sunset), clipped to end at
    // "now" for today so they never reach into the forecast portion.
    const nightEnd = isToday ? Math.min(nowTs, chartEnd) : chartEnd;
    const markAreaData: Record<string, unknown>[][] = [];
    if (sunriseTs && sunriseTs > chartStart) {
        const end = Math.min(sunriseTs, nightEnd);
        if (end > chartStart) markAreaData.push([{ xAxis: chartStart }, { xAxis: end }]);
    }
    if (sunsetTs && sunsetTs < nightEnd) {
        markAreaData.push([{ xAxis: sunsetTs }, { xAxis: nightEnd }]);
    }

    // Confidence ribbon for the forecast portion of today's line — an
    // ECharts stacked-area pair (invisible lower bound + visible delta on top
    // of it), so the band's top/bottom follow the temperature curve itself
    // instead of a flat rectangle. Widens the further out it goes.
    let bandSeries: Record<string, unknown>[] = [];
    if (isToday && nowTs > chartStart && nowTs < chartEnd) {
        const futurePoints = points.filter((p) => p.t >= nowTs);
        const span = Math.max(1, chartEnd - nowTs);
        const band = futurePoints.map((p) => {
            const growth = (p.t - nowTs) / span;
            const margin = 1 + growth * 1.8;
            return { t: p.t, lower: p.temp - margin, delta: margin * 2 };
        });
        bandSeries = [
            {
                id: 'temp-band-lower',
                type: 'line' as const,
                stack: 'confidence-band',
                yAxisIndex: 0,
                data: band.map((b) => [b.t, b.lower]),
                showSymbol: false,
                symbol: 'none',
                lineStyle: { opacity: 0 },
                silent: true,
                tooltip: { show: false },
            },
            {
                id: 'temp-band-upper',
                type: 'line' as const,
                stack: 'confidence-band',
                yAxisIndex: 0,
                data: band.map((b) => [b.t, b.delta]),
                showSymbol: false,
                symbol: 'none',
                lineStyle: { opacity: 0 },
                areaStyle: { color: C.band },
                silent: true,
                tooltip: { show: false },
            },
        ];
    }

    const tempSeries: Record<string, unknown>[] = isToday
        ? [
              {
                  id: 'temp-past',
                  type: 'line' as const,
                  name: 'Temperatur',
                  yAxisIndex: 0,
                  data: points.filter((p) => p.t <= nowTs).map((p) => [p.t, p.temp]),
                  showSymbol: true,
                  symbolSize: 3,
                  itemStyle: { color: C.temp, borderWidth: 0 },
                  // Explicit emphasis (hover/tap) style identical to the normal one —
                  // ECharts' default emphasis state enlarges the symbol with a light
                  // fill, which read as an unwanted "filled circle" on hover.
                  emphasis: { scale: false, itemStyle: { color: C.temp, borderWidth: 0 } },
                  smooth: true,
                  color: C.temp,
                  lineStyle: { color: C.temp, width: 2 },
              },
              {
                  id: 'temp-future',
                  type: 'line' as const,
                  name: 'Temperatur (Prognose)',
                  yAxisIndex: 0,
                  data: points.filter((p) => p.t >= nowTs).map((p) => [p.t, p.temp]),
                  showSymbol: false,
                  smooth: true,
                  color: C.temp,
                  lineStyle: { color: C.temp, width: 2, type: 'dashed' as const },
                  markLine: markLineData.length ? { symbol: 'none', silent: true, data: markLineData } : undefined,
                  markArea: markAreaData.length ? { silent: true, itemStyle: { color: C.night }, data: markAreaData } : undefined,
              },
          ]
        : [
              {
                  id: 'temp',
                  type: 'line' as const,
                  name: 'Temperatur',
                  yAxisIndex: 0,
                  data: points.map((p) => [p.t, p.temp]),
                  showSymbol: false,
                  smooth: true,
                  color: C.temp,
                  lineStyle: { color: C.temp, width: 2 },
                  markLine: markLineData.length ? { symbol: 'none', silent: true, data: markLineData } : undefined,
                  markArea: markAreaData.length ? { silent: true, itemStyle: { color: C.night }, data: markAreaData } : undefined,
              },
          ];

    const rainSeries = {
        id: 'rain',
        type: 'bar' as const,
        name: 'Regen',
        yAxisIndex: 1,
        data: points.map((p) => [p.t, p.rain]),
        itemStyle: { color: C.rain },
        barMaxWidth: 10,
    };

    return { rainSeries, tempSeries, bandSeries, chartStart, chartEnd };
}

// Shared axis-trigger tooltip. If the hovered point's series list doesn't
// already include a probability series (variant B has its own), look the
// value up from the raw hourly blob so A/C get "tap for the exact number"
// without a dedicated series.
function buildTooltipFormatter(hourly: HourlyBlob | null) {
    return (raw: unknown) => {
        const list = (Array.isArray(raw) ? raw : [raw]) as {
            marker: string;
            seriesName: string;
            axisValue: number;
            value: [number, number];
        }[];
        if (!list.length) return '';
        const time = new Date(list[0].axisValue).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const rows = list.map((p) => {
            const unit = p.seriesName === 'Regen' ? 'mm' : p.seriesName === 'Regenwahrscheinlichkeit' ? '%' : '°C';
            const decimals = p.seriesName === 'Regenwahrscheinlichkeit' ? 0 : 1;
            return `${p.marker}${p.seriesName}: ${formatNum(p.value[1], decimals)} ${unit}`;
        });
        const hasProb = list.some((p) => p.seriesName === 'Regenwahrscheinlichkeit');
        if (!hasProb && hourly?.time) {
            let bestIdx = -1;
            let bestDiff = Infinity;
            for (let i = 0; i < hourly.time.length; i++) {
                const diff = Math.abs(new Date(hourly.time[i]).getTime() - list[0].axisValue);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIdx = i;
                }
            }
            const pct = bestIdx >= 0 ? hourly.precipitation_probability?.[bestIdx] : undefined;
            if (typeof pct === 'number') rows.push(`Regenwahrsch.: ${formatNum(pct, 0)} %`);
        }
        return [time, ...rows].join('<br/>');
    };
}

const AXIS_COMMON = {
    animation: false,
    yAxisTemp: { type: 'value' as const, name: '°C', axisLabel: { color: C.axis, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
    yAxisRain: { type: 'value' as const, name: 'mm', axisLabel: { color: C.axis, fontSize: 10 }, splitLine: { show: false } },
};

// Variante A/C: one grid. `showAxisLabels` is off for A (a separate ruler row
// above takes over) and on for C (chart keeps its own axis, ribbon replaces
// the number row below).
function buildSingleGridOption(core: ReturnType<typeof buildCoreSeries>, showAxisLabels: boolean, tooltipFormatter: (raw: unknown) => string) {
    return {
        animation: false,
        grid: { left: CHART_PAD_X, right: CHART_PAD_X, top: 24, bottom: 22 },
        tooltip: { trigger: 'axis' as const, formatter: tooltipFormatter },
        xAxis: {
            type: 'time' as const,
            min: core.chartStart,
            max: core.chartEnd,
            axisLabel: { show: showAxisLabels, color: C.axis, fontSize: 10 },
            axisLine: { show: showAxisLabels, lineStyle: { color: C.axisLine } },
            axisTick: { show: showAxisLabels },
        },
        yAxis: [AXIS_COMMON.yAxisTemp, AXIS_COMMON.yAxisRain],
        series: [core.rainSeries, ...core.bandSeries, ...core.tempSeries],
    };
}

// Variante B: two stacked grids (chart + probability bars) sharing one linked
// axisPointer, so a tap anywhere draws one crosshair through both and the
// tooltip merges temperature, rain AND probability — alignment is guaranteed
// because it's the same coordinate system, not matched CSS padding.
function buildDualGridOption(core: ReturnType<typeof buildCoreSeries>, points: Pt[], tooltipFormatter: (raw: unknown) => string) {
    const probSeries = {
        id: 'prob-bars',
        type: 'bar' as const,
        name: 'Regenwahrscheinlichkeit',
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: points.map((p) => [p.t, p.prob]),
        itemStyle: {
            color: (params: { value: [number, number] }) => {
                const v = params.value[1];
                const alpha = 0.22 + Math.min(1, v / 100) * 0.65;
                return `rgba(47,127,214,${alpha.toFixed(2)})`;
            },
        },
        barMaxWidth: 10,
    };
    return {
        animation: false,
        axisPointer: { link: [{ xAxisIndex: 'all' as const }] },
        grid: [
            { left: CHART_PAD_X, right: CHART_PAD_X, top: 18, height: 104 },
            { left: CHART_PAD_X, right: CHART_PAD_X, top: 146, height: 28 },
        ],
        tooltip: { trigger: 'axis' as const, axisPointer: { type: 'line' as const }, formatter: tooltipFormatter },
        xAxis: [
            { gridIndex: 0, type: 'time' as const, min: core.chartStart, max: core.chartEnd, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
            {
                gridIndex: 1,
                type: 'time' as const,
                min: core.chartStart,
                max: core.chartEnd,
                axisLabel: { color: C.axis, fontSize: 10 },
                axisLine: { lineStyle: { color: C.axisLine } },
            },
        ],
        yAxis: [
            { gridIndex: 0, ...AXIS_COMMON.yAxisTemp },
            { gridIndex: 0, ...AXIS_COMMON.yAxisRain },
            { gridIndex: 1, type: 'value' as const, min: 0, max: 100, show: false },
        ],
        series: [core.rainSeries, ...core.bandSeries, ...core.tempSeries, probSeries],
    };
}

function RulerRow({ samples }: { samples: { hour: number; frac: number }[] }) {
    return (
        <div style={{ position: 'relative', height: 16 }}>
            <div style={{ position: 'absolute', left: CHART_PAD_X, right: CHART_PAD_X, bottom: 0, borderBottom: '1px solid var(--widget-border)' }} />
            {samples.map((s) => (
                <span
                    key={s.hour}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: `calc(${CHART_PAD_X}px + ${s.frac} * (100% - ${CHART_PAD_X * 2}px))`,
                        transform: 'translateX(-50%)',
                        fontSize: 9,
                        color: 'var(--text-secondary)',
                        opacity: 0.75,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {String(s.hour).padStart(2, '0')}
                </span>
            ))}
        </div>
    );
}

function ProbRibbon({ points }: { points: Pt[] }) {
    if (!points.length) return null;
    const stops = points
        .map((p, i) => {
            const frac = i / (points.length - 1);
            const alpha = 0.12 + Math.min(1, p.prob / 100) * 0.7;
            return `rgba(47,127,214,${alpha.toFixed(2)}) ${(frac * 100).toFixed(1)}%`;
        })
        .join(', ');
    return (
        <div style={{ marginTop: 6 }}>
            <div style={{ margin: `0 ${CHART_PAD_X}px`, height: 14, borderRadius: 4, background: `linear-gradient(to right, ${stops})`, border: '1px solid var(--widget-border)' }} />
            <div className="flex items-center justify-between" style={{ margin: `3px ${CHART_PAD_X}px 0`, fontSize: 8.5, color: 'var(--text-tertiary, var(--text-secondary))' }}>
                <span>gering</span>
                <span>Regenwahrscheinlichkeit — Zahl auf Tipp im Chart</span>
                <span>hoch</span>
            </div>
        </div>
    );
}

// ── Shared detail panel for whichever day is selected ───────────────────────
function DetailPanel({ index, base }: { index: number; base: string }) {
    const prefix = `${base}.Taeglich.Tag${index}`;
    const { value: maxV } = useDatapoint(`${prefix}.temperaturMax`);
    const { value: minV } = useDatapoint(`${prefix}.temperaturMin`);
    const { value: sunriseV } = useDatapoint(`${prefix}.sonnenaufgang`);
    const { value: sunsetV } = useDatapoint(`${prefix}.sonnenuntergang`);
    const { value: rainSumV } = useDatapoint(`${prefix}.niederschlagSumme`);
    const { value: rainProbV } = useDatapoint(`${prefix}.niederschlagWahrscheinlichkeitMax`);
    const { value: rainOnlyV } = useDatapoint(`${prefix}.regenSumme`);
    const { value: rainHoursV } = useDatapoint(`${prefix}.niederschlagStunden`);
    const { value: sunshineV } = useDatapoint(`${prefix}.sonnenscheindauer`);
    const { value: daylightV } = useDatapoint(`${prefix}.tageslichtdauer`);
    const { value: uvMaxV } = useDatapoint(`${prefix}.uvIndexMax`);
    const { value: uvMaxClearV } = useDatapoint(`${prefix}.uvIndexKlarhimmelMax`);
    const { value: radiationV } = useDatapoint(`${prefix}.globalstrahlungSumme`);
    const { value: evapotranspirationV } = useDatapoint(`${prefix}.verdunstung`);
    const { value: hourlyRaw } = useDatapoint(`${base}.Stuendlich.json`);

    const max = asNum(maxV);
    const min = asNum(minV);
    const sunrise = typeof sunriseV === 'string' ? sunriseV : null;
    const sunset = typeof sunsetV === 'string' ? sunsetV : null;
    const rainSum = asNum(rainSumV);
    const rainProb = asNum(rainProbV);
    const rainOnly = asNum(rainOnlyV);
    const rainHours = asNum(rainHoursV);
    const sunshineHours = asNum(sunshineV) !== null ? (asNum(sunshineV) as number) / 3600 : null;
    const daylightHours = asNum(daylightV) !== null ? (asNum(daylightV) as number) / 3600 : null;
    const uvMax = asNum(uvMaxV);
    const uvMaxClear = asNum(uvMaxClearV);
    const radiation = asNum(radiationV);
    const evapotranspiration = asNum(evapotranspirationV);

    const isToday = index === 0;
    const hourly = useMemo(() => parseJson<HourlyBlob>(hourlyRaw), [hourlyRaw]);

    const points = useMemo(() => {
        if (!hourly?.time) return [];
        const dateStr = localDateStr(index);
        const out: { t: number; temp: number; rain: number; prob: number }[] = [];
        for (let i = 0; i < hourly.time.length; i++) {
            if (!hourly.time[i].startsWith(dateStr)) continue;
            const temp = hourly.temperature_2m?.[i];
            const rain = hourly.precipitation?.[i];
            const prob = hourly.precipitation_probability?.[i];
            if (typeof temp !== 'number') continue;
            out.push({
                t: new Date(hourly.time[i]).getTime(),
                temp,
                rain: typeof rain === 'number' ? rain : 0,
                prob: typeof prob === 'number' ? prob : 0,
            });
        }
        return out;
    }, [hourly, index]);

    // Rain-probability row (DWD-style): a few plain percentage readouts every
    // 3 hours, not a chart series — that's how the reference app shows it too.
    // `frac` (0..1) is this sample's position along the SAME hour-0..hour-23
    // span the chart's x-axis is pinned to (see `option` below), so the label
    // row can be aligned under the matching point on the chart via CHART_PAD_X.
    const probSamples = useMemo(() => {
        if (!hourly?.time || !points.length) return [];
        const dateStr = localDateStr(index);
        const spanStart = points[0].t;
        const spanEnd = points[points.length - 1].t;
        const out: { hour: number; pct: number | null; frac: number }[] = [];
        for (let h = 0; h < 24; h += 3) {
            const key = `${dateStr}T${String(h).padStart(2, '0')}:00`;
            const idx = hourly.time.indexOf(key);
            const pct = idx >= 0 ? hourly.precipitation_probability?.[idx] : undefined;
            const t = spanStart + h * 3600000;
            const frac = spanEnd > spanStart ? (t - spanStart) / (spanEnd - spanStart) : 0;
            out.push({ hour: h, pct: typeof pct === 'number' ? pct : null, frac });
        }
        return out;
    }, [hourly, index, points]);

    const { optionA, optionB, optionC } = useMemo(() => {
        if (!points.length) return { optionA: null, optionB: null, optionC: null };
        const core = buildCoreSeries(points, sunrise, sunset, isToday);
        const formatter = buildTooltipFormatter(hourly);
        return {
            optionA: buildSingleGridOption(core, false, formatter),
            optionB: buildDualGridOption(core, points, formatter),
            optionC: buildSingleGridOption(core, true, formatter),
        };
    }, [points, sunrise, sunset, isToday, hourly]);

    return (
        <div style={{ padding: '12px 12px 14px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {isToday ? 'Heute' : `${dayLabel(index)} ${dayDateStr(index)}`}
                </span>
                {isToday && (
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
                )}
            </div>

            {/* ── Variante A — gemeinsames Lineal ─────────────────────────── */}
            <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2 }}>
                    Variante A · Gemeinsames Lineal
                </div>
                {probSamples.length > 0 && <RulerRow samples={probSamples} />}
                {optionA ? (
                    <ReactECharts option={optionA} notMerge style={{ height: 150 }} />
                ) : (
                    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                        Keine Stundendaten für diesen Tag
                    </div>
                )}
                {probSamples.length > 0 && (
                    <div style={{ position: 'relative', height: 24 }}>
                        {probSamples.map((s) => (
                            <div
                                key={s.hour}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: `calc(${CHART_PAD_X}px + ${s.frac} * (100% - ${CHART_PAD_X * 2}px))`,
                                    transform: 'translateX(-50%)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: s.pct && s.pct > 0 ? C.rain : 'var(--text-secondary)',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {s.pct !== null ? `${formatNum(s.pct, 0)}%` : '–'}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Variante B — verbundenes Fadenkreuz ─────────────────────── */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--widget-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>
                    Variante B · Verbundenes Fadenkreuz
                </div>
                {optionB ? (
                    <ReactECharts option={optionB} notMerge style={{ height: 192 }} />
                ) : (
                    <div style={{ height: 192, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                        Keine Stundendaten für diesen Tag
                    </div>
                )}
            </div>

            {/* ── Variante C — Farbband ───────────────────────────────────── */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--widget-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>
                    Variante C · Farbband
                </div>
                {optionC ? (
                    <ReactECharts option={optionC} notMerge style={{ height: 150 }} />
                ) : (
                    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                        Keine Stundendaten für diesen Tag
                    </div>
                )}
                <ProbRibbon points={points} />
            </div>

            <GroupLabel text="Sonne & Licht" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 6, columnGap: 10, marginTop: 5 }}>
                <DetailRow Icon={Sunrise} label="Aufgang" value={sunrise ? `${timeOnly(sunrise)}` : '–'} />
                <DetailRow Icon={Sunset} label="Untergang" value={sunset ? `${timeOnly(sunset)}` : '–'} />
                <DetailRow Icon={Clock} label="Tageslicht" value={daylightHours !== null ? `${formatNum(daylightHours, 1)} h` : '–'} />
                <DetailRow Icon={Sun} label="Sonnenschein" value={sunshineHours !== null ? `${formatNum(sunshineHours, 1)} h` : '–'} />
            </div>

            <GroupLabel text="Niederschlag" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 6, columnGap: 10, marginTop: 5 }}>
                <DetailRow Icon={Droplet} label="Gesamt" value={rainSum !== null ? `${formatNum(rainSum, 1)} mm` : '–'} />
                <DetailRow Icon={CloudRain} label="davon Regen" value={rainOnly !== null ? `${formatNum(rainOnly, 1)} mm` : '–'} />
                <DetailRow Icon={Hourglass} label="Regenstunden" value={rainHours !== null ? `${formatNum(rainHours, 0)} h` : '–'} />
                <DetailRow Icon={Umbrella} label="Wahrsch. max" value={rainProb !== null ? `${formatNum(rainProb, 0)} %` : '–'} />
            </div>

            <GroupLabel text="Temperatur & Sonstiges" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 6, columnGap: 10, marginTop: 5 }}>
                <DetailRow Icon={ThermometerSun} label="Max" value={max !== null ? `${formatNum(max, 0)}°` : '–'} />
                <DetailRow Icon={ThermometerSnowflake} label="Min" value={min !== null ? `${formatNum(min, 0)}°` : '–'} />
                <DetailRow Icon={Sun} label="UV Max" value={uvMax !== null ? formatNum(uvMax, 0) : '–'} />
                <DetailRow Icon={Sun} dim label="UV Max (klar)" value={uvMaxClear !== null ? formatNum(uvMaxClear, 0) : '–'} />
                <DetailRow Icon={Zap} label="Globalstrahlung" value={radiation !== null ? `${formatNum(radiation, 0)} MJ/m²` : '–'} />
                <DetailRow Icon={Droplets} label="Verdunstung" value={evapotranspiration !== null ? `${formatNum(evapotranspiration, 1)} mm` : '–'} />
            </div>
        </div>
    );
}

export function WeatherForecastStripWidget({ config }: WidgetProps) {
    const base = (config.options?.basePath as string) || DEFAULT_BASE;
    const [active, setActive] = useState(0);

    return (
        <div
            style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)' }}
            data-widget-interactive
        >
            <div className="flex" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity' }}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <StripCell key={i} index={i} base={base} active={active === i} onSelect={() => setActive(i)} />
                ))}
            </div>
            <div style={{ borderTop: '1px solid var(--widget-border)' }}>
                {/* key={active}: force a remount per day rather than re-pointing
                    one instance's useDatapoint refs at a new day's ids — mirrors
                    how the original widget mounts one DayCard per day, so every
                    field is fresh from the cache immediately, no stale carry-over. */}
                <DetailPanel key={active} index={active} base={base} />
            </div>
        </div>
    );
}
