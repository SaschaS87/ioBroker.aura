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
    ArrowUp,
    Droplet,
    Wind,
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
 * DWD-app-style forecast tile: one slim horizontally-swipeable day strip + a
 * single shared detail panel below (chart with a linked temperature/rain +
 * rain-probability view, sun/moon markers for day/night), instead of 7
 * stacked accordion cards. Replaces WeatherForecastWidget.tsx, which is
 * retired — see `Wetter/Aura Wetter-Widget - Aufbau.md` for its full
 * documentation before it was removed.
 */

const DEFAULT_BASE = 'javascript.0.Wetter';

const C = {
    temp: '#e0922f',
    rain: '#2f7fd6',
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
    // Matches the moon badge's own fill (MOON_SVG below) at 40% opacity —
    // picked 29.07. after an on-phone A/B round against lighter/darker greys;
    // the moon-toned wash read best. See Wetter/Aura Wetter-Widget - Aufbau.md.
    night: 'rgba(107,114,128,0.40)',
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
function weatherLabel(code: number | null): string {
    if (code === null) return '–';
    if (code === 0) return 'Klar';
    if (code === 1) return 'Meist klar';
    if (code === 2) return 'Teilweise bewölkt';
    if (code === 3) return 'Bedeckt';
    if (code === 45 || code === 48) return 'Nebel';
    if (code >= 51 && code <= 57) return 'Nieselregen';
    if (code >= 61 && code <= 67) return 'Regen';
    if (code >= 80 && code <= 82) return 'Regenschauer';
    if (code >= 71 && code <= 77) return 'Schnee';
    if (code === 85 || code === 86) return 'Schneeschauer';
    if (code >= 95) return 'Gewitter';
    return 'Unbekannt';
}

// Status-card colour by weather condition (same idea as HeatingWidget's
// MODE_STYLE: a tinted card via color-mix, so it works in light and dark).
const MOOD_COLOR: Record<string, string> = {
    clear: '#eab308',
    cloudy: '#8a8f98',
    fog: '#8a8f98',
    rain: '#2f7fd6',
    snow: '#5aa0e0',
    storm: '#8b5cf6',
};
function weatherMood(code: number | null): keyof typeof MOOD_COLOR {
    if (code === null) return 'cloudy';
    if (code === 0 || code === 1) return 'clear';
    if (code === 2 || code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloudy';
}

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function compassLabel(deg: number | null): string {
    if (deg === null) return '';
    const idx = Math.round((deg % 360) / 22.5) % 16;
    return COMPASS[idx];
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
// For real UTC timestamps (Status.modelllaufZeit / letzterAbruf, with a "Z"
// suffix) — unlike timeOnly() above, this must actually convert to local
// time rather than slice the string, or it'd be off by the UTC offset.
function localTime(iso: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

interface HourlyBlob {
    time: string[];
    temperature_2m?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    uv_index?: number[];
    [key: string]: unknown;
}
interface MinutelyBlob {
    time: string[];
    precipitation?: number[];
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
function currentHourIndex(hourly: HourlyBlob | null): number {
    if (!hourly?.time) return -1;
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;
    return hourly.time.indexOf(key);
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

// ── Current-conditions status card — restored 1:1 from the retired
// WeatherForecastWidget.tsx (only this block, not the rest of that widget:
// no nowcast/radar/footer). Always shows "right now", independent of
// whichever day is selected in the strip below. ──────────────────────────
function CurrentConditionsCard({ base }: { base: string }) {
    const { value: tempV } = useDatapoint(`${base}.Aktuell.temperatur`);
    const { value: feelsV } = useDatapoint(`${base}.Aktuell.gefuehlteTemperatur`);
    const { value: codeV } = useDatapoint(`${base}.Aktuell.wettercode`);
    const { value: cloudV } = useDatapoint(`${base}.Aktuell.bewoelkung`);
    const { value: humidityV } = useDatapoint(`${base}.Aktuell.luftfeuchte`);
    const { value: windSpeedV } = useDatapoint(`${base}.Aktuell.windgeschwindigkeit`);
    const { value: windDirV } = useDatapoint(`${base}.Aktuell.windrichtung`);
    const { value: windGustsV } = useDatapoint(`${base}.Aktuell.windboeen`);
    const { value: precipitationV } = useDatapoint(`${base}.Aktuell.niederschlag`);
    const { value: isDayV } = useDatapoint(`${base}.Aktuell.istTag`);
    const { value: sunriseTodayV } = useDatapoint(`${base}.Taeglich.Tag0.sonnenaufgang`);
    const { value: sunsetTodayV } = useDatapoint(`${base}.Taeglich.Tag0.sonnenuntergang`);
    const { value: hourlyRaw } = useDatapoint(`${base}.Stuendlich.json`);

    const temp = asNum(tempV);
    const feels = asNum(feelsV);
    const code = asNum(codeV);
    const cloud = asNum(cloudV);
    const humidity = asNum(humidityV);
    const windSpeed = asNum(windSpeedV);
    const windDir = asNum(windDirV);
    const windGusts = asNum(windGustsV);
    const precipitation = asNum(precipitationV);
    const sunriseToday = typeof sunriseTodayV === 'string' ? sunriseTodayV : null;
    const sunsetToday = typeof sunsetTodayV === 'string' ? sunsetTodayV : null;
    const Icon = weatherIcon(code);
    const mood = weatherMood(code);
    // No mood tint at night — Open-Meteo's own day/night flag (astronomically
    // computed for this location) is more authoritative than re-deriving it
    // from the sunrise/sunset timestamps ourselves.
    // Open-Meteo sends is_day as a number (0/1), not a real JSON boolean — a
    // strict `=== false` check missed the 0 case. null (not loaded yet) keeps
    // the default (coloured), only a confirmed falsy value counts as night.
    const isNight = isDayV !== null && (isDayV === false || isDayV === 0 || isDayV === '0');
    const moodColor = isNight ? 'var(--text-secondary)' : MOOD_COLOR[mood];
    const cardBg = isNight ? 'var(--widget-bg)' : `color-mix(in srgb, ${moodColor} 18%, var(--widget-bg))`;
    const cardBorder = isNight ? 'var(--widget-border)' : `color-mix(in srgb, ${moodColor} 45%, var(--widget-border))`;

    // current UV isn't in the `current` API block — derive it from this hour's
    // entry in the hourly forecast instead (no extra state/API call needed).
    const hourly = useMemo(() => parseJson<HourlyBlob>(hourlyRaw), [hourlyRaw]);
    const currentUv = useMemo(() => {
        const idx = currentHourIndex(hourly);
        const v = idx >= 0 ? hourly?.uv_index?.[idx] : undefined;
        return typeof v === 'number' ? v : null;
    }, [hourly]);

    return (
        <div
            style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 'var(--widget-radius)',
                padding: '14px 12px',
                textAlign: 'center',
            }}
        >
            <div className="inline-flex items-center justify-center gap-2" style={{ fontSize: 18, fontWeight: 500, color: moodColor, lineHeight: 1.2 }}>
                <Icon size={22} />
                {weatherLabel(code)} · {temp !== null ? `${formatNum(temp, 1)}°C` : '–'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                gefühlt {feels !== null ? `${formatNum(feels, 0)}°` : '–'}
            </div>
            <div className="flex items-center justify-center flex-wrap" style={{ gap: 16, marginTop: 11 }}>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Cloud size={14} /> {cloud !== null ? `${formatNum(cloud, 0)}%` : '–'}
                </span>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Droplet size={14} /> {humidity !== null ? `${formatNum(humidity, 0)}%` : '–'}
                </span>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Wind size={14} />
                    {windSpeed !== null ? formatNum(windSpeed, 0) : '–'}
                    {windDir !== null && <ArrowUp size={11} style={{ transform: `rotate(${windDir}deg)` }} />}
                    {compassLabel(windDir)}
                    {windGusts !== null ? ` · Böen ${formatNum(windGusts, 0)}` : ''}
                </span>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <Sun size={14} /> UV {currentUv !== null ? formatNum(currentUv, 0) : '–'}
                </span>
                <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <CloudRain size={14} /> {precipitation !== null ? `${formatNum(precipitation, 1)}mm` : '–'}
                </span>
            </div>
            <div className="flex items-center justify-center" style={{ gap: 18, marginTop: 11, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span className="inline-flex items-center gap-1">
                    <Sunrise size={13} /> {timeOnly(sunriseToday)}
                </span>
                <span className="inline-flex items-center gap-1">
                    <Sunset size={13} /> {timeOnly(sunsetToday)}
                </span>
            </div>
        </div>
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

type Pt = { t: number; temp: number; rain: number; prob: number };

// Temperature at an arbitrary timestamp between two hourly points (linear
// interpolation) — used to give the "measured" and "Prognose" line segments
// a shared connecting point at exactly "now", instead of each stopping at
// its own nearest hour and leaving a gap in between.
function interpolateAt(points: Pt[], ts: number): { t: number; temp: number } | null {
    for (let i = 0; i < points.length - 1; i++) {
        if (points[i].t <= ts && points[i + 1].t >= ts) {
            const span = points[i + 1].t - points[i].t;
            const frac = span > 0 ? (ts - points[i].t) / span : 0;
            return { t: ts, temp: points[i].temp + (points[i + 1].temp - points[i].temp) * frac };
        }
    }
    return null;
}

// Illustrative (not model-derived — see Aufbau.md) confidence margin for a
// point at time `t`: a mild lead-time component (further ahead = a bit less
// certain) PLUS a bulge centred on the day's temperature peak (the daily high
// is inherently the hardest single feature to pin exactly — surface heating
// depends on cloud cover/wind mixing that are themselves uncertain), scaled
// up for days further out in the forecast horizon.
function confidenceMargin(t: number, bandStart: number, chartEnd: number, peakT: number, dayScale: number): number {
    const totalSpan = Math.max(1, chartEnd - bandStart);
    const leadFrac = Math.min(1, Math.max(0, (t - bandStart) / totalSpan));
    const lead = 0.8 + 1.0 * leadFrac;
    const sigma = 3.5 * 3600000;
    const dist = t - peakT;
    const bulge = 1.2 * Math.exp(-(dist * dist) / (2 * sigma * sigma));
    return (lead + bulge) * dayScale;
}

function buildCoreSeries(points: Pt[], sunrise: string | null, sunset: string | null, isToday: boolean, dayIndex: number) {
    const nowTs = Date.now();
    const sunriseTs = sunrise ? new Date(sunrise).getTime() : null;
    const sunsetTs = sunset ? new Date(sunset).getTime() : null;
    const chartStart = points[0].t;
    const chartEnd = points[points.length - 1].t;

    const markLineData: Record<string, unknown>[] = [];
    if (sunriseTs) markLineData.push({ xAxis: sunriseTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });
    if (sunsetTs) markLineData.push({ xAxis: sunsetTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });

    // Grey "night" bands over the full astronomical range (before sunrise AND
    // after sunset), independent of "now" — these used to be clipped at "now"
    // to avoid double-stacking with the old flat forecast rectangle, but that
    // rectangle is gone (replaced by the curve-hugging ribbon below, which
    // can't visually collide with a full-height band), so the clipping was
    // just silently dropping the evening shading for most of the day.
    const markAreaData: Record<string, unknown>[][] = [];
    if (sunriseTs && sunriseTs > chartStart) {
        markAreaData.push([{ xAxis: chartStart }, { xAxis: sunriseTs }]);
    }
    if (sunsetTs && sunsetTs < chartEnd) {
        markAreaData.push([{ xAxis: sunsetTs }, { xAxis: chartEnd }]);
    }

    // Shared "now" point so the measured and forecast line segments touch
    // instead of leaving a gap — see interpolateAt() above.
    const nowPoint = isToday ? interpolateAt(points, nowTs) : null;

    // Confidence ribbon: an ECharts stacked-area pair (invisible lower bound +
    // visible delta on top), so the band's top/bottom follow the temperature
    // curve itself. Today: only the forecast portion (from "now" onward).
    // Other days: the entire day, since all of it is forecast.
    const bandStart = isToday ? nowTs : chartStart;
    const bandBasePoints: Pt[] = isToday
        ? [...(nowPoint ? [{ t: nowPoint.t, temp: nowPoint.temp, rain: 0, prob: 0 }] : []), ...points.filter((p) => p.t > nowTs)]
        : points;
    const dayScale = Math.min(2.5, 1 + dayIndex * 0.25);
    let bandSeries: Record<string, unknown>[] = [];
    if (bandBasePoints.length > 1) {
        const peakPoint = points.reduce((best, p) => (p.temp > best.temp ? p : best), points[0]);
        const band = bandBasePoints.map((p) => {
            const margin = confidenceMargin(p.t, bandStart, chartEnd, peakPoint.t, dayScale);
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

    let tempSeries: Record<string, unknown>[];
    if (isToday) {
        const pastData = points.filter((p) => p.t <= nowTs).map((p): [number, number] => [p.t, p.temp]);
        const futureData = points.filter((p) => p.t > nowTs).map((p): [number, number] => [p.t, p.temp]);
        if (nowPoint) {
            if (!pastData.length || pastData[pastData.length - 1][0] !== nowPoint.t) pastData.push([nowPoint.t, nowPoint.temp]);
            if (!futureData.length || futureData[0][0] !== nowPoint.t) futureData.unshift([nowPoint.t, nowPoint.temp]);
        }
        tempSeries = [
            {
                id: 'temp-past',
                type: 'line' as const,
                name: 'Temperatur',
                yAxisIndex: 0,
                data: pastData,
                showSymbol: true,
                symbol: 'circle',
                symbolSize: 4,
                itemStyle: { color: C.temp, borderWidth: 0 },
                // Standard ECharts emphasis (hover/tap) behaviour — same as every
                // other chart in the app, deliberately not overridden.
                smooth: true,
                color: C.temp,
                lineStyle: { color: C.temp, width: 2 },
            },
            {
                id: 'temp-future',
                type: 'line' as const,
                name: 'Temperatur (Prognose)',
                yAxisIndex: 0,
                data: futureData,
                showSymbol: false,
                smooth: true,
                color: C.temp,
                lineStyle: { color: C.temp, width: 2, type: 'dashed' as const },
                // z pushes the dashed sunrise/sunset lines above the band's area
                // fill so they don't get visually cut by its (anti-aliased) edge —
                // that made the line look offset from the grey area's boundary even
                // though both are computed from the exact same sunriseTs/sunsetTs.
                markLine: markLineData.length ? { symbol: 'none', silent: true, z: 100, data: markLineData } : undefined,
                markArea: markAreaData.length ? { silent: true, z: 1, itemStyle: { color: C.night }, data: markAreaData } : undefined,
            },
        ];
    } else {
        tempSeries = [
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
                // z pushes the dashed sunrise/sunset lines above the band's area
                // fill so they don't get visually cut by its (anti-aliased) edge —
                // that made the line look offset from the grey area's boundary even
                // though both are computed from the exact same sunriseTs/sunsetTs.
                markLine: markLineData.length ? { symbol: 'none', silent: true, z: 100, data: markLineData } : undefined,
                markArea: markAreaData.length ? { silent: true, z: 1, itemStyle: { color: C.night }, data: markAreaData } : undefined,
            },
        ];
    }

    const rainSeries = {
        id: 'rain',
        type: 'bar' as const,
        name: 'Regen',
        yAxisIndex: 1,
        data: points.map((p) => [p.t, p.rain]),
        itemStyle: { color: C.rain },
        barMaxWidth: 10,
    };

    return { rainSeries, tempSeries, bandSeries, chartStart, chartEnd, sunriseTs, sunsetTs };
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

// Fixed default ranges (0–35°C / 0–5mm) so a normal day's chart doesn't jump
// around scale-wise — but still expand via the min/max callbacks whenever the
// actual data (incl. the confidence band) doesn't fit, rather than clipping it.
const AXIS_COMMON = {
    animation: false,
    yAxisTemp: {
        type: 'value' as const,
        name: '°C',
        // Rounded to whole 10s (not the raw data/band extent) and a fixed
        // 10-step interval — an unrounded bound (e.g. 38.65, from the
        // confidence band's exact margin) produced an ugly decimal axis
        // label AND an extra gridline right next to the last clean one.
        min: (val: { min: number }) => Math.floor(Math.min(0, val.min) / 10) * 10,
        max: (val: { max: number }) => Math.ceil(Math.max(40, val.max) / 10) * 10,
        interval: 10,
        axisLabel: { color: C.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: C.grid } },
    },
    yAxisRain: {
        type: 'value' as const,
        name: 'mm',
        min: 0,
        max: (val: { max: number }) => Math.max(5, val.max),
        axisLabel: { color: C.axis, fontSize: 10 },
        splitLine: { show: false },
    },
};

// Two stacked grids (chart + probability bars) sharing one linked
// axisPointer, so a tap anywhere draws one crosshair through both and the
// tooltip merges temperature, rain AND probability — alignment is guaranteed
// because it's the same coordinate system, not matched CSS padding.
const GRID_TOP0 = 16;
const GRID_H0 = 90;
const GRID_TOP1 = 112;
const GRID_H1 = 24;
const CHART_HEIGHT = 156;

// Sun/moon markers as small flat SVGs (filled circle + glyph) rendered
// through ECharts' own markPoint — NOT a separate HTML/CSS overlay. An
// overlay computed its own x position via CHART_PAD_X + a fraction, which
// looked right at first but drifted from the actual dashed line on resize
// (rotating to landscape, resizing the browser): the overlay recalculated
// instantly from the new container width, but ECharts only reflows on its
// own resize cycle, so the two briefly (or not so briefly) disagreed. It
// also rendered UNDER the canvas by default DOM order, so the axis line cut
// through the badges. Baking the markers into the chart's own coordinate
// system removes both problems at once — same data, same resize, same
// paint order as everything else in the chart.
// Coordinates hand-scaled to 70% around the (8,8) centre (rather than an SVG
// transform= with parentheses/spaces in the attribute value) and the whole
// string run through encodeURIComponent — both belt-and-suspenders against
// the data-URI mangling anything, since a malformed image src here silently
// stalls the chart's own canvas (nothing renders at all, no console error).
const SUN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="8" fill="#eab308"/>' +
    '<g stroke="#fff" stroke-width="1" stroke-linecap="round">' +
    '<circle cx="8" cy="8" r="2.1" fill="none"/>' +
    '<line x1="8" y1="3.8" x2="8" y2="4.64"/><line x1="8" y1="11.36" x2="8" y2="12.2"/>' +
    '<line x1="3.8" y1="8" x2="4.64" y2="8"/><line x1="11.36" y1="8" x2="12.2" y2="8"/>' +
    '<line x1="5.76" y1="5.76" x2="5.2" y2="5.2"/><line x1="10.24" y1="10.24" x2="10.8" y2="10.8"/>' +
    '<line x1="5.76" y1="10.24" x2="5.2" y2="10.8"/><line x1="10.24" y1="5.76" x2="10.8" y2="5.2"/>' +
    '</g></svg>';
// Crescent via two overlapping circles (base moon minus an offset "bite" in
// the badge's own background colour) instead of a single hand-built arc
// path — the arc version came out lopsided, hugging the left edge instead of
// reading as a centred crescent. A centred base circle with the bite offset
// only slightly keeps the whole glyph visually centred in the badge.
const MOON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="8" fill="#6b7280"/>' +
    '<circle cx="8" cy="8" r="3.3" fill="#fff"/>' +
    '<circle cx="9.2" cy="6.9" r="3.1" fill="#6b7280"/>' +
    '</svg>';
const SUN_IMAGE = `image://data:image/svg+xml;utf8,${encodeURIComponent(SUN_SVG)}`;
const MOON_IMAGE = `image://data:image/svg+xml;utf8,${encodeURIComponent(MOON_SVG)}`;

function buildDualGridOption(core: ReturnType<typeof buildCoreSeries>, points: Pt[], tooltipFormatter: (raw: unknown) => string) {
    const sunMoonMarkPoints: Record<string, unknown>[] = [];
    if (core.sunriseTs !== null && core.sunriseTs > core.chartStart && core.sunriseTs < core.chartEnd) {
        sunMoonMarkPoints.push({ coord: [core.sunriseTs, 0], symbol: SUN_IMAGE, symbolSize: 16 });
    }
    if (core.sunsetTs !== null && core.sunsetTs > core.chartStart && core.sunsetTs < core.chartEnd) {
        sunMoonMarkPoints.push({ coord: [core.sunsetTs, 0], symbol: MOON_IMAGE, symbolSize: 16 });
    }
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
        // Sit exactly on the shared axis (y=0 on the 0-100 probability scale,
        // which is the grid's bottom edge) at sunrise/sunset — see comment above.
        markPoint: sunMoonMarkPoints.length ? { silent: true, symbolOffset: [0, 0], label: { show: false }, data: sunMoonMarkPoints } : undefined,
    };
    return {
        animation: false,
        axisPointer: { link: [{ xAxisIndex: 'all' as const }] },
        // Tight gap between the two grids (6px) — the probability strip reads
        // as "part of the same chart", not a separate panel below it.
        grid: [
            { left: CHART_PAD_X, right: CHART_PAD_X, top: GRID_TOP0, height: GRID_H0 },
            { left: CHART_PAD_X, right: CHART_PAD_X, top: GRID_TOP1, height: GRID_H1 },
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

    const option = useMemo(() => {
        if (!points.length) return null;
        const core = buildCoreSeries(points, sunrise, sunset, isToday, index);
        const formatter = buildTooltipFormatter(hourly);
        return buildDualGridOption(core, points, formatter);
    }, [points, sunrise, sunset, isToday, index, hourly]);

    return (
        <div style={{ padding: '12px 12px 14px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {isToday ? 'Heute' : `${dayLabel(index)} ${dayDateStr(index)}`}
                </span>
                <span className="inline-flex items-center gap-2" style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                    {isToday && (
                        <span className="inline-flex items-center gap-1">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.temp, display: 'inline-block' }} />
                            gemessen
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                        <span style={{ width: 10, height: 6, borderRadius: 2, background: C.band, display: 'inline-block' }} />
                        Prognose
                    </span>
                </span>
            </div>

            <div style={{ marginTop: 8 }}>
                {option ? (
                    <ReactECharts option={option} notMerge style={{ height: CHART_HEIGHT }} />
                ) : (
                    <div style={{ height: CHART_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                        Keine Stundendaten für diesen Tag
                    </div>
                )}
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

// ── Rain nowcast, 15-minute steps (next ~6h) — restored 1:1 from the retired
// WeatherForecastWidget.tsx (see Wetter/Aura Wetter-Widget - Aufbau.md); was
// lost when the widget was consolidated down to the linked-chart variant.
function RainNowcast({ base }: { base: string }) {
    const { value: minutelyRaw } = useDatapoint(`${base}.Minuten15.json`);
    const minutely = useMemo(() => parseJson<MinutelyBlob>(minutelyRaw), [minutelyRaw]);
    const nowcast = useMemo(() => {
        if (!minutely?.time) return [];
        const now = Date.now();
        const out: { t: number; rain: number }[] = [];
        for (let i = 0; i < minutely.time.length; i++) {
            const t = new Date(minutely.time[i]).getTime();
            if (t < now - 15 * 60000) continue;
            const rain = minutely.precipitation?.[i];
            out.push({ t, rain: typeof rain === 'number' ? rain : 0 });
            if (out.length >= 24) break; // 24 x 15 min = 6 Std.
        }
        return out;
    }, [minutely]);
    const nowcastMax = Math.max(0.5, ...nowcast.map((p) => p.rain));

    return (
        <div style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)', padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Regen-Nowcast (15-Minuten-Takt)</div>
            {nowcast.length ? (
                <div className="flex items-end" style={{ gap: 6, overflowX: 'auto', height: 56 }}>
                    {nowcast.map((p, i) => (
                        <div key={i} className="flex flex-col items-center" style={{ flex: '0 0 auto', width: 28 }}>
                            <div
                                style={{
                                    width: 14,
                                    height: Math.max(2, (p.rain / nowcastMax) * 34),
                                    background: C.rain,
                                    opacity: p.rain > 0 ? 1 : 0.25,
                                    borderRadius: 2,
                                }}
                            />
                            <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 3 }}>
                                {new Date(p.t).toTimeString().slice(0, 5)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Keine 15-Minuten-Daten verfügbar</div>
            )}
        </div>
    );
}

// ── Data-provenance footer — applies to the whole tab (current conditions,
// strip, detail panel all come from the same Open-Meteo pull), so it's a
// single footer here rather than repeated per section. Kein Rahmen, keine
// Karte — bewusst zurückhaltend. Restored 1:1 from the retired
// WeatherForecastWidget.tsx (see Wetter/Aura Wetter-Widget - Aufbau.md).
// `footerOnly` lets this render as its own tiny widget instance, so it can be
// pinned to the bottom of the tab independently of where the main strip sits
// in the grid (Sascha, 29.07.: the timestamp kept ending up mid-tab once
// other widgets were added below the strip).
function DataFooter({ base }: { base: string }) {
    const { value: modelRunV } = useDatapoint(`${base}.Status.modelllaufZeit`);
    const { value: modelAvailableV } = useDatapoint(`${base}.Status.modelllaufVerfuegbarAb`);
    const { value: nextRunV } = useDatapoint(`${base}.Status.naechsteBerechnung`);
    const { value: lastFetchV } = useDatapoint(`${base}.Status.letzterAbruf`);

    const modelRun = typeof modelRunV === 'string' ? modelRunV : null;
    const modelAvailable = typeof modelAvailableV === 'string' ? modelAvailableV : null;
    const nextRun = typeof nextRunV === 'string' ? nextRunV : null;
    const lastFetch = typeof lastFetchV === 'string' ? lastFetchV : null;

    return (
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7, lineHeight: 1.5, marginTop: 2 }}>
            <div>
                Datenstand {localTime(modelRun)} Uhr · verfügbar ab {localTime(modelAvailable)} Uhr
            </div>
            <div>
                nächste Berechnung {localTime(nextRun)} Uhr · abgerufen um {localTime(lastFetch)} Uhr
            </div>
        </div>
    );
}

export function WeatherForecastStripWidget({ config }: WidgetProps) {
    const base = (config.options?.basePath as string) || DEFAULT_BASE;
    const [active, setActive] = useState(0);

    // footerOnly: a second, minimal instance of this same widget type that
    // renders just the data-provenance footer — used to pin it to the bottom
    // of the tab regardless of where the main strip instance sits.
    if (config.options?.footerOnly) {
        return <DataFooter base={base} />;
    }

    const showFooter = config.options?.showFooter !== false;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-widget-interactive>
            <CurrentConditionsCard base={base} />
            <div style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)' }}>
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
            <RainNowcast base={base} />
            {showFooter && <DataFooter base={base} />}
        </div>
    );
}
