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
    // Tint for the "not measured yet" part of today's chart — same hue as the
    // temperature line so it reads as "this temperature, but forecast".
    future: 'rgba(224,146,47,0.16)',
};

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
            <span className="inline-flex items-center gap-1" style={{ fontSize: 9.5, color: 'var(--accent, #2f7fd6)', minHeight: 12 }}>
                {rainSum !== null && rainSum > 0 ? (
                    <>
                        <Droplet size={9} />
                        {rainProb !== null ? `${formatNum(rainProb, 0)}%` : ''}
                    </>
                ) : rainProb !== null && rainProb > 0 ? (
                    `${formatNum(rainProb, 0)}%`
                ) : (
                    ''
                )}
            </span>
        </button>
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

    // Rain-probability row (DWD-style): a few plain percentage readouts every
    // 3 hours, not a chart series — that's how the reference app shows it too.
    const probSamples = useMemo(() => {
        if (!hourly?.time) return [];
        const dateStr = localDateStr(index);
        const out: { hour: number; pct: number | null }[] = [];
        for (let h = 0; h < 24; h += 3) {
            const key = `${dateStr}T${String(h).padStart(2, '0')}:00`;
            const idx = hourly.time.indexOf(key);
            const pct = idx >= 0 ? hourly.precipitation_probability?.[idx] : undefined;
            out.push({ hour: h, pct: typeof pct === 'number' ? pct : null });
        }
        return out;
    }, [hourly, index]);

    const option = useMemo(() => {
        if (!points.length) return null;
        const nowTs = Date.now();
        const sunriseTs = sunrise ? new Date(sunrise).getTime() : null;
        const sunsetTs = sunset ? new Date(sunset).getTime() : null;
        const chartStart = points[0].t;
        const chartEnd = points[points.length - 1].t;

        const markLineData: Record<string, unknown>[] = [];
        if (sunriseTs) markLineData.push({ xAxis: sunriseTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });
        if (sunsetTs) markLineData.push({ xAxis: sunsetTs, lineStyle: { color: C.axis, type: 'dashed' as const, width: 1 }, label: { show: false } });

        const markAreaData: Record<string, unknown>[][] = [];
        if (sunriseTs && sunriseTs > chartStart) markAreaData.push([{ xAxis: chartStart }, { xAxis: sunriseTs }]);
        if (sunsetTs && sunsetTs < chartEnd) markAreaData.push([{ xAxis: sunsetTs }, { xAxis: chartEnd }]);
        // Only today has an actual "already happened" portion — shade the rest
        // of today's chart to flag it as still forecast, distinct from the
        // grey night bands above.
        if (isToday && nowTs > chartStart && nowTs < chartEnd) {
            markAreaData.push([{ xAxis: nowTs, itemStyle: { color: C.future } }, { xAxis: chartEnd }]);
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
                      symbolSize: 5,
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
                    id: 'rain',
                    type: 'bar' as const,
                    name: 'Regen',
                    yAxisIndex: 1,
                    data: points.map((p) => [p.t, p.rain]),
                    itemStyle: { color: C.rain },
                    barMaxWidth: 10,
                },
                ...tempSeries,
            ],
        };
    }, [points, sunrise, sunset, isToday]);

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
                            <span style={{ width: 10, height: 6, borderRadius: 2, background: C.future, border: `1px dashed ${C.axis}`, display: 'inline-block' }} />
                            Prognose
                        </span>
                    </span>
                )}
            </div>

            {option ? (
                <ReactECharts option={option} notMerge style={{ height: 160 }} />
            ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                    Keine Stundendaten für diesen Tag
                </div>
            )}

            {probSamples.length > 0 && (
                <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', opacity: 0.7, marginBottom: 3 }}>Niederschlagswahrscheinlichkeit</div>
                    <div className="flex" style={{ gap: 2 }}>
                        {probSamples.map((s) => (
                            <div key={s.hour} className="flex flex-col items-center" style={{ flex: '1 1 0' }}>
                                <span style={{ fontSize: 9, color: 'var(--text-secondary)', opacity: 0.6 }}>{String(s.hour).padStart(2, '0')}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: s.pct && s.pct > 0 ? C.rain : 'var(--text-secondary)' }}>
                                    {s.pct !== null ? `${formatNum(s.pct, 0)}%` : '–'}
                                </span>
                            </div>
                        ))}
                    </div>
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
