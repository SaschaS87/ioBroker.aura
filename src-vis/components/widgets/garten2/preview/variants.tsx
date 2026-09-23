/**
 * Sechs Gestaltungs-Entwuerfe fuer Garten2 (nur Dev-Vorschau, 22.09.2026).
 * Alle lesen dasselbe Modell (previewModel.ts) — sie unterscheiden sich nur
 * in Anordnung und Bedienung, nicht in den Daten.
 *
 *   A  Heizung-Linie     Kopf wie Heizung, Werte als Kacheln, Kreise aufklappbar
 *   B  Listen-Linie      Abschnitte wie Wohnklima/Rolllaeden, Kreis-Sheet
 *   C  Ringe             Bodenfeuchte als Ringe, Wochenplan in einer Karte
 *   D  Zeitleiste        Woche als Leiste, Plan als Punkte-Raster
 *   E  Kacheln           Zweispaltiges Raster, Kreis-Kacheln mit Sheet
 *   F  Ruhig             Grosse Schrift, Zeitplan als Schalter
 */
import { useState } from 'react';
import {
    CalendarClock,
    ChevronDown,
    ChevronRight,
    CloudRain,
    Droplet,
    Droplets,
    History,
    Settings2,
    Sprout,
    Square,
    Sun,
    TrendingDown,
    TrendingUp,
    Umbrella,
} from 'lucide-react';
import type { TimerWeekday } from '../../../../types';
import {
    Caption,
    CircleSheetBody,
    DayLetters,
    daysText,
    ManualRow,
    MODE_OPTIONS,
    modeText,
    PreviewSheet,
    ProgressBar,
    RoundBtn,
    Seg,
} from './parts';
import {
    fmtClock,
    fmtLastOn,
    fmtMm,
    fmtNum,
    fmtRunTime,
    WEEKDAY_ORDER,
    WEEKDAY_SHORT,
    type G2Circle,
    type G2Model,
} from './previewModel';

export interface VariantProps {
    model: G2Model;
}

const TODAY: TimerWeekday = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as TimerWeekday[])[new Date().getDay()];

function fraction(m: G2Model): number {
    const r = m.running;
    if (!r || r.totalSec <= 0) return 0;
    return 1 - r.remainingSec / r.totalSec;
}

function EtpTrend({ m }: { m: G2Model }) {
    if (m.weather.etpTrend === 'up') return <TrendingUp size={14} className="g2p-accent" />;
    if (m.weather.etpTrend === 'down') return <TrendingDown size={14} style={{ color: 'var(--accent-yellow)' }} />;
    return null;
}

function idleLine(m: G2Model): string {
    if (m.nextRun) return `Nächster Lauf: ${m.nextRun.circle.label}, ${m.nextRun.text} Uhr`;
    if (m.lastRun) return `Zuletzt gegossen: ${m.lastRun.label}, ${fmtLastOn(m.lastRun.lastOn)}`;
    return 'Kein Lauf geplant';
}

function circleSub(c: G2Circle): string {
    if (c.mode === 'schedule') {
        return c.plan.days.size ? `Zeitplan · ${daysText(c.plan.days)}${c.plan.time ? `, ${c.plan.time}` : ''}` : 'Zeitplan · keine Termine';
    }
    if (c.mode === 'evaporation') return `Verdunstung · Restfeuchte ${c.moisture === null ? '—' : `${Math.round(c.moisture)} %`}`;
    return 'Modus unbekannt';
}

// ═══ A: Heizung-Linie ═══════════════════════════════════════════════════════

function Tile({ label, value, unit, sub, extra }: { label: string; value: string; unit?: string; sub?: string; extra?: React.ReactNode }) {
    return (
        <div className="g2p-card g2p-tile">
            <div className="g2p-label">{label}</div>
            <div className="g2p-value" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {value}
                {unit && <span className="g2p-unit">{unit}</span>}
                {extra}
            </div>
            {sub && <div className="g2p-hint" style={{ marginTop: 1 }}>{sub}</div>}
        </div>
    );
}

function Collapsible({ title, subtitle, children, onClickInstead }: { title: string; subtitle?: string; children?: React.ReactNode; onClickInstead?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="g2p-card">
            <button type="button" className="g2p-a-coll-head" onClick={onClickInstead ?? (() => setOpen((o) => !o))}>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="g2p-title">{title}</span>
                    {subtitle && <span className="g2p-sub" style={{ marginLeft: 8 }}>{subtitle}</span>}
                </span>
                {onClickInstead ? (
                    <ChevronRight size={16} className="g2p-row-icon" />
                ) : (
                    <ChevronDown size={16} className="g2p-row-icon" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
                )}
            </button>
            {open && children && <div className="g2p-a-coll-body">{children}</div>}
        </div>
    );
}

export function VariantA({ model: m }: VariantProps) {
    const r = m.running;
    return (
        <>
            <div className={`g2p-card g2p-a-hero${r ? ' is-running' : ''}`}>
                {r ? (
                    <>
                        <div className="g2p-a-hero-title g2p-accent">
                            <Droplets size={20} /> {r.label}
                        </div>
                        <div className="g2p-a-hero-time">{fmtClock(r.remainingSec)}</div>
                        <ProgressBar fraction={fraction(m)} />
                        <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                            Stoppen
                        </button>
                    </>
                ) : (
                    <>
                        <div className="g2p-a-hero-title" style={{ color: 'var(--text-secondary)' }}>
                            <Droplets size={20} /> Bereit
                        </div>
                        <div className="g2p-sub">{idleLine(m)}</div>
                        <div className="g2p-chips">
                            {m.lastRun && (
                                <span className="g2p-chip">
                                    <History size={14} /> {fmtLastOn(m.lastRun.lastOn).replace(' Uhr', '')}
                                </span>
                            )}
                            <span className="g2p-chip">
                                <Droplet size={14} /> {m.weekLiters === null ? '—' : `${fmtNum(m.weekLiters, 0)} l`} diese Woche
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div className="g2p-grid2">
                <Tile label="Verdunstung heute" value={fmtNum(m.weather.etpToday, 2)} unit="mm" extra={<EtpTrend m={m} />} sub={`gestern ${fmtMm(m.weather.etpYesterday, 2)}`} />
                <Tile label="Regen heute" value={fmtNum(m.weather.rainToday)} unit="mm" sub={`morgen ${fmtMm(m.weather.rainTomorrow)}`} />
            </div>

            {m.circles.map((c) => (
                <Collapsible key={c.name} title={c.label} subtitle={circleSub(c)}>
                    <Seg size="sm" value={c.mode} options={MODE_OPTIONS} onChange={(v) => m.setMode(c.name, v)} />
                    {c.mode === 'schedule' && <DayLetters days={c.plan.days} variant="short" />}
                    <ManualRow circle={c} model={m} />
                </Collapsible>
            ))}

            <Collapsible title="Einstellungen" subtitle="Regensperre" onClickInstead={m.openSettings} />
        </>
    );
}

// ═══ B: Listen-Linie ════════════════════════════════════════════════════════

export function VariantB({ model: m }: VariantProps) {
    const [sheetFor, setSheetFor] = useState<string | null>(null);
    const r = m.running;
    const sheetCircle = m.circles.find((c) => c.name === sheetFor) ?? null;
    return (
        <>
            <Caption>Jetzt</Caption>
            <div className="g2p-card">
                {r ? (
                    <>
                        <div className="g2p-row">
                            <Droplets size={20} className="g2p-accent" />
                            <div className="g2p-row-main">
                                <span className="g2p-title">{r.label} gießt</span>
                                <span className="g2p-sub">noch {fmtClock(r.remainingSec)} min</span>
                            </div>
                            <RoundBtn kind="stop" onClick={m.stop} label="Stoppen" />
                        </div>
                        <div style={{ padding: '0 14px 12px' }}>
                            <ProgressBar fraction={fraction(m)} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="g2p-row">
                            <CalendarClock size={20} className="g2p-row-icon" />
                            <div className="g2p-row-main">
                                <span className="g2p-title">Nächster Lauf</span>
                                <span className="g2p-sub">{m.nextRun ? m.nextRun.circle.label : 'nichts geplant'}</span>
                            </div>
                            <span className="g2p-row-value">{m.nextRun ? m.nextRun.text : '—'}</span>
                        </div>
                        <div className="g2p-row">
                            <History size={20} className="g2p-row-icon" />
                            <div className="g2p-row-main">
                                <span className="g2p-title">Zuletzt gegossen</span>
                                <span className="g2p-sub">
                                    {m.lastRun ? `${m.lastRun.label} · ${fmtRunTime(m.lastRun.lastRunningTime)}` : '—'}
                                </span>
                            </div>
                            <span className="g2p-row-value">{m.lastRun ? fmtLastOn(m.lastRun.lastOn).replace(' Uhr', '') : '—'}</span>
                        </div>
                    </>
                )}
            </div>

            <Caption>Wetter</Caption>
            <div className="g2p-card">
                <div className="g2p-row">
                    <Sun size={20} className="g2p-row-icon" />
                    <div className="g2p-row-main">
                        <span className="g2p-title">Verdunstung heute</span>
                        <span className="g2p-sub">gestern {fmtMm(m.weather.etpYesterday, 2)}</span>
                    </div>
                    <EtpTrend m={m} />
                    <span className="g2p-row-value">{fmtNum(m.weather.etpToday, 2)} mm</span>
                </div>
                <div className="g2p-row">
                    <CloudRain size={20} className="g2p-row-icon" />
                    <div className="g2p-row-main">
                        <span className="g2p-title">Regen heute</span>
                        <span className="g2p-sub">gestern {fmtMm(m.weather.rainYesterday)} (gemessen)</span>
                    </div>
                    <span className="g2p-row-value">{fmtMm(m.weather.rainToday)}</span>
                </div>
                <div className="g2p-row">
                    <Umbrella size={20} className="g2p-row-icon" />
                    <div className="g2p-row-main">
                        <span className="g2p-title">Regen morgen</span>
                        <span className="g2p-sub">Prognose</span>
                    </div>
                    <span className="g2p-row-value">{fmtMm(m.weather.rainTomorrow)}</span>
                </div>
            </div>

            <Caption
                right={
                    <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                        <Settings2 size={16} />
                    </button>
                }
            >
                Kreise
            </Caption>
            <div className="g2p-card">
                {m.circles.map((c) => {
                    const running = r?.name === c.name;
                    return (
                        <button key={c.name} type="button" className="g2p-row" onClick={() => setSheetFor(c.name)}>
                            <Sprout size={20} className={running ? 'g2p-accent' : 'g2p-row-icon'} />
                            <div className="g2p-row-main">
                                <span className="g2p-title">{c.label}</span>
                                <span className="g2p-sub">{running ? `gießt · noch ${fmtClock(r.remainingSec)}` : circleSub(c)}</span>
                            </div>
                            <span className={`g2p-row-value${c.mode === 'schedule' ? ' g2p-muted' : ''}`}>
                                {c.moisture === null ? '—' : `${Math.round(c.moisture)} %`}
                            </span>
                            <ChevronRight size={16} className="g2p-row-icon" />
                        </button>
                    );
                })}
            </div>

            {sheetCircle && (
                <PreviewSheet title={sheetCircle.label} subtitle={modeText(sheetCircle)} onClose={() => setSheetFor(null)}>
                    <CircleSheetBody circle={sheetCircle} model={m} />
                </PreviewSheet>
            )}
        </>
    );
}

// ═══ C: Ringe ═══════════════════════════════════════════════════════════════

export function VariantC({ model: m }: VariantProps) {
    const r = m.running;
    return (
        <>
            <div className="g2p-card g2p-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="g2p-title">{r ? `${r.label} gießt` : 'Bodenfeuchte'}</span>
                    <span className="g2p-sub">{r ? `noch ${fmtClock(r.remainingSec)}` : m.nextRun ? `nächster Lauf ${m.nextRun.text}` : 'Bereit'}</span>
                </div>
                <div className="g2p-c-rings">
                    {m.circles.map((c) => {
                        const isRun = r?.name === c.name;
                        const pct = isRun
                            ? Math.round(fraction(m) * 100)
                            : Math.round(Math.min(100, Math.max(0, c.moisture ?? 0)));
                        return (
                            <div key={c.name} className="g2p-c-ringbox" style={{ opacity: r && !isRun ? 0.4 : 1 }}>
                                <div className={`g2p-c-ring${isRun ? ' is-big' : ''}`} style={{ '--pct': `${pct}%` } as React.CSSProperties}>
                                    <div className="g2p-c-ring-inner">
                                        {isRun ? fmtClock(r.remainingSec) : c.moisture === null ? '—' : `${Math.round(c.moisture)}%`}
                                    </div>
                                </div>
                                <span className="g2p-sub" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {r ? (
                    <button type="button" className="g2p-btn g2p-btn--danger" onClick={m.stop}>
                        <Square size={13} /> Stoppen
                    </button>
                ) : (
                    m.lastRun && (
                        <div className="g2p-hint" style={{ textAlign: 'center' }}>
                            Zuletzt gegossen: {m.lastRun.label}, {fmtLastOn(m.lastRun.lastOn)}
                        </div>
                    )
                )}
            </div>

            <div className="g2p-card" style={{ padding: '12px 0' }}>
                <div className="g2p-cols">
                    <div>
                        <div className="g2p-label">Verdunstung</div>
                        <div className="g2p-value" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {fmtNum(m.weather.etpToday, 2)}
                            <span className="g2p-unit">mm</span>
                            <EtpTrend m={m} />
                        </div>
                    </div>
                    <div>
                        <div className="g2p-label">Regen heute</div>
                        <div className="g2p-value">
                            {fmtNum(m.weather.rainToday)} <span className="g2p-unit">mm</span>
                        </div>
                    </div>
                    <div>
                        <div className="g2p-label">Regen morgen</div>
                        <div className="g2p-value">
                            {fmtNum(m.weather.rainTomorrow)} <span className="g2p-unit">mm</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="g2p-card">
                <div className="g2p-c-section" style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}>
                    <span className="g2p-title" style={{ flex: 1 }}>Wochenplan</span>
                    <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                        <Settings2 size={16} />
                    </button>
                </div>
                {m.circles.map((c) => (
                    <div key={c.name} className="g2p-c-section">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="g2p-title" style={{ flex: 1 }}>{c.label}</span>
                            <span className="g2p-sub">{c.plan.next ? `nächster ${c.plan.next}` : c.mode === 'schedule' ? 'kein Termin' : ''}</span>
                        </div>
                        <Seg size="sm" value={c.mode} options={MODE_OPTIONS} onChange={(v) => m.setMode(c.name, v)} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}>
                            <span style={{ flex: 1 }}>
                                {c.mode === 'schedule' ? <DayLetters days={c.plan.days} /> : <span className="g2p-hint">Gießt nach Restfeuchte</span>}
                            </span>
                            {r?.name === c.name ? (
                                <RoundBtn kind="stop" onClick={m.stop} label="Stoppen" />
                            ) : (
                                <RoundBtn kind="play" onClick={() => m.start(c.name, 10)} disabled={r !== null} label={`${c.label} 10 min gießen`} />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

// ═══ D: Zeitleiste ══════════════════════════════════════════════════════════

export function VariantD({ model: m }: VariantProps) {
    const [open, setOpen] = useState<string | null>(null);
    const r = m.running;
    return (
        <>
            <div className="g2p-card g2p-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {r ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span className="g2p-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Droplets size={15} className="g2p-accent" />
                                {r.label} gießt
                            </span>
                            <span className="g2p-value g2p-accent">{fmtClock(r.remainingSec)}</span>
                        </div>
                        <ProgressBar fraction={fraction(m)} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span className="g2p-hint">{fmtClock(r.totalSec - r.remainingSec)} gelaufen</span>
                            <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                                Stoppen
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span className="g2p-title">Diese Woche</span>
                            <span className="g2p-sub">{m.nextRun ? `nächster Lauf ${m.nextRun.text}` : 'nichts geplant'}</span>
                        </div>
                        <div className="g2p-d-week">
                            {WEEKDAY_ORDER.map((d) => (
                                <div key={d} className={`g2p-d-day${d === TODAY ? ' is-today' : ''}`}>
                                    <span className="g2p-d-day-name">{WEEKDAY_SHORT[d]}</span>
                                    <span className="g2p-d-dots">
                                        {m.circles.map((c) => (
                                            <span key={c.name} className={`g2p-d-dot${c.mode === 'schedule' && c.plan.days.has(d) ? '' : ' is-empty'}`} />
                                        ))}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {m.lastRun && (
                            <div className="g2p-hint">
                                Zuletzt: {m.lastRun.label}, {fmtLastOn(m.lastRun.lastOn)} · {fmtRunTime(m.lastRun.lastRunningTime)}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="g2p-card" style={{ padding: '12px 0' }}>
                <div className="g2p-cols">
                    <div>
                        <div className="g2p-label">Verdunstung</div>
                        <div className="g2p-value" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {fmtNum(m.weather.etpToday, 2)}
                            <span className="g2p-unit">mm</span>
                            <EtpTrend m={m} />
                        </div>
                    </div>
                    <div>
                        <div className="g2p-label">Regen</div>
                        <div className="g2p-value">
                            {fmtNum(m.weather.rainToday)} <span className="g2p-unit">mm</span>
                        </div>
                    </div>
                    <div>
                        <div className="g2p-label">Morgen</div>
                        <div className="g2p-value">
                            {fmtNum(m.weather.rainTomorrow)} <span className="g2p-unit">mm</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="g2p-card">
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 0' }}>
                    <span className="g2p-title" style={{ flex: 1 }}>Wochenplan</span>
                    <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                        <Settings2 size={16} />
                    </button>
                </div>
                <div className="g2p-d-matrix-row g2p-d-matrix-head">
                    <span />
                    {WEEKDAY_ORDER.map((d) => (
                        <span key={d} className="g2p-d-cell g2p-hint" style={{ fontWeight: d === TODAY ? 700 : 500 }}>
                            {WEEKDAY_SHORT[d]}
                        </span>
                    ))}
                    <span />
                </div>
                {m.circles.map((c) => (
                    <div key={c.name} style={{ display: 'contents' }}>
                        <button type="button" className="g2p-d-matrix-row" onClick={() => setOpen(open === c.name ? null : c.name)}>
                            <span style={{ minWidth: 0 }}>
                                <span className="g2p-title" style={{ display: 'block' }}>{c.label}</span>
                                <span className="g2p-hint">{c.mode === 'schedule' ? c.plan.time ?? 'Zeitplan' : 'Verdunstung'}</span>
                            </span>
                            {WEEKDAY_ORDER.map((d) => (
                                <span key={d} className="g2p-d-cell">
                                    <span className={`g2p-d-cell-dot${c.mode === 'schedule' && c.plan.days.has(d) ? ' is-on' : ''}`} style={c.mode !== 'schedule' ? { opacity: 0.35 } : undefined} />
                                </span>
                            ))}
                            <ChevronDown size={15} className="g2p-row-icon" style={{ transform: open === c.name ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
                        </button>
                        {open === c.name && (
                            <div className="g2p-d-expand">
                                <Seg size="sm" value={c.mode} options={MODE_OPTIONS} onChange={(v) => m.setMode(c.name, v)} />
                                <ManualRow circle={c} model={m} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

// ═══ E: Kacheln ═════════════════════════════════════════════════════════════

export function VariantE({ model: m }: VariantProps) {
    const [sheetFor, setSheetFor] = useState<string | null>(null);
    const r = m.running;
    const sheetCircle = m.circles.find((c) => c.name === sheetFor) ?? null;
    return (
        <>
            <div className={`g2p-card g2p-a-hero${r ? ' is-running' : ''}`}>
                {r ? (
                    <>
                        <div className="g2p-sub">{r.label} gießt</div>
                        <div className="g2p-a-hero-time">{fmtClock(r.remainingSec)}</div>
                        <ProgressBar fraction={fraction(m)} />
                        <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                            Stoppen
                        </button>
                    </>
                ) : (
                    <>
                        <div className="g2p-a-hero-title" style={{ color: 'var(--text-secondary)' }}>
                            <Droplets size={20} /> Bereit
                        </div>
                        <div className="g2p-sub">{idleLine(m)}</div>
                    </>
                )}
            </div>

            <div className="g2p-grid2">
                <Tile label="Verdunstung heute" value={fmtNum(m.weather.etpToday, 2)} unit="mm" extra={<EtpTrend m={m} />} sub={`gestern ${fmtMm(m.weather.etpYesterday, 2)}`} />
                <Tile label="Regen heute" value={fmtNum(m.weather.rainToday)} unit="mm" sub={`morgen ${fmtMm(m.weather.rainTomorrow)}`} />
            </div>

            <Caption
                right={
                    <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                        <Settings2 size={16} />
                    </button>
                }
            >
                Kreise
            </Caption>
            <div className="g2p-grid2">
                {m.circles.map((c) => {
                    const isRun = r?.name === c.name;
                    return (
                        <div
                            key={c.name}
                            role="button"
                            tabIndex={0}
                            className={`g2p-card g2p-e-tile${isRun ? ' is-running' : ''}`}
                            onClick={() => setSheetFor(c.name)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') setSheetFor(c.name);
                            }}
                        >
                            <div className="g2p-e-tile-head">
                                <span style={{ minWidth: 0 }}>
                                    <span className="g2p-title" style={{ display: 'block' }}>{c.label}</span>
                                    <span className="g2p-hint">{modeText(c)}</span>
                                </span>
                                {isRun ? (
                                    <RoundBtn kind="stop" onClick={m.stop} label="Stoppen" />
                                ) : (
                                    <RoundBtn kind="play" onClick={() => m.start(c.name, 10)} disabled={r !== null} label={`${c.label} 10 min gießen`} />
                                )}
                            </div>
                            <div style={{ flex: 1 }} />
                            {isRun ? (
                                <div className="g2p-value g2p-accent">{fmtClock(r.remainingSec)}</div>
                            ) : c.mode === 'schedule' ? (
                                <div className="g2p-value" style={{ fontSize: 16 }}>{c.plan.next ?? 'kein Termin'}</div>
                            ) : (
                                <div className="g2p-value">
                                    {c.moisture === null ? '—' : Math.round(c.moisture)} <span className="g2p-unit">% Restfeuchte</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {sheetCircle && (
                <PreviewSheet title={sheetCircle.label} subtitle={modeText(sheetCircle)} onClose={() => setSheetFor(null)}>
                    <CircleSheetBody circle={sheetCircle} model={m} />
                </PreviewSheet>
            )}
        </>
    );
}

// ═══ F: Ruhig ═══════════════════════════════════════════════════════════════

function FItem({ c, m }: { c: G2Circle; m: G2Model }) {
    const [manual, setManual] = useState(false);
    const isRun = m.running?.name === c.name;
    const isSchedule = c.mode === 'schedule';
    return (
        <div className="g2p-f-item">
            <div className="g2p-row" style={{ minHeight: 56 }}>
                <div className="g2p-row-main">
                    <span className="g2p-title">{c.label}</span>
                    <span className="g2p-sub">
                        {isRun
                            ? `gießt · noch ${fmtClock(m.running!.remainingSec)}`
                            : isSchedule
                              ? `${daysText(c.plan.days)}${c.plan.time ? `, ${c.plan.time}` : ''}`
                              : `nach Verdunstung · ${c.moisture === null ? '—' : `${Math.round(c.moisture)} %`}`}
                    </span>
                </div>
                <span className="g2p-hint">Zeitplan</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={isSchedule}
                    className={`g2p-f-switch${isSchedule ? ' is-on' : ''}`}
                    onClick={() => m.setMode(c.name, isSchedule ? 'evaporation' : 'schedule')}
                    aria-label="Zeitplan statt Verdunstung"
                >
                    <span className="g2p-f-switch-knob" />
                </button>
            </div>
            <div className="g2p-f-manual">
                {isRun ? (
                    <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                        Stoppen
                    </button>
                ) : manual ? (
                    <ManualRow circle={c} model={m} compact />
                ) : (
                    <button type="button" className="g2p-textbtn" onClick={() => setManual(true)}>
                        Jetzt gießen …
                    </button>
                )}
            </div>
        </div>
    );
}

export function VariantF({ model: m }: VariantProps) {
    const r = m.running;
    return (
        <>
            <div className="g2p-card g2p-f-hero">
                {r ? (
                    <>
                        <span className="g2p-f-kicker">Läuft · {r.label}</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span className="g2p-f-big g2p-accent">{fmtClock(r.remainingSec)}</span>
                            <button type="button" className="g2p-textbtn g2p-textbtn--danger" onClick={m.stop}>
                                Stoppen
                            </button>
                        </div>
                        <ProgressBar fraction={fraction(m)} />
                    </>
                ) : m.nextRun ? (
                    <>
                        <span className="g2p-f-kicker">Nächster Lauf</span>
                        <span className="g2p-f-big">{m.nextRun.text}</span>
                        <span className="g2p-sub">{m.nextRun.circle.label}</span>
                    </>
                ) : (
                    <>
                        <span className="g2p-f-kicker">Zuletzt gegossen</span>
                        <span className="g2p-f-big">{m.lastRun ? fmtLastOn(m.lastRun.lastOn).replace(' Uhr', '') : '—'}</span>
                        <span className="g2p-sub">
                            {m.lastRun ? `${m.lastRun.label} · ${fmtRunTime(m.lastRun.lastRunningTime)}` : ''}
                        </span>
                    </>
                )}
                <div className="g2p-f-foot">
                    <span className="g2p-chip">
                        <Sun size={14} /> {fmtMm(m.weather.etpToday, 2)} verdunstet <EtpTrend m={m} />
                    </span>
                    <span className="g2p-chip">
                        <CloudRain size={14} /> {fmtMm(m.weather.rainToday)} Regen
                    </span>
                    <span className="g2p-chip">
                        <Umbrella size={14} /> morgen {fmtMm(m.weather.rainTomorrow)}
                    </span>
                </div>
            </div>

            <Caption
                right={
                    <button type="button" className="g2p-ico-btn" onClick={m.openSettings} aria-label="Einstellungen">
                        <Settings2 size={16} />
                    </button>
                }
            >
                Kreise
            </Caption>
            <div className="g2p-card">
                {m.circles.map((c) => (
                    <FItem key={c.name} c={c} m={m} />
                ))}
            </div>
        </>
    );
}

export const VARIANTS = [
    { key: 'A', name: 'Heizung-Linie', C: VariantA },
    { key: 'B', name: 'Listen-Linie', C: VariantB },
    { key: 'C', name: 'Ringe', C: VariantC },
    { key: 'D', name: 'Zeitleiste', C: VariantD },
    { key: 'E', name: 'Kacheln', C: VariantE },
    { key: 'F', name: 'Ruhig', C: VariantF },
] as const;
