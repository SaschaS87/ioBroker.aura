import React, { useEffect, useRef, useState } from 'react';
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
    const actionsRef = useRef<HTMLDivElement>(null);

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

    // rAF-Treiber fuer die Kuchengrafik: schreibt das Gradient-Bild direkt am
    // DOM-Knoten der bewaffneten Taste (nicht ueber React-State), damit es
    // nicht jeden Frame rendert. Laeuft nur, solange eine Taste bewaffnet ist.
    //
    // Zweiter Anlauf (Feature 15, 02.09.2026, Geraetetest Runde 3): der erste
    // Versuch (nur --pie-pct per setProperty setzen + erzwungener Layout-Read
    // per offsetHeight) hat den Randschnipsel auf dem iPhone NICHT behoben -
    // am PC (Chrome) lief dieselbe Fassung sauber durch, nur Safari zeigte
    // weiter ein haengenbleibendes Segment. offsetHeight erzwingt Layout,
    // nicht Paint - das war also die falsche Absicherung fuer ein reines
    // Hintergrundbild-Problem. Bekanntes WebKit-Verhalten: eine Custom
    // Property, die nur INNERHALB eines conic-gradient() referenziert wird
    // (hier zusaetzlich per Vererbung vom Eltern-Element .row-actions auf die
    // Taste, siehe ShutterRow.css), wird nicht zuverlaessig bei jedem
    // setProperty()-Aufruf neu gemalt. Deshalb jetzt: kompletter
    // background-image-String direkt auf der bewaffneten Taste selbst, mit
    // dem Prozentwert als Literal statt als Custom-Property-Referenz - das
    // aendert die Style-Deklaration selbst statt sich auf einen Lookup zu
    // verlassen. --pie-fill bleibt ueber CSS bezogen (aendert sich waehrend
    // der Animation nicht, nur der Prozentwert tut das). Weiterhin nur eine
    // Vermutung, noch nicht am Geraet bestaetigt.
    useEffect(() => {
        if (armed === null) return;
        const el = actionsRef.current;
        if (!el) return;

        const start = performance.now();

        let raf: number;
        const tick = () => {
            const pct = Math.max(0, 100 - ((performance.now() - start) / ARM_MS) * 100);
            const btn = el.querySelector<HTMLElement>('.row-btn.is-armed');
            if (btn) {
                btn.style.backgroundImage = `conic-gradient(var(--pie-fill) ${pct}%, var(--widget-bg) 0)`;
            }
            if (pct <= 0) {
                setArmed(null);
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            const btn = el.querySelector<HTMLElement>('.row-btn.is-armed');
            if (btn) btn.style.removeProperty('background-image');
        };
    }, [armed]);

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
            <div className="row-actions" ref={actionsRef}>
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
                            <ArrowToTopIcon size={20} />
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
                            <ArrowToBottomIcon size={20} />
                        </HapticButton>
                    </>
                )}
            </div>
        </div>
    );
};
