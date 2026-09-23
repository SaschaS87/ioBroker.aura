/**
 * Garten2 — Entwuerfe Runde 2 (nur Dev-Vorschau, 23.09.2026).
 * Runde 1 (A–F) liegt im Commit 115bb7da; Saschas Rueckmeldung dazu:
 *   - Kopf aus A behalten („Bereit", naechster/letzter Lauf, Liter der Woche)
 *   - Wetter als EINE Karte mit Spalten und senkrechten Haarlinien (C/D)
 *   - Kreise als Listenzeilen, Bedienung im Fenster von unten (B)
 *   - keine Kacheln, keine Punkte-Woche, nichts aus F
 *   - neu: Verlauf per Tipp auf Verdunstung/Regen, Wasserverbrauch mit Euro
 *
 *   G  Klassisch         Kopf A · Wetter 3 Spalten · Kreisliste
 *   H  Vier Werte        wie G, Wetter mit „gestern" · Verbrauch als eigene Zeile
 *   I  Ringe, ruhig      Feuchte-Ringe gleich gross, nichts ausgegraut
 *   J  Ein Block         Status und Wetter in einer Karte
 *   K  Kennzahlen        Verdunstung · Regen · Wasser als drei Spalten
 *   L  Mit Laufplan      „Naechste Laeufe" statt Wochenraster
 */
import { useState } from 'react';
import { CalendarClock, ChevronRight, Droplet, Droplets, History, Settings2, Sprout, TrendingDown, TrendingUp } from 'lucide-react';
import { Caption, CircleSheetBody, modeText, PreviewSheet, ProgressBar, RoundBtn } from './parts';
import { WaterSheet, WeatherHistorySheet, type WeatherTab } from './history';
import {
    fmtClock,
    fmtLastOn,
    fmtNum,
    fmtRunTime,
    fmtWhen,
    upcomingRuns,
    WATER_PRICE_EUR_PER_M3,
    type G2Circle,
    type G2Model,
} from './previewModel';

export interface VariantProps {
    model: G2Model;
}

function fraction(m: G2Model): number {
    const r = m.running;
    if (!r || r.totalSec <= 0) return 0;
    return 1 - r.remainingSec / r.totalSec;
}

function euro(liters: number | null): string {
    if (liters === null) return '—';
    return ((liters / 1000) * WATER_PRICE_EUR_PER_M3).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function liters(v: number | null): string {
    return v === null ? '—' : `${fmtNum(v, 0)} l`;
}

function EtpTrend({ m }: { m: G2Model }) {
    if (m.weather.etpTrend === 'up') return <TrendingUp size={13} className="g2p-accent" />;
    if (m.weather.etpTrend === 'down') return <TrendingDown size={13} style={{ color: 'var(--accent-yellow)' }} />;
    return null;
}

// ── Fenster-Verwaltung: ein Fenster zur Zeit ────────────────────────────────

type SheetState = { kind: 'circle'; name: string } | { kind: 'weather'; tab: WeatherTab } | { kind: 'water'; circles?: string[] } | null;

function useSheets() {
    return useState<SheetState>(null);
}

function Sheets({ m, s, set }: { m: G2Model; s: SheetState; set: (x: SheetState) => void }) {
    if (!s) return null;
    if (s.kind === 'weather') return <WeatherHistorySheet initialTab={s.tab} model={m} onClose={() => set(null)} />;
    if (s.kind === 'water') return <WaterSheet model={m} initialCircles={s.circles} samples={m.samples} onClose={() => set(null)} />;
    const c = m.circles.find((x) => x.name === s.name);
    if (!c) return null;
    return (
        <PreviewSheet title={c.label} subtitle={modeText(c)} onClose={() => set(null)}>
            <CircleSheetBody circle={c} model={m} onWater={() => set({ kind: 'water', circles: [c.name] })} />
        </PreviewSheet>
    );
}

// ── Gemeinsame Bausteine ────────────────────────────────────────────────────

/** Kopf aus Entwurf A — jetzt mit Kreisnamen beim letzten Lauf. */
function Hero({
    m,
    onWater,
    chips = true,
    flat = false,
    lastLine = false,
}: {
    m: G2Model;
    onWater?: () => void;
    chips?: boolean;
    flat?: boolean;
    lastLine?: boolean;
}) {
    const r = m.running;
    const cls = flat ? `g2p-a-hero${r ? ' is-running-flat' : ''}` : `g2p-card g2p-a-hero${r ? ' is-running' : ''}`;
    if (r) {
        return (
            <div className={cls}>
                <div className="g2p-a-hero-title g2p-accent">
                    <Droplets size={20} /> {r.label}
                </div>
                <div className="g2p-a-hero-time">{fmtClock(r.remainingSec)}</div>
                <ProgressBar fraction={fraction(m)} />
                <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                    Stoppen
                </button>
            </div>
        );
    }
    return (
        <div className={cls}>
            <div className="g2p-a-hero-title" style={{ color: 'var(--text-secondary)' }}>
                <Droplets size={20} /> Bereit
            </div>
            <div className="g2p-sub">
                {m.nextRun ? `Nächster Lauf: ${m.nextRun.circle.label}, ${m.nextRun.text} Uhr` : 'Kein Lauf geplant'}
            </div>
            {lastLine && m.lastRun && (
                <div className="g2p-hint" style={{ marginTop: 6 }}>
                    Zuletzt: {m.lastRun.label}, {fmtLastOn(m.lastRun.lastOn)} · {fmtRunTime(m.lastRun.lastRunningTime)}
                </div>
            )}
            {chips && (
                <div className="g2p-chips">
                    {m.lastRun && (
                        <span className="g2p-chip">
                            <History size={14} /> {m.lastRun.label}, {fmtLastOn(m.lastRun.lastOn).replace(' Uhr', '')}
                        </span>
                    )}
                    {onWater ? (
                        <button type="button" className="g2p-chip g2p-chip--link" onClick={onWater}>
                            <Droplet size={14} /> {liters(m.weekLiters)} diese Woche
                            <ChevronRight size={13} />
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}

interface ColDef {
    key: string;
    label: string;
    value: string;
    unit: string;
    sub?: string;
    extra?: React.ReactNode;
    onClick?: () => void;
}

/** Spalten mit senkrechten Haarlinien (aus C/D) — jede Spalte antippbar. */
function Cols({ cols, bare = false }: { cols: ColDef[]; bare?: boolean }) {
    const body = (
        <div className="g2p-cols">
            {cols.map((c) => (
                <button key={c.key} type="button" className="g2p-col" onClick={c.onClick} disabled={!c.onClick}>
                    <span className="g2p-label">{c.label}</span>
                    <span className="g2p-value" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        {c.value}
                        <span className="g2p-unit">{c.unit}</span>
                        {c.extra}
                    </span>
                    {c.sub && <span className="g2p-hint">{c.sub}</span>}
                </button>
            ))}
        </div>
    );
    return bare ? body : <div className="g2p-card" style={{ padding: '10px 0' }}>{body}</div>;
}

function weatherCols(m: G2Model, open: (t: WeatherTab) => void, withYesterday: boolean): ColDef[] {
    const w = m.weather;
    const cols: ColDef[] = [
        {
            key: 'etp',
            label: withYesterday ? 'Verdunst. heute' : 'Verdunstung',
            value: fmtNum(w.etpToday, 2),
            unit: 'mm',
            extra: <EtpTrend m={m} />,
            onClick: () => open('etp'),
        },
    ];
    if (withYesterday) cols.push({ key: 'etpy', label: 'gestern', value: fmtNum(w.etpYesterday, 2), unit: 'mm', onClick: () => open('etp') });
    cols.push(
        { key: 'rain', label: 'Regen heute', value: fmtNum(w.rainToday), unit: 'mm', onClick: () => open('rain') },
        { key: 'rainm', label: 'Regen morgen', value: fmtNum(w.rainTomorrow), unit: 'mm', onClick: () => open('rain') },
    );
    return cols;
}

function circleSub(c: G2Circle, m: G2Model): string {
    if (m.running?.name === c.name) return `gießt · noch ${fmtClock(m.running.remainingSec)}`;
    if (c.mode === 'schedule') {
        return c.plan.next ? `Zeitplan · nächster ${c.plan.next}` : 'Zeitplan · keine Termine';
    }
    if (c.mode === 'evaporation') return 'Verdunstung · gießt nach Bedarf';
    return 'Modus unbekannt';
}

/** Kreise als Listenzeilen (aus B), Tipp oeffnet das Kreis-Fenster. */
function CircleList({ m, open, value = 'moisture' }: { m: G2Model; open: (name: string) => void; value?: 'moisture' | 'none' }) {
    return (
        <div className="g2p-card">
            {m.circles.map((c) => {
                const run = m.running?.name === c.name;
                return (
                    // div statt button: im Lauf sitzt der Stopp-Knopf in der Zeile.
                    <div
                        key={c.name}
                        role="button"
                        tabIndex={0}
                        className="g2p-row g2p-row--tap"
                        onClick={() => open(c.name)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') open(c.name);
                        }}
                    >
                        <Sprout size={20} className={run ? 'g2p-accent' : 'g2p-row-icon'} />
                        <span className="g2p-row-main">
                            <span className="g2p-title">{c.label}</span>
                            <span className={`g2p-sub${run ? ' g2p-accent' : ''}`}>{circleSub(c, m)}</span>
                        </span>
                        {value === 'moisture' && !run && (
                            <span className="g2p-row-value" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                                {c.moisture === null ? '—' : `${Math.round(c.moisture)} %`}
                            </span>
                        )}
                        {run ? (
                            <RoundBtn kind="stop" onClick={m.stop} label="Stoppen" />
                        ) : (
                            <ChevronRight size={16} className="g2p-row-icon" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function CirclesCaption({ m }: { m: G2Model }) {
    return (
        <Caption
            right={
                <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                    <Settings2 size={16} />
                </button>
            }
        >
            Kreise
        </Caption>
    );
}

// ═══ G: Klassisch ═══════════════════════════════════════════════════════════

export function VariantG({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    return (
        <>
            <Hero m={m} onWater={() => set({ kind: 'water' })} />
            <Cols cols={weatherCols(m, (tab) => set({ kind: 'weather', tab }), false)} />
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} />
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

// ═══ H: Vier Werte ══════════════════════════════════════════════════════════

/** Vier Werte in zwei Gruppen — Ueberschrift je Gruppe, darunter heute/gestern bzw. heute/morgen. */
function GroupedWeather({ m, open }: { m: G2Model; open: (t: WeatherTab) => void }) {
    const w = m.weather;
    const group = (title: string, tab: WeatherTab, a: [string, string, React.ReactNode?], b: [string, string]) => (
        <button type="button" className="g2p-col g2p-h-group" onClick={() => open(tab)}>
            <span className="g2p-label">{title}</span>
            <span className="g2p-h-pair">
                <span>
                    <span className="g2p-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {a[1]}
                        <span className="g2p-unit">mm</span>
                        {a[2]}
                    </span>
                    <span className="g2p-hint">{a[0]}</span>
                </span>
                <span>
                    <span className="g2p-value g2p-h-second">
                        {b[1]}
                        <span className="g2p-unit"> mm</span>
                    </span>
                    <span className="g2p-hint">{b[0]}</span>
                </span>
            </span>
        </button>
    );
    return (
        <div className="g2p-card" style={{ padding: '10px 0' }}>
            <div className="g2p-cols">
                {group('Verdunstung', 'etp', ['heute', fmtNum(w.etpToday, 2), <EtpTrend key="t" m={m} />], ['gestern', fmtNum(w.etpYesterday, 2)])}
                {group('Regen', 'rain', ['heute', fmtNum(w.rainToday)], ['morgen', fmtNum(w.rainTomorrow)])}
            </div>
        </div>
    );
}

export function VariantH({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    return (
        <>
            <Hero m={m} />
            <GroupedWeather m={m} open={(tab) => set({ kind: 'weather', tab })} />
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} />
            <div className="g2p-card">
                <button type="button" className="g2p-row" onClick={() => set({ kind: 'water' })}>
                    <Droplet size={20} className="g2p-row-icon" />
                    <span className="g2p-row-main">
                        <span className="g2p-title">Wasserverbrauch</span>
                        <span className="g2p-sub">diese Woche · ≈ {euro(m.weekLiters)}</span>
                    </span>
                    <span className="g2p-row-value" style={{ fontSize: 15 }}>
                        {liters(m.weekLiters)}
                    </span>
                    <ChevronRight size={16} className="g2p-row-icon" />
                </button>
            </div>
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

// ═══ I: Ringe, ruhig ════════════════════════════════════════════════════════

export function VariantI({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    const r = m.running;
    return (
        <>
            <div className="g2p-card g2p-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="g2p-i-rings">
                    {m.circles.map((c) => {
                        const run = r?.name === c.name;
                        const pct = run ? Math.round(fraction(m) * 100) : Math.round(Math.min(100, Math.max(0, c.moisture ?? 0)));
                        return (
                            <button key={c.name} type="button" className="g2p-i-ringbox" onClick={() => set({ kind: 'circle', name: c.name })}>
                                <span className={`g2p-c-ring${run ? ' is-run' : ''}`} style={{ '--pct': `${pct}%` } as React.CSSProperties}>
                                    <span className="g2p-c-ring-inner">
                                        {run ? (
                                            <>
                                                <span style={{ fontSize: 14 }}>{fmtClock(r.remainingSec)}</span>
                                                <span className="g2p-hint" style={{ fontSize: 9 }}>gießt</span>
                                            </>
                                        ) : c.moisture === null ? (
                                            '—'
                                        ) : (
                                            `${Math.round(c.moisture)} %`
                                        )}
                                    </span>
                                </span>
                                <span className="g2p-sub g2p-ellipsis">{c.label}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="g2p-sep" />
                {r ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="g2p-title g2p-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Droplets size={16} /> {r.label} gießt · noch {fmtClock(r.remainingSec)}
                        </span>
                        <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                            Stoppen
                        </button>
                    </div>
                ) : (
                    <div className="g2p-i-status">
                        <span className="g2p-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Droplets size={16} className="g2p-row-icon" /> Bereit
                        </span>
                        <span className="g2p-sub">{m.nextRun ? `nächster Lauf ${m.nextRun.text} · ${m.nextRun.circle.label}` : 'kein Lauf geplant'}</span>
                        <span className="g2p-i-status-foot">
                            {m.lastRun && (
                                <span className="g2p-chip">
                                    <History size={13} /> {m.lastRun.label}, {fmtLastOn(m.lastRun.lastOn).replace(' Uhr', '')}
                                </span>
                            )}
                            <button type="button" className="g2p-chip g2p-chip--link" onClick={() => set({ kind: 'water' })}>
                                <Droplet size={13} /> {liters(m.weekLiters)} diese Woche <ChevronRight size={12} />
                            </button>
                        </span>
                    </div>
                )}
            </div>
            <Cols cols={weatherCols(m, (tab) => set({ kind: 'weather', tab }), false)} />
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} value="none" />
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

// ═══ J: Ein Block ═══════════════════════════════════════════════════════════

export function VariantJ({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    return (
        <>
            <div className={`g2p-card${m.running ? ' g2p-j-running' : ''}`}>
                <Hero m={m} onWater={() => set({ kind: 'water' })} flat />
                <div className="g2p-sep" />
                <div style={{ padding: '10px 0' }}>
                    <Cols cols={weatherCols(m, (tab) => set({ kind: 'weather', tab }), false)} bare />
                </div>
            </div>
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} />
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

// ═══ K: Kennzahlen ══════════════════════════════════════════════════════════

export function VariantK({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    const w = m.weather;
    const cols: ColDef[] = [
        {
            key: 'etp',
            label: 'Verdunstung',
            value: fmtNum(w.etpToday, 2),
            unit: 'mm',
            extra: <EtpTrend m={m} />,
            sub: `gestern ${fmtNum(w.etpYesterday, 2)}`,
            onClick: () => set({ kind: 'weather', tab: 'etp' }),
        },
        {
            key: 'rain',
            label: 'Regen',
            value: fmtNum(w.rainToday),
            unit: 'mm',
            sub: `morgen ${fmtNum(w.rainTomorrow)}`,
            onClick: () => set({ kind: 'weather', tab: 'rain' }),
        },
        {
            key: 'water',
            label: 'Wasser',
            value: m.weekLiters === null ? '—' : fmtNum(m.weekLiters, 0),
            unit: 'l',
            sub: `Woche · ${euro(m.weekLiters)}`,
            onClick: () => set({ kind: 'water' }),
        },
    ];
    return (
        <>
            <Hero m={m} chips={false} lastLine />
            <Cols cols={cols} />
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} />
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

// ═══ L: Mit Laufplan ════════════════════════════════════════════════════════

export function VariantL({ model: m }: VariantProps) {
    const [s, set] = useSheets();
    const next = upcomingRuns(m.circles, 4);
    return (
        <>
            <Hero m={m} onWater={() => set({ kind: 'water' })} />
            <Cols cols={weatherCols(m, (tab) => set({ kind: 'weather', tab }), false)} />
            <Caption>Nächste Läufe</Caption>
            <div className="g2p-card">
                {next.length === 0 ? (
                    <div className="g2p-row">
                        <CalendarClock size={18} className="g2p-row-icon" />
                        <span className="g2p-sub">Kein Kreis im Zeitplan-Modus</span>
                    </div>
                ) : (
                    next.map((n) => (
                        <button key={`${n.circle.name}-${n.at}`} type="button" className="g2p-row g2p-l-row" onClick={() => set({ kind: 'circle', name: n.circle.name })}>
                            <span className="g2p-l-when">{fmtWhen(n.at)}</span>
                            <span className="g2p-title" style={{ flex: 1, minWidth: 0 }}>
                                {n.circle.label}
                            </span>
                            <ChevronRight size={16} className="g2p-row-icon" />
                        </button>
                    ))
                )}
            </div>
            <CirclesCaption m={m} />
            <CircleList m={m} open={(name) => set({ kind: 'circle', name })} />
            <Sheets m={m} s={s} set={set} />
        </>
    );
}

export const VARIANTS = [
    { key: 'G', name: 'Klassisch', C: VariantG },
    { key: 'H', name: 'Vier Werte', C: VariantH },
    { key: 'I', name: 'Ringe, ruhig', C: VariantI },
    { key: 'J', name: 'Ein Block', C: VariantJ },
    { key: 'K', name: 'Kennzahlen', C: VariantK },
    { key: 'L', name: 'Mit Laufplan', C: VariantL },
] as const;
