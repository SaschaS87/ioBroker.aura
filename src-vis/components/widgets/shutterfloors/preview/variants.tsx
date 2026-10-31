/**
 * Zehn Entwuerfe fuer die Planer-Kachel ohne Wischen (Runde 31.10.2026).
 * Alle nutzen dasselbe PlanModel und dasselbe Popup wie die Produktion;
 * nur die Kachel selbst unterscheidet sich.
 */
import { useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Clock, Layers, Play } from 'lucide-react';
import { addDays, dayLabel, hhmm, WD_SHORT, weekdayOf, type Occurrence, type PlanModel, type Scene } from '../planner/planModel';
import { DayTrack, OccRow, PlayBtn, SceneGlyph, Seg, TrackScale } from '../planner/parts';
import { dayHead, emptyText, isPast, namesLine, statusText, type Sheet } from '../planner/PlanPopup';

type P = { m: PlanModel; sh: Sheet };

// ── gemeinsame Kleinteile ──────────────────────────────────────────────

/** Favoriten zuerst; gibt es keine, alle Szenen. */
function quickScenes(m: PlanModel, max = 6): Scene[] {
    const fav = m.scenes.filter((s) => s.favorite);
    return (fav.length ? fav : m.scenes).slice(0, max);
}

function next(m: PlanModel): { date: Date; occ: Occurrence } | null {
    return m.upcoming(1)[0] ?? null;
}

function whenText(m: PlanModel, n: { date: Date; occ: Occurrence }) {
    return `${dayLabel(n.date, m.today)} ${hhmm(n.occ.min)}`;
}

function countdown(m: PlanModel, n: { date: Date; occ: Occurrence }): string {
    const t = new Date(n.date.getFullYear(), n.date.getMonth(), n.date.getDate(), 0, n.occ.min);
    const diff = Math.max(0, Math.round((t.getTime() - m.now.getTime()) / 60000));
    if (diff < 60) return `in ${diff} min`;
    const h = Math.floor(diff / 60);
    const r = diff % 60;
    if (h < 24) return `in ${h} Std${r ? ` ${r} min` : ''}`;
    return `${dayLabel(n.date, m.today)}`;
}

function useFlash() {
    const [flash, setFlash] = useState<string | null>(null);
    return {
        flash,
        fire: (id: string) => {
            setFlash(id);
            window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 900);
        },
    };
}

/** Szene als Knopf: Antippen faehrt sofort. */
function SceneTiles({ m, sh, cols = 2, max = 6 }: P & { cols?: 2 | 3; max?: number }) {
    const { flash, fire } = useFlash();
    const list = quickScenes(m, max);
    if (!list.length) return <div className="rpp-empty rpp-center">Noch keine Szenen – über „Planen" anlegen.</div>;
    return (
        <div className={`rpp-qtiles${cols === 3 ? ' rpp-qtiles--3' : ''}`}>
            {list.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    className={`rpp-qtile${flash === s.id ? ' is-flash' : ''}`}
                    onClick={() => {
                        m.runScene(s.id);
                        fire(s.id);
                    }}
                >
                    <span className="rpp-qtile-top">
                        <SceneGlyph icon={s.icon} />
                        {cols === 2 && <Play size={12} className="rpp-qtile-play" />}
                    </span>
                    <span className="rpp-qtile-name">{s.name}</span>
                    {cols === 2 && <span className="rpp-qtile-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}</span>}
                </button>
            ))}
            {m.scenes.length > list.length && (
                <button type="button" className="rpp-qtile rpp-qtile--more" onClick={() => sh.show({ v: 'home' }, 'scenes')}>
                    <span className="rpp-qtile-more-n">{m.scenes.length}</span>
                    <span className="rpp-qtile-sub">alle Szenen</span>
                </button>
            )}
        </div>
    );
}

/** Szene als Pille (kleiner als Kachel), umbrechend statt seitlich scrollend. */
function SceneChips({ m, sh, max = 8 }: P & { max?: number }) {
    const { flash, fire } = useFlash();
    const list = quickScenes(m, max);
    return (
        <div className="pv-chips">
            {list.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    className={`pv-chip${flash === s.id ? ' is-flash' : ''}`}
                    onClick={() => {
                        m.runScene(s.id);
                        fire(s.id);
                    }}
                >
                    <SceneGlyph icon={s.icon} size={15} />
                    {s.name}
                </button>
            ))}
            {m.scenes.length > list.length && (
                <button type="button" className="pv-chip pv-chip--more" onClick={() => sh.show({ v: 'home' }, 'scenes')}>
                    alle {m.scenes.length}
                </button>
            )}
            {!list.length && <span className="rpp-sub">Noch keine Szenen</span>}
        </div>
    );
}

function TodayRows({ m, sh, max = 4 }: P & { max?: number }) {
    const occ = m.occurrences(m.today);
    const shown = occ.slice(0, max);
    return (
        <>
            {occ.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, m.today)}</div>}
            {shown.map((o) => (
                <OccRow key={o.entry.id} model={m} occ={o} past={isPast(m, m.today, o)} onClick={() => sh.show({ v: 'entry', id: o.entry.id })} />
            ))}
            {occ.length > shown.length && (
                <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                    +{occ.length - shown.length} weitere heute
                </button>
            )}
        </>
    );
}

/** Kopfzeile im Stil der Etagenköpfe: Titel links, Zusatz rechts. */
function Cap({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="pv-cap">
            <span className="pv-cap-text">{children}</span>
            {right && <span className="pv-cap-right">{right}</span>}
        </div>
    );
}

function Planen({ sh, tab }: { sh: Sheet; tab?: 'plan' | 'scenes' }) {
    return (
        <button type="button" className="rpp-textbtn rpp-textbtn--sm" onClick={() => sh.show({ v: 'home' }, tab ?? null)}>
            Planen
        </button>
    );
}

function Foot({ m, sh }: P) {
    return (
        <div className="pv-foot">
            <span className={`pv-status${m.master && !m.pausedToday ? '' : ' is-off'}`}>{statusText(m)}</span>
            <Planen sh={sh} />
        </div>
    );
}

// ── 1 Untereinander ────────────────────────────────────────────────────

function V1({ m, sh }: P) {
    const h = dayHead(m, m.today);
    return (
        <div className="rpp-card">
            <Cap right={h.sub.split(' · ').slice(1).join(' · ')}>Heute{h.hol ? ` · ${h.hol}` : ''}</Cap>
            <TodayRows m={m} sh={sh} max={3} />
            <Cap>Szenen</Cap>
            <SceneTiles m={m} sh={sh} />
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 2 Reiter zum Antippen ──────────────────────────────────────────────

function V2({ m, sh }: P) {
    const [tab, setTab] = useState<'plan' | 'scenes'>('plan');
    return (
        <div className="rpp-card">
            <div className="pv-pad">
                <Seg
                    value={tab}
                    onChange={setTab}
                    size="sm"
                    options={[
                        { value: 'plan', label: 'Heute' },
                        { value: 'scenes', label: 'Szenen' },
                    ]}
                />
            </div>
            {tab === 'plan' ? <TodayRows m={m} sh={sh} /> : <SceneTiles m={m} sh={sh} />}
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 3 Nebeneinander ────────────────────────────────────────────────────

function V3({ m, sh }: P) {
    const up = m.upcoming(3);
    const { flash, fire } = useFlash();
    return (
        <div className="rpp-card">
            <div className="pv-split">
                <button type="button" className="pv-split-left" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                    <span className="pv-label">Als Nächstes</span>
                    {up.length === 0 && <span className="rpp-sub">{emptyText(m, m.today)}</span>}
                    {up[0] && (
                        <>
                            <span className="pv-big">{hhmm(up[0].occ.min)}</span>
                            <span className="pv-strong rpp-ellipsis">{m.targetName(up[0].occ.entry.target)}</span>
                            <span className="rpp-sub">{dayLabel(up[0].date, m.today)}</span>
                        </>
                    )}
                    {up.slice(1).map((u) => (
                        <span key={`${u.date.toDateString()}-${u.occ.entry.id}`} className="pv-mini rpp-ellipsis">
                            {whenText(m, { date: u.date, occ: u.occ })} · {m.targetName(u.occ.entry.target)}
                        </span>
                    ))}
                </button>
                <div className="pv-split-right">
                    <span className="pv-label">Szenen</span>
                    {quickScenes(m, 4).map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`pv-stackbtn${flash === s.id ? ' is-flash' : ''}`}
                            onClick={() => {
                                m.runScene(s.id);
                                fire(s.id);
                            }}
                        >
                            <SceneGlyph icon={s.icon} size={15} />
                            <span className="rpp-ellipsis">{s.name}</span>
                        </button>
                    ))}
                    {m.scenes.length > 4 && (
                        <button type="button" className="rpp-textbtn rpp-textbtn--sm" onClick={() => sh.show({ v: 'home' }, 'scenes')}>
                            alle {m.scenes.length}
                        </button>
                    )}
                </div>
            </div>
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 4 Szenen zuerst, Plan als Fußzeile ─────────────────────────────────

function V4({ m, sh }: P) {
    const n = next(m);
    return (
        <div className="rpp-card">
            <Cap right={<Planen sh={sh} tab="scenes" />}>Szenen</Cap>
            <SceneTiles m={m} sh={sh} />
            <button type="button" className="pv-planline" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                <Clock size={16} className="pv-planline-icon" />
                <span className="rpp-ellipsis">
                    {n ? (
                        <>
                            Nächste Fahrt <b>{whenText(m, n)}</b> · {m.targetName(n.occ.entry.target)}
                        </>
                    ) : (
                        statusText(m)
                    )}
                </span>
                <ChevronRight size={16} className="rpp-chev" />
            </button>
        </div>
    );
}

// ── 5 Nächste Fahrt groß ───────────────────────────────────────────────

function V5({ m, sh }: P) {
    const n = next(m);
    return (
        <div className="rpp-card">
            <div className="pv-hero">
                <span className="pv-label">{n ? `Nächste Fahrt ${countdown(m, n)}` : statusText(m)}</span>
                {n ? (
                    <button type="button" className="pv-hero-main" onClick={() => sh.show({ v: 'entry', id: n.occ.entry.id })}>
                        <span className="pv-big">{hhmm(n.occ.min)}</span>
                        <span className="pv-hero-text">
                            <span className="pv-strong rpp-ellipsis">{m.targetName(n.occ.entry.target)}</span>
                            <span className="rpp-sub rpp-ellipsis">
                                {dayLabel(n.date, m.today)} · {namesLine(m, n.occ.entry.target, 2)}
                            </span>
                        </span>
                    </button>
                ) : (
                    <span className="rpp-sub">{emptyText(m, m.today)}</span>
                )}
                {n && (
                    <div className="pv-hero-actions">
                        {n.occ.entry.target.kind === 'scene' && (
                            <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => n.occ.entry.target.kind === 'scene' && m.runScene(n.occ.entry.target.sceneId)}>
                                Jetzt schon fahren
                            </button>
                        )}
                        <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => m.setPausedToday(!m.pausedToday)}>
                            {m.pausedToday ? 'Heute wieder an' : 'Heute aussetzen'}
                        </button>
                    </div>
                )}
            </div>
            <Cap>Szenen</Cap>
            <div className="pv-pad">
                <SceneChips m={m} sh={sh} />
            </div>
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 6 Zeitstrahl ───────────────────────────────────────────────────────

function V6({ m, sh }: P) {
    const occ = m.occurrences(m.today);
    const h = dayHead(m, m.today);
    return (
        <div className="rpp-card">
            <Cap right={h.sub.split(' · ').slice(1).join(' · ')}>Heute</Cap>
            <button type="button" className="pv-trackbox" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                <DayTrack model={m} date={m.today} />
                <TrackScale />
                <span className="pv-tracklist">
                    {occ.length === 0 && <span className="rpp-sub">{emptyText(m, m.today)}</span>}
                    {occ.map((o) => (
                        <span key={o.entry.id} className={`pv-trackitem${isPast(m, m.today, o) ? ' is-past' : ''}`}>
                            <b>{hhmm(o.min)}</b> {m.targetName(o.entry.target)}
                        </span>
                    ))}
                </span>
            </button>
            <Cap>Szenen</Cap>
            <div className="pv-pad">
                <SceneChips m={m} sh={sh} />
            </div>
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 7 Klappbox ─────────────────────────────────────────────────────────

function V7({ m, sh }: P) {
    const [open, setOpen] = useState(false);
    const n = next(m);
    return (
        <div className="rpp-card">
            <button type="button" className="pv-klapp" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <CalendarClock size={18} className="pv-planline-icon" />
                <span className="pv-klapp-main">
                    <span className="pv-strong">Szenen & Zeitplan</span>
                    <span className="rpp-sub rpp-ellipsis">
                        {n ? `${statusText(m)} · nächste ${whenText(m, n)} ${m.targetName(n.occ.entry.target)}` : statusText(m)}
                    </span>
                </span>
                <ChevronDown size={18} className={`pv-klapp-chev${open ? ' is-open' : ''}`} />
            </button>
            {open && (
                <>
                    <Cap>Heute</Cap>
                    <TodayRows m={m} sh={sh} />
                    <Cap>Szenen</Cap>
                    <SceneTiles m={m} sh={sh} />
                    <Foot m={m} sh={sh} />
                </>
            )}
        </div>
    );
}

// ── 8 Eine Liste: Szene mit ihrer nächsten Zeit ────────────────────────

function V8({ m, sh }: P) {
    const rows = m.scenes
        .map((s) => {
            const runs = m
                .entriesOfScene(s.id)
                .filter((e) => e.enabled)
                .map((e) => m.nextRunOf(e))
                .filter((r): r is { date: Date; min: number } => !!r)
                .sort((a, b) => a.date.getTime() - b.date.getTime() || a.min - b.min);
            return { s, run: runs[0] ?? null };
        })
        .sort((a, b) => {
            if (a.run && b.run) return a.run.date.getTime() - b.run.date.getTime() || a.run.min - b.run.min;
            if (a.run) return -1;
            if (b.run) return 1;
            return Number(!!b.s.favorite) - Number(!!a.s.favorite);
        })
        .slice(0, 6);
    return (
        <div className="rpp-card">
            <Cap right={<Planen sh={sh} />}>Szenen & Zeiten</Cap>
            {rows.length === 0 && <div className="rpp-empty rpp-center">Noch keine Szenen – über „Planen" anlegen.</div>}
            {rows.map(({ s, run }) => (
                <div key={s.id} role="button" tabIndex={0} className="rpp-row rpp-row--tap" onClick={() => sh.show({ v: 'scene', id: s.id })}>
                    <span className="pv-when">
                        {run ? (
                            <>
                                <b>{hhmm(run.min)}</b>
                                <span>{dayLabel(run.date, m.today)}</span>
                            </>
                        ) : (
                            <span>Hand</span>
                        )}
                    </span>
                    <span className="rpp-row-main">
                        <span className="rpp-title">{s.name}</span>
                        <span className="rpp-sub rpp-ellipsis">{namesLine(m, { kind: 'scene', sceneId: s.id })}</span>
                    </span>
                    <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                </div>
            ))}
            <div className="pv-foot">
                <span className={`pv-status${m.master && !m.pausedToday ? '' : ' is-off'}`}>{statusText(m)}</span>
                {m.scenes.length > rows.length && (
                    <button type="button" className="rpp-textbtn rpp-textbtn--sm" onClick={() => sh.show({ v: 'home' }, 'scenes')}>
                        alle {m.scenes.length}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── 9 Wochenraster ─────────────────────────────────────────────────────

function V9({ m, sh }: P) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(m.today, i));
    return (
        <div className="rpp-card">
            <Cap right={<Planen sh={sh} tab="plan" />}>Diese Woche</Cap>
            <button type="button" className="pv-week" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                {days.map((d, i) => (
                    <span key={i} className={`rpp-week-row${i === 0 ? ' is-today' : ''}`}>
                        <span className="rpp-week-day">{WD_SHORT[weekdayOf(d)]}</span>
                        <DayTrack model={m} date={d} compact />
                    </span>
                ))}
                <span className="rpp-week-row">
                    <span />
                    <TrackScale />
                </span>
            </button>
            <Cap>Szenen</Cap>
            <div className="pv-pad">
                <SceneChips m={m} sh={sh} />
            </div>
            <Foot m={m} sh={sh} />
        </div>
    );
}

// ── 10 Zwei Einstiege ──────────────────────────────────────────────────

function V10({ m, sh }: P) {
    const n = next(m);
    return (
        <div className="pv-two">
            <button type="button" className="rpp-card pv-two-btn" onClick={() => sh.show({ v: 'home' }, 'plan')}>
                <CalendarClock size={22} className="pv-planline-icon" />
                <span className="pv-strong">Zeitplan</span>
                <span className="rpp-sub">{statusText(m)}</span>
                <span className="rpp-sub rpp-ellipsis">{n ? `nächste ${whenText(m, n)}` : '–'}</span>
            </button>
            <button type="button" className="rpp-card pv-two-btn" onClick={() => sh.show({ v: 'home' }, 'scenes')}>
                <Layers size={22} className="pv-planline-icon" />
                <span className="pv-strong">Szenen</span>
                <span className="rpp-sub">{m.scenes.length} angelegt</span>
                <span className="rpp-sub rpp-ellipsis">antippen zum Fahren</span>
            </button>
        </div>
    );
}

export const VARIANTS: { key: string; name: string; desc: string; C: (p: P) => ReactNode }[] = [
    { key: '1', name: 'Untereinander', desc: 'Heutige Fahrten oben, Szenen-Knöpfe darunter. Alles auf einen Blick, nichts zum Blättern.', C: V1 },
    { key: '2', name: 'Reiter zum Antippen', desc: 'Ein Umschalter „Heute | Szenen" oben in der Kachel. Wechseln nur per Tipp, Wischen ist abgeschaltet.', C: V2 },
    { key: '3', name: 'Nebeneinander', desc: 'Links die nächste Fahrt groß, rechts die Szenen als gestapelte Knöpfe.', C: V3 },
    { key: '4', name: 'Szenen zuerst', desc: 'Szenen-Knöpfe sind die Hauptsache, der Zeitplan ist nur eine Zeile darunter.', C: V4 },
    { key: '5', name: 'Nächste Fahrt groß', desc: 'Countdown zur nächsten Fahrt, dazu „Jetzt schon fahren" und „Heute aussetzen". Szenen als kleine Pillen.', C: V5 },
    { key: '6', name: 'Zeitstrahl', desc: 'Der Tag als Linie von 0 bis 24 Uhr mit Punkten je Fahrt, darunter die Szenen als Pillen.', C: V6 },
    { key: '7', name: 'Klappbox', desc: 'Eingeklappt nur eine Zeile mit der nächsten Fahrt. Aufgeklappt Fahrten und Szenen untereinander.', C: V7 },
    { key: '8', name: 'Eine Liste', desc: 'Jede Szene eine Zeile, links ihre nächste Uhrzeit, rechts der Fahren-Knopf. Zeitplan und Szenen verschmelzen.', C: V8 },
    { key: '9', name: 'Wochenraster', desc: 'Sieben Zeitstrahlen für die nächsten sieben Tage, darunter die Szenen als Pillen.', C: V9 },
    { key: '10', name: 'Zwei Einstiege', desc: 'Nur zwei Knöpfe „Zeitplan" und „Szenen", jeder öffnet sein eigenes Fenster. Die Kachel bleibt winzig.', C: V10 },
];
