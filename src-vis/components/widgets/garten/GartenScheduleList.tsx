/**
 * Terminliste einer Kreiskarte — Form aus dem Planungs-Artefakt, Variante B.
 *
 * Eine Zeile je Termin, getrennt durch eine Haarlinie: links Uhrzeit fett,
 * daneben die Dauer als Chip, darunter die sieben Wochentags-Plaettchen;
 * rechts ein eigener Schalter je Termin. Darunter die Taste „+ Termin“.
 *
 * Alle :hover-Regeln stehen in GartenCircleCard.css hinter
 * `@media (hover: hover) and (pointer: fine)` — sonst bleibt die Hervorhebung
 * auf iOS nach dem Antippen haengen.
 */
import { AlertTriangle, Plus } from 'lucide-react';
import type { TimerEvent, TimerWeekday } from '../../../types';
import { PARALLEL_HINT } from './gartenConstants';
import { GartenSwitch } from './GartenSwitch';

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

/** Reihenfolge von `Date.getDay()`: 0 = Sonntag. */
const WEEKDAY_INDEX: Record<TimerWeekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Uhrzeit eines Termins als HH:MM (der Garten kennt nur Zeit-Ausloeser). */
export function eventTime(ev: TimerEvent): string {
    if (ev.trigger.kind !== 'time') return '--:--';
    return `${String(ev.trigger.hour).padStart(2, '0')}:${String(ev.trigger.minute).padStart(2, '0')}`;
}

/**
 * Naechster geplanter Start unter allen aktiven Terminen, z. B. „Mi 06:00“.
 *
 * Das ist die **geplante** Zeit, nicht die tatsaechliche: Laeuft zu dem
 * Zeitpunkt ein anderer Kreis, reiht der Adapter diesen hier dahinter ein
 * (maximumParallelValves = 1). Deshalb steht der Satz dazu im Kopfbereich des
 * Widgets und nicht als Versprechen an der Pille.
 */
export function nextEventText(events: TimerEvent[], now: Date = new Date()): string | null {
    let bestAt = Number.POSITIVE_INFINITY;
    let bestText: string | null = null;

    for (const ev of events) {
        if (!ev.enabled || ev.trigger.kind !== 'time') continue;
        for (const d of ev.weekdays) {
            const target = WEEKDAY_INDEX[d];
            if (target === undefined) continue;
            const at = new Date(now.getTime());
            at.setHours(ev.trigger.hour, ev.trigger.minute, 0, 0);
            let delta = (target - now.getDay() + 7) % 7;
            // Heute, aber die Uhrzeit ist schon vorbei -> erst in einer Woche.
            if (delta === 0 && at.getTime() <= now.getTime()) delta = 7;
            at.setDate(at.getDate() + delta);
            if (at.getTime() < bestAt) {
                bestAt = at.getTime();
                bestText = `${WEEKDAY_SHORT[d]} ${eventTime(ev)}`;
            }
        }
    }
    return bestText;
}

interface Props {
    events: TimerEvent[];
    /** IDs von Terminen, die mit einem anderen Kreis zur selben Zeit starten. */
    collisions: Set<string>;
    onToggle: (id: string) => void;
    onEdit: (ev: TimerEvent) => void;
    onAdd: () => void;
    /** Im Bearbeitungsmodus des Admins ist die Liste nur Anzeige. */
    interactive?: boolean;
}

export function GartenScheduleList({ events, collisions, onToggle, onEdit, onAdd, interactive = true }: Props) {
    return (
        <div className="garten-schedule">
            {events.length === 0 && <div className="garten-schedule-empty">Noch kein Termin angelegt.</div>}

            {events.map((ev) => {
                const collides = collisions.has(ev.id);
                return (
                    <div key={ev.id} className={`garten-ev${ev.enabled ? '' : ' is-off'}`}>
                        <button
                            type="button"
                            className="garten-ev-main"
                            onClick={interactive ? () => onEdit(ev) : undefined}
                            disabled={!interactive}
                        >
                            <span className="garten-ev-line">
                                <span className="garten-ev-time">{eventTime(ev)}</span>
                                <span className="garten-dur">{ev.value || '?'} Min</span>
                                {ev.label ? <span className="garten-ev-label">{ev.label}</span> : null}
                                {collides && (
                                    <span
                                        className="garten-ev-warn"
                                        title={`Startet nacheinander, weil ein anderer Kreis zur selben Zeit geplant ist. ${PARALLEL_HINT}`}
                                    >
                                        <AlertTriangle size={13} />
                                    </span>
                                )}
                            </span>
                            <span className="garten-days">
                                {WEEKDAY_ORDER.map((d) => (
                                    <span key={d} className={`garten-day${ev.weekdays.includes(d) ? ' is-on' : ''}`}>
                                        {WEEKDAY_SHORT[d]}
                                    </span>
                                ))}
                            </span>
                        </button>

                        <GartenSwitch
                            on={ev.enabled}
                            disabled={!interactive}
                            onToggle={() => onToggle(ev.id)}
                            label={ev.enabled ? 'Termin aktiv — abschalten' : 'Termin inaktiv — einschalten'}
                            title={ev.enabled ? 'Aktiv' : 'Inaktiv'}
                        />
                    </div>
                );
            })}

            <div className="garten-btn-row">
                <button
                    type="button"
                    className="garten-btn"
                    onClick={interactive ? onAdd : undefined}
                    disabled={!interactive}
                >
                    <Plus size={14} /> Termin
                </button>
            </div>
        </div>
    );
}
