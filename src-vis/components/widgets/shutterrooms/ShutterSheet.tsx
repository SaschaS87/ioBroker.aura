import React, { useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore, slatPendingKey } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import { SlatSlider } from './SlatSlider';
import { HapticButton } from './HapticButton';
import { tapFeedback } from './haptics';
import { useSheetDismiss } from '../useSheetDismiss';
import { useDragValue, SNAP_POS, KNOB_PAD } from './useDragValue';
import { useYellowForeground } from './useYellowForeground';
import type { ShutterDeviceDef } from './types';
import './ShutterSheet.css';

interface ShutterSheetProps {
    device: ShutterDeviceDef;
    room: string;
    room_facade: string;
    connected: boolean;
    /** Himmelsrichtung im Untertitel zeigen. Der Rollos-Tab gruppiert nach
     *  Etage und braucht sie nicht; der Rolllaeden-Tab gruppiert nach Fassade
     *  und behaelt sie - deshalb Default true. */
    showFacade?: boolean;
    onClose: () => void;
}

export const ShutterSheet: React.FC<ShutterSheetProps> = ({
    device,
    room,
    room_facade,
    connected,
    showFacade = true,
    onClose,
}) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending, showToast } = usePendingStore();
    const stopFgColor = useYellowForeground();
    const [positionDraft, setPositionDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const [localSlatIsDragging, setLocalSlatIsDragging] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);

    // Eine Rechnung, nicht zwei: Fenster-, Regler- und Tastenbreite zentralisiert
    const VIZ_W_PLAIN = 170;   // Fenster ohne Lamelle
    const VIZ_W_SLAT  = 150;   // Fenster mit Lamelle daneben
    const SLAT_W      = 44;    // Lamellenregler
    const INSTR_GAP   = 16;    // Abstand dazwischen
    const vizW = device.slatDp ? VIZ_W_SLAT : VIZ_W_PLAIN;
    const instrW = vizW + (device.slatDp ? INSTR_GAP + SLAT_W : 0);   // 210 bzw. 170

    // Angezeigt und geregelt wird durchgaengig der GESCHLOSSENE Anteil
    // (0 % = offen, 100 % = zu), damit Liste und Feinregler dieselbe Zahl meinen.
    // Der Hook liefert weiterhin den offenen Anteil - hier wird nur gespiegelt.
    const displayClosed = positionDraft !== null ? positionDraft : 100 - (state.posOpen ?? 0);
    const displaySlat = slatDraft !== null ? slatDraft : (state.slatShownPos ?? 0);

    // Schließen: nach unten wischen, Backdrop-Klick oder Escape. Dieselbe
    // Mechanik wie beim Raumklima-Sheet – der Baustein liegt gemeinsam daneben.
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    // Position Zieh-Handler (eine Instanz)
    const { handlers: positionDragHandlers, isDragging: positionIsDragging } = useDragValue({
        get: () => positionDraft !== null ? positionDraft : displayClosed,
        set: setPositionDraft,
        snapPoints: SNAP_POS,
        spanPx: 280,
    });


    const handleStop = () => {
        if (!device.stopDp) return;
        tapFeedback();
        setState(device.stopDp, true);
        // Stopp hat kein Ziel – Auftrags-Zustand beenden, Wort statt Bild.
        clearPending(device.key);
        showToast('Gestoppt');
        // Entwürfe verwerfen (F4)
        setPositionDraft(null);
        setSlatDraft(null);
    };

    const handleConfirm = () => {
        tapFeedback();
        if (positionDraft !== null && device.posDp) {
            const targetRaw = device.invertPosition ? positionDraft : 100 - positionDraft;
            // Denselben Wert nochmal schreiben bewegt nichts, die Box quittiert
            // nichts – der Datenpunkt bliebe dauerhaft auf ack:false stehen und
            // die Anzeige waere blind. Also gar nicht erst senden.
            const alreadyThere = state.ackedPos !== null
                && Math.round(state.ackedPos) === Math.round(targetRaw);
            if (!alreadyThere) {
                setState(device.posDp, targetRaw);
                markPending(device.key, targetRaw, state.lastKnownAckedPos);
            }
            setPositionDraft(null);
        }
        if (slatDraft !== null && device.slatDp) {
            // Gleiches Prinzip für Lamelle: nicht schreiben, wenn Ziel schon anliegt
            const alreadyThereSat = state.slatAckedPos !== null
                && Math.round(state.slatAckedPos) === Math.round(slatDraft);
            if (!alreadyThereSat) {
                setState(device.slatDp, slatDraft);
                markPending(slatPendingKey(device.key), slatDraft);
            }
            setSlatDraft(null);
        }
    };

    // Wortzeilen für Position
    const getPositionWord = (): string => {
        // Fahrt mit bekanntem Ziel: Richtung anzeigen
        if (travel) {
            return targetClosed !== null && startClosed !== null
                ? (targetClosed > startClosed ? 'fährt zu' : 'fährt auf')
                : 'fährt';
        }
        // Fahrt ohne bekanntes Ziel
        if (busy && positionDraft === null) {
            return 'fährt';
        }
        // Unbekannter Wert (und kein Entwurf): leer
        if (state.isUnknown && positionDraft === null) {
            return '';
        }
        // Zahl ohne Quittung der Box: sagen, dass sie eine Vermutung ist
        if (state.isEstimate && positionDraft === null) {
            return 'nicht bestätigt';
        }
        // Ruhe, Wert bekannt
        if (displayClosed <= 3) return 'ganz offen';
        if (displayClosed >= 97) return 'ganz geschlossen';
        return '';
    };

    // Wortzeilen für Lamelle
    const getSlatWord = (): string => {
        // Unbekannter Wert (und kein Entwurf): leer
        if (state.isSlatUnknown && slatDraft === null) {
            return '';
        }
        if (displaySlat <= 5) return 'waagerecht';
        if (displaySlat >= 88) return 'geschlossen';
        return 'halb offen';
    };

    const effFacade = device.facade || room_facade;
    const busy = state.isMoving || state.isActing || state.isSlatActing;
    const hasDraft = positionDraft !== null || slatDraft !== null;

    // Fahrt mit bekanntem Ziel und Startwert: zeigt Start → Ziel
    const travel = busy && positionDraft === null && state.targetOpen !== null && state.startOpen !== null;
    const startClosed = state.startOpen !== null ? 100 - state.startOpen : null;
    const targetClosed = state.targetOpen !== null ? 100 - state.targetOpen : null;

    // Während der Fahrt zeigt das Fenster das ZIEL – die 900-ms-Transition in
    // ShutterViz.css lässt den Behang dorthin gleiten. Ohne bekanntes Ziel
    // (z. B. Fahrt vom Wandschalter) bleibt der letzte bekannte Stand stehen:
    // lieber unbewegt als falsch.
    const vizClosed =
        positionDraft !== null ? positionDraft
      : travel && targetClosed !== null ? targetClosed
      : displayClosed;

    return (
        <div className="shutter-sheet-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div ref={sheetRef} className="shutter-sheet" style={sheetStyle} role="dialog" aria-modal="true">
                {/* Griff-Balken und Kopfzeile bilden zusammen die Ziehflaeche.
                    Der Koerper bleibt aussen vor, sonst kollidiert das Ziehen
                    mit dem Scrollen in den Reglern. */}
                <div
                    className="sheet-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    {/* Griff-Balken */}
                    <div className="sheet-grip">
                        <div className="grip-handle" />
                    </div>

                    {/* Kopfzeile */}
                    <div className="sheet-header">
                        <div className="sheet-header-title">
                            <h2 className="sheet-title">{device.label}</h2>
                            {/* Untertitel nur, wenn die Himmelsrichtung etwas beitraegt.
                                Der nackte Raumname ist am 25.08. entfallen - er steckt
                                ohnehin im Namen des Antriebs eine Zeile darueber. */}
                            {showFacade && effFacade && <p className="sheet-subtitle">{`${room} · ${effFacade}`}</p>}
                        </div>
                    </div>
                </div>

                {/* Körper */}
                <div className="sheet-body" style={{ '--instr-w': `${instrW}px`, '--instr-gap': `${INSTR_GAP}px` } as React.CSSProperties}>
                    {/* Zwei Instrumente nebeneinander */}
                    <div className="sheet-instruments">
                        {/* Position */}
                        <div className="instrument">
                            <h3 className="block-title">POSITION</h3>
                            <div
                                className={`block-value ${positionIsDragging ? 'live' : ''} ${travel ? 'is-travel' : ''} ${
                                    !travel && positionDraft === null && state.isEstimate ? 'is-estimate' : ''
                                }`}
                            >
                                {state.isUnknown && positionDraft === null ? (
                                    '−'
                                ) : travel && targetClosed !== null && startClosed !== null ? (
                                    <>
                                        {Math.round(startClosed)} → <span className="block-ziel">{Math.round(targetClosed)} %</span>
                                    </>
                                ) : (
                                    `${Math.round(displayClosed)} % zu`
                                )}
                            </div>
                            <div className="block-word">{getPositionWord()}</div>
                            <div
                                className="shutter-viz-wrapper"
                                {...positionDragHandlers}
                            >
                                <ShutterViz
                                    closedFrac={state.isUnknown && positionDraft === null ? null : vizClosed}
                                    isMoving={state.isMoving || state.isActing}
                                    isUnknown={state.isUnknown}
                                    direction={state.direction}
                                    size="control"
                                    widthPx={vizW}
                                    heightPx={280}
                                    snapMarks={SNAP_POS}
                                    isDragging={positionIsDragging}
                                />
                            </div>
                        </div>

                        {/* Lamelle (nur wenn slatDp vorhanden) */}
                        {device.slatDp && (
                            <div className="instrument">
                                <h3 className="block-title">LAMELLE</h3>
                                <div className={`block-value ${localSlatIsDragging ? 'live' : ''}`}>
                                    {state.isSlatUnknown ? '−' : `${Math.round(displaySlat)}°`}
                                </div>
                                <div className="block-word">{getSlatWord()}</div>
                                <SlatSlider
                                    value={displaySlat}
                                    onChange={setSlatDraft}
                                    spanPx={280 - 2 * KNOB_PAD}
                                    disabled={!connected || state.isSlatUnknown}
                                    onDraggingChange={setLocalSlatIsDragging}
                                />
                            </div>
                        )}
                    </div>

                    {/* OK-/Stopp-Taste */}
                    <div className="sheet-confirm-container">
                        {busy ? (
                            <div style={{ '--stop-fg': stopFgColor } as React.CSSProperties}>
                                <HapticButton
                                    className="sheet-confirm sheet-confirm-stop"
                                    onPress={handleStop}
                                    label="Stopp"
                                >
                                    <span className="sheet-confirm-label">
                                        <Square size={20} fill="currentColor" />
                                        Stopp
                                    </span>
                                </HapticButton>
                            </div>
                        ) : hasDraft ? (
                            <HapticButton
                                className="sheet-confirm"
                                onPress={handleConfirm}
                                label="OK"
                            >
                                OK
                            </HapticButton>
                        ) : (
                            <HapticButton
                                className="sheet-confirm is-disabled"
                                disabled
                                onPress={() => {}}
                                label="OK"
                            >
                                OK
                            </HapticButton>
                        )}
                    </div>

                    {/* Nicht verbunden Hinweis */}
                    {!connected && <div className="sheet-notice">TaHoma-Box nicht erreichbar</div>}
                </div>
            </div>
        </div>
    );
};
