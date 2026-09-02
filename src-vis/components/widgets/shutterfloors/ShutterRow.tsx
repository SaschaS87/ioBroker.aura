import React, { useCallback, useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from '../shutterrooms/useShutterDevice';
import { useYellowForeground } from '../shutterrooms/useYellowForeground';
import { HapticButton } from '../shutterrooms/HapticButton';
import { WindowIcon, RoofWindowIcon, RaffstoreIcon } from '../../icons/ShutterTypeIcons';
import { ArrowToTopIcon, ArrowToBottomIcon } from '../../icons/ShutterActionIcons';
import type { ShutterFloorDeviceDef } from './types';
import './ShutterRow.css';

// Wartezeit des Tippschutzes: erster Tipp bewaffnet die Taste, erst der
// zweite (innerhalb dieser Frist) loest die Fahrt aus. Mit Sascha im
// Artefakt festgelegt, am iPhone bestaetigt (Feature 15, 02.09.2026).
const ARM_MS = 2500;

// Kreisradius der Kuchengrafik in SVG-Einheiten (viewBox 0 0 34 36, passend
// zu --btn-w/--btn-h) und daraus die Kreislinienlaenge fuer stroke-dasharray.
const PIE_R = 7.5;
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_R;

/**
 * Kuchengrafik-Countdown, vierter Anlauf gegen den Randschnipsel-Bug
 * (Feature 15, 02.09.2026). Die ersten drei Versuche - reiner
 * --pie-pct-Lookup im conic-gradient, erzwungener Layout-Read per
 * offsetHeight, dann direktes Ueberschreiben von background-image jeden
 * rAF-Frame mit Literalwert - haben den Bug am iPhone alle NICHT behoben.
 * Saschas Beschreibung (02.09.2026, Geraetetest): mal fehlt direkt zu
 * Beginn ein Stueck unten links, mal bleibt gegen Ende ein Kruemel unten
 * rechts stehen. Das wechselt je nach Tastendruck die Stelle - typisch fuer
 * ein Kompositions-/Teilrepaint-Problem beim wiederholten JS-Schreiben
 * eines Hintergrundbilds, nicht fuer einen Fehler in der Prozentrechnung.
 *
 * Deshalb komplett anderer Mechanismus: kein rAF/JS mehr, das pro Frame
 * irgendetwas neu malt. Stattdessen ein <circle> mit sehr dicker Kontur
 * (stroke-width = Radius, wirkt dadurch wie eine Kreisflaeche statt eines
 * Rings) und ein ganz gewoehnlicher CSS-transition auf stroke-dashoffset.
 * JS setzt den Zielwert genau EIN Mal - einen Frame nach dem Einhaengen
 * (doppeltes rAF: der Browser muss den Startzustand einmal gemalt haben,
 * sonst springt er direkt zum Ziel statt zu animieren). Die eigentlichen
 * 60 Bilder/Sekunde uebernimmt danach die Animations-Engine des Browsers -
 * die ist fuer CSS-transitions in Safari gut getestet, anders als
 * wiederholtes JS-Schreiben von background-image.
 *
 * Weiterhin nur eine Hypothese, noch nicht am Geraet bestaetigt.
 */
const PieCountdown: React.FC<{ armMs: number; onDone: () => void }> = ({ armMs, onDone }) => {
    const [shrinking, setShrinking] = useState(false);

    useEffect(() => {
        let raf2: number | undefined;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setShrinking(true));
        });
        const timeout = setTimeout(onDone, armMs);
        return () => {
            cancelAnimationFrame(raf1);
            if (raf2 !== undefined) cancelAnimationFrame(raf2);
            clearTimeout(timeout);
        };
    }, [armMs, onDone]);

    return (
        <svg className="row-pie" viewBox="0 0 34 36" aria-hidden="true">
            <circle
                className="row-pie-circle"
                cx="17"
                cy="18"
                r={PIE_R}
                // Rotation als SVG-Attribut statt CSS-transform: rotiert
                // exakt um den Kreismittelpunkt (17, 18), ohne sich auf
                // transform-origin-Defaults fuer SVG zu verlassen, die
                // zwischen Browsern unterschiedlich ausfallen koennen.
                transform="rotate(-90 17 18)"
                style={
                    {
                        strokeDasharray: PIE_CIRCUMFERENCE,
                        strokeDashoffset: shrinking ? PIE_CIRCUMFERENCE : 0,
                        transitionDuration: shrinking ? `${armMs}ms` : '0ms',
                    } as React.CSSProperties
                }
            />
        </svg>
    );
};

interface ShutterRowProps {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    onOpenSheet: (device: ShutterFloorDeviceDef) => void;
}

export const ShutterRow: React.FC<ShutterRowProps> = ({ device, connected, onOpenSheet }) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending } = usePendingStore();
    const stopFgColor = useYellowForeground();

    // Tippschutz: 'up'/'down' waehrend die jeweilige Taste bewaffnet ist,
    // sonst null. Erst der zweite Tipp innerhalb ARM_MS loest die Fahrt aus.
    const [armed, setArmed] = useState<'up' | 'down' | null>(null);

    // Berechne geschlossenen Anteil für Statustext
    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Bewegungs-Zustand: läuft, solange die Box Bewegung meldet ODER ein von
    // hier abgeschickter Befehl noch nicht am Ziel angekommen ist
    const busy = state.isMoving || state.isActing;

    // Statuszeile-Text
    let statusText = '';
    if (state.isUnknown) {
        statusText = 'unbekannt';
    } else if (state.isEstimate && closedFrac !== null) {
        // Ohne Quittung der Box ist die Zahl eine Vermutung. Dann bewusst die
        // Prozentform mit Tilde: "~ 40 % zu" traegt die Unsicherheit sichtbar,
        // ein blankes "Geschlossen" waere eine Behauptung.
        statusText = `~ ${Math.round(closedFrac)} % zu`;
    } else if (closedFrac !== null) {
        if (closedFrac <= 3) {
            statusText = 'Offen';
        } else if (closedFrac >= 97) {
            statusText = 'Geschlossen';
        } else {
            statusText = `${Math.round(closedFrac)} % zu`;
        }
    }

    // Bei Raffstore: Lamellenwinkel anhängen
    if (device.slatDp && state.slatAckedPos !== null) {
        statusText += ` · ${state.slatAckedPos}°`;
    }

    // Knopf-Handler mit Pending-Logik (analog ShutterTile)
    const handleOpen = () => {
        if (!device.upDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Auf" muss also 0 setzen.
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.upDp, true);
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true);
        clearPending(device.key);
    };

    const handleClose = () => {
        if (!device.downDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Zu" muss also 100 setzen.
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.downDp, true);
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
    };

    // Tippschutz-Zwischenschicht: erster Tipp bewaffnet nur, zweiter Tipp
    // (bei bereits bewaffneter Taste) loest die eigentliche Fahrt aus.
    const handleUpPress = () => {
        if (armed === 'up') {
            setArmed(null);
            handleOpen();
        } else {
            setArmed('up');
        }
    };

    const handleDownPress = () => {
        if (armed === 'down') {
            setArmed(null);
            handleClose();
        } else {
            setArmed('down');
        }
    };

    // Stabile Referenz fuer PieCountdown.onDone: setArmed selbst ist von
    // React garantiert referenzstabil, useCallback macht handleArmTimeout es
    // ebenfalls - sonst wuerde ein Re-Render aus anderem Grund (z.B.
    // connected-Prop) waehrend eine Taste bewaffnet ist den Countdown-Effekt
    // in PieCountdown unnoetig neu starten.
    const handleArmTimeout = useCallback(() => setArmed(null), []);

    // Entwaffnen, sobald die Zeile in Fahrt geht - eine bewaffnete Taste
    // waehrend der Fahrt waere irrefuehrend.
    useEffect(() => {
        if (busy) setArmed(null);
    }, [busy]);

    // Entwaffnen beim Wegschalten der App - eine noch bewaffnete Taste beim
    // Zurueckkehren waere eine Ueberraschung.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) setArmed(null);
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const handleRowClick = () => {
        onOpenSheet(device);
    };

    const handleRowKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenSheet(device);
        }
    };

    // Wähle das passende Icon basierend auf device.kind
    const TypeIcon =
        device.kind === 'dachfenster' ? RoofWindowIcon : device.kind === 'raffstore' ? RaffstoreIcon : WindowIcon;

    return (
        <div
            className="shutter-row"
            role="button"
            tabIndex={0}
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            // Der Status steht seit dem 01.09.2026 nicht mehr als eigener Text
            // in der Zeile (Platz fuer den Namen in Wohnklima-Groesse, siehe
            // Namenslaengen-Test), lebt aber hier weiter - fuer Screenreader,
            // die sonst nur noch den Namen vorlesen wuerden.
            aria-label={statusText ? `${device.label}, ${statusText}` : device.label}
            style={{
                opacity: !connected ? 0.5 : 1,
            }}
        >
            {/* Icon. Es zeigt seit dem 31.08.2026 auch den Stand: der Behang
                faellt so weit herunter, wie der Rollladen zu ist. Waehrend der
                Fahrt pulsiert die Flaeche ruhig – ohne Farbwechsel, denn die
                Stopp-Taste rechts ist bereits bernstein. */}
            <div className="row-icon">
                <TypeIcon size={18} closedFrac={closedFrac} isMoving={busy} />
            </div>

            {/* Einzeilig, nur Name (01.09.2026, nach Namenslaengen-Test): der
                Status verschwindet als eigener Text - der Fuellstand zeigt sich
                allein im Icon (inkl. Puls waehrend der Fahrt). Der Name laeuft
                dafuer in 14 px wie die Raumnamen auf Wohnklima (cardStyle-
                Zweig, live nachgemessen) statt vormals 13 px. */}
            <div className="row-name">{device.label}</div>

            {/* Zwei oder eine Taste */}
            <div className="row-actions">
                {busy ? (
                    <div style={{ '--stop-fg': stopFgColor } as React.CSSProperties}>
                        <HapticButton
                            className="row-btn row-btn-stop nodrag aura-widget-action"
                            onPress={handleStop}
                            disabled={!connected}
                            title="Stopp"
                            label={`${device.label} stoppen`}
                            stopPropagation
                        >
                            <Square size={16} fill="currentColor" />
                        </HapticButton>
                    </div>
                ) : (
                    <>
                        <HapticButton
                            className={`row-btn nodrag aura-widget-action${armed === 'up' ? ' is-armed' : ''}`}
                            onPress={handleUpPress}
                            disabled={!connected}
                            title={armed === 'up' ? 'Öffnen bestätigen' : 'Öffnen'}
                            label={
                                armed === 'up'
                                    ? `${device.label} öffnen – zum Bestätigen erneut tippen`
                                    : `${device.label} öffnen`
                            }
                            stopPropagation
                        >
                            {armed === 'up' && <PieCountdown armMs={ARM_MS} onDone={handleArmTimeout} />}
                            <span className="row-btn-icon">
                                <ArrowToTopIcon size={20} />
                            </span>
                        </HapticButton>
                        <HapticButton
                            className={`row-btn nodrag aura-widget-action${armed === 'down' ? ' is-armed' : ''}`}
                            onPress={handleDownPress}
                            disabled={!connected}
                            title={armed === 'down' ? 'Schließen bestätigen' : 'Schließen'}
                            label={
                                armed === 'down'
                                    ? `${device.label} schließen – zum Bestätigen erneut tippen`
                                    : `${device.label} schließen`
                            }
                            stopPropagation
                        >
                            {armed === 'down' && <PieCountdown armMs={ARM_MS} onDone={handleArmTimeout} />}
                            <span className="row-btn-icon">
                                <ArrowToBottomIcon size={20} />
                            </span>
                        </HapticButton>
                    </>
                )}
            </div>
        </div>
    );
};
