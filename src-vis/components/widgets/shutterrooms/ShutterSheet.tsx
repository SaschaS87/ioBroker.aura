import React, { useEffect, useRef, useState } from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import type { ShutterDeviceDef } from './types';
import './ShutterSheet.css';

interface ShutterSheetProps {
    device: ShutterDeviceDef;
    room: string;
    room_facade: string;
    connected: boolean;
    posQuick: number[];
    slatQuick: Array<[number, string]>;
    onClose: () => void;
}

export const ShutterSheet: React.FC<ShutterSheetProps> = ({
    device,
    room,
    room_facade,
    connected,
    posQuick,
    slatQuick,
    onClose,
}) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending } = usePendingStore();
    const [positionDraft, setPositionDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLInputElement>(null);
    const slatSliderRef = useRef<HTMLInputElement>(null);

    const displayPos = positionDraft !== null ? positionDraft : (state.posOpen ?? 0);
    const displaySlat = slatDraft !== null ? slatDraft : (state.slatAckedPos ?? 0);

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
            const targetRaw = device.invertPosition ? 100 - positionDraft : positionDraft;
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
            setSlatDraft(null);
        }
    };

    // Position Quick-Chips
    const handlePositionQuick = (val: number) => {
        if (!device.posDp) return;
        const targetRaw = device.invertPosition ? 100 - val : val;
        setState(device.posDp, targetRaw);
        markPending(device.key, targetRaw);
    };

    // Slat Quick-Chips
    const handleSlatQuick = (val: number) => {
        if (!device.slatDp) return;
        setState(device.slatDp, val);
    };

    const handleOpen = () => {
        if (!device.upDp) return;
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.upDp, true);
        markPending(device.key, targetRaw);
    };

    const handleClose = () => {
        if (!device.downDp) return;
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.downDp, true);
        markPending(device.key, targetRaw);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        const targetRaw = state.ackedPos !== null ? state.ackedPos : 50;
        setState(device.stopDp, true);
        markPending(device.key, targetRaw);
    };

    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);
    const effFacade = device.facade || room_facade;

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
                        <p className="sheet-subtitle">
                            {room} · {effFacade}
                        </p>
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
                            isMoving={state.isMoving}
                            isUnknown={state.isUnknown}
                            size="large"
                        />
                        <div className="sheet-buttons-vertical">
                            <button
                                className="sheet-btn sheet-btn-up"
                                onClick={handleOpen}
                                disabled={!connected}
                                title="Vollständig öffnen"
                            >
                                ▲
                            </button>
                            <button
                                className="sheet-btn sheet-btn-stop"
                                onClick={handleStop}
                                disabled={!connected}
                                title="Stopp"
                            >
                                ⏸
                            </button>
                            <button
                                className="sheet-btn sheet-btn-down"
                                onClick={handleClose}
                                disabled={!connected}
                                title="Vollständig schließen"
                            >
                                ▼
                            </button>
                        </div>
                    </div>

                    {/* Rechte Spalte: Position + optional Lamelle */}
                    <div className="sheet-right">
                        {/* Position Block */}
                        <div className="sheet-block">
                            <h3 className="block-title">Position</h3>
                            <div className="block-value">{state.isUnknown ? '−' : `${Math.round(displayPos)}%`}</div>
                            <input
                                ref={sliderRef}
                                type="range"
                                min="0"
                                max="100"
                                value={displayPos}
                                onChange={handlePositionChange}
                                onMouseUp={handlePositionEnd}
                                onTouchEnd={handlePositionEnd}
                                disabled={!connected || state.isUnknown}
                                className="block-slider"
                            />
                            <div className="quick-chips">
                                {posQuick.map((val) => (
                                    <button
                                        key={val}
                                        className={`quick-chip ${Math.abs(displayPos - val) < 5 ? 'active' : ''}`}
                                        onClick={() => handlePositionQuick(val)}
                                        disabled={!connected}
                                    >
                                        {val}%
                                    </button>
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
                                        <button
                                            key={val}
                                            className={`quick-chip ${Math.abs(displaySlat - val) < 5 ? 'active' : ''}`}
                                            onClick={() => handleSlatQuick(val)}
                                            disabled={!connected}
                                        >
                                            {label}
                                        </button>
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
