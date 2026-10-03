/**
 * Hero-Kachel des Garten2-Steuerpults — zeigt den laufenden Kreis
 * (`valveOn`/`countdown`, NICHT `sprinklerState`) oder den Ruhezustand.
 *
 * Der Ring ist reiner Fortschritt, nicht antippbar — Stopp geschieht über
 * die eigene Taste darunter, ohne Sicherheitsabfrage (wie im Tab „Garten").
 *
 * Die Wassermenge ist für diesen Durchgang ein FESTER Platzhalter
 * ("999 l", bewusst offensichtlich falsch) — Sascha wollte die echte
 * Berechnung aus `pipeFlow` (l/h) erst in einem späteren Schritt, siehe
 * Feature-Doku.
 */
import { Droplets, Square } from 'lucide-react';
import { clampMinutes } from '../garten/gartenConstants';
import type { CircleProbeData } from './Garten2Widget';

/** Platzhalter-Wassermenge — bewusst nicht aus pipeFlow berechnet, siehe Kopf. */
const PLACEHOLDER_WATER_AMOUNT = '999 l';

/** "09:45" -> 585. Unbekanntes/leeres Format liefert null. */
function countdownToSeconds(countdown: string): number | null {
    const m = /^(\d+):(\d{2})$/.exec(countdown.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

interface Props {
    running: CircleProbeData | null;
    plantInteractive: boolean;
}

export function Garten2Hero({ running, plantInteractive }: Props) {
    if (!running) {
        return (
            <div className="garten-card garten2-hero">
                <div className="garten2-hero-idle">
                    <Droplets size={28} />
                    <span className="garten2-hero-idle-text">Es läuft gerade kein Kreis</span>
                </div>
            </div>
        );
    }

    const totalSeconds = clampMinutes(running.state.runningTime) * 60;
    const remainingSeconds = countdownToSeconds(running.state.countdown) ?? totalSeconds;
    const fraction = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;
    const percent = Math.round(fraction * 100);

    return (
        <div className="garten-card garten2-hero">
            <div className="garten2-hero-top">
                <div
                    className="garten2-hero-ring"
                    style={{ '--g2-ring-pct': `${percent}%` } as React.CSSProperties}
                    role="img"
                    aria-label={`${running.label}, ${running.state.countdown || '—'} verbleibend`}
                >
                    <div className="garten2-hero-ring-inner">
                        <span className="garten2-hero-time">{running.state.countdown || '—'}</span>
                        <span className="garten2-hero-label">{running.label}</span>
                    </div>
                </div>
                <div className="garten2-hero-facts">
                    <span className="garten2-hero-fact">
                        <Droplets size={13} /> {PLACEHOLDER_WATER_AMOUNT}
                    </span>
                </div>
            </div>
            <div className="garten-btn-row">
                <button
                    type="button"
                    className="garten-btn is-dan"
                    onClick={plantInteractive ? running.state.stop : undefined}
                    disabled={!plantInteractive}
                >
                    <Square size={13} /> Stoppen
                </button>
            </div>
        </div>
    );
}
