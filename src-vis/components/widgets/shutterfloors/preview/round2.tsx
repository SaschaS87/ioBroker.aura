/**
 * Runde 2 (31.10.2026): Sascha hat Entwurf 10 „Zwei Einstiege" gewaehlt.
 * Jede der beiden Kacheln oeffnet jetzt ihr eigenes Fenster – eins fuer die
 * Szenen, eins fuer den Zeitplan – ohne die drei Reiter. Zehn Entwuerfe fuer
 * den Inhalt dieser Fenster. Die Editoren (Szene/Zeitpunkt) kommen
 * unveraendert aus editors.tsx, nur die Startansicht unterscheidet sich.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil, Plus, Settings } from 'lucide-react';
import {
    addDays,
    fmtDate,
    hhmm,
    nextHoliday,
    triggerMinutes,
    WD_SHORT,
    type HolidayMode,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type Scene,
} from '../planner/planModel';
import {
    Caption,
    DayLetters,
    DayTrack,
    EntryList,
    FavStar,
    isOpening,
    OccRow,
    PlayBtn,
    SceneGlyph,
    SceneList,
    Seg,
    Toggle,
    TrackScale,
} from '../planner/parts';
import { PlanSheet, type SheetView } from '../planner/editors';
import { dayHead, emptyText, isPast, namesLine, statusText, type Sheet } from '../planner/PlanPopup';
import { countdown, next, useFlash, V10, whenText } from './variants';

type W = { m: PlanModel; setView: (v: SheetView) => void };

// ── gemeinsame Kleinteile ──────────────────────────────────────────────

const HOLIDAY_WORD: Record<HolidayMode, string> = { sunday: 'wie Sonntag', normal: 'normal', skip: 'nichts fahren' };

function trig(e: PlanEntry): string {
    if (e.trigger.kind === 'time') return e.trigger.time;
    const base = e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang';
    const o = e.trigger.offset;
    return o === 0 ? base : `${base} ${o > 0 ? '+' : '−'}${Math.abs(o)} min`;
}

function sortedEntries(m: PlanModel, list: PlanEntry[] = m.entries): PlanEntry[] {
    const sun = m.sunFor(m.today);
    return [...list].sort((a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min);
}

function sceneTimes(m: PlanModel, id: string): string {
    const ent = m.entriesOfScene(id).filter((e) => e.enabled);
    return ent.length ? ent.map(trig).join(', ') : 'nur per Hand';
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={onClick}>
            <Plus size={16} /> {label}
        </button>
    );
}

/** Zeitpunkt-Zeile: Zeit · Ziel, darunter Wochentage und Namen. */
function EntryRow({ m, e, setView, toggle = true }: W & { e: PlanEntry; toggle?: boolean }) {
    return (
        <div
            className={`rpp-row rpp-row--tap rpp-row--tall${e.enabled ? '' : ' is-past'}`}
            role="button"
            tabIndex={0}
            onClick={() => setView({ v: 'entry', id: e.id })}
        >
            <span className="rpp-row-main">
                <span className="rpp-title">
                    {trig(e)}
                    <span className="rpp-dot-sep">·</span>
                    {m.targetName(e.target)}
                </span>
                <span className="rpp-sub rpp-inline">
                    <DayLetters days={e.days} dim={!e.enabled} />
                    <span className="rpp-ellipsis">{namesLine(m, e.target, 2)}</span>
                </span>
            </span>
            {toggle && <Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />}
        </div>
    );
}

function EntryCard({ m, setView, list, add = true }: W & { list?: PlanEntry[]; add?: boolean }) {
    const rows = sortedEntries(m, list);
    return (
        <div className="rpp-card">
            {rows.length === 0 && <div className="rpp-empty">Keine Zeitpunkte.</div>}
            {rows.map((e) => (
                <EntryRow key={e.id} m={m} e={e} setView={setView} />
            ))}
            {add && <AddRow label="Zeitpunkt hinzufügen" onClick={() => setView({ v: 'entry', id: null })} />}
        </div>
    );
}

/** Szenen-Zeile: Antippen = bearbeiten, Play = fahren. */
function SceneRow({ m, s, setView, star = true, times = true }: W & { s: Scene; star?: boolean; times?: boolean }) {
    const tg: PlanTarget = { kind: 'scene', sceneId: s.id };
    return (
        <div
            role="button"
            tabIndex={0}
            className="rpp-row rpp-row--tap rpp-row--tall"
            onClick={() => setView({ v: 'scene', id: s.id })}
        >
            <span className="rpp-row-icon">
                <SceneGlyph icon={s.icon} />
            </span>
            <span className="rpp-row-main">
                <span className="rpp-title">{s.name}</span>
                <span className="rpp-sub rpp-ellipsis">{namesLine(m, tg)}</span>
                {times && <span className="rpp-sub rpp-ellipsis">{sceneTimes(m, s.id)}</span>}
            </span>
            {star && (
                <FavStar
                    on={!!s.favorite}
                    onClick={() => m.toggleFavorite(s.id)}
                    label={s.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                />
            )}
            <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
        </div>
    );
}

function SceneCard({
    m,
    setView,
    list,
    add = true,
    star,
    times,
}: W & { list?: Scene[]; add?: boolean; star?: boolean; times?: boolean }) {
    const rows = list ?? m.scenes;
    return (
        <div className="rpp-card">
            {m.scenes.length === 0 && (
                <div className="rpp-empty">
                    Noch keine Szenen. Eine Szene fasst mehrere Rollläden mit ihrer Zielstellung zusammen.
                </div>
            )}
            {rows.map((s) => (
                <SceneRow key={s.id} m={m} s={s} setView={setView} star={star} times={times} />
            ))}
            {add && <AddRow label="Szene anlegen" onClick={() => setView({ v: 'scene', id: null })} />}
        </div>
    );
}

/** Szenen als Knoepfe: Antippen faehrt sofort, im Bearbeiten-Modus oeffnet es den Editor. */
function SceneButtons({ m, setView, edit, list, add = true }: W & { edit?: boolean; list?: Scene[]; add?: boolean }) {
    const { flash, fire } = useFlash();
    return (
        <div className="rpp-qtiles">
            {(list ?? m.scenes).map((s) => (
                <button
                    key={s.id}
                    type="button"
                    className={`rpp-qtile${flash === s.id ? ' is-flash' : ''}${edit ? ' pv-qtile-edit' : ''}`}
                    onClick={() => {
                        if (edit) return setView({ v: 'scene', id: s.id });
                        m.runScene(s.id);
                        fire(s.id);
                    }}
                >
                    <span className="rpp-qtile-top">
                        <SceneGlyph icon={s.icon} />
                        {edit && <Pencil size={13} className="rpp-qtile-play" />}
                    </span>
                    <span className="rpp-qtile-name">{s.name}</span>
                    <span className="rpp-qtile-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}</span>
                </button>
            ))}
            {edit && add && (
                <button
                    type="button"
                    className="rpp-qtile rpp-qtile--add"
                    onClick={() => setView({ v: 'scene', id: null })}
                >
                    <Plus size={18} />
                    <span className="rpp-qtile-sub">Neue Szene</span>
                </button>
            )}
        </div>
    );
}

function SceneChipsW({ m, list }: { m: PlanModel; list: Scene[] }) {
    const { flash, fire } = useFlash();
    if (!list.length) return null;
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
        </div>
    );
}

function favsOrAll(m: PlanModel) {
    const fav = m.scenes.filter((s) => s.favorite);
    return fav.length ? fav : m.scenes;
}

/** Hauptschalter + heute aussetzen. */
function Switches({ m }: { m: PlanModel }) {
    return (
        <div className="rpp-card">
            <div className="rpp-row">
                <span className="rpp-row-main">
                    <span className="rpp-title">Zeitplan aktiv</span>
                    <span className="rpp-sub">Hauptschalter für alle Zeitpunkte</span>
                </span>
                <Toggle on={m.master} onChange={m.setMaster} label="Zeitplan aktiv" />
            </div>
            <div className="rpp-row">
                <span className="rpp-row-main">
                    <span className="rpp-title">Heute aussetzen</span>
                    <span className="rpp-sub">Ab morgen läuft der Plan wieder</span>
                </span>
                <Toggle on={m.pausedToday} onChange={m.setPausedToday} label="Heute aussetzen" />
            </div>
        </div>
    );
}

function Holidays({ m, sun = false }: { m: PlanModel; sun?: boolean }) {
    const nh = nextHoliday(m.today);
    const s = m.sunFor(m.today);
    return (
        <div className="rpp-card rpp-pad">
            <span className="rpp-label">An Feiertagen</span>
            <Seg<HolidayMode>
                size="sm"
                value={m.holidayMode}
                options={[
                    { value: 'sunday', label: 'wie Sonntag' },
                    { value: 'normal', label: 'normal' },
                    { value: 'skip', label: 'nichts fahren' },
                ]}
                onChange={m.setHolidayMode}
            />
            <span className="rpp-hint">
                Nächster Feiertag: {WD_SHORT[(nh.date.getDay() + 6) % 7]} {fmtDate(nh.date)} · {nh.name}
            </span>
            {sun && (
                <span className="rpp-hint">
                    Sonne heute ↑ {hhmm(s.sunrise)} · ↓ {hhmm(s.sunset)}
                </span>
            )}
        </div>
    );
}

function EditBtn({ edit, setEdit }: { edit: boolean; setEdit: (v: boolean) => void }) {
    return (
        <button type="button" className="rpp-textbtn rpp-textbtn--sm" onClick={() => setEdit(!edit)}>
            {edit ? 'Fertig' : 'Bearbeiten'}
        </button>
    );
}

/** Zusatz neben dem Tagesnamen: Feiertag, sonst das Datum – nur wenn der Name nicht schon das Datum ist. */
function dayExtra(h: ReturnType<typeof dayHead>): string {
    const date = h.sub.split(' · ')[0];
    return h.hol ?? (h.title === date ? '' : date);
}

/** Ausfuehrungen der naechsten Tage, nach Tag gruppiert. */
function upcomingByDay(m: PlanModel, limit = 24) {
    const out: { date: Date; occ: ReturnType<PlanModel['occurrences']> }[] = [];
    m.upcoming(limit).forEach(({ date, occ }) => {
        const last = out[out.length - 1];
        if (last && last.date.toDateString() === date.toDateString()) last.occ.push(occ);
        else out.push({ date, occ: [occ] });
    });
    return out;
}

// ── 11 Schlicht ────────────────────────────────────────────────────────

function S11({ m, setView }: W) {
    return <SceneCard m={m} setView={setView} />;
}
function P11({ m, setView }: W) {
    return (
        <>
            <EntryCard m={m} setView={setView} />
            <Caption>Einstellungen</Caption>
            <Switches m={m} />
            <Holidays m={m} sun />
        </>
    );
}

// ── 12 Schalter oben ───────────────────────────────────────────────────

function S12({ m, setView }: W) {
    const fav = m.scenes.filter((s) => s.favorite);
    const rest = m.scenes.filter((s) => !s.favorite);
    return (
        <>
            {fav.length > 0 && (
                <>
                    <Caption>Favoriten · auf der Kachel</Caption>
                    <SceneCard m={m} setView={setView} list={fav} add={false} />
                </>
            )}
            <Caption>{fav.length ? 'Weitere' : 'Alle Szenen'}</Caption>
            <SceneCard m={m} setView={setView} list={rest.length || fav.length ? rest : m.scenes} />
        </>
    );
}
function P12({ m, setView }: W) {
    return (
        <>
            <Switches m={m} />
            <Caption>Zeitpunkte</Caption>
            <EntryCard m={m} setView={setView} />
            <Caption>Feiertage</Caption>
            <Holidays m={m} sun />
        </>
    );
}

// ── 13 Große Knöpfe ────────────────────────────────────────────────────

function S13({ m, setView }: W) {
    const [edit, setEdit] = useState(false);
    return (
        <>
            <Caption right={<EditBtn edit={edit} setEdit={setEdit} />}>
                {edit ? 'Zum Bearbeiten antippen' : 'Antippen zum Fahren'}
            </Caption>
            <SceneButtons m={m} setView={setView} edit={edit} />
            {!m.scenes.length && !edit && (
                <div className="rpp-empty rpp-center">Noch keine Szenen – über „Bearbeiten" anlegen.</div>
            )}
        </>
    );
}
function P13({ m, setView, holidays = true }: W & { holidays?: boolean }) {
    const n = next(m);
    return (
        <>
            <div className="rpp-card pv-hero">
                <span className="pv-label">Als Nächstes</span>
                {n ? (
                    <button
                        type="button"
                        className="pv-hero-main"
                        onClick={() => setView({ v: 'entry', id: n.occ.entry.id })}
                    >
                        <span className="pv-big">{hhmm(n.occ.min)}</span>
                        <span className="pv-hero-text">
                            <span className="pv-strong rpp-ellipsis">{m.targetName(n.occ.entry.target)}</span>
                            <span className="pv-mini">
                                {countdown(m, n)} · {namesLine(m, n.occ.entry.target, 2)}
                            </span>
                        </span>
                    </button>
                ) : (
                    <span className="rpp-sub">{emptyText(m, m.today)}</span>
                )}
                <div className="pv-hero-actions">
                    <button
                        type="button"
                        className={`rpp-btn rpp-btn--soft${m.pausedToday ? ' is-on' : ''}`}
                        onClick={() => m.setPausedToday(!m.pausedToday)}
                    >
                        {m.pausedToday ? 'Heute wieder an' : 'Heute aussetzen'}
                    </button>
                    <button
                        type="button"
                        className={`rpp-btn rpp-btn--soft${m.master ? '' : ' is-on'}`}
                        onClick={() => m.setMaster(!m.master)}
                    >
                        {m.master ? 'Plan aus' : 'Plan an'}
                    </button>
                </div>
            </div>
            <Caption>Alle Zeitpunkte</Caption>
            <EntryCard m={m} setView={setView} />
            {holidays && <Holidays m={m} />}
        </>
    );
}

// ── 14 Nach Tagen ──────────────────────────────────────────────────────

function S14({ m, setView }: W) {
    return (
        <>
            <Caption>Schnell fahren</Caption>
            <SceneChipsW m={m} list={favsOrAll(m)} />
            <Caption>Szenen bearbeiten</Caption>
            <SceneCard m={m} setView={setView} star times={false} />
        </>
    );
}
function P14({ m, setView }: W) {
    const days = upcomingByDay(m);
    return (
        <>
            <Switches m={m} />
            {days.length === 0 && (
                <div className="rpp-card">
                    <div className="rpp-empty">{emptyText(m, m.today)}</div>
                </div>
            )}
            {days.map((d) => {
                const h = dayHead(m, d.date);
                return (
                    <div key={d.date.toDateString()}>
                        <Caption right={<span className="rpp-sub">{dayExtra(h)}</span>}>{h.title}</Caption>
                        <div className="rpp-card">
                            {d.occ.map((o) => (
                                <OccRow
                                    key={o.entry.id}
                                    model={m}
                                    occ={o}
                                    past={isPast(m, d.date, o)}
                                    onClick={() => setView({ v: 'entry', id: o.entry.id })}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
            <div className="rpp-card">
                <AddRow label="Zeitpunkt hinzufügen" onClick={() => setView({ v: 'entry', id: null })} />
            </div>
            <Holidays m={m} />
        </>
    );
}

// ── 15 Nach Tageszeit ──────────────────────────────────────────────────

function S15({ m, setView }: W) {
    const up = m.scenes.filter((s) => isOpening(m, { kind: 'scene', sceneId: s.id }));
    const down = m.scenes.filter((s) => !isOpening(m, { kind: 'scene', sceneId: s.id }));
    return (
        <>
            {up.length > 0 && <Caption>Öffnen</Caption>}
            {up.length > 0 && <SceneCard m={m} setView={setView} list={up} add={false} />}
            {down.length > 0 && <Caption>Schließen</Caption>}
            {down.length > 0 && <SceneCard m={m} setView={setView} list={down} add={false} />}
            <div className="rpp-card">
                <AddRow label="Szene anlegen" onClick={() => setView({ v: 'scene', id: null })} />
            </div>
        </>
    );
}
function P15({ m, setView }: W) {
    const sun = m.sunFor(m.today);
    const morning = m.entries.filter((e) => triggerMinutes(e.trigger, sun).min < 12 * 60);
    const evening = m.entries.filter((e) => triggerMinutes(e.trigger, sun).min >= 12 * 60);
    return (
        <>
            <Caption right={<span className="rpp-sub">↑ {hhmm(sun.sunrise)}</span>}>Morgens</Caption>
            <EntryCard m={m} setView={setView} list={morning} add={false} />
            <Caption right={<span className="rpp-sub">↓ {hhmm(sun.sunset)}</span>}>Abends</Caption>
            <EntryCard m={m} setView={setView} list={evening} add={false} />
            <div className="rpp-card">
                <AddRow label="Zeitpunkt hinzufügen" onClick={() => setView({ v: 'entry', id: null })} />
            </div>
            <Caption>Einstellungen</Caption>
            <Switches m={m} />
            <Holidays m={m} />
        </>
    );
}

// ── 16 Woche ───────────────────────────────────────────────────────────

function P16({ m, setView }: W) {
    return (
        <>
            <Switches m={m} />
            <div className="rpp-card">
                {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(m.today, i);
                    const occ = m.occurrences(d);
                    const h = dayHead(m, d);
                    return (
                        <div key={i} className="pv-weekday">
                            <span className="pv-weekday-head">
                                <b>{h.title}</b>
                                <span className="rpp-sub">{dayExtra(h)}</span>
                            </span>
                            <span className="pv-weekday-list">
                                {occ.length === 0 && (
                                    <span className="rpp-sub">
                                        {emptyText(m, d) === 'Nichts geplant.' ? '–' : emptyText(m, d)}
                                    </span>
                                )}
                                {occ.map((o) => (
                                    <button
                                        key={o.entry.id}
                                        type="button"
                                        className={`pv-weekday-item${isPast(m, d, o) ? ' is-past' : ''}`}
                                        onClick={() => setView({ v: 'entry', id: o.entry.id })}
                                    >
                                        <b>{hhmm(o.min)}</b> {m.targetName(o.entry.target)}
                                    </button>
                                ))}
                            </span>
                        </div>
                    );
                })}
            </div>
            <Caption>Zeitpunkte</Caption>
            <EntryCard m={m} setView={setView} />
            <Holidays m={m} />
        </>
    );
}

// ── 17 Zeitstrahl ──────────────────────────────────────────────────────

function S17({ m, setView }: W) {
    return (
        <>
            <SceneChipsW m={m} list={m.scenes} />
            <Caption>Bearbeiten</Caption>
            <SceneCard m={m} setView={setView} />
        </>
    );
}
function P17({ m, setView }: W) {
    return (
        <>
            <div className="rpp-card rpp-pad pv-tracks">
                {Array.from({ length: 7 }, (_, i) => {
                    const d = addDays(m.today, i);
                    const h = dayHead(m, d);
                    return (
                        <div key={i} className="pv-trackrow">
                            <span className="pv-trackrow-label">
                                {i === 0 ? 'Heute' : `${WD_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}.`}
                                {h.hol ? ' ★' : ''}
                            </span>
                            <DayTrack model={m} date={d} compact onPick={(e) => setView({ v: 'entry', id: e.id })} />
                        </div>
                    );
                })}
                <div className="pv-trackrow">
                    <span className="pv-trackrow-label" />
                    <TrackScale />
                </div>
            </div>
            <EntryCard m={m} setView={setView} />
            <Switches m={m} />
            <Holidays m={m} />
        </>
    );
}

// ── 18 Nach Szene ──────────────────────────────────────────────────────

function S18({ m, setView }: W) {
    return (
        <div className="rpp-card">
            {m.scenes.map((s) => {
                const ent = sortedEntries(m, m.entriesOfScene(s.id));
                return (
                    <div key={s.id} className="pv-scenegroup">
                        <SceneRow m={m} s={s} setView={setView} times={false} />
                        <div className="pv-scenegroup-times">
                            {ent.map((e) => (
                                <button
                                    key={e.id}
                                    type="button"
                                    className={`pv-chip pv-chip--sm${e.enabled ? '' : ' is-off'}`}
                                    onClick={() => setView({ v: 'entry', id: e.id })}
                                >
                                    {trig(e)} · <DayLetters days={e.days} dim={!e.enabled} />
                                </button>
                            ))}
                            <button
                                type="button"
                                className="pv-chip pv-chip--sm pv-chip--more"
                                onClick={() =>
                                    setView({
                                        v: 'entry',
                                        id: null,
                                        preset: { target: { kind: 'scene', sceneId: s.id } },
                                    })
                                }
                            >
                                <Plus size={13} /> Zeit
                            </button>
                        </div>
                    </div>
                );
            })}
            <AddRow label="Szene anlegen" onClick={() => setView({ v: 'scene', id: null })} />
        </div>
    );
}
function P18({ m, setView }: W) {
    const used = m.scenes.filter((s) => m.entriesOfScene(s.id).length);
    const single = m.entries.filter((e) => e.target.kind === 'device');
    return (
        <>
            <Switches m={m} />
            {used.map((s) => (
                <div key={s.id}>
                    <Caption right={<PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />}>
                        {s.name}
                    </Caption>
                    <EntryCard m={m} setView={setView} list={m.entriesOfScene(s.id)} add={false} />
                </div>
            ))}
            {single.length > 0 && <Caption>Einzelne Rollläden</Caption>}
            {single.length > 0 && <EntryCard m={m} setView={setView} list={single} add={false} />}
            <div className="rpp-card">
                <AddRow label="Zeitpunkt hinzufügen" onClick={() => setView({ v: 'entry', id: null })} />
            </div>
            <Holidays m={m} />
        </>
    );
}

// ── 19 Bearbeiten-Modus ────────────────────────────────────────────────

function S19({ m, setView }: W) {
    const [edit, setEdit] = useState(false);
    const { flash, fire } = useFlash();
    if (edit) {
        return (
            <>
                <Caption right={<EditBtn edit setEdit={setEdit} />}>Bearbeiten</Caption>
                <SceneCard m={m} setView={setView} times={false} />
            </>
        );
    }
    return (
        <>
            <Caption right={<EditBtn edit={false} setEdit={setEdit} />}>Antippen zum Fahren</Caption>
            <div className="rpp-card">
                {m.scenes.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`rpp-row rpp-row--tap rpp-row--tall pv-runrow${flash === s.id ? ' is-flash' : ''}`}
                        onClick={() => {
                            m.runScene(s.id);
                            fire(s.id);
                        }}
                    >
                        <span className="rpp-row-icon">
                            <SceneGlyph icon={s.icon} />
                        </span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">{s.name}</span>
                            <span className="rpp-sub rpp-ellipsis">
                                {namesLine(m, { kind: 'scene', sceneId: s.id })}
                            </span>
                        </span>
                    </button>
                ))}
                {!m.scenes.length && <div className="rpp-empty">Noch keine Szenen – über „Bearbeiten" anlegen.</div>}
            </div>
        </>
    );
}
function P19({ m, setView }: W) {
    const [edit, setEdit] = useState(false);
    if (edit) {
        return (
            <>
                <Caption right={<EditBtn edit setEdit={setEdit} />}>Bearbeiten</Caption>
                <EntryCard m={m} setView={setView} />
                <Holidays m={m} sun />
            </>
        );
    }
    const days = upcomingByDay(m, 8);
    return (
        <>
            <div className="rpp-card">
                <div className="rpp-row">
                    <span className="rpp-row-main">
                        <span className="rpp-title">Zeitplan aktiv</span>
                        <span className="rpp-sub">Feiertage {HOLIDAY_WORD[m.holidayMode]}</span>
                    </span>
                    <Toggle on={m.master} onChange={m.setMaster} label="Zeitplan aktiv" />
                </div>
            </div>
            <Caption right={<EditBtn edit={false} setEdit={setEdit} />}>Als Nächstes</Caption>
            <div className="rpp-card">
                {days.length === 0 && <div className="rpp-empty">{emptyText(m, m.today)}</div>}
                {days.flatMap((d) =>
                    d.occ.map((o) => (
                        <OccRow
                            key={`${d.date.toDateString()}-${o.entry.id}`}
                            model={m}
                            occ={o}
                            past={isPast(m, d.date, o)}
                            showDate={d.date}
                        />
                    )),
                )}
            </div>
            <button
                type="button"
                className={`rpp-btn rpp-btn--soft${m.pausedToday ? ' is-on' : ''}`}
                onClick={() => m.setPausedToday(!m.pausedToday)}
            >
                {m.pausedToday ? 'Heute wieder an' : 'Heute aussetzen'}
            </button>
        </>
    );
}

// ── 20 Einstellungen zum Aufklappen ────────────────────────────────────

function S20({ m, setView }: W) {
    return <SceneList model={m} setView={setView} />;
}
function P20({ m, setView }: W) {
    const [open, setOpen] = useState(false);
    const n = next(m);
    return (
        <>
            <div className="rpp-card">
                <button type="button" className="pv-klapp" onClick={() => setOpen(!open)} aria-expanded={open}>
                    <span className="pv-klapp-main">
                        <span className={`pv-status${m.master && !m.pausedToday ? '' : ' is-off'}`}>
                            {statusText(m)}
                        </span>
                        <span className="rpp-sub rpp-ellipsis">
                            Feiertage {HOLIDAY_WORD[m.holidayMode]}
                            {n ? ` · nächste ${whenText(m, n)}` : ''}
                        </span>
                    </span>
                    <ChevronDown size={18} className={`pv-klapp-chev${open ? ' is-open' : ''}`} />
                </button>
            </div>
            {open && (
                <>
                    <Switches m={m} />
                    <Holidays m={m} sun />
                </>
            )}
            <EntryList model={m} setView={setView} />
        </>
    );
}

// ── 21 Wunsch aus 13 (01.11.2026) ──────────────────────────────────────
// Zeitplan wie 13, Feiertage hinter dem Zahnrad oben rechts. Szenen wie 13,
// Stift oben rechts zum Bearbeiten, getrennt nach Favoriten und Weiteren.

function S21({ m, setView, edit }: W & { edit: boolean }) {
    const fav = m.scenes.filter((s) => s.favorite);
    const rest = m.scenes.filter((s) => !s.favorite);
    return (
        <>
            {edit && (
                <div className="rpp-hint">
                    Szene antippen zum Bearbeiten. Ob sie Favorit ist, stellst du in der Szene ein.
                </div>
            )}
            {fav.length > 0 && <Caption>Favoriten</Caption>}
            {fav.length > 0 && <SceneButtons m={m} setView={setView} edit={edit} list={fav} add={false} />}
            {(rest.length > 0 || edit) && <Caption>{fav.length ? 'Weitere' : 'Szenen'}</Caption>}
            <SceneButtons m={m} setView={setView} edit={edit} list={rest} />
            {!m.scenes.length && !edit && (
                <div className="rpp-empty rpp-center">Noch keine Szenen – über den Stift anlegen.</div>
            )}
        </>
    );
}
function P21({ m, setView }: W) {
    return <P13 m={m} setView={setView} holidays={false} />;
}

function HeadBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className="rpp-back pv-headbtn" onClick={onClick} aria-label={label} title={label}>
            {children}
        </button>
    );
}

// ── Liste und Fenster ──────────────────────────────────────────────────

export const ROUND2: { key: string; name: string; desc: string; S: (p: W) => ReactNode; P: (p: W) => ReactNode }[] = [
    {
        key: '21',
        name: '13 nach Wunsch',
        desc: 'Zeitplan wie 13, die Feiertage liegen hinter dem Zahnrad oben rechts. Szenen wie 13 als große Knöpfe, getrennt nach Favoriten und Weiteren; der Stift oben rechts schaltet aufs Bearbeiten.',
        S: (p) => <S21 {...p} edit={false} />,
        P: P21,
    },
    {
        key: '11',
        name: 'Schlicht',
        desc: 'Szenen: eine Liste, antippen = bearbeiten, ▶ = fahren, Stern = Favorit. Zeitplan: alle Zeitpunkte mit Schalter, darunter die Einstellungen.',
        S: S11,
        P: P11,
    },
    {
        key: '12',
        name: 'Schalter oben',
        desc: 'Szenen: Favoriten (die auf der Kachel) oben, der Rest darunter. Zeitplan: Hauptschalter und „heute aussetzen" ganz oben, dann die Zeitpunkte, Feiertage unten.',
        S: S12,
        P: P12,
    },
    {
        key: '13',
        name: 'Große Knöpfe',
        desc: 'Szenen: große Knöpfe, antippen fährt sofort; „Bearbeiten" schaltet auf Ändern um. Zeitplan: die nächste Fahrt groß mit „Heute aussetzen", dann alle Zeitpunkte.',
        S: S13,
        P: P13,
    },
    {
        key: '14',
        name: 'Nach Tagen',
        desc: 'Szenen: oben Pillen zum schnellen Fahren, unten die Liste zum Bearbeiten. Zeitplan: was wann fährt, nach Heute, Morgen, … sortiert.',
        S: S14,
        P: P14,
    },
    {
        key: '15',
        name: 'Morgens / Abends',
        desc: 'Szenen getrennt nach Öffnen und Schließen. Zeitplan getrennt nach Morgens und Abends, mit Sonnenzeiten im Kopf.',
        S: S15,
        P: P15,
    },
    {
        key: '16',
        name: 'Woche',
        desc: 'Szenen: Liste wie 11. Zeitplan: die nächsten 7 Tage untereinander, je Tag die Uhrzeiten; Feiertage sind markiert. Darunter die Zeitpunkte zum Ändern.',
        S: S11,
        P: P16,
    },
    {
        key: '17',
        name: 'Zeitstrahl',
        desc: 'Szenen: alle als Pillen zum Fahren, darunter die Liste. Zeitplan: 7 Tages-Zeitstrahlen untereinander, ein Punkt antippen öffnet den Zeitpunkt.',
        S: S17,
        P: P17,
    },
    {
        key: '18',
        name: 'Nach Szene',
        desc: 'Szenen: jede Szene mit ihren Zeiten als Pillen, „+ Zeit" legt direkt einen Zeitpunkt an. Zeitplan: nach Szene gruppiert, ▶ im Kopf fährt sie.',
        S: S18,
        P: P18,
    },
    {
        key: '19',
        name: 'Bearbeiten-Modus',
        desc: 'Beide Fenster sind erst nur zum Benutzen: Szene antippen = fahren, Zeitplan = was als Nächstes kommt. Erst „Bearbeiten" zeigt Schalter, Anlegen und Feiertage.',
        S: S19,
        P: P19,
    },
    {
        key: '20',
        name: 'Einstellungen zum Aufklappen',
        desc: 'Szenen: die kompakte Liste von heute (Stern, ▶, Wochentage). Zeitplan: eine Statuszeile, die die Einstellungen aufklappt, darunter die kompakte Liste mit Wochentagen.',
        S: S20,
        P: P20,
    },
];

/** Kachel aus Entwurf 10 plus eigenes Fenster je Kachel. */
export function Round2({ m, sh, v }: { m: PlanModel; sh: Sheet; v: (typeof ROUND2)[number] }) {
    const isScenes = sh.tab === 'scenes';
    const wish = v.key === '21';
    const [opts, setOpts] = useState(false);
    const [edit, setEdit] = useState(false);
    useEffect(() => {
        setOpts(false);
        setEdit(false);
    }, [sh.seq]);
    let title = isScenes ? 'Szenen' : 'Zeitplan';
    let subtitle = isScenes ? `${m.scenes.length} Szenen` : statusText(m);
    let home: ReactNode;
    let headerRight: ReactNode = null;
    if (wish && !isScenes && opts) {
        title = 'Einstellungen';
        subtitle = 'Zeitplan';
        home = <Holidays m={m} sun />;
    } else if (wish && isScenes) {
        home = <S21 m={m} setView={sh.setView} edit={edit} />;
        headerRight = (
            <HeadBtn label={edit ? 'Fertig' : 'Szenen bearbeiten'} onClick={() => setEdit(!edit)}>
                {edit ? <Check size={20} /> : <Pencil size={18} />}
            </HeadBtn>
        );
    } else {
        const Home = isScenes ? v.S : v.P;
        home = <Home m={m} setView={sh.setView} />;
        if (wish)
            headerRight = (
                <HeadBtn label="Einstellungen" onClick={() => setOpts(true)}>
                    <Settings size={19} />
                </HeadBtn>
            );
    }
    return (
        <>
            <V10 m={m} sh={sh} />
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title={title}
                    subtitle={subtitle}
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={m}
                    headerRight={headerRight}
                    onHomeBack={wish && opts && !isScenes ? () => setOpts(false) : undefined}
                    home={<div className="rpp-home">{home}</div>}
                />
            )}
        </>
    );
}
