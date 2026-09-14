/**
 * Handbetrieb eines Kreises: Dauer-Chip und „Jetzt gießen“.
 *
 * Form aus dem Planungs-Artefakt: eine Tastenzeile (`btn-row`) am Fuss der
 * Karte, die Dauer als Chip in derselben Sprache wie die Dauer eines Termins —
 * kein eigener Kasten mit drei grossen Feldern.
 *
 * Vor dem Starten kommt eine Sicherheitsabfrage (abschaltbar ueber
 * `options.confirmManualStart`), vor dem Stoppen nie: Wer Wasser abstellen
 * will, soll das sofort koennen. Die Abfrage erscheint als kleines Popup neben
 * der Taste (ConfirmOverlay, `popup` + `anchorRef`) — die Vollflaechen-Variante
 * wuerde die halbe Kreiskarte verdecken.
 */
import { useRef, useState } from 'react';
import { Minus, Play, Plus, Square } from 'lucide-react';
import { ConfirmOverlay } from '../ConfirmOverlay';
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from './gartenConstants';
import type { CircleStatus } from './useSprinkleCircle';

interface Props {
    status: CircleStatus;
    circleLabel: string;
    defaultMinutes: number;
    confirm: boolean;
    onStart: (minutes: number) => void;
    onStop: () => void;
    /** Im Bearbeitungsmodus des Admins gesperrt — sonst laesst sich im Editor
     *  versehentlich Wasser ausloesen. */
    interactive?: boolean;
}

export function GartenManualStart({
    status,
    circleLabel,
    defaultMinutes,
    confirm,
    onStart,
    onStop,
    interactive = true,
}: Props) {
    const [minutesText, setMinutesText] = useState<string>(String(clampMinutes(defaultMinutes)));
    const [asking, setAsking] = useState(false);
    const startRef = useRef<HTMLButtonElement>(null);

    const minutes = clampMinutes(minutesText);
    const running = status === 'running';
    const waiting = status === 'waiting';

    const step = (delta: number) => setMinutesText(String(clampMinutes(minutes + delta)));

    const startNow = () => {
        setAsking(false);
        onStart(minutes);
    };

    if (running) {
        return (
            <div className="garten-btn-row">
                <button
                    type="button"
                    className="garten-btn is-dan"
                    onClick={interactive ? onStop : undefined}
                    disabled={!interactive}
                >
                    <Square size={13} /> Stoppen
                </button>
            </div>
        );
    }

    return (
        <div className="garten-btn-row">
            <div className="garten-dur-edit">
                <button
                    type="button"
                    className="garten-chip-btn"
                    onClick={interactive ? () => step(-1) : undefined}
                    disabled={!interactive || minutes <= MIN_MINUTES}
                    aria-label="Eine Minute weniger"
                >
                    <Minus size={13} />
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
                    onChange={(e) => setMinutesText(e.target.value)}
                    onBlur={() => setMinutesText(String(clampMinutes(minutesText)))}
                    disabled={!interactive}
                    aria-label="Dauer in Minuten"
                />
                <span className="garten-dur-unit">Min</span>
                <button
                    type="button"
                    className="garten-chip-btn"
                    onClick={interactive ? () => step(1) : undefined}
                    disabled={!interactive || minutes >= MAX_MINUTES}
                    aria-label="Eine Minute mehr"
                >
                    <Plus size={13} />
                </button>
            </div>

            <button
                ref={startRef}
                type="button"
                className="garten-btn is-pri"
                onClick={interactive ? () => (confirm ? setAsking(true) : startNow()) : undefined}
                disabled={!interactive || waiting}
                title={waiting ? 'Ein anderer Kreis läuft gerade' : undefined}
            >
                <Play size={13} /> {waiting ? 'Wartet' : 'Jetzt gießen'}
            </button>

            {asking && (
                <ConfirmOverlay
                    popup
                    anchorRef={startRef}
                    text={`${circleLabel} jetzt ${minutes} Minuten gießen?`}
                    onConfirm={startNow}
                    onCancel={() => setAsking(false)}
                />
            )}
        </div>
    );
}
