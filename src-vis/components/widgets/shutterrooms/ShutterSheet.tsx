import React, { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Square } from 'lucide-react';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useT } from '../../../i18n';
import type { TranslationKey } from '../../../i18n';
import { useShutterDevice, usePendingStore, slatPendingKey } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import { SlatSlider } from './SlatSlider';
import { HapticButton } from './HapticButton';
import { tapFeedback } from './haptics';
import { useSheetDismiss } from '../useSheetDismiss';
import { useDragValue, SNAP_POS, KNOB_PAD } from './useDragValue';
import { useYellowForeground } from './useYellowForeground';
import { radioDpsFromPosDp, radioLevel, isRadioOffline, RADIO_COLOR, clockTime } from './tahomaRadio';
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
    // Portal statt Inline-Rendering (01.09.2026, Rollläden-Umbau): Das Widget
    // ist seit dem Wegfall von fillTab ein normales react-grid-layout-Kind.
    // react-grid-layout setzt per Default useCSSTransforms=true und damit ein
    // `transform` auf den Vorfahren – das macht ihn zum Containing Block fuer
    // `position: fixed`, der Backdrop wuerde dann nur die Kachel abdecken statt
    // den Bildschirm. Portal nach dem Frontend-Root umgeht das, exakt wie beim
    // Raumklima-Sheet (RoomClimateSheet.tsx).
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;

    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending, showToast } = usePendingStore();
    const stopFgColor = useYellowForeground();
    const t = useT();
    const [positionDraft, setPositionDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const [localSlatIsDragging, setLocalSlatIsDragging] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);

    // Funkzeile: drei feste Hook-Aufrufe (kein Hook in einer Schleife). Kann
    // radioDpsFromPosDp() nichts ableiten, bekommt useDatapoint '' und
    // abonniert dann nichts (siehe useDatapoint.ts).
    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: radioStatusState } = useDatapoint(radioDps?.statusDp ?? '');
    const { state: radioRssiState } = useDatapoint(radioDps?.rssiDp ?? '');
    const { state: radioDiscreteState } = useDatapoint(radioDps?.discreteDp ?? '');
    const radioOffline = isRadioOffline(radioStatusState?.val);
    const radioLevelVal = radioLevel(radioDiscreteState?.val);
    const radioRssi = typeof radioRssiState?.val === 'number' ? radioRssiState.val : null;
    // Normalfall: ts = wann zuletzt durchgezaehlt. Ausfall: lc = seit wann.
    const radioCheckedTs = radioStatusState?.ts ?? 0;
    const radioSinceTs = radioStatusState?.lc ?? 0;

    // Eine Rechnung, nicht zwei: Fenster-, Regler- und Tastenbreite zentralisiert
    const VIZ_W_PLAIN = 170;   // Fenster ohne Lamelle
    const VIZ_W_SLAT  = 150;   // Fenster mit Lamelle daneben
    const SLAT_W      = 44;    // Lamellenregler
    const INSTR_GAP   = 16;    // Abstand dazwischen
    // Die OK-/Stopp-Taste ist bei JEDEM Antrieb gleich breit. Vorher spannte
    // sie sich ueber die ganze Instrumentenreihe und war beim Raffstore deshalb
    // 210 statt 170 px - von Sascha am 27.08.2026 gemeldet.
    const BTN_W       = VIZ_W_PLAIN;
    const vizW = device.slatDp ? VIZ_W_SLAT : VIZ_W_PLAIN;

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
        // Laufender Lamellen-Auftrag: Richtung statt Zustand, wie beim Fenster
        if (slatTravel) {
            const from = state.slatShownPos;
            if (from !== null && state.slatTarget !== null && Math.abs(state.slatTarget - from) > 3) {
                return state.slatTarget > from ? 'dreht zu' : 'dreht auf';
            }
            return 'dreht';
        }
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

    // Dasselbe fuer die Lamelle: solange ihr Auftrag laeuft, zeigen Zahl und
    // Regler das ZIEL - der Griff gleitet dorthin, statt erst auf den alten
    // Wert zurueckzuspringen und spaeter stumm auf den neuen zu huepfen.
    const slatTravel = state.isSlatActing && slatDraft === null && state.slatTarget !== null;
    const slatViz = slatDraft !== null ? slatDraft
        : slatTravel ? (state.slatTarget as number)
        : displaySlat;
    // Waehrend der Fahrt ist der Wert bekannt, auch wenn die Box gerade schweigt.
    const slatKnown = !state.isSlatUnknown || slatDraft !== null || slatTravel;
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

    return createPortal(
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
                <div className="sheet-body" style={{ '--btn-w': `${BTN_W}px`, '--instr-gap': `${INSTR_GAP}px` } as React.CSSProperties}>
                    {/* Zwei Instrumente nebeneinander */}
                    <div className="sheet-instruments">
                        {/* Position */}
                        <div className="instrument" style={{ '--col-w': `${vizW}px` } as React.CSSProperties}>
                            <h3 className="block-title">POSITION</h3>
                            <div
                                className={`block-value ${positionIsDragging ? 'live' : ''} ${
                                    !travel && positionDraft === null && state.isEstimate ? 'is-estimate' : ''
                                } ${radioOffline ? 'is-stale' : ''}`}
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
                                className={`shutter-viz-wrapper ${radioOffline ? 'is-stale' : ''}`}
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
                            <div className="instrument" style={{ '--col-w': `${SLAT_W}px` } as React.CSSProperties}>
                                <h3 className="block-title">LAMELLE</h3>
                                <div className={`block-value ${localSlatIsDragging ? 'live' : ''} ${slatTravel ? 'is-target' : ''}`}>
                                    {slatKnown ? `${Math.round(slatViz)}°` : '−'}
                                </div>
                                <div className="block-word">{getSlatWord()}</div>
                                <SlatSlider
                                    value={slatViz}
                                    onChange={setSlatDraft}
                                    spanPx={280 - 2 * KNOB_PAD}
                                    disabled={!connected || !slatKnown}
                                    onDraggingChange={setLocalSlatIsDragging}
                                    isMoving={slatTravel}
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

                    {/* Funkzeile (Feature 16, 02.09.2026). Absolute Uhrzeit, Abo
                        genuegt - bewusst KEIN 10-s-Takt wie in RoomClimateDetails,
                        dessen Fusszeile eine RELATIVE Zeit ("vor 5 Minuten") zeigt.
                        Kein Hinweisbalken (.sheet-notice) fuer den Funkausfall -
                        ausdrueckliche Vorgabe Saschas vom 02.09.2026. */}
                    <div className={`sheet-radio ${radioOffline ? 'is-offline' : ''}`}>
                        {radioOffline ? (
                            <>
                                {t('shuttersheet.radio.offline')}
                                {radioSinceTs > 0 &&
                                    ` · ${t('shuttersheet.radio.since', { time: clockTime(radioSinceTs) })}`}
                            </>
                        ) : (
                            <>
                                {radioLevelVal && (
                                    <span style={{ color: RADIO_COLOR[radioLevelVal] }}>
                                        {t(`shuttersheet.radio.${radioLevelVal}` as TranslationKey)}
                                    </span>
                                )}
                                {radioRssi !== null && ` (${radioRssi})`}
                                {radioCheckedTs > 0 &&
                                    ` · ${t('shuttersheet.radio.checked', { time: clockTime(radioCheckedTs) })}`}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        portalTarget,
    );
};
