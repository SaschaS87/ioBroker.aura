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
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ChevronRight, Minus, Plus, X } from 'lucide-react';
import {
    IosActionSheet,
    IosButtonRow,
    IosLeaveSheet as LeaveSheet,
    IosSaveButton as SaveButton,
    useLeaveGuard,
    useReportDirty,
    type LeaveGuardRegister,
} from '../../../common/ios';
import {
    daysText,
    entryNameOf,
    findCollisions,
    fmtDate,
    hhmm,
    dayLabel,
    newId,
    nextHoliday,
    quietSplit,
    resolveTargets,
    sceneTargetText,
    targetConflicts,
    triggerMinutes,
    triggerText,
    WD_SHORT,
    WEEKDAYS,
    type PlanEntry,
    type PlanModel,
    type PlanDevice,
    type PlanTarget,
    type Scene,
    type SceneIcon,
    type TargetConflict,
    type TriggerKind,
} from './planModel';
import { Caption, closedWord, DayLetters, DeviceGlyph, SceneGlyph, SCENE_ICONS, Seg, Toggle } from './parts';
import { sameEntry, sameSceneDraft, sceneDraftOf, sceneFromDraft, type SceneTargets } from './editorDirty';
import { useFaceliftVariant } from '../../../layout/facelift/faceliftVariant';
import { ShutterKindIcon } from '../ShutterKindIcon';
import { SceneTargetSheet } from './SceneTargetSheet';

/** Wohin ein Tipp in einem Editor fuehrt (Szene oeffnet Zeitpunkte; die Szene bleibt darunter eingehaengt). */
export type SheetView =
    | { v: 'scene'; id: string | null }
    | { v: 'entry'; id: string | null; preset?: Partial<PlanEntry> };

// Zurück-Wächter, „ungesichert"-Meldung, „Sichern" im Kopf und die Rückfrage beim Zurück sind seit
// 17.11.2026 gemeinsame Bausteine (common/ios/IosEditor.tsx), damit Rollläden und Garten dasselbe Muster teilen.
export type { LeaveGuardRegister };

interface EditorChrome {
    /** Platz rechts im Seitenkopf fuer "Sichern" (per Portal) */
    headSlot?: HTMLElement | null;
    registerLeaveGuard?: LeaveGuardRegister;
    onDirtyChange?: (dirty: boolean) => void;
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

/** Ziele-Block des Szenen-Editors in der Ist-Fassung (Chips je Rollladen), unverändert aus SceneEditor. */
function ClassicSceneTargets({
    model,
    targets,
    count,
    setPos,
    setSlat,
    takeCurrent,
}: {
    model: PlanModel;
    targets: SceneTargets;
    count: number;
    setPos: (key: string, v: number | null, hasSlat: boolean) => void;
    setSlat: (key: string, s: number) => void;
    takeCurrent: () => void;
}) {
    return (
        <>
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
        </>
    );
}

/** Ziele-Block des Szenen-Editors im Facelift: Liste je Etage, Antippen öffnet das Ziel-Pop-up. */
function FaceliftSceneTargets({
    model,
    targets,
    setTargets,
    takeCurrent,
}: {
    model: PlanModel;
    targets: SceneTargets;
    setTargets: Dispatch<SetStateAction<SceneTargets>>;
    takeCurrent: () => void;
}) {
    const [pick, setPick] = useState<string | null>(null);
    const count = Object.keys(targets).length;
    const m = Object.entries(targets).filter(([k, t]) => {
        const d = model.deviceOf(k);
        return t.quiet === true && !!d && d.hasSlow && !d.hasSlat;
    }).length;
    const device: PlanDevice | undefined = pick ? model.deviceOf(pick) : undefined;

    return (
        <>
            <div className="rpp-section rpp-section--flush rpp-scene-head">
                <div className="rpp-section-head">
                    <span className="rpp-label">
                        {count} {count === 1 ? 'Rollladen' : 'Rollläden'} beteiligt{m > 0 ? ` · ${m} leise` : ''}
                    </span>
                    <button type="button" className="rpp-textbtn" onClick={takeCurrent}>
                        Aktuellen Stand übernehmen
                    </button>
                </div>
                <div className="rpp-hint">Tippe auf einen Rollladen, um sein Ziel in dieser Szene festzulegen.</div>
            </div>

            {model.floors.map((floor) => (
                <section key={floor} className="aura-fl-section">
                    <div className="aura-fl-section-head">
                        <h2 className="aura-fl-section-title">{floor}</h2>
                    </div>
                    <div className="aura-fl-card">
                        {model.devices
                            .filter((d) => d.floor === floor)
                            .map((d) => {
                                const t = targets[d.key];
                                const text = sceneTargetText(t, d);
                                return (
                                    <button
                                        key={d.key}
                                        type="button"
                                        className="aura-fl-row aura-fl-row--nav"
                                        onClick={() => setPick(d.key)}
                                        aria-label={`${d.label}: ${text}`}
                                    >
                                        <span className={`sf-ico is-${d.kind} aura-fl-row-icon`}>
                                            <ShutterKindIcon kind={d.kind} closed={t ? t.closed : null} busy={false} />
                                        </span>
                                        <span className="aura-fl-row-main">
                                            <span className="aura-fl-row-title">{d.label}</span>
                                            <span className="aura-fl-row-sub">{text}</span>
                                        </span>
                                        <ChevronRight size={18} className="aura-fl-chev" />
                                    </button>
                                );
                            })}
                    </div>
                </section>
            ))}

            {pick && device && (
                <SceneTargetSheet
                    device={device}
                    value={targets[pick] ?? null}
                    onApply={(v) =>
                        setTargets((prev) => {
                            const n = { ...prev };
                            if (v) n[pick] = v;
                            else delete n[pick];
                            return n;
                        })
                    }
                    onClose={() => setPick(null)}
                />
            )}
        </>
    );
}

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
    const flv = useFaceliftVariant();
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
            else
                next[key] = {
                    closed: v,
                    slat: hasSlat ? (prev[key]?.slat ?? 0) : undefined,
                    ...(prev[key]?.quiet ? { quiet: true as const } : {}),
                };
            return next;
        });
    const setSlat = (key: string, s: number) => setTargets((prev) => ({ ...prev, [key]: { ...prev[key], slat: s } }));

    const takeCurrent = () => {
        setTargets((prev) => {
            const next: SceneTargets = {};
            model.devices.forEach((d) => {
                if (d.closed === null) return;
                const quiet = prev[d.key]?.quiet ? { quiet: true as const } : {};
                if (flv)
                    next[d.key] = {
                        closed: Math.round(d.closed),
                        slat: d.hasSlat ? (prev[d.key]?.slat ?? 0) : undefined,
                        ...quiet,
                    };
                else next[d.key] = { closed: Math.round(d.closed / 5) * 5, slat: d.hasSlat ? 0 : undefined, ...quiet };
            });
            return next;
        });
        model.showToast('Aktuelle Stellung aller Rollläden übernommen');
    };

    const save = () => {
        const s = sceneFromDraft(scene?.id ?? newId('s'), { name, icon, favorite, targets });
        model.saveScene(s);
        setAskLeave(false);
        onDone();
    };

    const usedBy = scene ? model.entriesOfScene(scene.id) : [];
    const onlyThis = usedBy.filter((e) => e.targets.every((t) => t.kind === 'scene' && t.sceneId === scene?.id)).length;
    const shortened = usedBy.length - onlyThis;
    const deleteParts: string[] = [];
    if (onlyThis > 0) deleteParts.push(`${onlyThis === 1 ? 'Der Zeitpunkt' : `Die ${onlyThis} Zeitpunkte`} im Wochenplan, ${onlyThis === 1 ? 'der' : 'die'} nur diese Szene ${onlyThis === 1 ? 'fährt' : 'fahren'}, ${onlyThis === 1 ? 'wird' : 'werden'} mit gelöscht.`);
    if (shortened > 0) deleteParts.push(`${shortened === 1 ? 'Aus einem Zeitpunkt' : `Aus ${shortened} Zeitpunkten`} mit weiteren Zielen wird nur diese Szene entfernt, die übrigen Ziele bleiben.`);
    const deleteMessage = deleteParts.length ? deleteParts.join(' ') : undefined;

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
                <SwitchRow title="Favorit" sub="Als Schnellknopf auf der Kachel zeigen">
                    <Toggle on={favorite} onChange={setFavorite} label="Favorit" />
                </SwitchRow>
            </div>

            {flv ? (
                <FaceliftSceneTargets
                    model={model}
                    targets={targets}
                    setTargets={setTargets}
                    takeCurrent={takeCurrent}
                />
            ) : (
                <ClassicSceneTargets
                    model={model}
                    targets={targets}
                    count={count}
                    setPos={setPos}
                    setSlat={setSlat}
                    takeCurrent={takeCurrent}
                />
            )}

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
                                    preset: { targets: [{ kind: 'scene', sceneId: scene.id }] },
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
                message={deleteMessage}
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

/** Kopiert den Eintrag ohne `quiet` und `name` und setzt beide nur, wenn sie wirklich gelten
 *  (leise nur mit keepQuiet, Name nur getrimmt und nicht leer), damit ein nicht sichtbarer
 *  Zustand nie mitgespeichert wird. */
function cleanEntry(e: PlanEntry, keepQuiet: boolean): PlanEntry {
    const { quiet: _quiet, name: _name, ...rest } = e;
    const out: PlanEntry = rest;
    if (keepQuiet && e.quiet) out.quiet = true;
    const name = e.name?.trim();
    if (name) out.name = name;
    return out;
}

function conflictLine(m: PlanModel, e: PlanEntry, c: TargetConflict): string {
    const label = m.deviceOf(c.key)?.label ?? c.key;
    const n = c.sources.length;
    const count = n === 2 ? 'zwei' : n === 3 ? 'drei' : String(n);
    const w = c.winner;
    const pos = closedWord(Math.round(w.closed)) + (typeof w.slat === 'number' ? ` · Lamelle ${Math.round(w.slat)}°` : '');
    const src = w.kind === 'device' ? 'einzeln gewählt' : `aus „${m.targetName(e.targets[w.from])}"`;
    return `${label} steht in ${count} Zielen. Es gilt: ${pos} (${src}).`;
}

/** Liste der Ziele eines Zeitpunkts (Szenen und einzelne Rollläden), mit Hinzufügen und Entfernen. */
function TargetListEditor({
    model,
    entry,
    onChange,
    conflicts,
}: {
    model: PlanModel;
    entry: PlanEntry;
    onChange: (t: PlanTarget[]) => void;
    conflicts: TargetConflict[];
}) {
    const usedScenes = new Set(entry.targets.flatMap((t) => (t.kind === 'scene' ? [t.sceneId] : [])));
    const usedDevices = new Set(entry.targets.flatMap((t) => (t.kind === 'device' ? [t.key] : [])));
    const freeScenes = model.scenes.filter((s) => !usedScenes.has(s.id));
    return (
        <>
            <div className="rpp-card rpp-tlist">
                {entry.targets.length === 0 && (
                    <div className="rpp-tlist-row">
                        <span className="rpp-sub">Noch nichts gewählt. Füge unten eine Szene oder einen Rollladen hinzu.</span>
                    </div>
                )}
                {entry.targets.map((t, i) => {
                    const name = model.targetName(t);
                    const dev = t.kind === 'device' ? model.deviceOf(t.key) : undefined;
                    const n = model.targetCount(t);
                    return (
                        <div key={`${i}-${t.kind}-${t.kind === 'scene' ? t.sceneId : t.key}`} className="rpp-tlist-row">
                            <div className="rpp-tlist-head">
                                <span className="rpp-row-icon">
                                    {t.kind === 'scene' ? (
                                        <SceneGlyph icon={model.sceneOf(t.sceneId)?.icon ?? 'home'} size={16} />
                                    ) : (
                                        <DeviceGlyph kind={dev?.kind ?? 'fenster'} closed={t.closed} size={16} />
                                    )}
                                </span>
                                <span className="rpp-title rpp-grow rpp-tlist-name">{name}</span>
                                {t.kind === 'scene' && (
                                    <span className="rpp-sub">
                                        {n} {n === 1 ? 'Rollladen' : 'Rollläden'}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="rpp-tlist-del"
                                    aria-label={`${name} entfernen`}
                                    onClick={() => onChange(entry.targets.filter((_, j) => j !== i))}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            {t.kind === 'device' && (
                                <div className="rpp-chips">
                                    {POS_CHIPS.filter((c) => c.v !== null).map((c) => (
                                        <button
                                            key={String(c.v)}
                                            type="button"
                                            className={`rpp-chip${t.closed === c.v ? ' is-active' : ''}`}
                                            onClick={() => onChange(entry.targets.map((x, j) => (j === i ? { ...t, closed: c.v as number } : x)))}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="rpp-tlist-row">
                    <div className="rpp-tlist-add">
                        <select
                            className="rpp-input rpp-tlist-pick"
                            aria-label="Szene hinzufügen"
                            value=""
                            disabled={freeScenes.length === 0}
                            onChange={(ev) => {
                                if (ev.target.value) onChange([...entry.targets, { kind: 'scene', sceneId: ev.target.value }]);
                            }}
                        >
                            <option value="">+ Szene</option>
                            {(
                                [
                                    ['Favoriten', freeScenes.filter((s) => s.favorite)],
                                    ['Weitere', freeScenes.filter((s) => !s.favorite)],
                                ] as [string, Scene[]][]
                            )
                                .filter(([, list]) => list.length > 0)
                                .map(([label, list]) => (
                                    <optgroup key={label} label={label}>
                                        {list.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                        </select>
                        <select
                            className="rpp-input rpp-tlist-pick"
                            aria-label="Rollladen hinzufügen"
                            value=""
                            onChange={(ev) => {
                                if (ev.target.value) onChange([...entry.targets, { kind: 'device', key: ev.target.value, closed: 0 }]);
                            }}
                        >
                            <option value="">+ Rollladen</option>
                            {model.floors.map((f) => (
                                <optgroup key={f} label={f}>
                                    {model.devices
                                        .filter((d) => d.floor === f)
                                        .map((d) => (
                                            <option key={d.key} value={d.key} disabled={usedDevices.has(d.key)}>
                                                {d.label}
                                                {usedDevices.has(d.key) ? ' (schon gewählt)' : ''}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {conflicts.length > 0 && (
                <div className="rpp-hint rpp-tlist-hint" role="status">
                    {conflicts.slice(0, 3).map((c) => (
                        <span key={c.key} className="rpp-quiet-line">
                            {conflictLine(model, entry, c)}
                        </span>
                    ))}
                    {conflicts.length > 3 && <span className="rpp-quiet-line">+ {conflicts.length - 3} weitere</span>}
                </div>
            )}
        </>
    );
}

/**
 * Schalterzeile. Im Facelift steht der Schalter immer auf Höhe der Überschrift, der Erklärtext
 * darunter über die volle Breite (so wie bei „Aktiv"). Bei „Ist" bleibt der alte Aufbau.
 */
function SwitchRow({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
    const flv = useFaceliftVariant();
    if (!flv) {
        return (
            <div className="rpp-kv">
                <span className="rpp-row-main">
                    <span className="rpp-title">{title}</span>
                    {sub && <span className="rpp-sub">{sub}</span>}
                </span>
                {children}
            </div>
        );
    }
    return (
        <>
            <div className="rpp-kv">
                <span className="rpp-title">{title}</span>
                {children}
            </div>
            {sub && <span className="rpp-sub rpp-switch-sub">{sub}</span>}
        </>
    );
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
    const flv = useFaceliftVariant();
    // Ausgangsstand einmal beim Oeffnen (bei einem neuen Zeitpunkt die Vorbelegung).
    // Neu: die Ziel-Liste startet leer. Ist: wie bisher mit der ersten Szene vorbelegt.
    const [base] = useState<PlanEntry>(
        () =>
            entry ?? {
                id: newId('e'),
                days: [true, true, true, true, true, false, false],
                trigger: { kind: 'time', time: '07:00', offset: 0, earliest: null, latest: null },
                targets: flv
                    ? []
                    : [
                          model.scenes[0]
                              ? { kind: 'scene', sceneId: model.scenes[0].id }
                              : { kind: 'device', key: model.devices[0]?.key ?? '', closed: 0 },
                      ],
                enabled: true,
                ...preset,
            },
    );
    const [e, setE] = useState<PlanEntry>(base);
    const set = (patch: Partial<PlanEntry>) => setE((p) => ({ ...p, ...patch }));
    const setTrig = (patch: Partial<PlanEntry['trigger']>) => setE((p) => ({ ...p, trigger: { ...p.trigger, ...patch } }));
    const [askLeave, setAskLeave] = useState(false);
    const [askDelete, setAskDelete] = useState(false);

    const listMode = flv || base.targets.length !== 1; // Ist mit einem Ziel: Oberfläche exakt wie heute
    const t0 = e.targets[0];
    const setT0 = (t: PlanTarget) => set({ targets: [t] });
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

    const resolved = useMemo(() => resolveTargets(e, model.scenes), [e, model.scenes]);
    const slowCount = resolved.filter((r) => model.deviceOf(r.key)?.hasSlow).length;
    const conflicts = useMemo(() => targetConflicts(e, model.scenes), [e, model.scenes]);
    const sceneTargetCount = e.targets.filter((t) => t.kind === 'scene').length;
    const onlyOneDevice = e.targets.length === 1 && e.targets[0].kind === 'device';
    const allDevices = e.targets.length > 0 && e.targets.every((t) => t.kind === 'device');
    const deviceOf = model.deviceOf;
    // Wer fährt mit dem jetzigen Schalterstand leise, wer normal (Namen für den Hinweis)
    const split = useMemo(
        () => quietSplit(e, model.scenes, (k) => !!deviceOf(k)?.hasSlow),
        [e, model.scenes, deviceOf],
    );
    const names = (keys: string[]) => keys.map((k) => deviceOf(k)?.label ?? k).join(', ');
    const canSaveEntry = e.days.some(Boolean) && e.targets.length > 0 && e.targets.every((t) => t.kind !== 'scene' || !!t.sceneId);
    const dirty = !sameEntry(e, base);
    const canSave = dirty && canSaveEntry;
    useLeaveGuard(registerLeaveGuard, () => {
        if (!dirty) return true;
        setAskLeave(true);
        return false;
    });
    useReportDirty(onDirtyChange, dirty);
    const saveEntry = () => {
        model.saveEntry(cleanEntry(e, slowCount > 0));
        setAskLeave(false);
        onDone();
    };

    return (
        <div
            className="rpp-editor"
            // Tastatur einfahren, sobald woanders getippt oder gescrollt wird (sonst verdeckt sie am Handy Zurück/Sichern)
            onPointerDown={(ev) => {
                const a = document.activeElement;
                if (a instanceof HTMLInputElement && a.id === 'rpp-entry-name' && ev.target !== a) a.blur();
            }}
        >
            <div className="rpp-section">
                <span className="rpp-label">Was fährt?</span>
                {listMode ? (
                    <>
                        <TargetListEditor model={model} entry={e} onChange={(targets) => set({ targets })} conflicts={conflicts} />
                        <label className="rpp-label" htmlFor="rpp-entry-name">
                            Name (freiwillig)
                        </label>
                        <div className="rpp-name-wrap">
                            <input
                                id="rpp-entry-name"
                                className="rpp-input"
                                maxLength={60}
                                enterKeyHint="done"
                                value={e.name ?? ''}
                                placeholder={e.targets.length > 0 ? entryNameOf({ targets: e.targets }, model.targetName) : 'Name'}
                                onChange={(ev) => set({ name: ev.target.value })}
                                onKeyDown={(ev) => {
                                    if (ev.key === 'Enter') ev.currentTarget.blur();
                                }}
                            />
                            {!!e.name && (
                                <button type="button" className="rpp-name-clear" aria-label="Name löschen" onClick={() => set({ name: '' })}>
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                    <Seg
                        value={t0.kind}
                        options={[
                            { value: 'scene', label: 'Eine Szene' },
                            { value: 'device', label: 'Ein Rollladen' },
                        ]}
                        onChange={(k) =>
                            setT0(
                                k === 'scene'
                                    ? { kind: 'scene', sceneId: model.scenes[0]?.id ?? '' }
                                    : { kind: 'device', key: model.devices[0]?.key ?? '', closed: 0 },
                            )
                        }
                    />
                    {t0.kind === 'scene' ? (
                        model.scenes.length === 0 ? (
                            <span className="rpp-sub">Noch keine Szene angelegt.</span>
                        ) : (
                            <div className="rpp-chips rpp-chips--wrap">
                                {model.scenes.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className={`rpp-chip rpp-chip--scene${t0.kind === 'scene' && t0.sceneId === s.id ? ' is-active' : ''}`}
                                        onClick={() => setT0({ kind: 'scene', sceneId: s.id })}
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
                                value={t0.kind === 'device' ? t0.key : ''}
                                onChange={(ev) => setT0({ kind: 'device', key: ev.target.value, closed: t0.kind === 'device' ? t0.closed : 0 })}
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
                                        className={`rpp-chip${t0.kind === 'device' && t0.closed === c.v ? ' is-active' : ''}`}
                                        onClick={() => t0.kind === 'device' && setT0({ ...t0, closed: c.v as number })}
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
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
                            <button
                                key={p.label}
                                type="button"
                                aria-pressed={p.days.every((x, i) => x === e.days[i])}
                                className={`rpp-textbtn rpp-preset${p.days.every((x, i) => x === e.days[i]) ? ' is-active' : ''}`}
                                onClick={() => set({ days: p.days })}
                            >
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
                                {i > 0 ? ', ' : ''}„{model.entryName(c.other)}" ({triggerText(c.other.trigger)}, {daysText(c.other.days)}), betrifft{' '}
                                {c.deviceKeys.map((k) => model.deviceOf(k)?.label ?? k).join(', ')}
                            </span>
                        ))}
                        {collisions.length > 2 ? ` +${collisions.length - 2} weitere` : ''}. Speichern geht trotzdem.
                    </div>
                )}
            </div>

            {slowCount > 0 && (
                <div className="rpp-section">
                    <SwitchRow
                        title="Leise fahren"
                        sub={
                            onlyOneDevice ? (
                                'Langsamer und leiser, dauert etwa doppelt so lange'
                            ) : (
                                <>
                                    <span className="rpp-quiet-line">
                                        <b>
                                            {e.quiet || sceneTargetCount === 0
                                                ? 'Leise:'
                                                : sceneTargetCount === 1
                                                  ? 'Leise durch die Szene:'
                                                  : 'Leise durch die Szenen:'}
                                        </b>{' '}
                                        {split.quiet.length > 0 ? names(split.quiet) : 'keiner'}
                                    </span>
                                    {split.normal.length > 0 && (
                                        <span className="rpp-quiet-line">
                                            <b>{flv ? 'Nicht leise:' : 'Normal:'}</b> {names(split.normal)}
                                        </span>
                                    )}
                                </>
                            )
                        }
                    >
                        <Toggle on={!!e.quiet} onChange={(v) => set({ quiet: v })} label="Leise fahren" />
                    </SwitchRow>
                </div>
            )}
            {slowCount === 0 && allDevices && (
                <div className="rpp-section">
                    <span className="rpp-sub">{onlyOneDevice ? 'Dieser Rollladen kann nicht leise fahren.' : 'Diese Rollläden können nicht leise fahren.'}</span>
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
