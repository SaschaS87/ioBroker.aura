import React, { useMemo, useState, useEffect } from 'react';
import { Square, RadioOff } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore } from '../shutterrooms/useShutterDevice';
import { useYellowForeground } from '../shutterrooms/useYellowForeground';
import { HapticButton } from '../shutterrooms/HapticButton';
import { radioDpsFromPosDp, isRadioOffline } from '../shutterrooms/tahomaRadio';
import { WindowIcon, RoofWindowIcon, RaffstoreIcon } from '../../icons/ShutterTypeIcons';
import { ArrowToTopIcon, ArrowToBottomIcon } from '../../icons/ShutterActionIcons';
import type { ShutterFloorDeviceDef } from './types';
import './ShutterRow.css';

interface ShutterRowProps {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    onOpenSheet: (device: ShutterFloorDeviceDef) => void;
}

// Stopp-Fenster gegen Flackern und Nachhaengen (Feature 17, Ziel C).
// Der Adapter tahoma.1 laeuft im Polling-Modus: system.adapter.tahoma.1,
// common.dataSource: "poll", native.pollinterval: 5000. core:MovingState wird
// nur alle ~5,0 s auf einem festen globalen Raster aktualisiert, nicht an den
// Tastendruck gekoppelt.
// Gemessen am 03.09.2026 an Wohnz_gross (Kommandos befristet historisiert,
// danach wieder auf enabled: false): Stopp 07:27:41.917 -> Poll bestaetigt
// "steht" 07:27:47.184 = 5,27 s Verzug (Worst Case dieser Messreihe); zweiter
// Fall 07:27:57.517 -> 07:28:02.19 = 4,67 s. Poll-Zeitpunkte lagen 5,00-5,03 s
// auseinander.
// Daraus: 6000 ms = ein Poll-Intervall plus Marge, deckt den gemessenen Worst
// Case von 5,27 s mit ~0,7 s Reserve ab.
// Verweis auf PENDING_MAX_AGE_MS = 45000 in useShutterDevice.ts: Das
// Stopp-Fenster liegt bewusst weit darunter, kann mit der
// Auftrags-Altersgrenze nicht kollidieren.
const STOP_IGNORE_MOVING_MS = 6000;

export const ShutterRow: React.FC<ShutterRowProps> = ({ device, connected, onOpenSheet }) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending } = usePendingStore();
    const stopFgColor = useYellowForeground();

    // Merker fuer das Stopp-Fenster (Feature 17, Ziel C). Bewusst useState,
    // nicht useRef: Ein useRef loest kein Neuzeichnen aus. Laeuft nach dem
    // Fensterende noch eine echte Fremdfahrt (Wandschalter), muesste die
    // Zeile beim Ablauf des Fensters von selbst wieder auf busy umschalten -
    // ohne Neuzeichnen bliebe die Stopp-Taste unsichtbar, bis zufaellig eine
    // andere Datenpunktmeldung eintrifft. Ob der Adapter bei unveraendertem
    // Poll-Wert ueberhaupt erneut ein stateChange sendet, ist nicht belegt.
    const [stoppedAt, setStoppedAt] = useState<number | null>(null);

    // Funk-Ausfall-Zeichen (Offene-Punkte-Eintrag "Zeichen fuer kein
    // Funkkontakt in der Zeilenliste", umgesetzt 02.09.2026 - Saschas Wahl:
    // Variante A, durchgestrichenes Funksymbol unten rechts am Typ-Icon).
    // Nur der Status-Datenpunkt wird gebraucht, RSSI/Discrete bleiben dem
    // Popup und der Signalstaerke-Box vorbehalten.
    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: radioStatusState } = useDatapoint(radioDps?.statusDp ?? '');
    const radioOffline = isRadioOffline(radioStatusState?.val);

    // Berechne geschlossenen Anteil für Statustext
    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Stopp-Fenster aktiv? Dieselbe Lehre wie bei PENDING_MAX_AGE_MS
    // (useShutterDevice.ts): iOS friert Timer ein, sobald die App in den
    // Hintergrund wandert. Ein Fenster, das nur per setTimeout endet, bliebe
    // nach Rueckkehr aus dem Hintergrund unbegrenzt offen und wuerde echte
    // Bewegungsmeldungen dauerhaft schlucken. Der Zeitstempelvergleich beim
    // Rendern ist die massgebliche Pruefung, der Timer weiter unten sorgt nur
    // fuer das Neuzeichnen.
    const inStopWindow = stoppedAt !== null && Date.now() - stoppedAt < STOP_IGNORE_MOVING_MS;

    // Bewegungs-Zustand: läuft, solange die Box Bewegung meldet ODER ein von
    // hier abgeschickter Befehl noch nicht am Ziel angekommen ist.
    // state.isActing steht bewusst ausserhalb der Fenster-Bedingung: Ein
    // bewusster neuer Auf/Zu-Tipp ruft markPending() synchron auf und setzt
    // damit sofort isActing = true - die Stopp-Taste erscheint sofort wieder,
    // unabhaengig davon, ob das Stopp-Fenster noch laeuft. Das Fenster
    // daempft ausschliesslich das rohe, um bis zu ein Poll-Intervall
    // verspaetete isMoving, niemals ein selbst ausgeloestes Fahrsignal.
    //
    // Wahrheitstabelle:
    // isActing | isMoving | inStopWindow | alt   | neu
    // false    | false    | -            | false | false
    // false    | true     | false        | true  | true
    // false    | true     | true         | true  | false  <- einziger Unterschied
    // true     | -        | -            | true  | true
    // "neu" ist nie true, wo "alt" false war.
    const busy = state.isActing || (state.isMoving && !inStopWindow);

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
        // Stopp-Fenster sofort verwerfen: Solange der Auftrag laeuft, traegt
        // isActing die Anzeige. Der Auftrag endet aber vorzeitig, sobald die
        // Box die Zielposition im Toleranzband ±3 quittiert
        // (useShutterDevice.ts) - bei einer kurzen Fahrt kann das noch
        // innerhalb der 6 Sekunden passieren. Danach traegt allein isMoving.
        // Ein noch offenes Stopp-Fenster wuerde die Anzeige in diesem Moment
        // faelschlich abschalten. Deshalb wird das Fenster bei jedem
        // bewussten Auf/Zu-Tipp sofort verworfen.
        setStoppedAt(null);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true);
        clearPending(device.key);
        // Stopp-Fenster setzen (Feature 17, Ziel C). Deckt zwei Symptome mit
        // einem Mechanismus ab:
        // "Haengt nach": isActing war schon sofort weg, isMoving stand bis
        // zum naechsten Poll-Tick noch auf true (gemessen 4,67-5,27 s). Das
        // Fenster blendet diesen Rest aus.
        // "Flackern": Wurde Stopp gedrueckt, bevor der erste Poll die Fahrt
        // ueberhaupt als true bestaetigt hatte, fielen isActing und isMoving
        // gleichzeitig weg, der naechste Poll holte die kurze reale Fahrt
        // nach, der uebernaechste meldete false. Das Fenster deckt diese
        // Nachzuegler ab.
        setStoppedAt(Date.now());
    };

    const handleClose = () => {
        if (!device.downDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Zu" muss also 100 setzen.
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.downDp, true);
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
        // Stopp-Fenster sofort verwerfen - Begruendung siehe handleOpen.
        setStoppedAt(null);
    };

    // Der Timer beendet das Stopp-Fenster nicht fachlich - das tut der
    // Zeitstempelvergleich in inStopWindow weiter oben. Er sorgt nur dafuer,
    // dass die Zeile beim Fensterende einmal neu zeichnet.
    useEffect(() => {
        if (stoppedAt === null) return;
        const rest = STOP_IGNORE_MOVING_MS - (Date.now() - stoppedAt);
        if (rest <= 0) {
            setStoppedAt(null);
            return;
        }
        const t = window.setTimeout(() => setStoppedAt(null), rest);
        return () => window.clearTimeout(t);
    }, [stoppedAt]);

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
                {/* Funk-Ausfall: durchgestrichenes Funksymbol unten rechts am
                    Typ-Icon, 45 % Deckkraft (Variante A, siehe Offene Punkte). */}
                {radioOffline && (
                    <span className="row-icon-radio-badge" aria-hidden="true">
                        <RadioOff size={11} strokeWidth={2} />
                    </span>
                )}
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
                        <button
                            type="button"
                            className="row-btn row-btn-plain nodrag aura-widget-action"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpen();
                            }}
                            disabled={!connected}
                            title="Öffnen"
                            aria-label={`${device.label} öffnen`}
                        >
                            <span className="row-btn-icon">
                                <ArrowToTopIcon size={20} />
                            </span>
                        </button>
                        <button
                            type="button"
                            className="row-btn row-btn-plain nodrag aura-widget-action"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClose();
                            }}
                            disabled={!connected}
                            title="Schließen"
                            aria-label={`${device.label} schließen`}
                        >
                            <span className="row-btn-icon">
                                <ArrowToBottomIcon size={20} />
                            </span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
