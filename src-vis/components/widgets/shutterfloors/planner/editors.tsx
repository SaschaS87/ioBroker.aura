/**
 * Editoren der Rolllaeden-Planer-Kachel (Produktion, Feature 23): SceneEditor, EntryEditor.
 *
 * Seit Feature 30, Phase 2 sind es Seiten im Stapel (PlannerStack.tsx), keine Fenster von unten mehr.
 * Der Kopf (Zurueck, Titel, "Sichern") gehoert der Seite; "Sichern" kommt per Portal in den Kopf
 * (headSlot). Das Muster beider Editoren:
 *   - "Sichern" ist grau, bis sich gegenueber dem Ausgangsstand etwas geaendert hat (editorDirty.ts)
 *   - Zurueck mit Aenderungen fragt nach (Aenderungen verwerfen / Sichern / Weiter bearbeiten); die Seite
 *     ruft dazu den Zurueck-Waechter, den der Editor per registerLeaveGuard anmeldet
 *   - Loeschen steht als rote Knopfzeile ganz unten und fragt nach
 * parts.tsx importiert von hier nur den Typ SheetView.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { IosActionSheet, IosButtonRow } from '../../../common/ios';
import {
    daysText,
    devicesOfTarget,
    findCollisions,
    fmtDate,
    hhmm,
    dayLabel,
    newId,
    nextHoliday,
    triggerMinutes,
    triggerText,
    WD_SHORT,
    WEEKDAYS,
    type PlanEntry,
    type PlanModel,
    type Scene,
    type SceneIcon,
    type TriggerKind,
} from './planModel';
import { Caption, closedWord, DayLetters, DeviceGlyph, SceneGlyph, SCENE_ICONS, Seg, Toggle } from './parts';
import { sameEntry, sameSceneDraft, sceneDraftOf, type SceneTargets } from './editorDirty';

/** Wohin ein Tipp in einem Editor fuehrt (Szene oeffnet Zeitpunkte; die Szene bleibt darunter eingehaengt). */
export type SheetView =
    | { v: 'scene'; id: string | null }
    | { v: 'entry'; id: string | null; preset?: Partial<PlanEntry> };

/** Anmeldung des Zurueck-Waechters bei der Seite: true = darf sofort zurueck, false = Editor fragt nach. */
export type LeaveGuardRegister = (guard: (() => boolean) | null) => void;

/** Meldet den Waechter an und aktuell, ohne bei jedem Rendern neu anzumelden. */
function useLeaveGuard(register: LeaveGuardRegister | undefined, guard: () => boolean) {
    const ref = useRef(guard);
    ref.current = guard;
    useEffect(() => {
        register?.(() => ref.current());
        return () => register?.(null);
    }, [register]);
}

/** Meldet "ungesicherte Aenderungen" nach oben (der Stapel haelt dann den Entwurf beim Tab-Wechsel). */
function useReportDirty(onDirtyChange: ((dirty: boolean) => void) | undefined, dirty: boolean) {
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [onDirtyChange, dirty]);
    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}

interface EditorChrome {
    /** Platz rechts im Seitenkopf fuer "Sichern" (per Portal) */
    headSlot?: HTMLElement | null;
    registerLeaveGuard?: LeaveGuardRegister;
    onDirtyChange?: (dirty: boolean) => void;
}

/** "Sichern" im Kopf: fett, blau, grau solange nichts zu sichern ist. */
function SaveButton({ slot, canSave, onSave }: { slot?: HTMLElement | null; canSave: boolean; onSave: () => void }) {
    if (!slot) return null;
    return createPortal(
        <button type="button" className="ios-bar-text is-strong" onClick={onSave} disabled={!canSave}>
            Sichern
        </button>,
        slot,
    );
}

/** Rueckfrage beim Zurueck mit ungesicherten Aenderungen. */
function LeaveSheet({
    open,
    canSave,
    onDiscard,
    onSave,
    onStay,
}: {
    open: boolean;
    canSave: boolean;
    onDiscard: () => void;
    onSave: () => void;
    onStay: () => void;
}) {
    return (
        <IosActionSheet
            open={open}
            actions={[
                { key: 'discard', label: 'Änderungen verwerfen', tone: 'destructive', onSelect: onDiscard },
                { key: 'save', label: 'Sichern', disabled: !canSave, onSelect: onSave },
            ]}
            cancelLabel="Weiter bearbeiten"
            onCancel={onStay}
        />
    );
}

// ── Szenen-Editor ──────────────────────────────────────────────────────

const POS_CHIPS: { v: number | null; label: string }[] = [
    { v: null, label: '—' },
    { v: 0, label: 'offen' },
    { v: 25, label: '25' },
    { v: 50, label: '50' },
    { v: 75, label: '75' },
    { v: 100, label: 'zu' },
];

const SLAT_CHIPS: { v: number; label: string }[] = [
    { v: 0, label: 'waagerecht' },
    { v: 50, label: 'halb' },
    { v: 90, label: 'geschlossen' },
];

export function SceneEditor({
    model,
    scene,
    onDone,
    setView,
    headSlot,
    registerLeaveGuard,
    onDirtyChange,
}: {
    model: PlanModel;
    scene?: Scene;
    onDone: () => void;
    setView: (v: SheetView) => void;
} & EditorChrome) {
    // Ausgangsstand einmal beim Oeffnen: gegen ihn wird "geaendert" gemessen
    const [base] = useState(() => sceneDraftOf(scene, model));
    const [name, setName] = useState(base.name);
    const [icon, setIcon] = useState<SceneIcon>(base.icon);
    const [favorite, setFavorite] = useState<boolean>(base.favorite);
    const [targets, setTargets] = useState<SceneTargets>(base.targets);
    const [askLeave, setAskLeave] = useState(false);
    const [askDelete, setAskDelete] = useState(false);
    const count = Object.keys(targets).length;
    const dirty = !sameSceneDraft({ name, icon, favorite, targets }, base);
    const canSave = dirty && count > 0;
    useLeaveGuard(registerLeaveGuard, () => {
        if (!dirty) return true;
        setAskLeave(true);
        return false;
    });
    useReportDirty(onDirtyChange, dirty);

    const setPos = (key: string, v: number | null, hasSlat: boolean) =>
        setTargets((prev) => {
            const next = { ...prev };
            if (v === null) delete next[key];
            else next[key] = { closed: v, slat: hasSlat ? (prev[key]?.slat ?? 0) : undefined };
            return next;
        });
    const setSlat = (key: string, s: number) => setTargets((prev) => ({ ...prev, [key]: { ...prev[key], slat: s } }));

    const takeCurrent = () => {
        const next: Record<string, { closed: number; slat?: number }> = {};
        model.devices.forEach((d) => {
            if (d.closed !== null) next[d.key] = { closed: Math.round(d.closed / 5) * 5, slat: d.hasSlat ? 0 : undefined };
        });
        setTargets(next);
        model.showToast('Aktuelle Stellung aller Rollläden übernommen');
    };

    const save = () => {
        const s: Scene = {
            id: scene?.id ?? newId('s'),
            name: name.trim() || 'Ohne Namen',
            icon,
            favorite,
            targets: Object.entries(targets).map(([key, v]) => ({ key, closed: v.closed, slat: v.slat })),
        };
        model.saveScene(s);
        setAskLeave(false);
        onDone();
    };

    const usedBy = scene ? model.entriesOfScene(scene.id) : [];

    return (
        <div className="rpp-editor">
            <div className="rpp-section">
                <label className="rpp-label" htmlFor="rpp-scene-name">
                    Name
                </label>
                <input
                    id="rpp-scene-name"
                    className="rpp-input"
                    value={name}
                    placeholder="z. B. Guten Morgen"
                    onChange={(e) => setName(e.target.value)}
                />
                <div className="rpp-icon-pick" role="radiogroup" aria-label="Symbol">
                    {(Object.keys(SCENE_ICONS) as SceneIcon[]).map((k) => (
                        <button
                            key={k}
                            type="button"
                            role="radio"
                            aria-checked={icon === k}
                            className={`rpp-icon-opt${icon === k ? ' is-active' : ''}`}
                            onClick={() => setIcon(k)}
                        >
                            <SceneGlyph icon={k} />
                        </button>
                    ))}
                </div>
                <div className="rpp-kv">
                    <span className="rpp-row-main">
                        <span className="rpp-title">Favorit</span>
                        <span className="rpp-sub">Als Schnellknopf auf der Kachel zeigen</span>
                    </span>
                    <Toggle on={favorite} onChange={setFavorite} label="Favorit" />
                </div>
            </div>

            <div className="rpp-section rpp-section--flush">
                <div className="rpp-section-head">
                    <span className="rpp-label">
                        {count} {count === 1 ? 'Rollladen' : 'Rollläden'} beteiligt
                    </span>
                    <button type="button" className="rpp-textbtn" onClick={takeCurrent}>
                        Aktuellen Stand übernehmen
                    </button>
                </div>
                <div className="rpp-hint">„—" heißt: fährt bei dieser Szene nicht mit. Zahlen = Prozent zu.</div>
            </div>

            {model.floors.map((floor) => (
                <div key={floor} className="rpp-editor-floor">
                    <Caption>{floor}</Caption>
                    <div className="rpp-card">
                        {model.devices
                            .filter((d) => d.floor === floor)
                            .map((d) => {
                                const t = targets[d.key];
                                return (
                                    <div key={d.key} className={`rpp-dev${t ? '' : ' is-off'}`}>
                                        <div className="rpp-dev-head">
                                            <span className="rpp-row-icon">
                                                <DeviceGlyph kind={d.kind} closed={t ? t.closed : d.closed} />
                                            </span>
                                            <span className="rpp-title rpp-grow">{d.label}</span>
                                            <span className="rpp-sub">jetzt {d.closed === null ? '—' : closedWord(Math.round(d.closed))}</span>
                                        </div>
                                        <div className="rpp-chips">
                                            {POS_CHIPS.map((c) => {
                                                const active = c.v === null ? !t : t?.closed === c.v;
                                                return (
                                                    <button
                                                        key={String(c.v)}
                                                        type="button"
                                                        className={`rpp-chip${active ? ' is-active' : ''}${c.v === null ? ' is-none' : ''}`}
                                                        onClick={() => setPos(d.key, c.v, d.hasSlat)}
                                                    >
                                                        {c.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {d.hasSlat && t && (
                                            <div className="rpp-chips rpp-chips--slat">
                                                <span className="rpp-sub">Lamelle</span>
                                                {SLAT_CHIPS.map((c) => (
                                                    <button
                                                        key={c.v}
                                                        type="button"
                                                        className={`rpp-chip rpp-chip--sm${t.slat === c.v ? ' is-active' : ''}`}
                                                        onClick={() => setSlat(d.key, c.v)}
                                                    >
                                                        {c.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ))}

            {scene && (
                // Kreis schliessen: Zeitpunkt antippen oder anlegen; die Szene bleibt darunter
                // eingehaengt, „Zurück" fuehrt wieder hierher – mit den noch ungesicherten Aenderungen.
                <div className="rpp-editor-floor">
                    <Caption>Im Wochenplan</Caption>
                    <div className="rpp-card">
                        {usedBy.length === 0 && <div className="rpp-empty">Diese Szene startet bisher nur per Hand.</div>}
                        {usedBy.map((e) => (
                            <div
                                key={e.id}
                                role="button"
                                tabIndex={0}
                                className={`rpp-row rpp-row--tap${e.enabled ? '' : ' is-past'}`}
                                onClick={() => setView({ v: 'entry', id: e.id })}
                            >
                                <span className="rpp-row-main">
                                    <span className="rpp-title">{triggerText(e.trigger)}</span>
                                    <DayLetters days={e.days} dim={!e.enabled} />
                                </span>
                                <Toggle on={e.enabled} onChange={() => model.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                                <ChevronRight size={16} className="rpp-chev" />
                            </div>
                        ))}
                        <button
                            type="button"
                            className="rpp-row rpp-row--tap rpp-row--add"
                            onClick={() =>
                                setView({
                                    v: 'entry',
                                    id: null,
                                    preset: { target: { kind: 'scene', sceneId: scene.id } },
                                })
                            }
                        >
                            <Plus size={16} /> Zeit hinzufügen
                        </button>
                    </div>
                </div>
            )}

            {scene && <IosButtonRow label="Szene löschen" tone="danger" onClick={() => setAskDelete(true)} />}

            <SaveButton slot={headSlot} canSave={canSave} onSave={save} />
            <LeaveSheet
                open={askLeave}
                canSave={canSave}
                onDiscard={() => {
                    setAskLeave(false);
                    onDone();
                }}
                onSave={save}
                onStay={() => setAskLeave(false)}
            />
            <IosActionSheet
                open={askDelete}
                title={scene ? `„${scene.name}" löschen?` : undefined}
                message={
                    usedBy.length > 0
                        ? `${usedBy.length === 1 ? 'Der Zeitpunkt' : `Die ${usedBy.length} Zeitpunkte`} im Wochenplan, ${usedBy.length === 1 ? 'der' : 'die'} diese Szene ${usedBy.length === 1 ? 'fährt' : 'fahren'}, ${usedBy.length === 1 ? 'wird' : 'werden'} mit gelöscht.`
                        : undefined
                }
                actions={[
                    {
                        key: 'delete',
                        label: 'Szene löschen',
                        tone: 'destructive',
                        onSelect: () => {
                            setAskDelete(false);
                            if (scene) model.deleteScene(scene.id);
                            onDone();
                        },
                    },
                ]}
                cancelLabel="Abbrechen"
                onCancel={() => setAskDelete(false)}
            />
        </div>
    );
}

// ── Zeitpunkt-Editor ───────────────────────────────────────────────────

function Stepper({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
    return (
        <div className="rpp-stepper">
            <button type="button" className="rpp-stepper-btn" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="weniger">
                <Minus size={14} />
            </button>
            <span className="rpp-stepper-val">
                {value > 0 ? '+' : value < 0 ? '−' : '±'}
                {Math.abs(value)}
                <span className="rpp-stepper-unit"> min</span>
            </span>
            <button type="button" className="rpp-stepper-btn" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="mehr">
                <Plus size={14} />
            </button>
        </div>
    );
}

function ClampRow({ label, value, onChange, fallback }: { label: string; value: string | null; onChange: (v: string | null) => void; fallback: string }) {
    return (
        <div className="rpp-kv">
            <span className="rpp-sub">{label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {value !== null && <input type="time" className="rpp-time-input rpp-time-input--sm" value={value} onChange={(e) => onChange(e.target.value || null)} />}
                <Toggle on={value !== null} onChange={(on) => onChange(on ? fallback : null)} label={label} />
            </span>
        </div>
    );
}

/** Kopiert den Eintrag ohne das `quiet`-Feld, damit ein nicht sichtbarer
 *  Zustand nie mitgespeichert wird. */
function omitQuiet(e: PlanEntry): PlanEntry {
    const { quiet: _quiet, ...rest } = e;
    return rest;
}

export function EntryEditor({
    model,
    entry,
    preset,
    onDone,
    headSlot,
    registerLeaveGuard,
    onDirtyChange,
}: {
    model: PlanModel;
    entry?: PlanEntry;
    preset?: Partial<PlanEntry>;
    onDone: () => void;
} & EditorChrome) {
    // Ausgangsstand einmal beim Oeffnen (bei einem neuen Zeitpunkt die Vorbelegung)
    const [base] = useState<PlanEntry>(
        () =>
            entry ?? {
                id: newId('e'),
                days: [true, true, true, true, true, false, false],
                trigger: { kind: 'time', time: '07:00', offset: 0, earliest: null, latest: null },
                target: model.scenes[0]
                    ? { kind: 'scene', sceneId: model.scenes[0].id }
                    : { kind: 'device', key: model.devices[0]?.key ?? '', closed: 0 },
                enabled: true,
                ...preset,
            },
    );
    const [e, setE] = useState<PlanEntry>(base);
    const set = (patch: Partial<PlanEntry>) => setE((p) => ({ ...p, ...patch }));
    const setTrig = (patch: Partial<PlanEntry['trigger']>) => setE((p) => ({ ...p, trigger: { ...p.trigger, ...patch } }));
    const [askLeave, setAskLeave] = useState(false);
    const [askDelete, setAskDelete] = useState(false);

    const todaySun = model.sunFor(model.today);
    const todayRes = triggerMinutes(e.trigger, todaySun);
    const next = model.nextRunOf(e);
    const nh = nextHoliday(model.today);

    const presets: { label: string; days: boolean[] }[] = [
        { label: 'Mo–Fr', days: [true, true, true, true, true, false, false] },
        { label: 'Sa/So', days: [false, false, false, false, false, true, true] },
        { label: 'täglich', days: [true, true, true, true, true, true, true] },
    ];

    const collisions = useMemo(
        () => findCollisions(e, model.entries, model.scenes, model.sunFor, model.today),
        [e, model.entries, model.scenes, model.sunFor, model.today],
    );

    const quietKeys = useMemo(() => devicesOfTarget(e.target, model.scenes), [e.target, model.scenes]);
    const slowCount = quietKeys.filter((k) => model.deviceOf(k)?.hasSlow).length;
    const canSaveEntry = e.days.some(Boolean) && !(e.target.kind === 'scene' && !e.target.sceneId);
    const dirty = !sameEntry(e, base);
    const canSave = dirty && canSaveEntry;
    useLeaveGuard(registerLeaveGuard, () => {
        if (!dirty) return true;
        setAskLeave(true);
        return false;
    });
    useReportDirty(onDirtyChange, dirty);
    const saveEntry = () => {
        model.saveEntry(slowCount > 0 && e.quiet ? { ...e, quiet: true } : omitQuiet(e));
        setAskLeave(false);
        onDone();
    };

    return (
        <div className="rpp-editor">
            <div className="rpp-section">
                <span className="rpp-label">Was fährt?</span>
                <Seg
                    value={e.target.kind}
                    options={[
                        { value: 'scene', label: 'Eine Szene' },
                        { value: 'device', label: 'Ein Rollladen' },
                    ]}
                    onChange={(k) =>
                        set({
                            target:
                                k === 'scene'
                                    ? { kind: 'scene', sceneId: model.scenes[0]?.id ?? '' }
                                    : { kind: 'device', key: model.devices[0]?.key ?? '', closed: 0 },
                        })
                    }
                />
                {e.target.kind === 'scene' ? (
                    model.scenes.length === 0 ? (
                        <span className="rpp-sub">Noch keine Szene angelegt.</span>
                    ) : (
                        <div className="rpp-chips rpp-chips--wrap">
                            {model.scenes.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    className={`rpp-chip rpp-chip--scene${e.target.kind === 'scene' && e.target.sceneId === s.id ? ' is-active' : ''}`}
                                    onClick={() => set({ target: { kind: 'scene', sceneId: s.id } })}
                                >
                                    <SceneGlyph icon={s.icon} size={14} /> {s.name}
                                </button>
                            ))}
                        </div>
                    )
                ) : (
                    <>
                        <select
                            className="rpp-input"
                            value={e.target.key}
                            onChange={(ev) => set({ target: { kind: 'device', key: ev.target.value, closed: e.target.kind === 'device' ? e.target.closed : 0 } })}
                        >
                            {model.floors.map((f) => (
                                <optgroup key={f} label={f}>
                                    {model.devices
                                        .filter((d) => d.floor === f)
                                        .map((d) => (
                                            <option key={d.key} value={d.key}>
                                                {d.label}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                        <div className="rpp-chips">
                            {POS_CHIPS.filter((c) => c.v !== null).map((c) => (
                                <button
                                    key={String(c.v)}
                                    type="button"
                                    className={`rpp-chip${e.target.kind === 'device' && e.target.closed === c.v ? ' is-active' : ''}`}
                                    onClick={() => e.target.kind === 'device' && set({ target: { ...e.target, closed: c.v as number } })}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <div className="rpp-section">
                <span className="rpp-label">Wann?</span>
                <Seg<TriggerKind>
                    value={e.trigger.kind}
                    options={[
                        { value: 'time', label: 'Uhrzeit' },
                        { value: 'sunrise', label: 'Sonnenaufgang' },
                        { value: 'sunset', label: 'Sonnenuntergang' },
                    ]}
                    onChange={(k) => setTrig({ kind: k })}
                />
                {e.trigger.kind === 'time' ? (
                    <div className="rpp-kv">
                        <span className="rpp-sub">Uhrzeit</span>
                        <input type="time" className="rpp-time-input" value={e.trigger.time} onChange={(ev) => setTrig({ time: ev.target.value || '07:00' })} />
                    </div>
                ) : (
                    <>
                        <div className="rpp-kv">
                            <span className="rpp-sub">
                                Versatz zu {e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'} ({hhmm(e.trigger.kind === 'sunrise' ? todaySun.sunrise : todaySun.sunset)} heute)
                            </span>
                            <Stepper value={e.trigger.offset} onChange={(v) => setTrig({ offset: v })} min={-120} max={120} step={5} />
                        </div>
                        <ClampRow label="Frühestens" value={e.trigger.earliest} onChange={(v) => setTrig({ earliest: v })} fallback={e.trigger.kind === 'sunrise' ? '06:30' : '17:30'} />
                        <ClampRow label="Spätestens" value={e.trigger.latest} onChange={(v) => setTrig({ latest: v })} fallback={e.trigger.kind === 'sunrise' ? '08:30' : '22:00'} />
                        <div className="rpp-hint">
                            Heute wäre das <b>{hhmm(todayRes.min)} Uhr</b>
                            {todayRes.clamped ? ' (durch die Grenze verschoben)' : ''}.
                        </div>
                    </>
                )}
            </div>

            <div className="rpp-section">
                <div className="rpp-section-head">
                    <span className="rpp-label">An welchen Tagen?</span>
                    <span className="rpp-presets">
                        {presets.map((p) => (
                            <button key={p.label} type="button" className="rpp-textbtn" onClick={() => set({ days: p.days })}>
                                {p.label}
                            </button>
                        ))}
                    </span>
                </div>
                <div className="rpp-daypick">
                    {WEEKDAYS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            aria-pressed={e.days[d]}
                            className={`rpp-daypick-btn${e.days[d] ? ' is-on' : ''}`}
                            onClick={() => set({ days: e.days.map((x, i) => (i === d ? !x : x)) })}
                        >
                            {WD_SHORT[d]}
                        </button>
                    ))}
                </div>
                <div className="rpp-hint">
                    Feiertage: {model.holidayMode === 'sunday' ? 'gelten wie Sonntag' : model.holidayMode === 'skip' ? 'es fährt nichts' : 'normaler Wochentag'}. Nächster:{' '}
                    {WD_SHORT[(nh.date.getDay() + 6) % 7]} {fmtDate(nh.date)} {nh.name}.
                </div>
                {collisions.length > 0 && (
                    <div className="rpp-hint">
                        Achtung: Es gibt schon einen Zeitpunkt, der dieselben Rollläden betrifft:{' '}
                        {collisions.slice(0, 2).map((c, i) => (
                            <span key={c.other.id}>
                                {i > 0 ? ', ' : ''}„{model.targetName(c.other.target)}" ({triggerText(c.other.trigger)}, {daysText(c.other.days)}), betrifft{' '}
                                {c.deviceKeys.map((k) => model.deviceOf(k)?.label ?? k).join(', ')}
                            </span>
                        ))}
                        {collisions.length > 2 ? ` +${collisions.length - 2} weitere` : ''}. Speichern geht trotzdem.
                    </div>
                )}
            </div>

            {slowCount > 0 && (
                <div className="rpp-section">
                    <div className="rpp-kv">
                        <span className="rpp-row-main">
                            <span className="rpp-title">Leise fahren</span>
                            <span className="rpp-sub">
                                {slowCount < quietKeys.length
                                    ? `Leise bei ${slowCount} von ${quietKeys.length} Rollläden, die übrigen fahren normal`
                                    : 'Langsamer und leiser, dauert etwa doppelt so lange'}
                            </span>
                        </span>
                        <Toggle on={!!e.quiet} onChange={(v) => set({ quiet: v })} label="Leise fahren" />
                    </div>
                </div>
            )}
            {slowCount === 0 && e.target.kind === 'device' && (
                <div className="rpp-section">
                    <span className="rpp-sub">Dieser Rollladen kann nicht leise fahren.</span>
                </div>
            )}

            <div className="rpp-section">
                <div className="rpp-kv">
                    <span className="rpp-title">Aktiv</span>
                    <Toggle on={e.enabled} onChange={(v) => set({ enabled: v })} label="Aktiv" />
                </div>
                <span className="rpp-sub">
                    {e.enabled && next ? `Nächstes Mal: ${dayLabel(next.date, model.today)}, ${hhmm(next.min)} Uhr` : 'Fährt nicht, solange ausgeschaltet.'}
                </span>
            </div>

            {entry && <IosButtonRow label="Zeitpunkt löschen" tone="danger" onClick={() => setAskDelete(true)} />}

            <SaveButton slot={headSlot} canSave={canSave} onSave={saveEntry} />
            <LeaveSheet
                open={askLeave}
                canSave={canSave}
                onDiscard={() => {
                    setAskLeave(false);
                    onDone();
                }}
                onSave={saveEntry}
                onStay={() => setAskLeave(false)}
            />
            <IosActionSheet
                open={askDelete}
                actions={[
                    {
                        key: 'delete',
                        label: 'Zeitpunkt löschen',
                        tone: 'destructive',
                        onSelect: () => {
                            setAskDelete(false);
                            if (entry) model.deleteEntry(entry.id);
                            onDone();
                        },
                    },
                ]}
                cancelLabel="Abbrechen"
                onCancel={() => setAskDelete(false)}
            />
        </div>
    );
}
