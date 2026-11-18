/**
 * UI-Facelift, Wohnklima Inhalt der Raum-Unterseite (WohnklimaFacelift).
 *
 * Aufbau von oben nach unten:
 *   1. Temperatur und Luftfeuchte groß, in den Farben ihrer Linien im Diagramm
 *   2. Verlauf in einer Karte: Zeitraum als Segment-Schalter (Tag / 7 Tage / Monat), darunter Blättern
 *      (zurück, Datum, vor, Heute), dann das Diagramm mit beiden Linien, darunter die Linien zum Ein- und
 *      Ausblenden
 *   3. Tiefst-, Höchst- und Mittelwert des gewählten Zeitraums, je eine Spalte Temperatur und Luftfeuchte
 *   4. „Geändert vor …" als Begleittext
 *
 * Dieselben Datenquellen wie RoomClimateDetails (Momentanwert per useDatapoint, Verlauf per
 * useMultiSeriesData mit Mittelwert-Aggregation, Zeitfenster aus chartPeriod). Die klassische Ansicht bleibt
 * unverändert.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChart2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader, TrendingDown, TrendingUp } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker, getStateDirect, subscribeStateDirect } from '../../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import { useGlobalSettingsStore } from '../../../store/globalSettingsStore';
import { useCssVar } from '../../../hooks/useCssVar';
import { useT } from '../../../i18n';
import { formatNum } from '../../../utils/formatValue';
import { baseDpId } from '../../../utils/dpRef';
import { formatLastChange } from '../../../utils/formatLastChange';
import { PERIOD_LABELS, offsetForDate, periodLabel, periodWindow, type PeriodMode } from '../../../utils/chartPeriod';
import { TEMP_COLOR_DEFAULT } from '../../../themes';
import { ChartDatePicker } from '../ChartDatePicker';

/** Farbe der Luftfeuchte, wie in RoomClimateDetails; je Theme über --fl-wk-hum überschreibbar */
const HUM_COLOR_DEFAULT = '#8aa8c8';

/** #RRGGBB + Deckkraft als 8-stelliges Hex (Canvas kennt keine CSS-Variablen und kein color-mix) */
function alpha(color: string, a: string, fallback: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${a}` : fallback;
}

interface Stats {
    min: number | null;
    max: number | null;
    avg: number | null;
}
function stats(data: [number, number][]): Stats {
    const v = data.map((p) => p[1]).filter((x) => typeof x === 'number' && Number.isFinite(x));
    if (v.length === 0) return { min: null, max: null, avg: null };
    return { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length };
}

export interface WohnklimaRoomDetailsProps {
    temperatureDp: string;
    humidityDp?: string;
    historyInstance?: string;
    title?: string;
    decimals?: number;
    showLastChangeFooter?: boolean;
}

export function WohnklimaRoomDetails({
    temperatureDp,
    humidityDp = '',
    historyInstance = 'history.0',
    title = 'Temperatur',
    decimals: decimalsProp,
    showLastChangeFooter = false,
}: WohnklimaRoomDetailsProps) {
    const { subscribe, getState, connected } = useIoBroker();
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = decimalsProp ?? defaultDecimals;
    const t = useT();
    const hasHum = !!humidityDp;

    // Farben: Canvas braucht feste Werte, die Zahlen oben bekommen dieselben über CSS-Variablen
    const tempColor = useCssVar('--temp-color', TEMP_COLOR_DEFAULT);
    const humColor = useCssVar('--fl-wk-hum', HUM_COLOR_DEFAULT);
    const axisColor = useCssVar('--text-secondary', '#888888');

    const { value: rawTemp } = useDatapoint(temperatureDp);
    const { value: rawHum } = useDatapoint(humidityDp);
    const temp = typeof rawTemp === 'number' ? rawTemp : null;
    const hum = typeof rawHum === 'number' ? rawHum : null;

    const [mode, setMode] = useState<PeriodMode>('day');
    const [offset, setOffset] = useState(0);
    const [pickerOpen, setPickerOpen] = useState(false);
    const win = useMemo(() => periodWindow(mode, offset), [mode, offset]);

    // Linien ein- und ausblenden; eine bleibt immer sichtbar
    const [showTemp, setShowTemp] = useState(true);
    const [showHum, setShowHum] = useState(true);
    const humOn = hasHum && showHum;

    // „Geändert vor …" (lc des Temperatur-Datenpunkts, wie die klassische Ansicht)
    const [lastChangedTs, setLastChangedTs] = useState(0);
    const [, redraw] = useState(0);
    useEffect(() => {
        if (!showLastChangeFooter) return;
        const id = baseDpId(temperatureDp);
        if (!id) return;
        getStateDirect(id).then((s) => {
            if (s) setLastChangedTs(s.lc > 0 ? s.lc : s.ts);
        });
        return subscribeStateDirect(id, (s) => {
            if (s) setLastChangedTs(s.lc > 0 ? s.lc : s.ts);
        });
    }, [temperatureDp, showLastChangeFooter]);
    useEffect(() => {
        if (!showLastChangeFooter || lastChangedTs === 0) return;
        const iv = setInterval(() => redraw((n) => n + 1), 10_000);
        return () => clearInterval(iv);
    }, [showLastChangeFooter, lastChangedTs]);

    const series: EChartSeriesConfig[] = useMemo(() => {
        const base = {
            chartType: 'line' as const,
            historyInstance,
            aggregate: 'average' as const,
            smooth: true,
            lineWidth: 2,
            historyStart: win.start,
            historyEnd: win.end,
        };
        const list: EChartSeriesConfig[] = [
            { ...base, id: `temp-${temperatureDp}`, name: title, datapointId: temperatureDp, color: tempColor, yAxisIndex: 0 },
        ];
        if (hasHum) {
            list.push({ ...base, id: `hum-${humidityDp}`, name: 'Luftfeuchte', datapointId: humidityDp, color: humColor, yAxisIndex: 1 });
        }
        // Kennzahlen aus den echten Einzelwerten, nicht aus den Diagrammpunkten: Die sind Mittelwerte je
        // Zeitblock (7 Tage: 1 h) und glätten kurze Spitzen weg (Wohnzimmer, 7 Tage, Luftfeuchte: Höchstwert
        // 54,7 statt 60,6 %, geprüft gegen InfluxDB am 13.11.2026). Werden nicht gezeichnet.
        const raw = { ...base, aggregate: 'none' as const, historyMaxCount: 20000 };
        list.push({ ...raw, id: `stat-temp-${temperatureDp}`, name: 'stat-temp', datapointId: temperatureDp });
        if (hasHum) list.push({ ...raw, id: `stat-hum-${humidityDp}`, name: 'stat-hum', datapointId: humidityDp });
        return list;
    }, [temperatureDp, humidityDp, hasHum, title, historyInstance, win, tempColor, humColor]);

    const dataMap = useMultiSeriesData(series, connected, subscribe, getState);
    const tempRes = dataMap.get(series[0].id);
    const humRes = hasHum ? dataMap.get(series[1].id) : undefined;
    const tempData = useMemo(() => tempRes?.data ?? [], [tempRes]);
    const humData = useMemo(() => humRes?.data ?? [], [humRes]);
    const loading = (tempRes?.loading ?? false) || (humRes?.loading ?? false);
    const hasData = (showTemp && tempData.length > 0) || (humOn && humData.length > 0);

    const tRaw = dataMap.get(`stat-temp-${temperatureDp}`)?.data;
    const hRaw = hasHum ? dataMap.get(`stat-hum-${humidityDp}`)?.data : undefined;
    const tStats = useMemo(() => stats(tRaw ?? []), [tRaw]);
    const hStats = useMemo(() => stats(hRaw ?? []), [hRaw]);

    const option = useMemo(() => {
        const grid = alpha(axisColor, '33', 'rgba(128,128,128,0.2)');
        const axisLine = alpha(axisColor, '66', 'rgba(128,128,128,0.4)');
        const yBase = {
            type: 'value' as const,
            scale: true,
            axisTick: { show: false },
            axisLine: { show: false },
        };
        return {
            backgroundColor: 'transparent',
            animation: false,
            // Oben Luft zur Zeitraum-Leiste, damit die oberste Achsenbeschriftung nicht klebt
            grid: { left: showTemp ? 40 : 12, right: humOn ? 40 : 12, top: 14, bottom: 24 },
            xAxis: {
                type: 'time' as const,
                min: win.start,
                max: win.end,
                axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
                axisTick: { show: false },
                axisLine: { show: true, lineStyle: { color: axisLine } },
                splitLine: { show: false },
            },
            yAxis: [
                {
                    ...yBase,
                    show: showTemp,
                    axisLabel: { color: tempColor, fontSize: 10, formatter: '{value}°' },
                    splitLine: { show: showTemp, lineStyle: { color: grid } },
                },
                {
                    ...yBase,
                    show: humOn,
                    position: 'right' as const,
                    axisLabel: { color: humColor, fontSize: 10, formatter: '{value} %' },
                    splitLine: { show: !showTemp && humOn, lineStyle: { color: grid } },
                },
            ],
            series: [
                ...(showTemp
                    ? [
                          {
                              name: 'Temperatur',
                              type: 'line',
                              yAxisIndex: 0,
                              smooth: true,
                              smoothMonotone: 'x',
                              showSymbol: false,
                              data: tempData,
                              itemStyle: { color: tempColor },
                              lineStyle: { color: tempColor, width: 2 },
                              areaStyle: {
                                  color: {
                                      type: 'linear',
                                      x: 0,
                                      y: 0,
                                      x2: 0,
                                      y2: 1,
                                      colorStops: [
                                          { offset: 0, color: alpha(tempColor, '29', 'transparent') },
                                          { offset: 1, color: alpha(tempColor, '08', 'transparent') },
                                      ],
                                  },
                              },
                          },
                      ]
                    : []),
                ...(humOn
                    ? [
                          {
                              name: 'Luftfeuchte',
                              type: 'line',
                              yAxisIndex: 1,
                              smooth: true,
                              smoothMonotone: 'x',
                              showSymbol: false,
                              data: humData,
                              itemStyle: { color: humColor },
                              lineStyle: { color: humColor, width: 2 },
                          },
                      ]
                    : []),
            ],
            legend: { show: false },
            tooltip: {
                trigger: 'axis' as const,
                confine: true,
                formatter: (params: unknown) => {
                    const items = params as { axisValue: number; value: [number, number]; marker: string; seriesName: string }[];
                    if (!items?.length) return '';
                    const when = new Date(items[0].axisValue).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const lines = items.map((it) => {
                        const v = it.value[1];
                        const u = it.seriesName === 'Luftfeuchte' ? '%' : '°C';
                        return `${it.marker} <b>${typeof v === 'number' ? formatNum(v, decimals) : v}${u}</b>`;
                    });
                    return [when, ...lines].join('<br/>');
                },
            },
        };
    }, [tempData, humData, showTemp, humOn, win, decimals, tempColor, humColor, axisColor]);

    const fmt = (v: number | null, u: string) => (v !== null ? `${formatNum(v, decimals)}${u}` : '–');
    const unitWord = mode === 'month' ? 'Monat' : mode === 'week' ? 'Woche' : 'Tag';
    const vars = { '--wk-temp': tempColor, '--wk-hum-line': humColor } as CSSProperties;

    return (
        <div className="wk-detail" style={vars}>
            <div className="wk-detail-hero">
                <div className="wk-detail-hero-item">
                    <span className="wk-detail-hero-label">Temperatur</span>
                    <span className="wk-detail-hero-val wk-detail-hero-val--temp">{fmt(temp, '°C')}</span>
                </div>
                {hasHum && (
                    <div className="wk-detail-hero-item">
                        <span className="wk-detail-hero-label">Luftfeuchte</span>
                        <span className="wk-detail-hero-val wk-detail-hero-val--hum">{fmt(hum, '%')}</span>
                    </div>
                )}
            </div>

            <section className="aura-fl-section wk-detail-section">
                <div className="aura-fl-section-head">
                    <h3 className="aura-fl-section-title">Verlauf</h3>
                </div>
                <div className="aura-fl-card wk-detail-chartcard">
                    {/* Zeile 1: Zeitraum als Segment-Schalter über die volle Breite */}
                    <div className="wk-seg" role="tablist" aria-label="Zeitraum">
                        {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((m) => (
                            <button
                                key={m}
                                type="button"
                                role="tab"
                                aria-selected={mode === m}
                                className="wk-seg-btn"
                                data-on={mode === m || undefined}
                                onClick={() => {
                                    setMode(m);
                                    setOffset(0);
                                }}
                            >
                                {PERIOD_LABELS[m]}
                            </button>
                        ))}
                    </div>
                    {/* Zeile 2: blättern, Datum wählen, zurück zu heute */}
                    <div className="wk-nav">
                        <button
                            type="button"
                            className="wk-nav-arrow"
                            aria-label={`Ein${unitWord === 'Woche' ? 'e' : 'en'} ${unitWord} zurück`}
                            onClick={() => setOffset(offset - 1)}
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button type="button" className="wk-nav-date" title="Zeitpunkt wählen" onClick={() => setPickerOpen(true)}>
                            <CalendarDays size={14} className="wk-nav-date-ico" />
                            <span className="wk-nav-date-label">{periodLabel(mode, win)}</span>
                            <ChevronDown size={13} className="wk-nav-date-chev" />
                        </button>
                        <button
                            type="button"
                            className="wk-nav-arrow"
                            aria-label={`Ein${unitWord === 'Woche' ? 'e' : 'en'} ${unitWord} vor`}
                            disabled={offset >= 0}
                            onClick={() => setOffset(offset < 0 ? offset + 1 : offset)}
                        >
                            <ChevronRight size={20} />
                        </button>
                        <button type="button" className="wk-nav-today" disabled={offset === 0} onClick={() => setOffset(0)}>
                            Heute
                        </button>
                    </div>
                    {/* Zeile 3: Diagramm */}
                    <div className="wk-chart">
                        {loading && !hasData && (
                            <div className="wk-chart-state">
                                <Loader size={20} className="animate-spin" />
                            </div>
                        )}
                        {!loading && !hasData && (
                            <div className="wk-chart-state">
                                <BarChart2 size={28} strokeWidth={1.5} />
                                <span className="wk-chart-state-text">Keine Daten</span>
                            </div>
                        )}
                        {hasData && (
                            <ReactECharts
                                key={`${mode}-${offset}`}
                                option={option}
                                notMerge
                                style={{ width: '100%', height: '100%' }}
                                opts={{ renderer: 'canvas' }}
                            />
                        )}
                    </div>
                    {/* Zeile 4: Linien ein- und ausblenden */}
                    {hasHum && (
                        <div className="wk-legend" role="group" aria-label="Linien">
                            <button
                                type="button"
                                className="wk-legend-btn wk-legend-btn--temp"
                                aria-pressed={showTemp}
                                data-on={showTemp || undefined}
                                onClick={() => (showTemp && !humOn ? null : setShowTemp(!showTemp))}
                            >
                                <span className="wk-legend-dot" />
                                Temperatur
                            </button>
                            <button
                                type="button"
                                className="wk-legend-btn wk-legend-btn--hum"
                                aria-pressed={showHum}
                                data-on={showHum || undefined}
                                onClick={() => (showHum && !showTemp ? null : setShowHum(!showHum))}
                            >
                                <span className="wk-legend-dot" />
                                Luftfeuchte
                            </button>
                        </div>
                    )}
                </div>
            </section>

            <section className="aura-fl-section wk-detail-section">
                <div className="aura-fl-section-head">
                    <h3 className="aura-fl-section-title">Im gewählten Zeitraum</h3>
                    {hasHum && (
                        <span className="wk-statcols">
                            <span className="wk-statcol wk-statcol--temp">Temp.</span>
                            <span className="wk-statcol wk-statcol--hum">Feuchte</span>
                        </span>
                    )}
                </div>
                <div className="aura-fl-card wk-detail-stats">
                    {(
                        [
                            ['min', 'Tiefstwert', tStats.min, hStats.min],
                            ['max', 'Höchstwert', tStats.max, hStats.max],
                            ['avg', 'Mittelwert', tStats.avg, hStats.avg],
                        ] as const
                    ).map(([k, label, tv, hv]) => (
                        <div key={k} className="aura-fl-row wk-detail-stat">
                            <span className={`aura-fl-row-icon wk-detail-stat-ico wk-detail-stat-ico--${k}`}>
                                {k === 'min' ? (
                                    <TrendingDown size={18} />
                                ) : k === 'max' ? (
                                    <TrendingUp size={18} />
                                ) : (
                                    <span className="wk-detail-stat-avg">Ø</span>
                                )}
                            </span>
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title">{label}</span>
                            </span>
                            <span className="wk-detail-stat-val wk-detail-stat-val--temp">{fmt(tv, '°C')}</span>
                            {hasHum && <span className="wk-detail-stat-val wk-detail-stat-val--hum">{fmt(hv, '%')}</span>}
                        </div>
                    ))}
                </div>
                {showLastChangeFooter && lastChangedTs > 0 && (
                    <p className="aura-fl-foot wk-detail-foot">
                        {/* Die Kurzformen unter einer Minute enden in de.ts auf „aktualisiert", die anderen nicht */}
                        Zuletzt geändert{' '}
                        {formatLastChange(t as (k: string, v?: Record<string, string | number>) => string, lastChangedTs).replace(
                            / aktualisiert$/,
                            '',
                        )}
                    </p>
                )}
            </section>

            {pickerOpen && (
                <ChartDatePicker
                    mode={mode}
                    initialDate={new Date(win.start)}
                    onApply={(y, m, d) => {
                        setOffset(offsetForDate(mode, y, m, d));
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
}
