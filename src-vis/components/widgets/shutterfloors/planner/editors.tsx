/**
 * Editoren + Popup-Geruest der Rolllaeden-Planer-Kachel (Produktion,
 * Feature 23). Herkunft: parts.tsx im inzwischen entfernten Entwurf (SceneEditor, EntryEditor,
 * PlanSheet, SettingsCard).
 *
 * Liegt in einer eigenen Datei statt in parts.tsx, weil PlanSheet direkt auf
 * SceneEditor/EntryEditor verdrahtet ist. parts.tsx importiert von hier NUR
 * den Typ `SheetView` (type-only, zur Kompilierzeit entfernt) — das haelt die
 * beiden Dateien frei von einem echten Laufzeit-Zirkel.
 *
 * SettingsCard trägt hier zusätzlich die drei Ansicht-Schalter aus Runde 5
 * (Sascha, s. Auftrag): Listen kompakt/mit Namen, Startseite Heute/Nächste 3,
 * Szenen Liste/Kacheln — Einstellung pro Gerät via useRollPlanView.ts
 * (localStorage), nicht auf dem Pi.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Play, Plus, Sunrise, Sunset, Trash2 } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { useSheetDismiss } from '../../useSheetDismiss';
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
    type HolidayMode,
    type PlanEntry,
    type PlanModel,
    type Scene,
    type SceneIcon,
    type TriggerKind,
} from './planModel';
import { Caption, closedWord, DayLetters, DeviceGlyph, SceneGlyph, SCENE_ICONS, Seg, Toggle } from './parts';
import { useRollPlanViewStore, type FirstPage, type ListStyle, type SceneView } from './useRollPlanView';

// ── Sheet-Navigation (Popup-Geruest) ────────────────────────────────────

export type SceneDraft = { name: string; icon: SceneIcon; favorite: boolean; targets: Record<string, { closed: number; slat?: number }> };

/** `back` = wohin „Zurück" und „Speichern" führen (z. B. zurück in die Szene). */
export type SheetView =
    | { v: 'home' }
    | { v: 'scene'; id: string | null; draft?: SceneDraft }
    | { v: 'entry'; id: string | null; preset?: Partial<PlanEntry>; back?: SheetView };

export function PlanSheet({
    title,
    subtitle,
    view,
    setView,
    onClose,
    model,
    home,
}: {
    title: string;
    subtitle?: string;
    view: SheetView;
    setView: (v: SheetView) => void;
    onClose: () => void;
    model: PlanModel;
    home: ReactNode;
}) {
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick } = useSheetDismiss(onClose);
    const back = () => setView(view.v === 'entry' && view.back ? view.back : { v: 'home' });
    let head = title;
    let sub = subtitle;
    let body: ReactNode = home;
    if (view.v === 'scene') {
        const s = view.id ? model.sceneOf(view.id) : undefined;
        head = s ? s.name : 'Neue Szene';
        sub = 'Welche Rollläden fahren wohin?';
        body = <SceneEditor key={view.id ?? 'new'} model={model} scene={s} draft={view.draft} onDone={back} setView={setView} />;
    } else if (view.v === 'entry') {
        const e = view.id ? model.entries.find((x) => x.id === view.id) : undefined;
        head = e ? 'Zeitpunkt bearbeiten' : 'Neuer Zeitpunkt';
        sub = 'Was fährt wann?';
        body = <EntryEditor key={view.id ?? 'new'} model={model} entry={e} preset={view.preset} onDone={back} />;
    }
    return createPortal(
        <div className="rpp-sheet-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div className="rpp-sheet" style={sheetStyle} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="rpp-sheet-drag" {...dragHandlers}>
                    <div className="rpp-sheet-grip">
                        <div className="rpp-grip-handle" />
                    </div>
                    <div className="rpp-sheet-header">
                        {view.v !== 'home' && (
                            // Pointer-Stops wie bei der Feder im Rollladen-Popup: sonst
                            // schluckt setPointerCapture der Wischgeste den Tap.
                            <button
                                type="button"
                                className="rpp-back"
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                                onPointerMove={(e) => e.stopPropagation()}
                                onClick={back}
                                aria-label="Zurück"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 className="rpp-sheet-title">{head}</h2>
                            {sub && <p className="rpp-sheet-subtitle">{sub}</p>}
                        </div>
                    </div>
                </div>
                {/* key: jede Ansicht beginnt oben, statt die Scrollhöhe der vorigen zu erben */}
                <div className="rpp-sheet-body" key={view.v === 'home' ? 'home' : `${view.v}-${view.id ?? 'new'}`}>
                    {body}
                </div>
            </div>
        </div>,
        portalTarget ?? document.body,
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

function SceneEditor({
    model,
    scene,
    draft,
    onDone,
    setView,
}: {
    model: PlanModel;
    scene?: Scene;
    draft?: SceneDraft;
    onDone: () => void;
    setView: (v: SheetView) => void;
}) {
    const [name, setName] = useState(draft?.name ?? scene?.name ?? '');
    const [icon, setIcon] = useState<SceneIcon>(draft?.icon ?? scene?.icon ?? 'sun');
    const [favorite, setFavorite] = useState<boolean>(draft?.favorite ?? scene?.favorite ?? false);
    const [targets, setTargets] = useState<Record<string, { closed: number; slat?: number }>>(() =>
        draft?.targets ?? Object.fromEntries(
            (scene?.targets ?? []).map((t) => [
                t.key,
                { closed: t.closed, slat: model.deviceOf(t.key)?.hasSlat ? (t.slat ?? 0) : undefined },
            ]),
        ),
    );
    const count = Object.keys(targets).length;

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
        onDone();
    };

    const usedBy = scene ? model.entriesOfScene(scene.id) : [];
    const backHere = (): SheetView => ({ v: 'scene', id: scene?.id ?? null, draft: { name, icon, favorite, targets } });

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
                // Kreis schliessen: Zeitpunkt antippen oder anlegen; „Zurück"
                // fuehrt wieder hierher – mit den noch ungespeicherten Aenderungen.
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
                                onClick={() => setView({ v: 'entry', id: e.id, back: backHere() })}
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
                                setView({ v: 'entry', id: null, preset: { target: { kind: 'scene', sceneId: scene.id } }, back: backHere() })
                            }
                        >
                            <Plus size={16} /> Zeit hinzufügen
                        </button>
                    </div>
                </div>
            )}

            <div className="rpp-actions">
                {scene && (
                    <button
                        type="button"
                        className="rpp-btn rpp-btn--danger rpp-btn--icon"
                        aria-label="Szene löschen"
                        onClick={() => {
                            model.deleteScene(scene.id);
                            onDone();
                        }}
                    >
                        <Trash2 size={16} />
                    </button>
                )}
                {scene && (
                    <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => model.runScene(scene.id)}>
                        <Play size={14} /> Jetzt fahren
                    </button>
                )}
                <button type="button" className="rpp-btn rpp-btn--primary" onClick={save} disabled={count === 0}>
                    Speichern
                </button>
            </div>
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

function EntryEditor({
    model,
    entry,
    preset,
    onDone,
}: {
    model: PlanModel;
    entry?: PlanEntry;
    preset?: Partial<PlanEntry>;
    onDone: () => void;
}) {
    const base: PlanEntry = entry ?? {
        id: newId('e'),
        days: [true, true, true, true, true, false, false],
        trigger: { kind: 'time', time: '07:00', offset: 0, earliest: null, latest: null },
        target: model.scenes[0] ? { kind: 'scene', sceneId: model.scenes[0].id } : { kind: 'device', key: model.devices[0]?.key ?? '', closed: 0 },
        enabled: true,
        ...preset,
    };
    const [e, setE] = useState<PlanEntry>(base);
    const set = (patch: Partial<PlanEntry>) => setE((p) => ({ ...p, ...patch }));
    const setTrig = (patch: Partial<PlanEntry['trigger']>) => setE((p) => ({ ...p, trigger: { ...p.trigger, ...patch } }));

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

            <div className="rpp-actions">
                {entry && (
                    <button
                        type="button"
                        className="rpp-btn rpp-btn--danger rpp-btn--icon"
                        aria-label="Zeitpunkt löschen"
                        onClick={() => {
                            model.deleteEntry(entry.id);
                            onDone();
                        }}
                    >
                        <Trash2 size={16} />
                    </button>
                )}
                <button
                    type="button"
                    className="rpp-btn rpp-btn--primary"
                    disabled={!e.days.some(Boolean) || (e.target.kind === 'scene' && !e.target.sceneId)}
                    onClick={() => {
                        model.saveEntry(slowCount > 0 && e.quiet ? { ...e, quiet: true } : omitQuiet(e));
                        onDone();
                    }}
                >
                    Speichern
                </button>
            </div>
        </div>
    );
}

// ── Einstellungen (Hauptschalter, Feiertage, Ansicht) ──────────────────

export function SettingsCard({ model }: { model: PlanModel }) {
    const sun = model.sunFor(model.today);
    const nh = nextHoliday(model.today);
    const view = useRollPlanViewStore();
    return (
        <>
            <div className="rpp-card">
                <div className="rpp-row">
                    <span className="rpp-row-main">
                        <span className="rpp-title">Wochenplan aktiv</span>
                        <span className="rpp-sub">Hauptschalter für alle Zeitpunkte</span>
                    </span>
                    <Toggle on={model.master} onChange={model.setMaster} label="Wochenplan aktiv" />
                </div>
                <div className="rpp-row">
                    <span className="rpp-row-main">
                        <span className="rpp-title">Heute aussetzen</span>
                        <span className="rpp-sub">Ab morgen läuft der Plan wieder</span>
                    </span>
                    <Toggle on={model.pausedToday} onChange={model.setPausedToday} label="Heute aussetzen" />
                </div>
            </div>
            <div className="rpp-card rpp-pad">
                <span className="rpp-label">Feiertage</span>
                <Seg<HolidayMode>
                    size="sm"
                    value={model.holidayMode}
                    options={[
                        { value: 'sunday', label: 'wie Sonntag' },
                        { value: 'normal', label: 'normal' },
                        { value: 'skip', label: 'nichts fahren' },
                    ]}
                    onChange={model.setHolidayMode}
                />
                <span className="rpp-hint">
                    Nächster Feiertag: {WD_SHORT[(nh.date.getDay() + 6) % 7]} {fmtDate(nh.date)} · {nh.name}
                </span>
            </div>
            <div className="rpp-card rpp-pad">
                <span className="rpp-label">Sonne heute{sun.fromPi ? '' : ' (gerechnet)'}</span>
                <div className="rpp-sun-row">
                    <span>
                        <Sunrise size={15} /> {hhmm(sun.sunrise)}
                    </span>
                    <span>
                        <Sunset size={15} /> {hhmm(sun.sunset)}
                    </span>
                    <span className="rpp-sub">Dämmerung bis {hhmm(sun.dusk)}</span>
                </div>
            </div>
            <div className="rpp-card rpp-pad">
                <span className="rpp-label">Ansicht</span>
                <span className="rpp-hint">Listen hier im Fenster</span>
                <Seg<ListStyle>
                    size="sm"
                    value={view.list}
                    options={[
                        { value: 'A', label: 'kompakt' },
                        { value: 'L', label: 'mit Rollladen-Namen' },
                    ]}
                    onChange={(list) => view.setView({ list })}
                />
                <span className="rpp-hint">Erste Seite der Kachel</span>
                <Seg<FirstPage>
                    size="sm"
                    value={view.first}
                    options={[
                        { value: 'today', label: 'Heute' },
                        { value: 'next', label: 'Nächste 3' },
                    ]}
                    onChange={(first) => view.setView({ first })}
                />
                <span className="rpp-hint">Szenen auf der Kachel</span>
                <Seg<SceneView>
                    size="sm"
                    value={view.scenes}
                    options={[
                        { value: 'S', label: 'Liste' },
                        { value: 'W', label: 'Kacheln, 6 pro Seite' },
                    ]}
                    onChange={(scenes) => view.setView({ scenes })}
                />
            </div>
        </>
    );
}
