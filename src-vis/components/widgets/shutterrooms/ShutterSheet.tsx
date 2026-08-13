import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, Square, ChevronDown } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore, slatPendingKey } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import { HapticButton } from './HapticButton';
import { tapFeedback } from './haptics';
import type { ShutterDeviceDef } from './types';
import './ShutterSheet.css';

interface ShutterSheetProps {
    device: ShutterDeviceDef;
    room: string;
    room_facade: string;
    connected: boolean;
    posQuick: number[];
    slatQuick: Array<[number, string]>;
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
    posQuick,
    slatQuick,
    showFacade = true,
    onClose,
}) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending, showToast } = usePendingStore();
    const [positionDraft, setPositionDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLInputElement>(null);
    const slatSliderRef = useRef<HTMLInputElement>(null);

    // Angezeigt und geregelt wird durchgaengig der GESCHLOSSENE Anteil
    // (0 % = offen, 100 % = zu), damit Liste und Feinregler dieselbe Zahl meinen.
    // Der Hook liefert weiterhin den offenen Anteil - hier wird nur gespiegelt.
    const displayClosed = positionDraft !== null ? positionDraft : 100 - (state.posOpen ?? 0);
    const displaySlat = slatDraft !== null ? slatDraft : (state.slatAckedPos ?? 0);

    // Welchen Wert die Schnellwahl-Knöpfe als "aktiv" markieren: beim Ziehen den
    // Finger, bei laufendem Auftrag das ZIEL, sonst den bestätigten Ist-Wert.
    // Vorher stand hier immer der Ist-Wert – während der Fahrt blieb deshalb der
    // alte Knopf eingefärbt, obwohl längst ein anderer angefahren wurde.
    const posChipRef = positionDraft !== null ? positionDraft : 100 - (state.targetOpen ?? state.posOpen ?? 0);
    const slatChipRef = slatDraft !== null ? slatDraft : (state.slatTarget ?? state.slatAckedPos ?? 0);

    // Escape-Taste schließt das Sheet
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Backdrop-Klick schließt
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // Position Slider: nur beim Loslassen schreiben
    const handlePositionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPositionDraft(Number(e.target.value));
    };

    const handlePositionEnd = () => {
        if (positionDraft !== null && device.posDp) {
            tapFeedback();
            // positionDraft ist der GESCHLOSSENE Anteil. Der offene waere
            // 100 - draft; mit der Invertierung verrechnet bleibt bei
            // invertPosition genau der Draft-Wert stehen.
            const targetRaw = device.invertPosition ? positionDraft : 100 - positionDraft;
            setState(device.posDp, targetRaw);
            markPending(device.key, targetRaw);
            setPositionDraft(null);
        }
    };

    // Slat Slider: nur beim Loslassen schreiben
    const handleSlatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSlatDraft(Number(e.target.value));
    };

    const handleSlatEnd = () => {
        if (slatDraft !== null && device.slatDp) {
            setState(device.slatDp, slatDraft);
            markPending(slatPendingKey(device.key), slatDraft);
            setSlatDraft(null);
        }
    };

    // Position Quick-Chips
    const handlePositionQuick = (val: number) => {
        if (!device.posDp) return;
        tapFeedback();
        // val ist der gewuenschte GESCHLOSSENE Anteil (0 = offen, 100 = zu).
        const targetRaw = device.invertPosition ? val : 100 - val;
        setState(device.posDp, targetRaw);
        markPending(device.key, targetRaw);
    };

    // Slat Quick-Chips
    const handleSlatQuick = (val: number) => {
        if (!device.slatDp) return;
        tapFeedback();
        setState(device.slatDp, val);
        markPending(slatPendingKey(device.key), val);
    };

    const handleOpen = () => {
        if (!device.upDp) return;
        tapFeedback();
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.upDp, true);
        markPending(device.key, targetRaw);
    };

    const handleClose = () => {
        if (!device.downDp) return;
        tapFeedback();
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.downDp, true);
        markPending(device.key, targetRaw);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        tapFeedback();
        setState(device.stopDp, true);
        // Stopp hat kein Ziel – Auftrags-Zustand beenden, Wort statt Bild.
        clearPending(device.key);
        showToast('Gestoppt');
    };

    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);
    const effFacade = device.facade || room_facade;
    const busy = state.isMoving || state.isActing;

    return (
        <div className="shutter-sheet-backdrop" onClick={handleBackdropClick}>
            <div ref={sheetRef} className="shutter-sheet" role="dialog" aria-modal="true">
                {/* Griff-Balken */}
                <div className="sheet-grip">
                    <div className="grip-handle" />
                </div>

                {/* Kopfzeile */}
                <div className="sheet-header">
                    <div className="sheet-header-title">
                        <h2 className="sheet-title">{device.label}</h2>
                        <p className="sheet-subtitle">{showFacade && effFacade ? `${room} · ${effFacade}` : room}</p>
                    </div>
                    <button className="sheet-close-btn" onClick={onClose} title="Schließen" aria-label="Schließen">
                        ✕
                    </button>
                </div>

                {/* Körper */}
                <div className="sheet-body">
                    {/* Linke Spalte: große Visualisierung + vertikale Buttons */}
                    <div className="sheet-left">
                        <ShutterViz
                            closedFrac={closedFrac}
                            isMoving={state.isMoving || state.isActing}
                            isUnknown={state.isUnknown}
                            direction={state.direction}
                            size="large"
                        />
                        <div className="sheet-buttons-vertical">
                            <HapticButton
                                className="sheet-btn sheet-btn-up"
                                onPress={handleOpen}
                                disabled={!connected}
                                title="Vollständig öffnen"
                                label="Vollständig öffnen"
                            >
                                <ChevronUp size={22} />
                            </HapticButton>
                            <HapticButton
                                className="sheet-btn sheet-btn-stop"
                                onPress={handleStop}
                                disabled={!connected}
                                title="Stopp"
                                label="Stopp"
                            >
                                <Square size={18} />
                            </HapticButton>
                            <HapticButton
                                className="sheet-btn sheet-btn-down"
                                onPress={handleClose}
                                disabled={!connected}
                                title="Vollständig schließen"
                                label="Vollständig schließen"
                            >
                                <ChevronDown size={22} />
                            </HapticButton>
                        </div>
                    </div>

                    {/* Rechte Spalte: Position + optional Lamelle */}
                    <div className="sheet-right">
                        {/* Position Block */}
                        <div className="sheet-block">
                            <h3 className="block-title">Position</h3>
                            <div className="block-value">
                                {state.isUnknown ? '−' : `${Math.round(displayClosed)} % zu`}
                                {/* Laufender Auftrag: das Ziel steht daneben, bis die Box
                                    die neue Position gemeldet hat. Nicht waehrend des
                                    Ziehens – dann fuehrt der Finger die Zahl. */}
                                {busy && positionDraft === null && state.targetOpen !== null && (
                                    <span className="block-ziel">→ {Math.round(100 - state.targetOpen)} %</span>
                                )}
                            </div>
                            <input
                                ref={sliderRef}
                                type="range"
                                min="0"
                                max="100"
                                value={displayClosed}
                                onChange={handlePositionChange}
                                onMouseUp={handlePositionEnd}
                                onTouchEnd={handlePositionEnd}
                                disabled={!connected || state.isUnknown}
                                className="block-slider"
                            />
                            <div className="quick-chips">
                                {posQuick.map((val) => (
                                    <HapticButton
                                        key={val}
                                        className={`quick-chip ${Math.abs(posChipRef - val) < 5 ? 'active' : ''}`}
                                        onPress={() => handlePositionQuick(val)}
                                        disabled={!connected}
                                        label={`Auf ${val} Prozent fahren`}
                                    >
                                        {val}%
                                    </HapticButton>
                                ))}
                            </div>
                        </div>

                        {/* Lamellen Block (nur wenn slatDp vorhanden) */}
                        {device.slatDp && (
                            <div className="sheet-block">
                                <h3 className="block-title">Lamellenwinkel</h3>
                                <div className="block-value">
                                    {state.isSlatUnknown ? '−' : `${Math.round(displaySlat)}°`}
                                </div>
                                <input
                                    ref={slatSliderRef}
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={displaySlat}
                                    onChange={handleSlatChange}
                                    onMouseUp={handleSlatEnd}
                                    onTouchEnd={handleSlatEnd}
                                    disabled={!connected || state.isSlatUnknown}
                                    className="block-slider"
                                />
                                <div className="quick-chips">
                                    {slatQuick.map(([val, label]) => (
                                        <HapticButton
                                            key={val}
                                            className={`quick-chip ${Math.abs(slatChipRef - val) < 5 ? 'active' : ''}`}
                                            onPress={() => handleSlatQuick(val)}
                                            disabled={!connected}
                                            label={`Lamelle: ${label}`}
                                        >
                                            {label}
                                        </HapticButton>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Nicht verbunden Hinweis */}
                        {!connected && <div className="sheet-notice">TaHoma-Box nicht erreichbar</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
