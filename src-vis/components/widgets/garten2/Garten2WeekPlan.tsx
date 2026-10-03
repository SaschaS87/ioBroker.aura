/**
 * Karte „Wochenplan" des Garten2-Steuerpults.
 *
 * Je Kreis eine Zeile mit Modusschalter (Verdunstung/Zeitplan, unveraendert
 * über useSprinkleCircle.setMode), Wochentags-Plaettchen, „Naechster Lauf"-Pille
 * und Handbetrieb (Dauer-Chip + „Jetzt gießen").
 *
 * Seit Feature 24 sind die Termine hier bearbeitbar: Ein Tipp auf den
 * Kreisnamen klappt die Terminliste auf — IMMER, auch im Verdunstungsmodus,
 * weil die Termine dort bei Neuansaat laufen. Gelesen und geschrieben wird
 * ueber useGartenPlanData (0_userdata.0.Garten bzw. Garten_Dev); ausgeloest
 * wird vom Skript Garten_Zeitplan. Termin-Dialog, Liste und Schalter sind die
 * unveraenderten Bausteine des Tabs „Garten".
 *
 * Neuansaat je Kreis (Einstellungen.ansaat): Termine laufen dann auch im
 * Verdunstungsmodus. Weil das ein Ausnahmezustand ist, steht ein Hinweis
 * dauerhaft auf der Karte (nicht nur im aufgeklappten Bereich).
 *
 * Das Zahnrad im Kartenkopf oeffnet das Einstellungen-Sheet (Regensperre).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Settings2, Sprout } from 'lucide-react';
import { ConfirmOverlay } from '../ConfirmOverlay';
import { GartenEventModal } from '../garten/GartenEventModal';
import { GartenManualStart } from '../garten/GartenManualStart';
import { GartenScheduleList, nextEventText } from '../garten/GartenScheduleList';
import { GartenSwitch } from '../garten/GartenSwitch';
import { DEFAULT_MANUAL_MINUTES } from '../garten/gartenConstants';
import type { TimerEvent, TimerWeekday } from '../../../types';
import type { CircleProbeData } from './Garten2Widget';
import { slotKeys, type GartenPlanEntry } from './gartenPlanModel';
import type { GartenPlanData } from './useGartenPlanData';

const WEEKDAY_SHORT: Record<TimerWeekday, string> = {
    mon: 'Mo',
    tue: 'Di',
    wed: 'Mi',
    thu: 'Do',
    fri: 'Fr',
    sat: 'Sa',
    sun: 'So',
};
const WEEKDAY_ORDER: TimerWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Vereinigung aller Wochentage über alle aktiven Termine eines Kreises. */
function activeWeekdays(events: TimerEvent[]): Set<TimerWeekday> {
    const days = new Set<TimerWeekday>();
    for (const ev of events) {
        if (!ev.enabled) continue;
        for (const d of ev.weekdays) days.add(d);
    }
    return days;
}

/** Neuer Termin — Vorbelegung wie newEvent in GartenCircleCard (Mo–Fr, 08:00). */
function newEvent(kreis: string, minutes: number): GartenPlanEntry {
    return {
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kreis,
        enabled: true,
        label: '',
        weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        trigger: { kind: 'time', hour: 8, minute: 0 },
        filter: 'all-days',
        value: String(minutes),
    };
}

interface RowProps {
    circle: CircleProbeData;
    /** Termine genau dieses Kreises. */
    events: GartenPlanEntry[];
    scharf: boolean;
    ansaat: boolean;
    collisions: Set<string>;
    plan: GartenPlanData;
    /** Termine/Schalter bedienbar (nicht im Bearbeitungsmodus des Admins). */
    interactive: boolean;
    /** Anlage schaltbar (Modus, Handbetrieb) — in der Dev-Vorschau false. */
    plantInteractive: boolean;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
    /** Schreibvorgang ausfuehren und Fehler oben auf der Karte melden. */
    run: (job: Promise<void>) => void;
}

function Garten2WeekPlanRow({
    circle,
    events,
    scharf,
    ansaat,
    collisions,
    plan,
    interactive,
    plantInteractive,
    confirmManualStart,
    manualDefaultMinutes,
    run,
}: RowProps) {
    const { state, label, sprinkleName } = circle;
    const [pendingMode, setPendingMode] = useState<'evaporation' | 'schedule' | null>(null);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<GartenPlanEntry | 'new' | null>(null);

    const isSchedule = state.mode === 'schedule';
    const modeKnown = state.mode !== 'unknown';
    // Termine laufen im Zeitplan-Modus oder — Ausnahme — bei Neuansaat.
    const termineLaufen = isSchedule || ansaat;
    const days = activeWeekdays(events);
    const nextText = termineLaufen && scharf ? nextEventText(events) : null;

    const chooseMode = (next: 'evaporation' | 'schedule') => {
        if (!plantInteractive || !modeKnown || next === state.mode) return;
        // Derselbe Sicherheitsschritt wie in GartenCircleCard: ein Moduswechsel
        // im laufenden Betrieb kann den Kreis sofort stoppen (addList(0)).
        if (state.status === 'running') {
            setPendingMode(next);
            return;
        }
        state.setMode(next);
    };

    const minutes = manualDefaultMinutes || DEFAULT_MANUAL_MINUTES;

    return (
        <div className="garten2-week-row">
            {/* Kopfzeile ist die Taste, die die Terminliste auf-/zuklappt. */}
            <button
                type="button"
                className="garten-card-t garten2-week-head"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label={`${label}: Termine ${open ? 'zuklappen' : 'aufklappen'}`}
            >
                <span className="garten-name">{label}</span>
                <span className="garten-head-right">
                    {termineLaufen && (
                        <span className={`garten-pill${scharf ? ' is-next' : ' is-off'}`}>
                            {scharf ? nextText || 'Kein Termin' : 'Pausiert'}
                        </span>
                    )}
                    <ChevronDown size={16} className={`garten2-chevron${open ? ' is-open' : ''}`} />
                </span>
            </button>

            <div className="garten-modes" title={modeKnown ? undefined : 'Dieser Kreis hat keinen autoOn-Datenpunkt.'}>
                <button
                    type="button"
                    className={`garten-mode${state.mode === 'evaporation' ? ' is-active' : ''}`}
                    onClick={() => chooseMode('evaporation')}
                    disabled={!plantInteractive || !modeKnown}
                >
                    Verdunstung
                </button>
                <button
                    type="button"
                    className={`garten-mode${isSchedule ? ' is-active' : ''}`}
                    onClick={() => chooseMode('schedule')}
                    disabled={!plantInteractive || !modeKnown}
                >
                    Zeitplan
                </button>
            </div>

            {ansaat && (
                <p className="garten-note garten2-ansaat-note">
                    <Sprout size={12} /> Neuansaat: Die Termine laufen auch im Verdunstungsmodus.
                </p>
            )}

            {termineLaufen && (
                <span className="garten-days garten2-days-readonly" aria-label="Aktive Wochentage — nur Anzeige">
                    {WEEKDAY_ORDER.map((d) => (
                        <span key={d} className={`garten-day${days.has(d) ? ' is-on' : ''}`}>
                            {WEEKDAY_SHORT[d]}
                        </span>
                    ))}
                </span>
            )}

            {open && (
                <div className="garten2-plan-open">
                    <div className="garten2-opt-row">
                        <span className="garten2-opt-text">
                            <span className="garten2-opt-title">Zeitplan scharf</span>
                            <span className="garten-sub">Aus pausiert alle Termine dieses Kreises.</span>
                        </span>
                        <GartenSwitch
                            on={scharf}
                            disabled={!interactive}
                            onToggle={() => run(plan.setScharf(sprinkleName, !scharf))}
                            label="Zeitplan scharf"
                            title="Zeitplan scharf — aus pausiert alle Termine dieses Kreises"
                        />
                    </div>

                    <div className="garten2-opt-row">
                        <span className="garten2-opt-text">
                            <span className="garten2-opt-title">Neuansaat</span>
                            <span className="garten-sub">
                                Termine laufen auch im Verdunstungsmodus, z. B. 4× 5 Min. täglich.
                            </span>
                        </span>
                        <GartenSwitch
                            on={ansaat}
                            disabled={!interactive}
                            onToggle={() => run(plan.setAnsaat(sprinkleName, !ansaat))}
                            label="Neuansaat"
                            title="Neuansaat — Termine laufen auch im Verdunstungsmodus"
                        />
                    </div>

                    {!termineLaufen && (
                        <p className="garten-note">
                            Verdunstungsmodus: Die Termine laufen erst im Zeitplan-Modus oder bei Neuansaat.
                        </p>
                    )}

                    <GartenScheduleList
                        events={events}
                        collisions={collisions}
                        interactive={interactive}
                        onToggle={(id) => run(plan.toggleEntry(id))}
                        onEdit={(ev) =>
                            setEditing(events.find((e) => e.id === ev.id) ?? { ...ev, kreis: sprinkleName })
                        }
                        onAdd={() => setEditing('new')}
                    />
                </div>
            )}

            <GartenManualStart
                status={state.status}
                circleLabel={label}
                defaultMinutes={manualDefaultMinutes}
                confirm={confirmManualStart}
                interactive={plantInteractive}
                onStart={state.startManual}
                onStop={state.stop}
            />

            {pendingMode && (
                <ConfirmOverlay
                    text="Der Kreis läuft gerade. Ein Moduswechsel kann ihn sofort stoppen. Trotzdem umschalten?"
                    onConfirm={() => {
                        state.setMode(pendingMode);
                        setPendingMode(null);
                    }}
                    onCancel={() => setPendingMode(null)}
                />
            )}

            {editing && (
                <GartenEventModal
                    initial={editing === 'new' ? newEvent(sprinkleName, minutes) : editing}
                    circleLabel={label}
                    onSave={(ev) => {
                        // `kreis` immer neu setzen: der Dialog kennt das Feld nicht.
                        run(plan.saveEntry({ ...ev, kreis: sprinkleName }));
                        setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                    onDelete={
                        editing === 'new'
                            ? undefined
                            : () => {
                                  run(plan.deleteEntry(editing.id));
                                  setEditing(null);
                              }
                    }
                />
            )}
        </div>
    );
}

interface Props {
    circles: CircleProbeData[];
    plan: GartenPlanData;
    interactive: boolean;
    plantInteractive: boolean;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
    onOpenSettings: () => void;
}

export function Garten2WeekPlan({
    circles,
    plan,
    interactive,
    plantInteractive,
    confirmManualStart,
    manualDefaultMinutes,
    onOpenSettings,
}: Props) {
    const [saveError, setSaveError] = useState<string | null>(null);

    const run = (job: Promise<void>) => {
        job.then(() => setSaveError(null)).catch((e: unknown) =>
            setSaveError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
        );
    };

    // Kollisionserkennung wie im Tab „Garten": zwei aktive Termine zur selben
    // Wochentag-Uhrzeit. Die exakte Vorschau der tatsaechlichen Startzeiten
    // braucht die Dauer der vorherigen Laeufe und bleibt aussen vor.
    const collisions = useMemo(() => {
        const names = new Set(circles.map((c) => c.sprinkleName));
        const buckets = new Map<string, string[]>();
        for (const ev of plan.entries) {
            if (!ev.enabled || !names.has(ev.kreis)) continue;
            for (const key of slotKeys(ev)) {
                const list = buckets.get(key);
                if (list) list.push(ev.id);
                else buckets.set(key, [ev.id]);
            }
        }
        const hit = new Set<string>();
        for (const ids of buckets.values()) if (ids.length > 1) for (const id of ids) hit.add(id);
        return hit;
    }, [circles, plan.entries]);

    const executionOff = plan.settingsLoaded && !plan.settings.aktiv;

    return (
        <div className="garten-card garten2-weekplan">
            <div className="garten-card-t">
                <span className="garten-name">Wochenplan</span>
                <button
                    type="button"
                    className="garten2-gear"
                    onClick={onOpenSettings}
                    aria-label="Einstellungen öffnen"
                    title="Einstellungen (Regensperre)"
                >
                    <Settings2 size={16} />
                </button>
            </div>

            {executionOff && (
                <div className="garten-cloud-banner" role="status">
                    <span className="garten-cloud-title">
                        <AlertTriangle size={14} /> Zeitplan-Ausführung ist aus
                    </span>
                    <span className="garten-cloud-text">
                        Die Termine werden angezeigt, aber nicht ausgelöst, bis der Zeitplan freigegeben ist.
                    </span>
                </div>
            )}
            {plan.scriptStale && (
                <div className="garten-cloud-banner" role="status">
                    <span className="garten-cloud-title">
                        <AlertTriangle size={14} /> Zeitplan-Skript läuft nicht
                    </span>
                    <span className="garten-cloud-text">
                        Das Skript Garten_Zeitplan hat sich seit über 3 Minuten nicht gemeldet. Termine werden derzeit
                        nicht ausgelöst.
                    </span>
                </div>
            )}
            {plan.entriesError && <p className="garten-note garten2-plan-error">Zeitplan: {plan.entriesError}</p>}
            {saveError && <p className="garten-note garten2-plan-error">{saveError}</p>}

            {circles.map((c, i) => (
                <div key={c.sprinkleName} className={i > 0 ? 'garten2-week-row-sep' : undefined}>
                    <Garten2WeekPlanRow
                        circle={c}
                        events={plan.entries.filter((e) => e.kreis === c.sprinkleName)}
                        scharf={plan.settings.scharf[c.sprinkleName] !== false}
                        ansaat={plan.settings.ansaat[c.sprinkleName] === true}
                        collisions={collisions}
                        plan={plan}
                        interactive={interactive}
                        plantInteractive={plantInteractive}
                        confirmManualStart={confirmManualStart}
                        manualDefaultMinutes={manualDefaultMinutes}
                        run={run}
                    />
                </div>
            ))}
        </div>
    );
}
