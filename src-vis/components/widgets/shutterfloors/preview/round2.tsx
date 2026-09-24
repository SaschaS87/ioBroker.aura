/**
 * Planer-Entwuerfe Runde 2 (nur Dev-Vorschau).
 *
 * Kachel F–K: Einstieg ueber der Etagenliste, Richtung B (Tagesliste) und
 * E (naechste Fahrten). Alle blaettern wie das Regen-Widget auf dem
 * Wetter-Tab (RainStationWidget): Pfeile links/rechts, Punkte unten –
 * zusaetzlich per Wischgeste.
 *
 * Popup L–N: das aufgeraeumte Popup aus A (Wochenplan / Szenen /
 * Einstellungen), drei Stufen, wie deutlich die beteiligten Rolllaeden
 * schon in der Liste zu sehen sind.
 */
import { useRef, useState, type ComponentType, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Pause, Plus } from 'lucide-react';
import {
    addDays,
    dayLabel,
    daysText,
    fmtDate,
    fmtDateLong,
    hhmm,
    holidayName,
    nextHoliday,
    triggerMinutes,
    triggerShort,
    WD_SHORT,
    weekdayOf,
    type Occurrence,
    type PlanDevice,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type Scene,
} from './planModel';
import {
    closedWord,
    DayLetters,
    DayTrack,
    DeviceGlyph,
    OccRow,
    PlanSheet,
    PlayBtn,
    SceneGlyph,
    Seg,
    SettingsCard,
    Toast,
    Toggle,
    TrackScale,
    type SheetView,
} from './parts';

export type ListStyle = 'L' | 'M' | 'N';

// ── Gemeinsames ────────────────────────────────────────────────────────

function useSheet() {
    const [open, setOpen] = useState(false);
    const [seq, setSeq] = useState(0);
    const [view, setView] = useState<SheetView>({ v: 'home' });
    return {
        open,
        seq,
        view,
        setView,
        show: (v: SheetView = { v: 'home' }) => {
            setSeq((n) => n + 1);
            setView(v);
            setOpen(true);
        },
        close: () => setOpen(false),
    };
}
type Sheet = ReturnType<typeof useSheet>;

function statusText(m: PlanModel): string {
    if (!m.master) return 'Plan aus';
    if (m.pausedToday) return 'heute ausgesetzt';
    return 'Plan aktiv';
}

function nowMin(m: PlanModel) {
    return m.now.getHours() * 60 + m.now.getMinutes();
}

/** Ist diese Ausführung schon vorbei bzw. fällt aus? */
function isPast(m: PlanModel, date: Date, o: Occurrence) {
    if (!m.master) return true;
    const today = date.toDateString() === m.today.toDateString();
    return today && (m.pausedToday || o.min <= nowMin(m));
}

function floorShort(name: string): string {
    if (/erd/i.test(name)) return 'EG';
    if (/ober/i.test(name)) return 'OG';
    if (/dach/i.test(name)) return 'DG';
    if (/keller|unter/i.test(name)) return 'UG';
    return name.slice(0, 2).toUpperCase();
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

/** „ganzes Erdgeschoss, Büro Maxi, Mika +2“ – volle Etagen zusammengefasst. */
function namesLine(m: PlanModel, tg: PlanTarget, max = 3): string {
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

/**
 * Blaettern wie RainStationWidget, dazu Wischen. Nach einer Wischgeste wird
 * der folgende Klick geschluckt, damit die Kachel nicht zusaetzlich aufgeht.
 */
function usePager(n: number) {
    const [idx, setIdx] = useState(0);
    const [dir, setDir] = useState<1 | -1>(1);
    const start = useRef<{ x: number; y: number } | null>(null);
    const swiped = useRef(0);
    const safe = n > 0 ? Math.min(idx, n - 1) : 0;
    const go = (d: 1 | -1) => {
        if (n < 2) return;
        setDir(d);
        setIdx((i) => (Math.min(i, n - 1) + d + n) % n);
    };
    const set = (i: number) => {
        setDir(i >= safe ? 1 : -1);
        setIdx(i);
    };
    const handlers = {
        onPointerDown: (e: RPointerEvent) => {
            start.current = { x: e.clientX, y: e.clientY };
        },
        onPointerUp: (e: RPointerEvent) => {
            const s = start.current;
            start.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            const dy = e.clientY - s.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                swiped.current = Date.now();
                go(dx < 0 ? 1 : -1);
            }
        },
        onPointerCancel: () => {
            start.current = null;
        },
        onClickCapture: (e: RMouseEvent) => {
            if (Date.now() - swiped.current < 350) {
                e.stopPropagation();
                e.preventDefault();
            }
        },
    };
    return { idx: safe, dir, go, set, handlers, n };
}
type Pager = ReturnType<typeof usePager>;

function Chevron({ pager, d }: { pager: Pager; d: 1 | -1 }) {
    const Icon = d < 0 ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            className="rpp-pg-chev"
            style={{ opacity: pager.n < 2 ? 0.3 : 1 }}
            onClick={(e) => {
                e.stopPropagation();
                pager.go(d);
            }}
            aria-label={d < 0 ? 'Zurück blättern' : 'Weiter blättern'}
        >
            <Icon size={18} />
        </button>
    );
}

function Dots({ pager, right, left }: { pager: Pager; right?: ReactNode; left?: ReactNode }) {
    return (
        <div className="rpp-pg-dots">
            {left && <span className="rpp-pg-side is-left">{left}</span>}
            {Array.from({ length: pager.n }, (_, i) => (
                <button
                    key={i}
                    type="button"
                    className={`rpp-pg-dot${i === pager.idx ? ' is-active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        pager.set(i);
                    }}
                    aria-label={`Seite ${i + 1}`}
                />
            ))}
            {right && <span className="rpp-pg-side is-right">{right}</span>}
        </div>
    );
}

/** Seiteninhalt, gleitet beim Blaettern aus der passenden Richtung herein. */
function Page({ pager, children, className = '' }: { pager: Pager; children: ReactNode; className?: string }) {
    return (
        <div key={pager.idx} className={`rpp-pg-page ${pager.dir > 0 ? 'is-next' : 'is-prev'} ${className}`}>
            {children}
        </div>
    );
}

function PlanLink({ sheet }: { sheet: Sheet }) {
    return (
        <button
            type="button"
            className="rpp-textbtn rpp-textbtn--sm"
            onClick={(e) => {
                e.stopPropagation();
                sheet.show();
            }}
        >
            Planen
        </button>
    );
}

function dayHead(m: PlanModel, d: Date) {
    const sun = m.sunFor(d);
    const hol = holidayName(d);
    return {
        title: dayLabel(d, m.today),
        sub: `${WD_SHORT[weekdayOf(d)]} ${fmtDate(d)} · ↑ ${hhmm(sun.sunrise)} · ↓ ${hhmm(sun.sunset)}`,
        hol,
    };
}

function emptyText(m: PlanModel, d: Date) {
    if (!m.master) return 'Wochenplan ist ausgeschaltet.';
    if (holidayName(d) && m.holidayMode === 'skip') return 'Feiertag – es fährt nichts.';
    return m.entries.length ? 'Nichts geplant.' : 'Noch keine Zeitpunkte – über „Planen“ einrichten.';
}

/** Kompakte Zeile: Zeit · Symbol · Name — für dichte Listen in der Kachel. */
function DenseOcc({ m, date, o, onClick, showDay }: { m: PlanModel; date: Date; o: Occurrence; onClick: () => void; showDay?: boolean }) {
    const tg = o.entry.target;
    const scene = tg.kind === 'scene' ? m.sceneOf(tg.sceneId) : undefined;
    const dev = tg.kind === 'device' ? m.deviceOf(tg.key) : undefined;
    return (
        <button type="button" className={`rpp-row rpp-row--tap rpp-row--dense${isPast(m, date, o) ? ' is-past' : ''}`} onClick={onClick}>
            <span className="rpp-time">{hhmm(o.min)}</span>
            <span className="rpp-row-icon">
                {scene ? <SceneGlyph icon={scene.icon} size={16} /> : dev ? <DeviceGlyph kind={dev.kind} closed={tg.kind === 'device' ? tg.closed : null} size={16} /> : null}
            </span>
            <span className="rpp-title rpp-grow">{m.targetName(tg)}</span>
            <span className="rpp-sub rpp-nowrap">
                {showDay ? dayLabel(date, m.today) : tg.kind === 'scene' ? `${m.targetCount(tg)} Rollläden` : `auf ${closedWord(tg.closed)}`}
            </span>
        </button>
    );
}

// ── Popup (Grundform A) mit Listenstufe L/M/N ──────────────────────────

function PlanPopup({ model, sheet, listStyle }: { model: PlanModel; sheet: Sheet; listStyle: ListStyle }) {
    const [tab, setTab] = useState<'plan' | 'scenes' | 'opts'>('plan');
    if (!sheet.open) return null;
    return (
        <PlanSheet
            key={sheet.seq}
            title="Szenen & Wochenplan"
            subtitle={statusText(model)}
            view={sheet.view}
            setView={sheet.setView}
            onClose={sheet.close}
            model={model}
            home={
                <div className="rpp-home">
                    <Seg
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'plan', label: 'Wochenplan' },
                            { value: 'scenes', label: 'Szenen' },
                            { value: 'opts', label: 'Einstellungen' },
                        ]}
                    />
                    {tab === 'plan' && <EntryListR2 model={model} setView={sheet.setView} style={listStyle} />}
                    {tab === 'scenes' && <SceneListR2 model={model} setView={sheet.setView} style={listStyle} />}
                    {tab === 'opts' && <SettingsCard model={model} />}
                </div>
            }
        />
    );
}

/** M: eine Reihe kleiner Rollladen-Symbole in Zielstellung, nach Etage. */
function GlyphStrip({ m, tg }: { m: PlanModel; tg: PlanTarget }) {
    const mem = membersOf(m, tg);
    return (
        <span className="rpp-glyphs">
            {m.floors.map((f) => {
                const list = mem.filter((x) => x.dev.floor === f);
                if (!list.length) return null;
                return (
                    <span key={f} className="rpp-glyphs-floor">
                        <span className="rpp-glyphs-label">{floorShort(f)}</span>
                        {list.map((x) => (
                            <span key={x.dev.key} className="rpp-glyph" title={`${x.dev.label}: ${closedWord(x.closed)}`}>
                                <DeviceGlyph kind={x.dev.kind} closed={x.closed} size={16} />
                            </span>
                        ))}
                    </span>
                );
            })}
        </span>
    );
}

/** N: alle beteiligten Rollläden mit Zielwert, zweispaltig nach Etage. */
function MemberGrid({ m, tg }: { m: PlanModel; tg: PlanTarget }) {
    const mem = membersOf(m, tg);
    return (
        <div className="rpp-members">
            {m.floors.map((f) => {
                const list = mem.filter((x) => x.dev.floor === f);
                if (!list.length) return null;
                return (
                    <div key={f} className="rpp-members-floor">
                        <span className="rpp-members-label">{f}</span>
                        <div className="rpp-members-grid">
                            {list.map((x) => (
                                <span key={x.dev.key} className="rpp-member">
                                    <DeviceGlyph kind={x.dev.kind} closed={x.closed} size={15} />
                                    <span className="rpp-member-name">{x.dev.label}</span>
                                    <span className="rpp-member-val">{closedWord(x.closed)}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function sceneTimes(m: PlanModel, s: Scene) {
    const ent = m.entriesOfScene(s.id).filter((e) => e.enabled);
    if (!ent.length) return 'nur per Hand';
    return ent
        .map((e) => `${daysText(e.days)} ${e.trigger.kind === 'time' ? e.trigger.time : e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'}`)
        .join(', ');
}

function SceneListR2({ model: m, setView, style }: { model: PlanModel; setView: (v: SheetView) => void; style: ListStyle }) {
    const add = (
        <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'scene', id: null })}>
            <Plus size={16} /> Szene anlegen
        </button>
    );
    if (style === 'N') {
        return (
            <>
                {m.scenes.length === 0 && <div className="rpp-card"><div className="rpp-empty">Noch keine Szenen.</div></div>}
                {m.scenes.map((s) => {
                    const tg: PlanTarget = { kind: 'scene', sceneId: s.id };
                    return (
                        <div key={s.id} role="button" tabIndex={0} className="rpp-card rpp-card--tap" onClick={() => setView({ v: 'scene', id: s.id })}>
                            <div className="rpp-row">
                                <span className="rpp-row-icon">
                                    <SceneGlyph icon={s.icon} />
                                </span>
                                <span className="rpp-row-main">
                                    <span className="rpp-title">{s.name}</span>
                                    <span className="rpp-sub">{sceneTimes(m, s)}</span>
                                </span>
                                <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                            </div>
                            <MemberGrid m={m} tg={tg} />
                        </div>
                    );
                })}
                <div className="rpp-card">{add}</div>
            </>
        );
    }
    return (
        <div className="rpp-card">
            {m.scenes.length === 0 && <div className="rpp-empty">Noch keine Szenen. Eine Szene fasst mehrere Rollläden mit ihrer Zielstellung zusammen.</div>}
            {m.scenes.map((s) => {
                const tg: PlanTarget = { kind: 'scene', sceneId: s.id };
                return (
                    <div key={s.id} role="button" tabIndex={0} className="rpp-row rpp-row--tap rpp-row--tall" onClick={() => setView({ v: 'scene', id: s.id })}>
                        <span className="rpp-row-icon">
                            <SceneGlyph icon={s.icon} />
                        </span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">
                                {s.name}
                                <span className="rpp-sub"> · {s.targets.length}</span>
                            </span>
                            {style === 'L' ? <span className="rpp-sub rpp-ellipsis">{namesLine(m, tg)}</span> : <GlyphStrip m={m} tg={tg} />}
                            <span className="rpp-sub rpp-ellipsis">{sceneTimes(m, s)}</span>
                        </span>
                        <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                    </div>
                );
            })}
            {add}
        </div>
    );
}

function EntryHead({ m, e }: { m: PlanModel; e: PlanEntry }) {
    return (
        <span className="rpp-title">
            {e.trigger.kind === 'time' ? e.trigger.time : e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'}
            {e.trigger.kind !== 'time' && e.trigger.offset !== 0 && (
                <span className="rpp-sub">
                    {' '}
                    {e.trigger.offset > 0 ? '+' : '−'}
                    {Math.abs(e.trigger.offset)} min
                </span>
            )}
            <span className="rpp-dot-sep">·</span>
            {m.targetName(e.target)}
        </span>
    );
}

function EntryListR2({ model: m, setView, style }: { model: PlanModel; setView: (v: SheetView) => void; style: ListStyle }) {
    const sun = m.sunFor(m.today);
    const list = [...m.entries].sort((a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min);
    const add = (
        <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'entry', id: null })}>
            <Plus size={16} /> Zeitpunkt hinzufügen
        </button>
    );
    const meta = (e: PlanEntry) => (
        <span className="rpp-sub rpp-inline">
            <DayLetters days={e.days} dim={!e.enabled} />
            {e.trigger.earliest && <span>ab {e.trigger.earliest}</span>}
            {e.trigger.latest && <span>bis {e.trigger.latest}</span>}
        </span>
    );
    if (style === 'N') {
        return (
            <>
                {list.length === 0 && <div className="rpp-card"><div className="rpp-empty">Noch keine Zeitpunkte im Wochenplan.</div></div>}
                {list.map((e) => (
                    <div key={e.id} role="button" tabIndex={0} className={`rpp-card rpp-card--tap${e.enabled ? '' : ' is-dim'}`} onClick={() => setView({ v: 'entry', id: e.id })}>
                        <div className="rpp-row">
                            <span className="rpp-row-main">
                                <EntryHead m={m} e={e} />
                                {meta(e)}
                            </span>
                            <Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                        </div>
                        <MemberGrid m={m} tg={e.target} />
                    </div>
                ))}
                <div className="rpp-card">{add}</div>
            </>
        );
    }
    return (
        <div className="rpp-card">
            {list.length === 0 && <div className="rpp-empty">Noch keine Zeitpunkte im Wochenplan.</div>}
            {list.map((e) => (
                <div key={e.id} className={`rpp-row rpp-row--tap rpp-row--tall${e.enabled ? '' : ' is-past'}`} onClick={() => setView({ v: 'entry', id: e.id })} role="button" tabIndex={0}>
                    <span className="rpp-row-main">
                        <EntryHead m={m} e={e} />
                        {style === 'L' ? <span className="rpp-sub rpp-ellipsis">{namesLine(m, e.target)}</span> : <GlyphStrip m={m} tg={e.target} />}
                        {meta(e)}
                    </span>
                    <Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                </div>
            ))}
            {add}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel F · Tagesliste zum Blättern (Richtung B)
// ═════════════════════════════════════════════════════════════════════

type KachelProps = { model: PlanModel; listStyle: ListStyle };

function KachelF({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const pg = usePager(7);
    const d = addDays(m.today, pg.idx);
    const occ = m.occurrences(d);
    const h = dayHead(m, d);
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <div className="rpp-pg-head">
                    <Chevron pager={pg} d={-1} />
                    <Page pager={pg} className="rpp-pg-headtext">
                        <span className="rpp-pg-title">{h.title}</span>
                        <span className="rpp-pg-sub">{h.hol ? `${h.hol} · ` : ''}{h.sub}</span>
                    </Page>
                    <Chevron pager={pg} d={1} />
                </div>
                <Page pager={pg} className="rpp-pg-list">
                    {occ.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, d)}</div>}
                    {occ.map((o) => (
                        <OccRow key={o.entry.id} model={m} occ={o} past={isPast(m, d, o)} onClick={() => sh.show({ v: 'entry', id: o.entry.id })} />
                    ))}
                </Page>
                <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel G · Nächste Fahrten, eine pro Seite (Richtung E, aber klein)
// ═════════════════════════════════════════════════════════════════════

function KachelG({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const up = m.upcoming(6);
    const pg = usePager(Math.max(1, up.length));
    const cur = up[pg.idx];
    const tg = cur?.occ.entry.target;
    const scene = tg?.kind === 'scene' ? m.sceneOf(tg.sceneId) : undefined;
    const dev = tg?.kind === 'device' ? m.deviceOf(tg.key) : undefined;
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <div className="rpp-pg-head rpp-pg-head--tall">
                    <Chevron pager={pg} d={-1} />
                    {cur && tg ? (
                        <Page pager={pg} className="rpp-g-main">
                            <button type="button" className="rpp-g-btn" onClick={() => sh.show({ v: 'entry', id: cur.occ.entry.id })}>
                                <span className="rpp-label-caps">{pg.idx === 0 ? 'Als Nächstes' : `${pg.idx + 1}. Fahrt`} · {dayLabel(cur.date, m.today)}</span>
                                <span className="rpp-g-line">
                                    <span className="rpp-a-time">{hhmm(cur.occ.min)}</span>
                                    <span className="rpp-g-icon">
                                        {scene ? <SceneGlyph icon={scene.icon} size={18} /> : dev ? <DeviceGlyph kind={dev.kind} closed={tg.kind === 'device' ? tg.closed : null} size={18} /> : null}
                                    </span>
                                    <span className="rpp-g-name">{m.targetName(tg)}</span>
                                </span>
                                <span className="rpp-sub rpp-ellipsis">
                                    {triggerShort(cur.occ.entry.trigger)} · {namesLine(m, tg, 2)}
                                </span>
                            </button>
                        </Page>
                    ) : (
                        <div className="rpp-g-main rpp-empty rpp-center">{emptyText(m, m.today)}</div>
                    )}
                    <Chevron pager={pg} d={1} />
                </div>
                <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel H · Tag als Zeitstrahl mit Uhrzeit-Chips
// ═════════════════════════════════════════════════════════════════════

function KachelH({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const pg = usePager(7);
    const d = addDays(m.today, pg.idx);
    const occ = m.occurrences(d);
    const h = dayHead(m, d);
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <div className="rpp-pg-head">
                    <Chevron pager={pg} d={-1} />
                    <Page pager={pg} className="rpp-pg-headtext">
                        <span className="rpp-pg-title">{h.title}</span>
                        <span className="rpp-pg-sub">{h.hol ? `${h.hol} · ` : ''}{h.sub}</span>
                    </Page>
                    <Chevron pager={pg} d={1} />
                </div>
                <Page pager={pg} className="rpp-h-body">
                    <DayTrack model={m} date={d} />
                    <TrackScale />
                    <div className="rpp-h-chips">
                        {occ.length === 0 && <span className="rpp-sub">{emptyText(m, d)}</span>}
                        {occ.map((o) => {
                            const scene = o.entry.target.kind === 'scene' ? m.sceneOf(o.entry.target.sceneId) : undefined;
                            return (
                                <button
                                    key={o.entry.id}
                                    type="button"
                                    className={`rpp-h-chip${isPast(m, d, o) ? ' is-past' : ''}`}
                                    onClick={() => sh.show({ v: 'entry', id: o.entry.id })}
                                >
                                    <b>{hhmm(o.min)}</b>
                                    {scene && <SceneGlyph icon={scene.icon} size={13} />}
                                    <span>{m.targetName(o.entry.target)}</span>
                                </button>
                            );
                        })}
                    </div>
                </Page>
                <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel I · Schlanke Zeile (so hoch wie eine Rollladen-Zeile)
// ═════════════════════════════════════════════════════════════════════

function KachelI({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const up = m.upcoming(8);
    const pg = usePager(Math.max(1, up.length));
    const cur = up[pg.idx];
    return (
        <>
            <div className="rpp-card rpp-pg rpp-i" {...pg.handlers}>
                <Chevron pager={pg} d={-1} />
                {cur ? (
                    <Page pager={pg} className="rpp-i-main">
                        <button type="button" className="rpp-i-btn" onClick={() => sh.show({ v: 'entry', id: cur.occ.entry.id })}>
                            <span className="rpp-time">{hhmm(cur.occ.min)}</span>
                            <span className="rpp-row-main">
                                <span className="rpp-title">{m.targetName(cur.occ.entry.target)}</span>
                                <span className="rpp-sub rpp-ellipsis">
                                    {dayLabel(cur.date, m.today)} · {namesLine(m, cur.occ.entry.target, 2)}
                                </span>
                            </span>
                        </button>
                    </Page>
                ) : (
                    <span className="rpp-i-main rpp-sub">{emptyText(m, m.today)}</span>
                )}
                <span className="rpp-i-count">
                    {up.length ? `${pg.idx + 1}/${up.length}` : ''}
                </span>
                <Chevron pager={pg} d={1} />
                <button
                    type="button"
                    className="rpp-i-plan"
                    aria-label="Planen"
                    onClick={(e) => {
                        e.stopPropagation();
                        sh.show();
                    }}
                >
                    <CalendarClock size={18} />
                </button>
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel J · Heute · Morgen · Woche (drei Seiten)
// ═════════════════════════════════════════════════════════════════════

function KachelJ({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const pg = usePager(3);
    const labels = ['Heute', 'Morgen', 'Diese Woche'];
    const tomorrow = addDays(m.today, 1);
    const body = () => {
        if (pg.idx < 2) {
            const d = pg.idx === 0 ? m.today : tomorrow;
            const occ = m.occurrences(d);
            return (
                <>
                    {occ.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, d)}</div>}
                    {occ.map((o) => (
                        <DenseOcc key={o.entry.id} m={m} date={d} o={o} onClick={() => sh.show({ v: 'entry', id: o.entry.id })} />
                    ))}
                </>
            );
        }
        return Array.from({ length: 7 }, (_, i) => addDays(m.today, i)).map((d) => {
            const occ = m.occurrences(d);
            const hol = holidayName(d);
            return (
                <button key={d.toDateString()} type="button" className="rpp-row rpp-row--tap rpp-row--dense" onClick={() => sh.show()}>
                    <span className="rpp-j-day">
                        {WD_SHORT[weekdayOf(d)]}
                        <span className="rpp-sub"> {fmtDate(d)}</span>
                    </span>
                    <span className="rpp-sub rpp-grow rpp-ellipsis">
                        {hol ? `${hol} · ` : ''}
                        {occ.length ? `${hhmm(occ[0].min)} – ${hhmm(occ[occ.length - 1].min)}` : 'nichts'}
                    </span>
                    <span className="rpp-j-count">{occ.length || ''}</span>
                </button>
            );
        });
    };
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <div className="rpp-pg-head">
                    <Chevron pager={pg} d={-1} />
                    <Page pager={pg} className="rpp-pg-headtext">
                        <span className="rpp-pg-title">{labels[pg.idx]}</span>
                        <span className="rpp-pg-sub">
                            {pg.idx === 2
                                ? `${WD_SHORT[weekdayOf(m.today)]} ${fmtDate(m.today)} – ${WD_SHORT[weekdayOf(addDays(m.today, 6))]} ${fmtDate(addDays(m.today, 6))}`
                                : dayHead(m, pg.idx === 0 ? m.today : tomorrow).sub}
                        </span>
                    </Page>
                    <Chevron pager={pg} d={1} />
                </div>
                <Page pager={pg} className="rpp-pg-list">
                    {body()}
                </Page>
                <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// Kachel K · Kalenderblatt, schlank (E verkleinert, Tage blättern)
// ═════════════════════════════════════════════════════════════════════

function KachelK({ model: m, listStyle }: KachelProps) {
    const sh = useSheet();
    const pg = usePager(7);
    const d = addDays(m.today, pg.idx);
    const occ = m.occurrences(d);
    const sun = m.sunFor(d);
    const hol = holidayName(d);
    const nh = nextHoliday(addDays(d, 1));
    const toHol = Math.round((nh.date.getTime() - d.getTime()) / 864e5);
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <div className="rpp-k-head">
                    <Page pager={pg} className="rpp-row-main">
                        <span className="rpp-k-date">
                            {pg.idx < 2 ? `${dayLabel(d, m.today)} · ${fmtDateLong(d).split(', ')[1]}` : fmtDateLong(d)}
                        </span>
                        <span className="rpp-sub rpp-inline">
                            <span>↑ {hhmm(sun.sunrise)}</span>
                            <span>↓ {hhmm(sun.sunset)}</span>
                            <span>{hol ? `Feiertag: ${hol}` : toHol <= 14 ? `${nh.name} in ${toHol} T.` : ''}</span>
                        </span>
                    </Page>
                    <button
                        type="button"
                        className={`rpp-round${m.pausedToday ? ' is-on' : ''}`}
                        aria-label={m.pausedToday ? 'Heute ausgesetzt' : 'Heute aussetzen'}
                        title={m.pausedToday ? 'Heute ausgesetzt' : 'Heute aussetzen'}
                        onClick={(e) => {
                            e.stopPropagation();
                            m.setPausedToday(!m.pausedToday);
                        }}
                    >
                        <Pause size={16} />
                    </button>
                    <button
                        type="button"
                        className="rpp-round"
                        aria-label="Planen"
                        onClick={(e) => {
                            e.stopPropagation();
                            sh.show();
                        }}
                    >
                        <CalendarClock size={16} />
                    </button>
                </div>
                <Page pager={pg} className="rpp-pg-list">
                    {occ.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, d)}</div>}
                    {occ.map((o) => (
                        <DenseOcc key={o.entry.id} m={m} date={d} o={o} onClick={() => sh.show({ v: 'entry', id: o.entry.id })} />
                    ))}
                </Page>
                <div className="rpp-k-foot">
                    <Chevron pager={pg} d={-1} />
                    <Dots pager={pg} />
                    <Chevron pager={pg} d={1} />
                </div>
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

export const KACHELN: { key: string; name: string; C: ComponentType<KachelProps> }[] = [
    { key: 'F', name: 'Tagesliste zum Blättern', C: KachelF },
    { key: 'G', name: 'Nächste Fahrt, eine pro Seite', C: KachelG },
    { key: 'H', name: 'Tag als Zeitstrahl + Uhrzeiten', C: KachelH },
    { key: 'I', name: 'Schlanke Zeile', C: KachelI },
    { key: 'J', name: 'Heute · Morgen · Woche', C: KachelJ },
    { key: 'K', name: 'Kalenderblatt, schlank', C: KachelK },
];

export const POPUPS: { key: ListStyle; name: string }[] = [
    { key: 'L', name: 'kompakt, Namen in einer Zeile' },
    { key: 'M', name: 'mittel, Rollladen-Symbole je Etage' },
    { key: 'N', name: 'ausführlich, jeder Rollladen mit Ziel' },
];
