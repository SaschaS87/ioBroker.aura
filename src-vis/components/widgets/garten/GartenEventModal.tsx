/**
 * Termin-Dialog eines Bewaesserungskreises — als Sheet von unten.
 *
 * Form und Verhalten wie bei Wohnklima (RoomClimateSheet) und Rollaeden
 * (ShutterSheet): das Blatt faehrt vom unteren Rand herein, schliesst per
 * Wischen am Griff, Tippen auf den Hintergrund oder Escape (useSheetDismiss).
 * Innen dieselbe Bildsprache wie die Kreiskarte: Wochentags-Plaettchen,
 * Dauer-Chip, getoente Tasten.
 *
 * Fachlich uebernommen aus dem Vorbild TimerEventModal ist nur das Geruest:
 * Ein Bewaesserungstermin hat immer eine feste Uhrzeit und laeuft an den
 * Tagen, die angehakt sind. Regen wird im Zeitplan-Modus bewusst ignoriert,
 * deshalb `filter: 'all-days'` ohne Bedienelement.
 *
 * Das Blatt haengt in einem Portal (usePortalTarget), nicht in der Kachel:
 * `position: fixed` allein reicht in einem react-grid-layout-Kind nicht, weil
 * ein `transform` am Vorfahren den Bezugsrahmen kapert.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { TimerEvent, TimerWeekday } from '../../../types';
import { usePortalTarget, usePortalThemeVars } from '../../../contexts/PortalTargetContext';
import { DateTimeInput } from '../../common/DateTimeInput';
import { useSheetDismiss } from '../useSheetDismiss';
import { clampMinutes, DEFAULT_MANUAL_MINUTES, MAX_MINUTES, MAX_MINUTES_HINT, MIN_MINUTES } from './gartenConstants';
import { GartenSwitch } from './GartenSwitch';
import './GartenEventModal.css';

interface Props {
    initial: TimerEvent;
    circleLabel: string;
    onSave: (ev: TimerEvent) => void;
    onCancel: () => void;
    onDelete?: () => void;
}

const WEEKDAYS: { id: TimerWeekday; short: string; long: string }[] = [
    { id: 'mon', short: 'Mo', long: 'Montag' },
    { id: 'tue', short: 'Di', long: 'Dienstag' },
    { id: 'wed', short: 'Mi', long: 'Mittwoch' },
    { id: 'thu', short: 'Do', long: 'Donnerstag' },
    { id: 'fri', short: 'Fr', long: 'Freitag' },
    { id: 'sat', short: 'Sa', long: 'Samstag' },
    { id: 'sun', short: 'So', long: 'Sonntag' },
];

/** Uhrzeit des Termins als HH:MM — der Dialog kennt nur Zeit-Ausloeser. */
function triggerTime(ev: TimerEvent): string {
    if (ev.trigger.kind !== 'time') return '08:00';
    return `${String(ev.trigger.hour).padStart(2, '0')}:${String(ev.trigger.minute).padStart(2, '0')}`;
}

export function GartenEventModal({ initial, circleLabel, onSave, onCancel, onDelete }: Props) {
    const [event, setEvent] = useState<TimerEvent>(initial);
    // Rohtext, damit das Tippen nicht ruckelt: geklemmt wird beim Verlassen des
    // Feldes und noch einmal beim Speichern.
    const [minutesText, setMinutesText] = useState<string>(String(initial.value ?? DEFAULT_MANUAL_MINUTES));
    const [error, setError] = useState<string>('');

    // Wischen am Griff, Tippen auf den Hintergrund und Escape schliessen das
    // Blatt mit derselben Ausfahr-Bewegung wie bei Wohnklima und Rollaeden.
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onCancel);

    const patch = (p: Partial<TimerEvent>) => setEvent((cur) => ({ ...cur, ...p }));

    const toggleWeekday = (d: TimerWeekday) => {
        const set = new Set(event.weekdays);
        if (set.has(d)) set.delete(d);
        else set.add(d);
        patch({ weekdays: WEEKDAYS.map((w) => w.id).filter((id) => set.has(id)) });
    };

    const minutes = clampMinutes(minutesText);
    const step = (delta: number) => {
        setMinutesText(String(clampMinutes(minutes + delta)));
        setError('');
    };

    const save = () => {
        const raw = Number(minutesText.trim().replace(',', '.'));
        if (!Number.isFinite(raw) || raw < MIN_MINUTES || raw > MAX_MINUTES) {
            setError(`Bitte ${MIN_MINUTES} bis ${MAX_MINUTES} Minuten`);
            return;
        }
        onSave({
            ...event,
            trigger: event.trigger.kind === 'time' ? event.trigger : { kind: 'time', hour: 8, minute: 0 },
            filter: 'all-days',
            value: String(clampMinutes(minutesText)),
        });
    };

    const portal = usePortalTarget();
    const themeVars = usePortalThemeVars();

    return createPortal(
        <div
            data-aura-app="frontend"
            className="garten-sheet-backdrop"
            style={{ ...themeVars, ...backdropStyle }}
            onClick={onBackdropClick}
        >
            <div
                className="garten-sheet"
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                aria-label={`${onDelete ? 'Termin bearbeiten' : 'Neuer Termin'} – ${circleLabel}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Griff + Titel bilden die Wischzone. */}
                <div
                    className="garten-sheet-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="garten-sheet-grip">
                        <div className="garten-sheet-grip-handle" />
                    </div>
                    <div className="garten-sheet-header">
                        <div className="garten-sheet-title">{onDelete ? 'Termin bearbeiten' : 'Neuer Termin'}</div>
                        <div className="garten-sheet-sub">{circleLabel}</div>
                    </div>
                </div>

                <div className="garten-sheet-body">
                    {/* Aktiv */}
                    <div className="garten-sheet-row">
                        <span className="garten-sheet-label is-inline">Termin aktiv</span>
                        <GartenSwitch
                            on={event.enabled}
                            onToggle={() => patch({ enabled: !event.enabled })}
                            label="Termin aktiv"
                        />
                    </div>

                    {/* Uhrzeit */}
                    <div className="garten-sheet-field">
                        <label className="garten-sheet-label">Uhrzeit</label>
                        <DateTimeInput
                            kind="time"
                            wrapClassName="w-full"
                            value={triggerTime(event)}
                            onValue={(v) => {
                                const [h, m] = v.split(':').map((x) => Number(x) || 0);
                                patch({ trigger: { kind: 'time', hour: h, minute: m } });
                            }}
                            className="garten-sheet-input"
                        />
                    </div>

                    {/* Wochentage */}
                    <div className="garten-sheet-field">
                        <label className="garten-sheet-label">Wochentage</label>
                        <div className="garten-sheet-days">
                            {WEEKDAYS.map((w) => {
                                const active = event.weekdays.includes(w.id);
                                return (
                                    <button
                                        key={w.id}
                                        type="button"
                                        className={`garten-day garten-sheet-day${active ? ' is-on' : ''}`}
                                        onClick={() => toggleWeekday(w.id)}
                                        title={w.long}
                                        aria-pressed={active}
                                    >
                                        {w.short}
                                    </button>
                                );
                            })}
                        </div>
                        {event.weekdays.length === 0 && (
                            <p className="garten-sheet-error">
                                Kein Wochentag gewählt — der Termin wird nicht ausgeführt.
                            </p>
                        )}
                    </div>

                    {/* Dauer */}
                    <div className="garten-sheet-field">
                        <label className="garten-sheet-label">Dauer</label>
                        <div className="garten-dur-edit garten-sheet-dur">
                            <button
                                type="button"
                                className="garten-chip-btn"
                                onClick={() => step(-1)}
                                disabled={minutes <= MIN_MINUTES}
                                aria-label="Eine Minute weniger"
                            >
                                <Minus size={14} />
                            </button>
                            <input
                                type="number"
                                className="garten-dur-input"
                                min={MIN_MINUTES}
                                max={MAX_MINUTES}
                                step={1}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={minutesText}
                                onChange={(e) => {
                                    setMinutesText(e.target.value);
                                    setError('');
                                }}
                                onBlur={() => setMinutesText(String(clampMinutes(minutesText)))}
                                aria-label="Dauer in Minuten"
                            />
                            <span className="garten-dur-unit">Min</span>
                            <button
                                type="button"
                                className="garten-chip-btn"
                                onClick={() => step(1)}
                                disabled={minutes >= MAX_MINUTES}
                                aria-label="Eine Minute mehr"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                        <p className="garten-sheet-hint">{MAX_MINUTES_HINT}</p>
                        {error && <p className="garten-sheet-error">{error}</p>}
                    </div>

                    {/* Bezeichnung */}
                    <div className="garten-sheet-field">
                        <label className="garten-sheet-label">Bezeichnung (optional)</label>
                        <input
                            type="text"
                            className="garten-sheet-input"
                            value={event.label ?? ''}
                            onChange={(e) => patch({ label: e.target.value })}
                            placeholder="z. B. Nachguss"
                        />
                    </div>
                </div>

                {/* Tastenzeile */}
                <div className="garten-btn-row garten-sheet-foot">
                    {onDelete && (
                        <button type="button" className="garten-btn is-dan garten-sheet-del" onClick={onDelete}>
                            <Trash2 size={13} /> Löschen
                        </button>
                    )}
                    <button type="button" className="garten-btn" onClick={startClose}>
                        Abbrechen
                    </button>
                    <button type="button" className="garten-btn is-pri" onClick={save}>
                        Speichern
                    </button>
                </div>
            </div>
        </div>,
        portal,
    );
}
