/**
 * Popup der Rolllaeden-Planer-Kachel (Produktion, Feature 23): drei Reiter
 * Wochenplan / Szenen / Einstellungen, plus die Blaetter-Bausteine
 * (usePager/Chevron/Dots), die auch PlanPages.tsx nutzt.
 *
 * Herkunft: Runde 2 des inzwischen entfernten Entwurfs, reduziert auf das, was Runde 5 tatsaechlich
 * braucht — die Kacheln F–K, die KACHELN/POPUPS-Vergleichslisten und die
 * ausfuehrlichen Popup-Stufen M/N (Symbolreihe/Rollladen-Gitter) waren reine
 * Entwurfs-Vergleiche und sind hier nicht mehr enthalten. Die Produktions-
 * `ListStyle` kennt nur die beiden von Sascha uebernommenen Stufen A
 * (kompakt) und L (mit Rollladen-Namen), siehe useRollPlanView.ts.
 */
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { dayLabel, fmtDate, hhmm, holidayName, triggerMinutes, WD_SHORT, weekdayOf, type Occurrence, type PlanDevice, type PlanEntry, type PlanModel, type PlanTarget } from './planModel';
import { closedWord, EntryList, PlayBtn, Seg, SceneList, Toggle } from './parts';
import { PlanSheet, SettingsCard, type SheetView } from './editors';
import type { ListStyle } from './useRollPlanView';

export type { SheetView };

// ── Sheet-Zustand (offen/geschlossen, welche Unteransicht) ──────────────

export function useSheet() {
    const [open, setOpen] = useState(false);
    const [seq, setSeq] = useState(0);
    const [view, setView] = useState<SheetView>({ v: 'home' });
    const [tab, setTab] = useState<PopupTab | null>(null);
    return {
        open,
        seq,
        view,
        setView,
        tab,
        /** `tab`: Popup direkt auf diesem Reiter öffnen (z. B. „Alle Szenen"). */
        show: (v: SheetView = { v: 'home' }, t: PopupTab | null = null) => {
            setSeq((n) => n + 1);
            setView(v);
            setTab(t);
            setOpen(true);
        },
        close: () => setOpen(false),
    };
}
export type Sheet = ReturnType<typeof useSheet>;
export type PopupTab = 'plan' | 'scenes' | 'opts';

export function statusText(m: PlanModel): string {
    if (!m.master) return 'Plan aus';
    if (m.pausedToday) return 'heute ausgesetzt';
    return 'Plan aktiv';
}

function nowMin(m: PlanModel) {
    return m.now.getHours() * 60 + m.now.getMinutes();
}

/** Ist diese Ausführung schon vorbei bzw. fällt aus? */
export function isPast(m: PlanModel, date: Date, o: Occurrence) {
    if (!m.master) return true;
    const today = date.toDateString() === m.today.toDateString();
    return today && (m.pausedToday || o.min <= nowMin(m));
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

/**
 * Blaettern wie RainStationWidget, dazu Wischen. Nach einer Wischgeste wird
 * der folgende Klick geschluckt, damit die Kachel nicht zusaetzlich aufgeht.
 */
export function usePager(n: number) {
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
export type Pager = ReturnType<typeof usePager>;

export function Chevron({ pager, d }: { pager: Pager; d: 1 | -1 }) {
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

export function Dots({ pager, right, left }: { pager: Pager; right?: ReactNode; left?: ReactNode }) {
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

export function PlanLink({ sheet }: { sheet: Sheet }) {
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

export function dayHead(m: PlanModel, d: Date) {
    const sun = m.sunFor(d);
    const hol = holidayName(d);
    return {
        title: dayLabel(d, m.today),
        sub: `${WD_SHORT[weekdayOf(d)]} ${fmtDate(d)} · ↑ ${hhmm(sun.sunrise)} · ↓ ${hhmm(sun.sunset)}`,
        hol,
    };
}

export function emptyText(m: PlanModel, d: Date) {
    if (!m.master) return 'Wochenplan ist ausgeschaltet.';
    if (holidayName(d) && m.holidayMode === 'skip') return 'Feiertag – es fährt nichts.';
    return m.entries.length ? 'Nichts geplant.' : 'Noch keine Zeitpunkte – über „Planen" einrichten.';
}

// ── Popup mit den drei Reitern ─────────────────────────────────────────

export function PlanPopup({ model, sheet, listStyle }: { model: PlanModel; sheet: Sheet; listStyle: ListStyle }) {
    const [tab, setTab] = useState<PopupTab>('plan');
    useEffect(() => {
        if (sheet.tab) setTab(sheet.tab);
    }, [sheet.seq, sheet.tab]);
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
                    {tab === 'plan' && (listStyle === 'A' ? <EntryList model={model} setView={sheet.setView} /> : <EntryListR2 model={model} setView={sheet.setView} />)}
                    {tab === 'scenes' && (listStyle === 'A' ? <SceneList model={model} setView={sheet.setView} /> : <SceneListR2 model={model} setView={sheet.setView} />)}
                    {tab === 'opts' && <SettingsCard model={model} />}
                </div>
            }
        />
    );
}

function sceneTimesShort(m: PlanModel, sceneId: string): string {
    const ent = m.entriesOfScene(sceneId).filter((e) => e.enabled);
    if (!ent.length) return 'nur per Hand';
    return ent.map((e) => (e.trigger.kind === 'time' ? e.trigger.time : e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang')).join(', ');
}

/** L: Namen in einer Zeile statt Symbolreihe/Gitter (M/N waren reine Entwurfs-Vergleiche). */
function SceneListR2({ model: m, setView }: { model: PlanModel; setView: (v: SheetView) => void }) {
    return (
        <div className="rpp-card">
            {m.scenes.length === 0 && <div className="rpp-empty">Noch keine Szenen. Eine Szene fasst mehrere Rollläden mit ihrer Zielstellung zusammen.</div>}
            {m.scenes.map((s) => {
                const tg: PlanTarget = { kind: 'scene', sceneId: s.id };
                return (
                    <div key={s.id} role="button" tabIndex={0} className="rpp-row rpp-row--tap rpp-row--tall" onClick={() => setView({ v: 'scene', id: s.id })}>
                        <span className="rpp-row-main">
                            <span className="rpp-title">
                                {s.name}
                                <span className="rpp-sub"> · {s.targets.length}</span>
                            </span>
                            <span className="rpp-sub rpp-ellipsis">{namesLine(m, tg)}</span>
                            <span className="rpp-sub rpp-ellipsis">{sceneTimesShort(m, s.id)}</span>
                        </span>
                        <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                    </div>
                );
            })}
            <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'scene', id: null })}>
                <Plus size={16} /> Szene anlegen
            </button>
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

function EntryListR2({ model: m, setView }: { model: PlanModel; setView: (v: SheetView) => void }) {
    const sun = m.sunFor(m.today);
    const list = [...m.entries].sort((a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min);
    return (
        <div className="rpp-card">
            {list.length === 0 && <div className="rpp-empty">Noch keine Zeitpunkte im Wochenplan.</div>}
            {list.map((e) => (
                <div key={e.id} className={`rpp-row rpp-row--tap rpp-row--tall${e.enabled ? '' : ' is-past'}`} onClick={() => setView({ v: 'entry', id: e.id })} role="button" tabIndex={0}>
                    <span className="rpp-row-main">
                        <EntryHead m={m} e={e} />
                        <span className="rpp-sub rpp-ellipsis">{namesLine(m, e.target)}</span>
                    </span>
                    <Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                </div>
            ))}
            <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'entry', id: null })}>
                <Plus size={16} /> Zeitpunkt hinzufügen
            </button>
        </div>
    );
}
