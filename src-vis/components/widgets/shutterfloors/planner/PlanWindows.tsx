/**
 * Rolllaeden-Planer: zwei Kacheln „Zeitplan" und „Szenen", jede oeffnet ihr
 * eigenes Fenster (Feature 23, Ueberarbeitung 31.10.–02.11.2026, Entwurf 21).
 * Ersetzt die Kachel mit Wischen und das Popup mit den drei Reitern.
 *
 * - Zeitplan: naechste Fahrt gross mit „Heute aussetzen" / „Plan aus",
 *   darunter alle Zeitpunkte. Feiertagsregel hinter dem Zahnrad oben rechts.
 * - Szenen: grosse Knoepfe, Antippen faehrt sofort, getrennt nach Favoriten
 *   und Weiteren. Der Stift oben rechts schaltet aufs Bearbeiten.
 * - Die Editoren (Szene/Zeitpunkt) kommen aus editors.tsx, Loeschen und
 *   Speichern stehen dort als Symbole im Fensterkopf.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, Check, Layers, Pencil, Play, Plus, Settings } from 'lucide-react';
import {
    dayLabel,
    fmtDate,
    hhmm,
    nextHoliday,
    triggerMinutes,
    WD_SHORT,
    type HolidayMode,
    type Occurrence,
    type PlanDevice,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type Scene,
} from './planModel';
import { Caption, closedWord, DayLetters, SceneGlyph, Seg, Toggle } from './parts';
import { PlanSheet, type SheetView } from './editors';

export type Tab = 'plan' | 'scenes';
/** Eigene Kacheln statt der zwei Standard-Kacheln (nur Entwurfs-Umschalter
 *  der Dev-Vorschau, Runde 31–40). Ohne Angabe bleibt alles wie gehabt. */
export type TilesRender = (m: PlanModel, open: (t: Tab) => void) => ReactNode;
type W = { m: PlanModel; setView: (v: SheetView) => void };
type Next = { date: Date; occ: Occurrence };

// ── Texte ──────────────────────────────────────────────────────────────

export function statusText(m: PlanModel): string {
    if (!m.master) return 'Plan aus';
    if (m.pausedToday) return 'heute ausgesetzt';
    return 'Plan aktiv';
}

function emptyText(m: PlanModel): string {
    if (!m.master) return 'Zeitplan ist ausgeschaltet.';
    return m.entries.length ? 'Nichts geplant.' : 'Noch keine Zeitpunkte.';
}

/** Beteiligte Antriebe eines Ziels in der Reihenfolge der Etagenliste. */
function membersOf(m: PlanModel, tg: PlanTarget): { dev: PlanDevice; closed: number }[] {
    if (tg.kind === 'device') {
        const dev = m.deviceOf(tg.key);
        return dev ? [{ dev, closed: tg.closed }] : [];
    }
    const s = m.sceneOf(tg.sceneId);
    if (!s) return [];
    return m.devices.flatMap((dev) => {
        const t = s.targets.find((x) => x.key === dev.key);
        return t ? [{ dev, closed: t.closed }] : [];
    });
}

/** „ganzes Erdgeschoss, Büro Maxi, Mika +2" – volle Etagen zusammengefasst. */
export function namesLine(m: PlanModel, tg: PlanTarget, max = 3): string {
    if (tg.kind === 'device') return `auf ${closedWord(tg.closed)}`;
    const mem = membersOf(m, tg);
    if (mem.length && mem.length === m.devices.length) return `alle ${mem.length} Rollläden`;
    const parts: string[] = [];
    m.floors.forEach((f) => {
        const onFloor = m.devices.filter((d) => d.floor === f);
        const inScene = mem.filter((x) => x.dev.floor === f);
        if (!inScene.length) return;
        if (inScene.length === onFloor.length) parts.push(`ganzes ${f}`);
        else inScene.forEach((x) => parts.push(x.dev.label));
    });
    return parts.slice(0, max).join(', ') + (parts.length > max ? ` +${parts.length - max}` : '');
}

function trig(e: PlanEntry): string {
    if (e.trigger.kind === 'time') return e.trigger.time;
    const base = e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang';
    const o = e.trigger.offset;
    return o === 0 ? base : `${base} ${o > 0 ? '+' : '−'}${Math.abs(o)} min`;
}

export function nextRun(m: PlanModel): Next | null {
    return m.upcoming(1)[0] ?? null;
}

export function countdown(m: PlanModel, n: Next): string {
    const t = new Date(n.date.getFullYear(), n.date.getMonth(), n.date.getDate(), 0, n.occ.min);
    const diff = Math.max(0, Math.round((t.getTime() - m.now.getTime()) / 60000));
    if (diff < 60) return `in ${diff} min`;
    const h = Math.floor(diff / 60);
    const r = diff % 60;
    if (h < 24) return `in ${h} Std${r ? ` ${r} min` : ''}`;
    return dayLabel(n.date, m.today);
}

// ── Kachel ─────────────────────────────────────────────────────────────

function Tiles({ m, open }: { m: PlanModel; open: (t: Tab) => void }) {
    const n = nextRun(m);
    return (
        <div className="rpp-two">
            <button type="button" className="rpp-card rpp-two-btn" onClick={() => open('plan')}>
                <CalendarClock size={22} className="rpp-two-icon" />
                <span className="rpp-strong">Zeitplan</span>
                <span className="rpp-sub">{statusText(m)}</span>
                <span className="rpp-sub rpp-ellipsis">
                    {n ? `nächste ${dayLabel(n.date, m.today)} ${hhmm(n.occ.min)}` : '–'}
                </span>
            </button>
            <button type="button" className="rpp-card rpp-two-btn" onClick={() => open('scenes')}>
                <Layers size={22} className="rpp-two-icon" />
                <span className="rpp-strong">Szenen</span>
                <span className="rpp-sub">{m.scenes.length} angelegt</span>
                <span className="rpp-sub rpp-ellipsis">antippen zum Fahren</span>
            </button>
        </div>
    );
}

// ── Zeitplan-Fenster ───────────────────────────────────────────────────

function EntryRow({ m, e, setView }: W & { e: PlanEntry }) {
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
            <Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
        </div>
    );
}

function PlanHome({ m, setView }: W) {
    const n = nextRun(m);
    const sun = m.sunFor(m.today);
    const entries = [...m.entries].sort(
        (a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min,
    );
    return (
        <>
            <div className="rpp-card rpp-hero">
                <span className="rpp-hero-label">Als Nächstes</span>
                {n ? (
                    <button
                        type="button"
                        className="rpp-hero-main"
                        onClick={() => setView({ v: 'entry', id: n.occ.entry.id })}
                    >
                        <span className="rpp-big">{hhmm(n.occ.min)}</span>
                        <span className="rpp-hero-text">
                            <span className="rpp-strong rpp-ellipsis">{m.targetName(n.occ.entry.target)}</span>
                            <span className="rpp-mini">
                                {countdown(m, n)} · {namesLine(m, n.occ.entry.target, 2)}
                            </span>
                        </span>
                    </button>
                ) : (
                    <span className="rpp-sub">{emptyText(m)}</span>
                )}
                <div className="rpp-hero-actions">
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
            <div className="rpp-card">
                {entries.length === 0 && <div className="rpp-empty">Noch keine Zeitpunkte.</div>}
                {entries.map((e) => (
                    <EntryRow key={e.id} m={m} e={e} setView={setView} />
                ))}
                <button
                    type="button"
                    className="rpp-row rpp-row--tap rpp-row--add"
                    onClick={() => setView({ v: 'entry', id: null })}
                >
                    <Plus size={16} /> Zeitpunkt hinzufügen
                </button>
            </div>
        </>
    );
}

/** Unterseite hinter dem Zahnrad. */
function PlanSettings({ m }: { m: PlanModel }) {
    const nh = nextHoliday(m.today);
    const sun = m.sunFor(m.today);
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
            <span className="rpp-hint">
                Sonne heute{sun.fromPi ? '' : ' (gerechnet)'} ↑ {hhmm(sun.sunrise)} · ↓ {hhmm(sun.sunset)}
            </span>
        </div>
    );
}

// ── Szenen-Fenster ─────────────────────────────────────────────────────

/** Antippen faehrt sofort; im Bearbeiten-Modus oeffnet es den Editor. */
function SceneButtons({ m, setView, edit, list, add }: W & { edit: boolean; list: Scene[]; add: boolean }) {
    const [flash, setFlash] = useState<string | null>(null);
    return (
        <div className="rpp-qtiles">
            {list.map((s) => (
                <button
                    key={s.id}
                    type="button"
                    className={`rpp-qtile${flash === s.id ? ' is-flash' : ''}${edit ? ' rpp-qtile-edit' : ''}`}
                    onClick={() => {
                        if (edit) return setView({ v: 'scene', id: s.id });
                        m.runScene(s.id);
                        setFlash(s.id);
                        window.setTimeout(() => setFlash((f) => (f === s.id ? null : f)), 900);
                    }}
                >
                    <span className="rpp-qtile-top">
                        <SceneGlyph icon={s.icon} />
                        {edit ? (
                            <Pencil size={13} className="rpp-qtile-play" />
                        ) : (
                            <Play size={12} className="rpp-qtile-play" />
                        )}
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

function ScenesHome({ m, setView, edit }: W & { edit: boolean }) {
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
            <SceneButtons m={m} setView={setView} edit={edit} list={rest} add />
            {!m.scenes.length && !edit && (
                <div className="rpp-empty rpp-center">Noch keine Szenen – über den Stift anlegen.</div>
            )}
        </>
    );
}

// ── Fenster ────────────────────────────────────────────────────────────

function HeadBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className="rpp-back rpp-head-btn" onClick={onClick} aria-label={label} title={label}>
            {children}
        </button>
    );
}

export function PlanWindows({ model: m, renderTiles }: { model: PlanModel; renderTiles?: TilesRender }) {
    const [tab, setTab] = useState<Tab | null>(null);
    const [seq, setSeq] = useState(0);
    const [view, setView] = useState<SheetView>({ v: 'home' });
    const [opts, setOpts] = useState(false);
    const [edit, setEdit] = useState(false);
    useEffect(() => {
        setOpts(false);
        setEdit(false);
    }, [seq]);
    const open = (t: Tab) => {
        setSeq((n) => n + 1);
        setView({ v: 'home' });
        setTab(t);
    };

    let title = 'Zeitplan';
    let subtitle = statusText(m);
    let home: ReactNode;
    let headerRight: ReactNode = null;
    if (tab === 'scenes') {
        title = 'Szenen';
        subtitle = `${m.scenes.length} Szenen`;
        home = <ScenesHome m={m} setView={setView} edit={edit} />;
        headerRight = (
            <HeadBtn label={edit ? 'Fertig' : 'Szenen bearbeiten'} onClick={() => setEdit(!edit)}>
                {edit ? <Check size={20} /> : <Pencil size={18} />}
            </HeadBtn>
        );
    } else if (opts) {
        title = 'Einstellungen';
        subtitle = 'Zeitplan';
        home = <PlanSettings m={m} />;
    } else {
        home = <PlanHome m={m} setView={setView} />;
        headerRight = (
            <HeadBtn label="Einstellungen" onClick={() => setOpts(true)}>
                <Settings size={19} />
            </HeadBtn>
        );
    }

    return (
        <>
            {renderTiles ? renderTiles(m, open) : <Tiles m={m} open={open} />}
            {tab && (
                <PlanSheet
                    key={seq}
                    title={title}
                    subtitle={subtitle}
                    view={view}
                    setView={setView}
                    onClose={() => setTab(null)}
                    model={m}
                    headerRight={headerRight}
                    onHomeBack={tab === 'plan' && opts ? () => setOpts(false) : undefined}
                    home={<div className="rpp-home">{home}</div>}
                />
            )}
        </>
    );
}
