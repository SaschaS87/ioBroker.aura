/**
 * Karte „Wochenplan" des Garten2-Steuerpults.
 *
 * Wochentags-Plättchen und „Nächster Lauf"-Pille sind reine Anzeige (aus dem
 * read-only Timer-Spiegel, siehe useGartenSchedules.ts) — NICHT antippbar,
 * mit sichtbarem Hinweis „Termine ändern im Tab Garten". Der Modusschalter
 * (Verdunstung/Zeitplan) bleibt bedienbar (useSprinkleCircle.setMode,
 * unveraendert übernommen), das Zahnrad im Kartenkopf öffnet das
 * Einstellungen-Sheet (Regensperre).
 *
 * Handbetrieb (Dauer-Chip + „Jetzt gießen") ist ebenfalls hier — Garten2
 * schreibt laut Plan `runningTime` für Handstart/Stopp, und die Optionen
 * `confirmManualStart`/`manualDefaultMinutes` existieren genau dafür.
 */
import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { ConfirmOverlay } from '../ConfirmOverlay';
import { GartenManualStart } from '../garten/GartenManualStart';
import { nextEventText } from '../garten/GartenScheduleList';
import type { TimerEvent, TimerWeekday } from '../../../types';
import type { CircleProbeData } from './Garten2Widget';

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

interface RowProps {
    circle: CircleProbeData;
    plantInteractive: boolean;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
}

function Garten2WeekPlanRow({ circle, plantInteractive, confirmManualStart, manualDefaultMinutes }: RowProps) {
    const { state, schedule, label } = circle;
    const [pendingMode, setPendingMode] = useState<'evaporation' | 'schedule' | null>(null);

    const isSchedule = state.mode === 'schedule';
    const modeKnown = state.mode !== 'unknown';
    const days = activeWeekdays(schedule.events);
    const nextText = isSchedule && schedule.enabled ? nextEventText(schedule.events) : null;

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

    return (
        <div className="garten2-week-row">
            <div className="garten-card-t">
                <span className="garten-name">{label}</span>
                <span className="garten-head-right">
                    {isSchedule && (
                        <span className={`garten-pill${schedule.enabled ? ' is-next' : ' is-off'}`}>
                            {schedule.enabled ? nextText || 'Kein Termin' : 'Pausiert'}
                        </span>
                    )}
                </span>
            </div>

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

            {isSchedule && (
                <span className="garten-days garten2-days-readonly" aria-label="Aktive Wochentage — nur Anzeige">
                    {WEEKDAY_ORDER.map((d) => (
                        <span key={d} className={`garten-day${days.has(d) ? ' is-on' : ''}`}>
                            {WEEKDAY_SHORT[d]}
                        </span>
                    ))}
                </span>
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
        </div>
    );
}

interface Props {
    circles: CircleProbeData[];
    plantInteractive: boolean;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
    onOpenSettings: () => void;
}

export function Garten2WeekPlan({
    circles,
    plantInteractive,
    confirmManualStart,
    manualDefaultMinutes,
    onOpenSettings,
}: Props) {
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

            {circles.map((c, i) => (
                <div key={c.sprinkleName} className={i > 0 ? 'garten2-week-row-sep' : undefined}>
                    <Garten2WeekPlanRow
                        circle={c}
                        plantInteractive={plantInteractive}
                        confirmManualStart={confirmManualStart}
                        manualDefaultMinutes={manualDefaultMinutes}
                    />
                </div>
            ))}

            <p className="garten-note">Termine ändern im Tab Garten.</p>
        </div>
    );
}
