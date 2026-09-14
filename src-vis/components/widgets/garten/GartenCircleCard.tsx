/**
 * Karte eines Bewaesserungskreises — Form aus dem Planungs-Artefakt vom
 * 09.09.2026, Variante B („Drei Zeitschaltuhren“).
 *
 * Aufbau von oben nach unten:
 *   Kopfzeile   Name links, Zustandspille und der Schalter „Zeitplan scharf“
 *               rechts — genau wie im Artefakt.
 *   Modus       zweiteiliger Segmentschalter Verdunstung / Zeitplan.
 *   Termine     nur im Zeitplan-Modus, eine Zeile je Termin, darunter „+ Termin“.
 *   Handbetrieb Dauer-Chip und „Jetzt gießen“ als Tastenzeile.
 *   Fuss        Bodenfeuchte und letzter Lauf, durch eine Haarlinie abgesetzt.
 *
 * Zwei Dinge sind hier bewusst so und nicht anders:
 *   - Der Handbetrieb bleibt auch in der Verdunstungsautomatik sichtbar. Die
 *     Einschaltbedingung des Adapters prueft `autoOn` gar nicht, ein Handstart
 *     lief im Test mit `autoOn = false` genauso.
 *   - Im Zeitplan-Modus wird die Bodenfeuchte ausgegraut UND mit sichtbarem
 *     Zusatztext versehen, nicht nur mit `title`: Auf dem iPhone gibt es kein
 *     Hover, ein `title` allein waere unsichtbar.
 */
import { useState } from 'react';
import { Droplets, Info } from 'lucide-react';
import type { GartenCircleDef, TimerEvent } from '../../../types';
import { ConfirmOverlay } from '../ConfirmOverlay';
import { GartenEventModal } from './GartenEventModal';
import { GartenManualStart } from './GartenManualStart';
import { GartenScheduleList, nextEventText } from './GartenScheduleList';
import { GartenSwitch } from './GartenSwitch';
import { DEFAULT_MANUAL_MINUTES, TIMER_MODE_MOISTURE_HINT } from './gartenConstants';
import { useSprinkleCircle } from './useSprinkleCircle';
import './GartenCircleCard.css';

interface Props {
    circle: GartenCircleDef;
    instance: string;
    events: TimerEvent[];
    scheduleEnabled: boolean;
    collisions: Set<string>;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
    showSoilMoisture: boolean;
    interactive: boolean;
    /** Darf die Anlage geschaltet werden (Modus, Handbetrieb)? In der
     *  Dev-Vorschau false, siehe DEV_WRITES_BLOCKED in GartenWidget. */
    plantInteractive: boolean;
    onEventsChange: (events: TimerEvent[]) => void;
    onScheduleEnabledChange: (enabled: boolean) => void;
}

/** Neuer Termin — Vorbelegung wie beim Zeitschaltuhr-Widget (Mo–Fr, 08:00). */
function newEvent(minutes: number): TimerEvent {
    return {
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        enabled: true,
        label: '',
        weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        trigger: { kind: 'time', hour: 8, minute: 0 },
        filter: 'all-days',
        value: String(minutes),
    };
}

export function GartenCircleCard({
    circle,
    instance,
    events,
    scheduleEnabled,
    collisions,
    confirmManualStart,
    manualDefaultMinutes,
    showSoilMoisture,
    interactive,
    plantInteractive,
    onEventsChange,
    onScheduleEnabledChange,
}: Props) {
    const c = useSprinkleCircle(instance, circle.sprinkleName);
    const [editing, setEditing] = useState<TimerEvent | 'new' | null>(null);
    const [pendingMode, setPendingMode] = useState<'evaporation' | 'schedule' | null>(null);

    const isSchedule = c.mode === 'schedule';
    const modeKnown = c.mode !== 'unknown';

    /**
     * Die Pille rechts oben. Der laufende Zustand schlaegt alles andere — wer
     * sehen will, ob gerade Wasser laeuft, soll nicht erst den naechsten Termin
     * lesen muessen.
     */
    const nextText = isSchedule && scheduleEnabled ? nextEventText(events) : null;
    let pillClass = 'is-off';
    let pillText = 'Aus';
    if (c.status === 'running') {
        pillClass = 'is-on';
        pillText = c.countdown ? `Läuft · ${c.countdown}` : 'Läuft';
    } else if (c.status === 'waiting') {
        pillClass = 'is-waiting';
        pillText = 'Wartet';
    } else if (!modeKnown) {
        pillText = 'unbekannt';
    } else if (!isSchedule) {
        pillText = 'Verdunstung';
    } else if (!scheduleEnabled) {
        pillText = 'Pausiert';
    } else if (nextText) {
        pillClass = 'is-next';
        pillText = nextText;
    } else {
        pillText = 'Kein Termin';
    }

    const chooseMode = (next: 'evaporation' | 'schedule') => {
        if (!plantInteractive || !modeKnown || next === c.mode) return;
        // Der Adapter ruft beim Moduswechsel addList(wateringTime: 0) — das kann
        // einen laufenden Kreis sofort stoppen. Deshalb erst fragen.
        if (c.status === 'running') {
            setPendingMode(next);
            return;
        }
        c.setMode(next);
    };

    const saveFromModal = (ev: TimerEvent) => {
        if (editing === 'new') onEventsChange([...events, ev]);
        else onEventsChange(events.map((x) => (x.id === ev.id ? ev : x)));
        setEditing(null);
    };

    const deleteFromModal = () => {
        if (editing && editing !== 'new') onEventsChange(events.filter((x) => x.id !== editing.id));
        setEditing(null);
    };

    return (
        <div className="garten-card">
            {/* 1. Kopfzeile — Name | Pille | Schalter „Zeitplan scharf“ */}
            <div className="garten-card-t">
                <span className="garten-name">{circle.label}</span>
                <span className="garten-head-right">
                    <span className={`garten-pill ${pillClass}`}>{pillText}</span>
                    {isSchedule && (
                        <GartenSwitch
                            on={scheduleEnabled}
                            disabled={!interactive}
                            onToggle={() => onScheduleEnabledChange(!scheduleEnabled)}
                            label="Zeitplan scharf"
                            title="Zeitplan scharf — aus pausiert alle Termine dieses Kreises"
                        />
                    )}
                </span>
            </div>

            {/* 2. Modusschalter */}
            <div className="garten-modes" title={modeKnown ? undefined : 'Dieser Kreis hat keinen autoOn-Datenpunkt.'}>
                <button
                    type="button"
                    className={`garten-mode${c.mode === 'evaporation' ? ' is-active' : ''}`}
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
            {!modeKnown && <p className="garten-note">Dieser Kreis hat keinen autoOn-Datenpunkt — Modus unbekannt.</p>}

            {/* 3. Terminliste — nur im Zeitplan-Modus */}
            {isSchedule && (
                <GartenScheduleList
                    events={events}
                    collisions={collisions}
                    interactive={interactive}
                    onToggle={(id) =>
                        onEventsChange(events.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)))
                    }
                    onEdit={(ev) => setEditing(ev)}
                    onAdd={() => setEditing('new')}
                />
            )}

            {/* 4. Handbetrieb — auch im Verdunstungsmodus */}
            <GartenManualStart
                status={c.status}
                circleLabel={circle.label}
                defaultMinutes={manualDefaultMinutes || DEFAULT_MANUAL_MINUTES}
                confirm={confirmManualStart}
                interactive={plantInteractive}
                onStart={(min) => c.startManual(min)}
                onStop={() => c.stop()}
            />

            {/* 5. Fusszeile */}
            <div className="garten-foot">
                {showSoilMoisture && (
                    <span className={`garten-foot-item${isSchedule ? ' is-muted' : ''}`}>
                        <Droplets size={12} />
                        {c.soilMoisture === null ? '—' : `${Math.round(c.soilMoisture)} %`}
                    </span>
                )}
                <span className="garten-foot-item">zuletzt an: {c.lastOn || '—'}</span>
            </div>
            {showSoilMoisture && isSchedule && (
                <p className="garten-note">
                    <Info size={11} /> {TIMER_MODE_MOISTURE_HINT}
                </p>
            )}

            {/* Sicherheitsabfrage vor einem Moduswechsel im laufenden Betrieb */}
            {pendingMode && (
                <ConfirmOverlay
                    text="Der Kreis läuft gerade. Ein Moduswechsel kann ihn sofort stoppen. Trotzdem umschalten?"
                    onConfirm={() => {
                        c.setMode(pendingMode);
                        setPendingMode(null);
                    }}
                    onCancel={() => setPendingMode(null)}
                />
            )}

            {editing && (
                <GartenEventModal
                    initial={editing === 'new' ? newEvent(manualDefaultMinutes || DEFAULT_MANUAL_MINUTES) : editing}
                    circleLabel={circle.label}
                    onSave={saveFromModal}
                    onCancel={() => setEditing(null)}
                    onDelete={editing === 'new' ? undefined : deleteFromModal}
                />
            )}
        </div>
    );
}
