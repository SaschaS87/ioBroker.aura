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
    ChevronDown,
    ArrowUp,
    Droplet,
    Droplets,
    Wind,
    Sunrise,
    Sunset,
    Clock,
    Hourglass,
    Umbrella,
    ThermometerSun,
    ThermometerSnowflake,
    Zap,
    Map as MapIcon,
    type LucideIcon,
} from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { formatNum } from '../../utils/formatValue';
import type { WidgetProps } from '../../types';

/**
 * Weather-forecast widget fed by the Open-Meteo pull script
 * (`script.js.Wetter.OpenMeteoAbruf`), which writes into `javascript.0.Wetter.*`:
 *   - Aktuell.*                    single scalar states (current conditions)
 *   - Taeglich.Tag0..Tag6.*        single scalar states per forecast day
 *   - Stuendlich.json / Minuten15.json   raw Open-Meteo `hourly` / `minutely_15`
 *     response objects as JSON strings (parsed client-side here)
 *
 * Layout: header (current conditions + a 2x2 stat row), 7 collapsible day
 * cards (accordion, only one open at a time — same pattern as HeatingWidget's
 * CollapsibleBox), a 15-minute rain-nowcast strip, and a radar placeholder.
 */

const DEFAULT_BASE = 'javascript.0.Wetter';

const C = {
    temp: '#e0922f',
    rain: '#2f7fd6',
    axis: '#888',
    axisLine: '#444',
    grid: '#333',
    night: 'rgba(136,136,136,0.14)',
};

const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// ── WMO weather_code → icon/label ────────────────────────────────────────────
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

// ── JSON-blob parsing (Stuendlich.json / Minuten15.json) ────────────────────
interface HourlyBlob {
    time: string[];
    temperature_2m?: number[];
    precipitation?: number[];
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

function DayCard({
    index,
    base,
    open,
    onToggle,
}: {
    index: number;
    base: string;
    open: boolean;
    onToggle: () => void;
}) {
    const prefix = `${base}.Taeglich.Tag${index}`;
    const { value: maxV } = useDatapoint(`${prefix}.temperaturMax`);
    const { value: minV } = useDatapoint(`${prefix}.temperaturMin`);
    const { value: codeV } = useDatapoint(`${prefix}.wettercode`);
    const { value: sunriseV } = useDatapoint(`${prefix}.sonnenaufgang`);
    const { value: sunsetV } = useDatapoint(`${prefix}.sonnenuntergang`);
    // Total precipitation (rain+showers+snow), matching the hourly chart's
    // `precipitation` series — NOT `regenSumme` (rain-only), which undercounts.
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
    const code = asNum(codeV);
    const Icon = weatherIcon(code);
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

    const hourly = useMemo(() => (open ? parseJson<HourlyBlob>(hourlyRaw) : null), [open, hourlyRaw]);

    const points = useMemo(() => {
        if (!hourly?.time) return [];
        const dateStr = localDateStr(index);
        const out: { t: number; temp: number; rain: number }[] = [];
        for (let i = 0; i < hourly.time.length; i++) {
            if (!hourly.time[i].startsWith(dateStr)) continue;
            const temp = hourly.temperature_2m?.[i];
            const rain = hourly.precipitation?.[i];
            if (typeof temp !== 'number') continue;
            out.push({ t: new Date(hourly.time[i]).getTime(), temp, rain: typeof rain === 'number' ? rain : 0 });
        }
        return out;
    }, [hourly, index]);

    const option = useMemo(() => {
        if (!points.length) return null;
        const sunriseTs = sunrise ? new Date(sunrise).getTime() : null;
        const sunsetTs = sunset ? new Date(sunset).getTime() : null;
        const chartStart = points[0].t;
        const chartEnd = points[points.length - 1].t;

        // Dashed sunrise/sunset markers — kept subtle (muted grey, thin) so they
        // read as context, not as the chart's main signal.
        const markLineData: Record<string, unknown>[] = [];
        if (sunriseTs) {
            markLineData.push({
                xAxis: sunriseTs,
                lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 },
                label: { show: false },
            });
        }
        if (sunsetTs) {
            markLineData.push({
                xAxis: sunsetTs,
                lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 },
                label: { show: false },
            });
        }
        // Grey night shading before sunrise and after sunset.
        const markAreaData: Record<string, unknown>[][] = [];
        if (sunriseTs && sunriseTs > chartStart) markAreaData.push([{ xAxis: chartStart }, { xAxis: sunriseTs }]);
        if (sunsetTs && sunsetTs < chartEnd) markAreaData.push([{ xAxis: sunsetTs }, { xAxis: chartEnd }]);

        return {
            animation: false,
            grid: { left: 34, right: 34, top: 24, bottom: 22 },
            tooltip: {
                trigger: 'axis' as const,
                formatter: (raw: unknown) => {
                    const list = (Array.isArray(raw) ? raw : [raw]) as {
                        marker: string;
                        seriesName: string;
                        axisValue: number;
                        value: [number, number];
                    }[];
                    if (!list.length) return '';
                    const time = new Date(list[0].axisValue).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    const rows = list.map((p) => {
                        const unit = p.seriesName === 'Regen' ? 'mm' : '°C';
                        return `${p.marker}${p.seriesName}: ${formatNum(p.value[1], 1)} ${unit}`;
                    });
                    return [time, ...rows].join('<br/>');
                },
            },
            xAxis: {
                type: 'time' as const,
                axisLabel: { color: C.axis, fontSize: 10 },
                axisLine: { lineStyle: { color: C.axisLine } },
            },
            yAxis: [
                { type: 'value' as const, name: '°C', axisLabel: { color: C.axis, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
                { type: 'value' as const, name: 'mm', axisLabel: { color: C.axis, fontSize: 10 }, splitLine: { show: false } },
            ],
            series: [
                {
                    type: 'bar' as const,
                    name: 'Regen',
                    yAxisIndex: 1,
                    data: points.map((p) => [p.t, p.rain]),
                    itemStyle: { color: C.rain },
                    barMaxWidth: 10,
                },
                {
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
            ],
        };
    }, [points, sunrise, sunset]);

    return (
        <div style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)' }}>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                className="flex items-center w-full text-left focus:outline-none"
                style={{ background: 'transparent', padding: '9px 12px', gap: 10 }}
            >
                <span style={{ minWidth: 96, fontSize: 13, color: 'var(--text-primary)' }}>
                    {dayLabel(index)} <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{dayDateStr(index)}</span>
                </span>
                <Icon size={17} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span className="flex-1" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {max !== null ? `${formatNum(max, 0)}°` : '–'}
                    <span style={{ color: 'var(--text-secondary)' }}> / {min !== null ? `${formatNum(min, 0)}°` : '–'}</span>
                </span>
                <span
                    className="inline-flex items-center justify-end gap-1"
                    style={{ minWidth: 68, fontSize: 11, color: 'var(--text-secondary)' }}
                >
                    <Droplet size={11} style={{ flexShrink: 0 }} />
                    {rainProb !== null ? `${formatNum(rainProb, 0)}%` : '–'}
                    {rainSum !== null ? ` · ${formatNum(rainSum, 1)}mm` : ''}
                </span>
                <ChevronDown
                    size={15}
                    className="shrink-0 transition-transform duration-200"
                    style={{ color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
            </button>
            {open && (
                <div style={{ borderTop: '1px solid var(--widget-border)', padding: '10px 12px 12px' }} onClick={(e) => e.stopPropagation()}>
                    {option ? (
                        <ReactECharts option={option} notMerge style={{ height: 160 }} />
                    ) : (
                        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                            Keine Stundendaten für diesen Tag
                        </div>
                    )}
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
            )}
        </div>
    );
}

export function WeatherForecastWidget({ config, editMode }: WidgetProps) {
    const base = (config.options?.basePath as string) || DEFAULT_BASE;
    const [openDay, setOpenDay] = useState<number | null>(null);
    const toggleDay = (i: number) => {
        if (editMode) return;
        setOpenDay((cur) => (cur === i ? null : i));
    };

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
    const { value: modelRunV } = useDatapoint(`${base}.Status.modelllaufZeit`);
    const { value: modelAvailableV } = useDatapoint(`${base}.Status.modelllaufVerfuegbarAb`);
    const { value: nextRunV } = useDatapoint(`${base}.Status.naechsteBerechnung`);
    const { value: lastFetchV } = useDatapoint(`${base}.Status.letzterAbruf`);
    const { value: hourlyRaw } = useDatapoint(`${base}.Stuendlich.json`);
    const { value: minutelyRaw } = useDatapoint(`${base}.Minuten15.json`);

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
    const modelRun = typeof modelRunV === 'string' ? modelRunV : null;
    const modelAvailable = typeof modelAvailableV === 'string' ? modelAvailableV : null;
    const nextRun = typeof nextRunV === 'string' ? nextRunV : null;
    const lastFetch = typeof lastFetchV === 'string' ? lastFetchV : null;
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
        <div className="flex flex-col h-full" data-widget-interactive>
            {/* Current conditions — coloured status card (Heizungs-Tab-Stil) */}
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

            {/* 7-day forecast, collapsible */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <DayCard key={i} index={i} base={base} open={openDay === i} onToggle={() => toggleDay(i)} />
                ))}
            </div>

            {/* Rain nowcast, 15-minute steps */}
            <div style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)', padding: '10px 12px', marginTop: 10 }}>
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

            {/* Rain radar — placeholder, built last */}
            <div
                style={{
                    border: '1px dashed var(--widget-border)',
                    borderRadius: 'var(--widget-radius)',
                    padding: '10px 12px',
                    marginTop: 10,
                    height: 90,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                }}
            >
                <MapIcon size={18} />
                Regenradar — folgt
            </div>

            {/* Datenherkunft — gilt für den ganzen Tab (aktuell, Nowcast, Tage),
                deshalb ein einziger Footer statt in der Kopf-Karte. Kein Rahmen,
                keine Karte — bewusst zurückhaltend. flex-wrap statt starrer
                Einzeiligkeit, damit es auf schmalen Bildschirmen sauber umbricht. */}
            <div
                className="flex flex-wrap items-center justify-center"
                style={{ gap: '4px 8px', fontSize: 10, color: 'var(--text-secondary)', opacity: 0.7, lineHeight: 1.5, marginTop: 10 }}
            >
                <span>Datenstand {localTime(modelRun)} Uhr</span>
                <span>· verfügbar ab {localTime(modelAvailable)} Uhr</span>
                <span>· nächste Berechnung {localTime(nextRun)} Uhr</span>
                <span>· abgerufen um {localTime(lastFetch)} Uhr</span>
            </div>
        </div>
    );
}
