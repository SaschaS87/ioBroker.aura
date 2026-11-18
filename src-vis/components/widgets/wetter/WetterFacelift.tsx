/**
 * UI-Facelift, Entwurfsphase Wetter (nur Dev-Vorschau, gelber Umschalter auf „Neu" und ein Buchstabe).
 *
 * Der Wetter-Tab besteht aus vier Widgets (Tagesstreifen, Regen-Stationskarte, Regenmenge pro Tag,
 * Datenquellen). Bei aktivem Entwurf zeichnet das erste (WeatherForecastStripWidget) diese ganze Seite; die
 * Einstellungen der drei anderen holt sie aus dem Dashboard-Store, ihre alten Karten blendet die
 * Brücken-Datei aus (WetterFacelift.css, :has(.wx-page)). Dashboard.tsx bleibt unberührt.
 *
 * Die Entwürfe unterscheiden sich darin, was oben sofort sichtbar ist und was auf Unterseiten wandert:
 *   A  Liste: Kopf, Tage als Zeilen, alles Weitere hinter Zeilen auf Unterseiten
 *   B  Heute mit Diagramm: Kopf, Tagesleiste mit Diagramm, Regen-Vorschau; Kennzahlen auf Unterseiten
 *   C  Kacheln: Kopf, aktuelle Werte und Regenmesser als Kacheln, Tagesleiste; Diagramme auf Unterseiten
 *   D  Eine Seite mit Reitern (Jetzt / Tage / Regen), ohne Unterseiten außer „Status"
 *
 * Alle Werte der heutigen Seite bleiben erreichbar. Nur lesend, bis auf „Adapter neu starten" in den
 * Datenquellen (unverändert aus DataSourceHealthBox).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import {
    Activity,
    ArrowUp,
    BarChart3,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    CloudRain,
    Droplet,
    Gauge,
    Thermometer,
    Umbrella,
    type LucideIcon,
} from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useDashboardStore } from '../../../store/dashboardStore';
import { formatNum } from '../../../utils/formatValue';
import { formatLastChange } from '../../../utils/formatLastChange';
import { useT } from '../../../i18n';
import type { WidgetConfig } from '../../../types';
import { IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import { DataSourceHealthBox, type HealthSourceDef } from '../shared/DataSourceHealthBox';
import { RainDailyWidget, type RainDailyStats } from '../RainDailyWidget';
import type { RainStationDef } from '../RainStationWidget';
import {
    C,
    CHART_HEIGHT,
    DAY_INDICES,
    GRID_TOP0_SINGLE,
    asNum,
    buildCoreSeries,
    buildSingleGridOption,
    compassLabel,
    currentHourIndex,
    dayDateStr,
    dayLabel,
    localDateStr,
    parseJson,
    timeOnly,
    useChartScrub,
    useNowTick,
    weatherIcon,
    weatherLabel,
    weatherMood,
    type HourlyBlob,
    type MinutelyBlob,
    type Pt,
} from '../WeatherForecastStripWidget';
import { useChartInk } from '../heating/chartInk';
// Zeitraum-Wahl (HeizungPeriodNav in RainDailyWidget) nutzt die hz-*-Klassen dieser Datei
import '../heating/HeizungFacelift.css';
import type { WetterDraft } from './wetterDraft';
import './WetterFacelift.css';

type Draft = Exclude<WetterDraft, 'ALT'>;
type Sub = { k: 'day'; i: number } | { k: 'now' } | { k: 'nowcast' } | { k: 'stations' } | { k: 'raindaily' } | { k: 'status' };

const num = (v: number | null, d: number, unit = '') => (v !== null ? `${formatNum(v, d)}${unit}` : '–');
const dayTitle = (i: number) => (i >= -1 && i <= 1 ? dayLabel(i) : `${dayLabel(i)} ${dayDateStr(i)}`);

// ── Daten ────────────────────────────────────────────────────────────────────

/** Aktuelle Werte (Open-Meteo „Aktuell"), dazu Sonnenzeiten und Höchst/Tiefst von heute. */
function useWxNow(base: string) {
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
    const { value: sunriseV } = useDatapoint(`${base}.Taeglich.Tag0.sonnenaufgang`);
    const { value: sunsetV } = useDatapoint(`${base}.Taeglich.Tag0.sonnenuntergang`);
    const { value: maxV } = useDatapoint(`${base}.Taeglich.Tag0.temperaturMax`);
    const { value: minV } = useDatapoint(`${base}.Taeglich.Tag0.temperaturMin`);
    const { value: hourlyRaw } = useDatapoint(`${base}.Stuendlich.json`);
    // UV steht nicht im Block „Aktuell": Wert der laufenden Stunde aus der Stundenvorhersage (wie bisher)
    const hourly = useMemo(() => parseJson<HourlyBlob>(hourlyRaw), [hourlyRaw]);
    const nowTs = useNowTick();
    const uv = useMemo(() => {
        const idx = currentHourIndex(hourly, nowTs);
        const v = idx >= 0 ? hourly?.uv_index?.[idx] : undefined;
        return typeof v === 'number' ? v : null;
    }, [hourly, nowTs]);
    const code = asNum(codeV);
    // Open-Meteo liefert is_day als 0/1; nur ein bestätigtes „falsch" gilt als Nacht (wie bisher)
    const isNight = isDayV !== null && (isDayV === false || isDayV === 0 || isDayV === '0');
    return {
        temp: asNum(tempV),
        feels: asNum(feelsV),
        code,
        mood: isNight ? 'night' : weatherMood(code),
        cloud: asNum(cloudV),
        humidity: asNum(humidityV),
        windSpeed: asNum(windSpeedV),
        windDir: asNum(windDirV),
        windGusts: asNum(windGustsV),
        precipitation: asNum(precipitationV),
        sunrise: typeof sunriseV === 'string' ? sunriseV : null,
        sunset: typeof sunsetV === 'string' ? sunsetV : null,
        max: asNum(maxV),
        min: asNum(minV),
        uv,
    };
}
type WxNow = ReturnType<typeof useWxNow>;

/** Tageswerte eines Tages (Open-Meteo „Taeglich.Tag<i>"), fertige Tageskennzahlen, keine Diagrammpunkte. */
function useWxDay(base: string, index: number) {
    const p = `${base}.Taeglich.Tag${index}`;
    const { value: maxV } = useDatapoint(`${p}.temperaturMax`);
    const { value: minV } = useDatapoint(`${p}.temperaturMin`);
    const { value: codeV } = useDatapoint(`${p}.wettercode`);
    const { value: sunriseV } = useDatapoint(`${p}.sonnenaufgang`);
    const { value: sunsetV } = useDatapoint(`${p}.sonnenuntergang`);
    const { value: rainSumV } = useDatapoint(`${p}.niederschlagSumme`);
    const { value: rainProbV } = useDatapoint(`${p}.niederschlagWahrscheinlichkeitMax`);
    const { value: rainOnlyV } = useDatapoint(`${p}.regenSumme`);
    const { value: rainHoursV } = useDatapoint(`${p}.niederschlagStunden`);
    const { value: sunshineV } = useDatapoint(`${p}.sonnenscheindauer`);
    const { value: daylightV } = useDatapoint(`${p}.tageslichtdauer`);
    const { value: uvMaxV } = useDatapoint(`${p}.uvIndexMax`);
    const { value: uvMaxClearV } = useDatapoint(`${p}.uvIndexKlarhimmelMax`);
    const { value: radiationV } = useDatapoint(`${p}.globalstrahlungSumme`);
    const { value: evapoV } = useDatapoint(`${p}.verdunstung`);
    const hours = (v: unknown) => (asNum(v) !== null ? (asNum(v) as number) / 3600 : null);
    return {
        max: asNum(maxV),
        min: asNum(minV),
        code: asNum(codeV),
        sunrise: typeof sunriseV === 'string' ? sunriseV : null,
        sunset: typeof sunsetV === 'string' ? sunsetV : null,
        rainSum: asNum(rainSumV),
        rainProb: asNum(rainProbV),
        rainOnly: asNum(rainOnlyV),
        rainHours: asNum(rainHoursV),
        sunshineHours: hours(sunshineV),
        daylightHours: hours(daylightV),
        uvMax: asNum(uvMaxV),
        uvMaxClear: asNum(uvMaxClearV),
        radiation: asNum(radiationV),
        evapo: asNum(evapoV),
    };
}

/** Regen-Vorschau: die nächsten 24 Viertelstunden (6 h) aus „Minuten15.json". */
function useNowcast(base: string) {
    const { value: raw } = useDatapoint(`${base}.Minuten15.json`);
    const minutely = useMemo(() => parseJson<MinutelyBlob>(raw), [raw]);
    // Die Daten reichen zwei Tage zurück; allein `now` bestimmt den ersten Balken (useNowTick, nie Date.now())
    const now = useNowTick();
    return useMemo(() => {
        const bars: { t: number; rain: number }[] = [];
        if (minutely?.time) {
            for (let i = 0; i < minutely.time.length; i++) {
                const t = new Date(minutely.time[i]).getTime();
                if (t < now - 15 * 60000) continue;
                const rain = minutely.precipitation?.[i];
                bars.push({ t, rain: typeof rain === 'number' ? rain : 0 });
                if (bars.length >= 24) break;
            }
        }
        const sum = bars.reduce((s, b) => s + b.rain, 0);
        const max = bars.reduce((m, b) => Math.max(m, b.rain), 0);
        return { bars, sum, max };
    }, [minutely, now]);
}

/** Die Widgets des Tabs, in dem dieses Widget liegt (für die Einstellungen der Regen- und Status-Widgets). */
function useTabWidgets(selfId: string): WidgetConfig[] {
    const layouts = useDashboardStore((s) => s.layouts);
    return useMemo(() => {
        for (const l of layouts ?? [])
            for (const s of l.sections ?? [])
                for (const t of s.tabs ?? []) if ((t.widgets ?? []).some((w) => w.id === selfId)) return t.widgets;
        return [];
    }, [layouts, selfId]);
}

// ── Seite ────────────────────────────────────────────────────────────────────

export function WetterFacelift({ draft, base, selfId }: { draft: Draft; base: string; selfId: string }) {
    const widgets = useTabWidgets(selfId);
    const stationCfg = widgets.find((w) => w.type === 'rainstation');
    const dailyCfg = widgets.find((w) => w.type === 'raindaily');
    const healthCfg = widgets.find((w) => w.type === 'datasourcehealth');
    const stations = (stationCfg?.options?.stations as RainStationDef[] | undefined) ?? [];
    const stationDecimals = (stationCfg?.options?.decimals as number | undefined) ?? 1;
    const healthSources = (healthCfg?.options?.healthSources as HealthSourceDef[] | undefined) ?? [];

    const now = useWxNow(base);
    const nowcast = useNowcast(base);

    const [sub, setSub] = useState<Sub | null>(null);
    const [active, setActive] = useState(0); // gewählter Tag der Tagesleiste (B, D)
    const [tab, setTab] = useState<'now' | 'days' | 'rain'>('now'); // Reiter in D
    const [showPast, setShowPast] = useState(false); // A: vergangene Tage einblenden
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen: beim Zurückkommen wieder auf der Übersicht und bei „Heute" (wie die heutige Seite)
    useEffect(() => {
        if (hidden) {
            setSub(null);
            setActive(0);
        }
    }, [hidden]);
    // anderer Entwurf: Unterseite schließen
    useEffect(() => setSub(null), [draft]);

    const open = (s: Sub) => setSub(s);

    // Zeilen, die in mehreren Entwürfen vorkommen
    const rowNowcast = (
        <NavRow
            Icon={Umbrella}
            title="Nächste 6 Stunden"
            sub={
                nowcast.bars.length === 0
                    ? 'Keine Daten'
                    : nowcast.sum > 0
                      ? `${formatNum(nowcast.sum, 1)} mm erwartet`
                      : 'Kein Regen erwartet'
            }
            onClick={() => open({ k: 'nowcast' })}
        />
    );
    const rowStations = stations.length > 0 && (
        <StationNavRow st={stations[0]} decimals={stationDecimals} onClick={() => open({ k: 'stations' })} />
    );
    const rowDaily = dailyCfg && (
        <NavRow
            Icon={BarChart3}
            title="Regenmenge je Tag"
            sub="Tag · 7 Tage · Monat"
            onClick={() => open({ k: 'raindaily' })}
        />
    );
    const rowNow = (
        <NavRow
            Icon={Gauge}
            title="Aktuelle Werte"
            sub={`Wind ${num(now.windSpeed, 0, ' km/h')} · Feuchte ${num(now.humidity, 0, ' %')}`}
            onClick={() => open({ k: 'now' })}
        />
    );
    const statusSection = healthSources.length > 0 && (
        <Section title="Status">
            <div className="aura-fl-card">
                <button
                    type="button"
                    className="aura-fl-row aura-fl-row--nav wx-status-row"
                    onClick={() => open({ k: 'status' })}
                >
                    <span className="aura-fl-row-icon wx-ico wx-ico--status">
                        <Activity size={20} />
                    </span>
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title wx-row-title">Datenquellen</span>
                        {/* unsichtbarer Fühler: färbt das Symbol bei Warnung gelb, bei Störung rot */}
                        <DataSourceHealthBox sources={healthSources} appearance="probe" />
                    </span>
                    <ChevronRight size={18} className="aura-fl-chev" />
                </button>
            </div>
        </Section>
    );

    let home: ReactNode;
    if (draft === 'A') {
        const days = showPast ? DAY_INDICES : DAY_INDICES.filter((i) => i >= 0);
        home = (
            <>
                <Section>
                    <Head now={now} />
                </Section>
                <section className="aura-fl-section wx-section">
                    <div className="aura-fl-section-head wx-section-head">
                        <h2 className="aura-fl-section-title">Vorhersage</h2>
                        <button type="button" className="aura-fl-fold wx-fold" onClick={() => setShowPast((v) => !v)}>
                            <span className="aura-fl-fold-label">2 vergangene Tage</span>
                            <ChevronDown size={16} className={`aura-fl-fold-chev${showPast ? ' is-open' : ''}`} />
                        </button>
                    </div>
                    <div className="aura-fl-card">
                        {days.map((i) => (
                            <DayRow key={i} base={base} index={i} onClick={() => open({ k: 'day', i })} />
                        ))}
                    </div>
                </section>
                <Section title="Regen">
                    <div className="aura-fl-card">
                        {rowNowcast}
                        {rowStations}
                        {rowDaily}
                    </div>
                </Section>
                <Section title="Jetzt">
                    <div className="aura-fl-card">{rowNow}</div>
                </Section>
                {statusSection}
            </>
        );
    } else if (draft === 'B') {
        home = (
            <>
                <Section>
                    <Head now={now} />
                </Section>
                <Section>
                    <div className="aura-fl-card wx-daycard">
                        <DayStrip base={base} active={active} onSelect={setActive} resetKey={hidden} />
                        <DayChart key={active} base={base} index={active} />
                        <NavRow
                            title={`Alle Werte: ${dayTitle(active)}`}
                            onClick={() => open({ k: 'day', i: active })}
                            plain
                        />
                    </div>
                </Section>
                <Section title="Regen in den nächsten 6 Stunden">
                    <Nowcast data={nowcast} />
                </Section>
                <Section title="Regen gemessen">
                    <div className="aura-fl-card">
                        {rowStations}
                        {rowDaily}
                    </div>
                </Section>
                <Section title="Jetzt">
                    <div className="aura-fl-card">{rowNow}</div>
                </Section>
                {statusSection}
            </>
        );
    } else if (draft === 'C') {
        home = (
            <>
                <Section>
                    <Head now={now} />
                </Section>
                <Section title="Jetzt">
                    <NowTiles now={now} />
                </Section>
                <Section title="Vorhersage" foot="Tag antippen für Verlauf und alle Werte.">
                    <div className="aura-fl-card wx-daycard">
                        <DayStrip base={base} onSelect={(i) => open({ k: 'day', i })} resetKey={hidden} />
                    </div>
                </Section>
                {stations.length > 0 && (
                    <Section title="Regenmesser">
                        <StationTiles stations={stations} decimals={stationDecimals} />
                    </Section>
                )}
                <Section title="Regen">
                    <div className="aura-fl-card">
                        {rowNowcast}
                        {rowDaily}
                    </div>
                </Section>
                {statusSection}
            </>
        );
    } else {
        home = (
            <>
                <div className="wx-seg wx-tabs" role="tablist" aria-label="Bereich">
                    {(
                        [
                            ['now', 'Jetzt'],
                            ['days', 'Tage'],
                            ['rain', 'Regen'],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            role="tab"
                            aria-selected={tab === k}
                            className="wx-seg-btn"
                            data-on={tab === k || undefined}
                            onClick={() => setTab(k)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {tab === 'now' && (
                    <>
                        <Section>
                            <Head now={now} />
                        </Section>
                        <Section title="Aktuelle Werte">
                            <NowRows now={now} />
                        </Section>
                        <Section title="Regen in den nächsten 6 Stunden">
                            <Nowcast data={nowcast} />
                        </Section>
                    </>
                )}
                {tab === 'days' && (
                    <>
                        <Section>
                            <div className="aura-fl-card wx-daycard">
                                <DayStrip base={base} active={active} onSelect={setActive} resetKey={hidden} />
                                <DayChart key={active} base={base} index={active} />
                            </div>
                        </Section>
                        <DayStats key={active} base={base} index={active} />
                    </>
                )}
                {tab === 'rain' && (
                    <>
                        <StationSections stations={stations} decimals={stationDecimals} />
                        {dailyCfg && <RainDaily config={dailyCfg} />}
                    </>
                )}
                {statusSection}
            </>
        );
    }

    let subTitle = '';
    let subNode: ReactNode = null;
    if (sub?.k === 'day') {
        subTitle = dayTitle(sub.i);
        subNode = (
            <>
                <div className="aura-fl-card wx-daycard wx-first">
                    <DayStrip base={base} active={sub.i} onSelect={(i) => setSub({ k: 'day', i })} />
                    <DayChart key={sub.i} base={base} index={sub.i} />
                </div>
                <p className="aura-fl-foot">
                    Temperatur als Linie, Niederschlag als Balken. Graue Flächen sind Nacht, das graue Band um die
                    Linie zeigt die Unsicherheit der Vorhersage. Mit dem Finger über das Diagramm fahren zeigt die
                    Werte je Stunde.
                </p>
                <DayStats key={sub.i} base={base} index={sub.i} />
            </>
        );
    } else if (sub?.k === 'now') {
        subTitle = 'Aktuelle Werte';
        subNode = (
            <>
                <div className="wx-first">
                    <NowRows now={now} />
                </div>
                <p className="aura-fl-foot">Werte von Open-Meteo für den Standort, kein eigener Sensor.</p>
            </>
        );
    } else if (sub?.k === 'nowcast') {
        subTitle = 'Nächste 6 Stunden';
        subNode = (
            <>
                <div className="wx-first">
                    <Nowcast data={nowcast} />
                </div>
                <p className="aura-fl-foot">
                    Erwarteter Niederschlag in Schritten von 15 Minuten (Open-Meteo). Balken antippen zeigt Uhrzeit
                    und Menge.
                </p>
            </>
        );
    } else if (sub?.k === 'stations') {
        subTitle = 'Regenmesser';
        subNode = <StationSections stations={stations} decimals={stationDecimals} first />;
    } else if (sub?.k === 'raindaily') {
        subTitle = 'Regenmenge je Tag';
        subNode = dailyCfg ? <RainDaily config={dailyCfg} first /> : null;
    } else if (sub?.k === 'status') {
        subTitle = 'Status';
        subNode = (
            <DataSourceHealthBox
                sources={healthSources}
                appearance="page"
                footnote="Zeigt, wann die Regenmesser (Netatmo) und die Vorhersage (Open-Meteo) zuletzt Daten geliefert haben. Bei einer Störung lässt sich der Adapter hier neu starten."
            />
        );
    }

    const pages = [
        { key: 'home', node: <div className="wx-home">{home}</div> },
        ...(sub
            ? [
                  {
                      // ein Schlüssel je Art: Tageswechsel auf der Unterseite tauscht nur den Inhalt
                      key: `s-${sub.k}`,
                      node: (
                          <div className="ios-page wx-subpage">
                              <IosNavBar
                                  sticky
                                  title={subTitle}
                                  backLabel="Wetter"
                                  backFallback="Zurück"
                                  onBack={() => setSub(null)}
                              />
                              {subNode}
                          </div>
                      ),
                  },
              ]
            : []),
    ];
    return (
        <div className="aura-fl-scope wx-page" data-wx-draft={draft} data-widget-interactive>
            <IosStack rootRef={rootRef} pages={pages} depth={sub ? 1 : 0} sizing="current" manageScroll bleed={6} />
        </div>
    );
}

// ── gemeinsame Teile ─────────────────────────────────────────────────────────

function Section({ title, children, foot }: { title?: string; children: ReactNode; foot?: ReactNode }) {
    return (
        <section className={`aura-fl-section wx-section${title ? '' : ' wx-section--plain'}`}>
            {title && (
                <div className="aura-fl-section-head wx-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                </div>
            )}
            {children}
            {foot && <p className="aura-fl-foot wx-foot">{foot}</p>}
        </section>
    );
}

/** Antippbare Zeile mit Symbol, Titel, Unterzeile und Winkel; `plain` ohne Symbol. */
function NavRow({
    Icon,
    title,
    sub,
    right,
    plain,
    onClick,
}: {
    Icon?: LucideIcon;
    title: string;
    sub?: ReactNode;
    right?: ReactNode;
    plain?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`aura-fl-row aura-fl-row--nav wx-navrow${plain ? ' wx-row--plain' : ''}`}
            onClick={onClick}
        >
            {Icon && (
                <span className="aura-fl-row-icon wx-ico">
                    <Icon size={20} />
                </span>
            )}
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title wx-row-title">{title}</span>
                {sub && <span className="aura-fl-row-sub">{sub}</span>}
            </span>
            {right}
            <ChevronRight size={18} className="aura-fl-chev" />
        </button>
    );
}

/** Schlichte Wertzeile ohne Symbol (wie „Aktuelle Werte" der Heizung). */
function ValRow({ label, sub, value }: { label: string; sub?: ReactNode; value: ReactNode }) {
    return (
        <div className="aura-fl-row wx-valrow wx-row--plain">
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title wx-row-title">{label}</span>
                {sub && <span className="aura-fl-row-sub">{sub}</span>}
            </span>
            <span className="wx-row-val">{value}</span>
        </div>
    );
}

/** Kopf-Karte: was das Wetter gerade tut, groß die Temperatur. Färbt sich nach Wetterlage (data-mood). */
function Head({ now }: { now: WxNow }) {
    const Icon = weatherIcon(now.code);
    return (
        <div className="aura-fl-card wx-head" data-mood={now.mood}>
            <Icon className="wx-head-mark" aria-hidden />
            <span className="wx-head-label">{weatherLabel(now.code)}</span>
            <span className="wx-head-temp">{num(now.temp, 1, '°')}</span>
            <span className="wx-head-sub">
                Gefühlt {num(now.feels, 0, '°')} · Heute {num(now.max, 0, '°')} / {num(now.min, 0, '°')}
            </span>
        </div>
    );
}

const windText = (now: WxNow) =>
    now.windSpeed !== null ? `${formatNum(now.windSpeed, 0)} km/h${now.windDir !== null ? ` ${compassLabel(now.windDir)}` : ''}` : '–';

function WindArrow({ deg }: { deg: number | null }) {
    if (deg === null) return null;
    return <ArrowUp size={15} className="wx-windarrow" style={{ transform: `rotate(${deg}deg)` }} aria-hidden />;
}

/** Aktuelle Werte als schlichte Zeilen. */
function NowRows({ now }: { now: WxNow }) {
    return (
        <div className="aura-fl-card">
            <ValRow label="Gefühlte Temperatur" value={num(now.feels, 0, ' °C')} />
            <ValRow
                label="Wind"
                sub={now.windGusts !== null ? `Böen ${formatNum(now.windGusts, 0)} km/h` : undefined}
                value={
                    <>
                        <WindArrow deg={now.windDir} />
                        {windText(now)}
                    </>
                }
            />
            <ValRow label="Luftfeuchte" value={num(now.humidity, 0, ' %')} />
            <ValRow label="Bewölkung" value={num(now.cloud, 0, ' %')} />
            <ValRow label="UV-Index" value={num(now.uv, 0)} />
            <ValRow label="Niederschlag" value={num(now.precipitation, 1, ' mm')} />
            <ValRow label="Sonnenaufgang" value={timeOnly(now.sunrise)} />
            <ValRow label="Sonnenuntergang" value={timeOnly(now.sunset)} />
        </div>
    );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="wx-tile">
            <span className="wx-tile-label">{label}</span>
            <span className="wx-tile-val">{value}</span>
            {sub && <span className="wx-tile-sub">{sub}</span>}
        </div>
    );
}

/** Aktuelle Werte als Kacheln (C). */
function NowTiles({ now }: { now: WxNow }) {
    return (
        <div className="aura-fl-card wx-tiles">
            <Tile
                label="Wind"
                value={
                    <>
                        <WindArrow deg={now.windDir} />
                        {windText(now)}
                    </>
                }
                sub={now.windGusts !== null ? `Böen ${formatNum(now.windGusts, 0)} km/h` : undefined}
            />
            <Tile label="Luftfeuchte" value={num(now.humidity, 0, ' %')} sub={`Bewölkung ${num(now.cloud, 0, ' %')}`} />
            <Tile label="Niederschlag" value={num(now.precipitation, 1, ' mm')} sub={`UV-Index ${num(now.uv, 0)}`} />
            <Tile label="Sonne" value={timeOnly(now.sunrise)} sub={`Untergang ${timeOnly(now.sunset)}`} />
        </div>
    );
}

// ── Tage ─────────────────────────────────────────────────────────────────────

const rainText = (prob: number | null, sum: number | null) => {
    const parts: string[] = [];
    if (prob !== null && prob > 0) parts.push(`${formatNum(prob, 0)} %`);
    if (sum !== null && sum > 0) parts.push(`${formatNum(sum, 1)} mm`);
    return parts.join(' · ');
};

/** A: ein Tag als Zeile */
function DayRow({ base, index, onClick }: { base: string; index: number; onClick: () => void }) {
    const d = useWxDay(base, index);
    const Icon = weatherIcon(d.code);
    const rain = rainText(d.rainProb, d.rainSum);
    return (
        <button type="button" className="aura-fl-row aura-fl-row--nav wx-dayrow" onClick={onClick}>
            <span className="aura-fl-row-icon wx-ico">
                <Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title wx-row-title">{dayTitle(index)}</span>
                <span className="aura-fl-row-sub">{weatherLabel(d.code)}</span>
            </span>
            <span className="wx-dayval">
                <span className="wx-row-val">
                    {num(d.max, 0, '°')} <span className="wx-min">{num(d.min, 0, '°')}</span>
                </span>
                {rain && <span className="wx-dayval-rain">{rain}</span>}
            </span>
            <ChevronRight size={18} className="aura-fl-chev" />
        </button>
    );
}

function StripCell({
    base,
    index,
    active,
    onSelect,
}: {
    base: string;
    index: number;
    active: boolean;
    onSelect: () => void;
}) {
    const d = useWxDay(base, index);
    const Icon = weatherIcon(d.code);
    return (
        <button type="button" className="wx-cell" data-on={active || undefined} data-day={index} onClick={onSelect}>
            <span className="wx-cell-day">{dayLabel(index)}</span>
            <span className="wx-cell-date">{dayDateStr(index)}</span>
            <Icon size={22} className="wx-cell-icon" />
            <span className="wx-cell-temp">
                {num(d.max, 0, '°')} <span className="wx-min">{num(d.min, 0, '°')}</span>
            </span>
            <span className="wx-cell-rain">
                {d.rainProb !== null && d.rainProb > 0 && <span>{formatNum(d.rainProb, 0)} %</span>}
                {d.rainSum !== null && d.rainSum > 0 && <span>{formatNum(d.rainSum, 1)} mm</span>}
            </span>
        </button>
    );
}

/** Tagesleiste zum seitlichen Wischen: 2 vergangene Tage, heute, 6 Tage Vorhersage. Beginnt bei „Heute". */
function DayStrip({
    base,
    active,
    onSelect,
    resetKey,
}: {
    base: string;
    active?: number;
    onSelect: (i: number) => void;
    /** wechselt, wenn der Tab verlassen/betreten wird: dann wieder auf „Heute" rollen */
    resetKey?: unknown;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        const show = active !== undefined && active !== 0 ? active : 0;
        const cell = el?.querySelector<HTMLElement>(`[data-day="${show}"]`);
        if (!el || !cell) return;
        // gewählten Tag (sonst „Heute") an den linken Rand; ohne scrollIntoView, das die Seite mitbewegt
        const raf = requestAnimationFrame(() => {
            el.scrollLeft = show === 0 ? cell.offsetLeft : Math.max(0, cell.offsetLeft - cell.offsetWidth);
        });
        return () => cancelAnimationFrame(raf);
        // nur beim Einhängen und beim Zurückkommen auf den Tab, nicht bei jedem Tippen
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);
    return (
        <div ref={ref} className="wx-strip">
            {DAY_INDICES.map((i) => (
                <StripCell key={i} base={base} index={i} active={active === i} onSelect={() => onSelect(i)} />
            ))}
        </div>
    );
}

/** Verlauf eines Tages: Temperatur, Niederschlag, Nacht, Unsicherheit; Fingerzug zeigt die Stundenwerte. */
function DayChart({ base, index }: { base: string; index: number }) {
    const d = useWxDay(base, index);
    const { value: hourlyRaw } = useDatapoint(`${base}.Stuendlich.json`);
    const hourly = useMemo(() => parseJson<HourlyBlob>(hourlyRaw), [hourlyRaw]);
    const isToday = index === 0;
    const points = useMemo((): Pt[] => {
        if (!hourly?.time) return [];
        const dateStr = localDateStr(index);
        const out: Pt[] = [];
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

    const boxRef = useRef<HTMLDivElement>(null);
    // Canvas kann keine CSS-Variablen auflösen: Achsen und Gitter am Element lesen (wie die Heizungs-Diagramme)
    const ink = useChartInk(boxRef);
    const nowTs = useNowTick();
    const option = useMemo(() => {
        if (!points.length) return null;
        const core = buildCoreSeries(points, d.sunrise, d.sunset, isToday, index, nowTs);
        const o = buildSingleGridOption(core, () => '');
        const label = { color: ink.axis, fontSize: 10 };
        return {
            ...o,
            xAxis: o.xAxis.map((x) => ({ ...x, axisLabel: label, axisLine: { lineStyle: { color: ink.axisLine } } })),
            yAxis: o.yAxis.map((y, i) => ({
                ...y,
                axisLabel: label,
                nameTextStyle: { color: ink.axis, fontSize: 10 },
                splitLine: i === 0 ? { lineStyle: { color: ink.grid } } : { show: false },
            })),
            // eigene Tooltip-Box unsichtbar, die Anzeige über dem Diagramm ersetzt sie (wie bisher)
            tooltip: {
                ...o.tooltip,
                formatter: () => '',
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                borderWidth: 0,
                padding: 0,
                extraCssText: 'box-shadow:none; pointer-events:none;',
            },
        };
    }, [points, d.sunrise, d.sunset, isToday, index, nowTs, ink]);

    const scrub = useChartScrub(points);
    const sp = scrub.scrubbing ? points[scrub.idx] : undefined;

    return (
        <div ref={boxRef} className="wx-chart" {...scrub.pointerHandlers}>
            <div className="wx-chart-head">
                {sp ? (
                    <span className="wx-scrub">
                        <span className="wx-scrub-time">
                            <Clock size={13} />
                            {new Date(sp.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="wx-scrub-temp">
                            <Thermometer size={13} />
                            {formatNum(sp.temp, 0)}°
                        </span>
                        <span className="wx-scrub-rain">
                            <Droplet size={13} />
                            {formatNum(sp.rain, 1)} mm
                        </span>
                        <span className="wx-scrub-rain">
                            <Umbrella size={13} />
                            {formatNum(sp.prob, 0)} %
                        </span>
                    </span>
                ) : (
                    <>
                        <span className="wx-chart-title">{dayTitle(index)}</span>
                        <span className="wx-legend">
                            {isToday && (
                                <span className="wx-legend-item">
                                    <span className="wx-legend-dot" style={{ background: C.temp }} />
                                    gemessen
                                </span>
                            )}
                            {index >= 0 && (
                                <span className="wx-legend-item">
                                    <span className="wx-legend-band" style={{ background: C.band }} />
                                    Prognose
                                </span>
                            )}
                        </span>
                    </>
                )}
            </div>
            <div className="wx-chart-body">
                {option ? (
                    <>
                        <ReactECharts
                            ref={scrub.chartRef}
                            option={option}
                            notMerge
                            lazyUpdate
                            style={{ height: CHART_HEIGHT, width: '100%' }}
                            onEvents={scrub.onEvents}
                        />
                        {sp && (
                            <div
                                className="wx-crosshair"
                                style={{ left: scrub.xPx(scrub.idx), top: GRID_TOP0_SINGLE - 4 }}
                            />
                        )}
                    </>
                ) : (
                    <div className="wx-chart-empty" style={{ height: CHART_HEIGHT }}>
                        Keine Stundendaten für diesen Tag
                    </div>
                )}
            </div>
        </div>
    );
}

/** Alle Kennzahlen eines Tages in drei Abschnitten (Sonne & Licht, Niederschlag, Temperatur & Sonstiges). */
function DayStats({ base, index }: { base: string; index: number }) {
    const d = useWxDay(base, index);
    return (
        <>
            <Section title="Sonne und Licht">
                <div className="aura-fl-card">
                    <ValRow label="Sonnenaufgang" value={timeOnly(d.sunrise)} />
                    <ValRow label="Sonnenuntergang" value={timeOnly(d.sunset)} />
                    <ValRow label="Tageslicht" value={num(d.daylightHours, 1, ' h')} />
                    <ValRow label="Sonnenschein" value={num(d.sunshineHours, 1, ' h')} />
                </div>
            </Section>
            <Section title="Niederschlag">
                <div className="aura-fl-card">
                    <ValRow label="Gesamt" value={num(d.rainSum, 1, ' mm')} />
                    <ValRow label="Davon Regen" value={num(d.rainOnly, 1, ' mm')} />
                    <ValRow label="Regenstunden" value={num(d.rainHours, 0, ' h')} />
                    <ValRow label="Höchste Wahrscheinlichkeit" value={num(d.rainProb, 0, ' %')} />
                </div>
            </Section>
            <Section title="Temperatur und Sonstiges">
                <div className="aura-fl-card">
                    <ValRow label="Höchstwert" value={num(d.max, 0, ' °C')} />
                    <ValRow label="Tiefstwert" value={num(d.min, 0, ' °C')} />
                    <ValRow label="UV-Index, höchster" value={num(d.uvMax, 0)} />
                    <ValRow label="UV-Index bei klarem Himmel" value={num(d.uvMaxClear, 0)} />
                    <ValRow label="Globalstrahlung" value={num(d.radiation, 0, ' MJ/m²')} />
                    <ValRow label="Verdunstung" value={num(d.evapo, 1, ' mm')} />
                </div>
            </Section>
        </>
    );
}

// ── Regen ────────────────────────────────────────────────────────────────────

/** Regen-Vorschau als Balken je Viertelstunde; Summe und höchster Wert stehen immer darüber. */
function Nowcast({ data }: { data: ReturnType<typeof useNowcast> }) {
    const { bars, sum, max } = data;
    const scale = Math.max(0.5, max);
    // angetippten Balken über seine Zeit merken, nicht über die Stelle (die Leiste rückt alle 15 min weiter)
    const [selT, setSelT] = useState<number | null>(null);
    const sel = selT !== null ? bars.find((b) => b.t === selT) : undefined;
    const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
    if (!bars.length)
        return (
            <div className="aura-fl-card wx-nowcast">
                <span className="wx-nowcast-empty">Keine 15-Minuten-Daten verfügbar</span>
            </div>
        );
    return (
        <div className="aura-fl-card wx-nowcast">
            <div className="wx-nowcast-head">
                <span className="wx-nowcast-stat">
                    <span className="wx-nowcast-num">{formatNum(sum, 1)} mm</span>
                    <span className="wx-nowcast-label">Summe</span>
                </span>
                <span className="wx-nowcast-stat">
                    <span className="wx-nowcast-num">{formatNum(max, 1)} mm</span>
                    <span className="wx-nowcast-label">Höchstwert je 15 min</span>
                </span>
            </div>
            <div className="wx-bars">
                {bars.map((b) => (
                    <button
                        key={b.t}
                        type="button"
                        className="wx-bar"
                        data-on={selT === b.t || undefined}
                        data-dry={b.rain > 0 ? undefined : ''}
                        aria-label={`${hhmm(b.t)} Uhr, ${formatNum(b.rain, 1)} mm`}
                        onClick={() => setSelT(b.t)}
                    >
                        <span className="wx-bar-fill" style={{ height: Math.max(2, (b.rain / scale) * 40) }} />
                        <span className="wx-bar-time">{hhmm(b.t)}</span>
                    </button>
                ))}
            </div>
            <div className="wx-nowcast-foot">
                {sel ? (
                    <>
                        {hhmm(sel.t)} Uhr: <b>{formatNum(sel.rain, 1)} mm</b>
                    </>
                ) : (
                    'Balken antippen für Uhrzeit und Menge'
                )}
            </div>
        </div>
    );
}

function useStation(st: RainStationDef, decimals: number) {
    const { value: vToday } = useDatapoint(st.todayDp ?? '');
    const { value: vHour } = useDatapoint(st.lastHourDp ?? '');
    const { value: vYesterday } = useDatapoint(st.yesterdayDp ?? '');
    const { state: cur, value: vCurrent } = useDatapoint(st.currentDp ?? '');
    const lc = cur ? (cur.lc > 0 ? cur.lc : cur.ts) : 0;
    // „vor … min" läuft mit, auch wenn kein neuer Wert kommt
    const [, setTick] = useState(0);
    useEffect(() => {
        if (lc === 0) return;
        const iv = window.setInterval(() => setTick((x) => x + 1), 30_000);
        return () => window.clearInterval(iv);
    }, [lc]);
    const t = useT();
    const mm = (v: unknown) => (typeof v === 'number' ? `${formatNum(v, decimals)} mm` : '–');
    return {
        today: mm(vToday),
        hour: mm(vHour),
        yesterday: mm(vYesterday),
        current: mm(vCurrent),
        changed:
            lc > 0
                ? `Zuletzt geändert ${formatLastChange(t as (k: string, v?: Record<string, string | number>) => string, lc)}`
                : null,
    };
}

/** Zeile zur Unterseite „Regenmesser": zeigt den Tageswert der ersten Station. */
function StationNavRow({ st, decimals, onClick }: { st: RainStationDef; decimals: number; onClick: () => void }) {
    const s = useStation(st, decimals);
    return (
        <NavRow
            Icon={CloudRain}
            title="Regenmesser"
            sub={`Heute ${s.today} · ${st.name ?? 'Station 1'}`}
            onClick={onClick}
        />
    );
}

/** Eine Station als Abschnitt mit vier Zeilen. */
function StationSection({ st, decimals, first }: { st: RainStationDef; decimals: number; first?: boolean }) {
    const s = useStation(st, decimals);
    return (
        <section className={`aura-fl-section wx-section${first ? ' wx-section--first' : ''}`}>
            <div className="aura-fl-section-head wx-section-head">
                <h2 className="aura-fl-section-title">{st.name ?? 'Station'}</h2>
            </div>
            <div className="aura-fl-card">
                <ValRow label="Heute" value={<span className="wx-rainval">{s.today}</span>} />
                <ValRow label="Letzte Stunde" value={s.hour} />
                <ValRow label="Gestern" value={s.yesterday} />
                <ValRow label="Aktuell" value={s.current} />
            </div>
            {s.changed && <p className="aura-fl-foot wx-foot">{s.changed}</p>}
        </section>
    );
}

function StationSections({
    stations,
    decimals,
    first,
}: {
    stations: RainStationDef[];
    decimals: number;
    first?: boolean;
}) {
    return (
        <>
            {stations.map((st, i) => (
                <StationSection key={i} st={st} decimals={decimals} first={first && i === 0} />
            ))}
        </>
    );
}

/** C: Regenmesser als Kacheln, oben blättert man durch die Stationen. */
function StationTiles({ stations, decimals }: { stations: RainStationDef[]; decimals: number }) {
    const [idx, setIdx] = useState(0);
    const n = stations.length;
    const i = Math.min(idx, n - 1);
    return (
        <>
            <div className="aura-fl-card">
                <div className="wx-stnav">
                    <button
                        type="button"
                        className="wx-stnav-btn"
                        aria-label="Vorherige Station"
                        disabled={n < 2}
                        onClick={() => setIdx((i - 1 + n) % n)}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="wx-stnav-name">{stations[i].name ?? `Station ${i + 1}`}</span>
                    <button
                        type="button"
                        className="wx-stnav-btn"
                        aria-label="Nächste Station"
                        disabled={n < 2}
                        onClick={() => setIdx((i + 1) % n)}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
                <StationTileGrid key={i} st={stations[i]} decimals={decimals} />
            </div>
            <div className="wx-dots" aria-hidden>
                {stations.map((_, k) => (
                    <span key={k} className="wx-dot" data-on={k === i || undefined} />
                ))}
            </div>
        </>
    );
}
function StationTileGrid({ st, decimals }: { st: RainStationDef; decimals: number }) {
    const s = useStation(st, decimals);
    return (
        <>
            <div className="wx-tiles wx-tiles--inner">
                <Tile label="Heute" value={<span className="wx-rainval">{s.today}</span>} />
                <Tile label="Letzte Stunde" value={s.hour} />
                <Tile label="Gestern" value={s.yesterday} />
                <Tile label="Aktuell" value={s.current} />
            </div>
            {s.changed && <div className="wx-tiles-foot">{s.changed}</div>}
        </>
    );
}

/** Regenmenge je Tag: das bestehende Diagramm in einer Karte, darunter die Kennzahlen des Zeitraums. */
function RainDaily({ config, first }: { config: WidgetConfig; first?: boolean }) {
    const [stats, setStats] = useState<RainDailyStats | null>(null);
    const decimals = (config.options?.decimals as number | undefined) ?? 1;
    const mm = (v: number) => `${v === 0 ? '0' : formatNum(v, decimals)} mm`;
    const day = stats?.range === 'day';
    return (
        <>
            <section className={`aura-fl-section wx-section${first ? ' wx-section--first' : ''}`}>
                {!first && (
                    <div className="aura-fl-section-head wx-section-head">
                        <h2 className="aura-fl-section-title">Regenmenge je Tag</h2>
                    </div>
                )}
                <div className="aura-fl-card wx-raindaily">
                    <RainDailyWidget config={config} editMode={false} onConfigChange={() => {}} onStats={setStats} />
                </div>
                <p className="aura-fl-foot wx-foot">
                    Gemessene Regenmenge der gewählten Station. Ein Tipp auf einen Tag zeigt seine Stunden.
                </p>
            </section>
            <Section title="Im gewählten Zeitraum">
                <div className="aura-fl-card">
                    <ValRow
                        label="Summe"
                        value={<span className="wx-rainval">{stats && stats.sum !== null ? mm(stats.sum) : '–'}</span>}
                    />
                    <ValRow
                        label={day ? 'Regenstunden' : 'Regentage'}
                        value={stats && stats.sum !== null ? String(stats.rainUnits) : '–'}
                    />
                    <ValRow
                        label={day ? 'Nasseste Stunde' : 'Nassester Tag'}
                        sub={stats?.peak ? stats.peak.label : undefined}
                        value={stats?.peak ? mm(stats.peak.value) : '–'}
                    />
                </div>
            </Section>
        </>
    );
}
