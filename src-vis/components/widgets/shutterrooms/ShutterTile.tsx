import React from 'react';
import { ChevronUp, Square, ChevronDown } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import { HapticButton } from './HapticButton';
import type { ShutterDeviceDef } from './types';
import './ShutterTile.css';

interface ShutterTileProps {
    device: ShutterDeviceDef;
    connected: boolean;
    onOpenSheet: (device: ShutterDeviceDef) => void;
}

export const ShutterTile: React.FC<ShutterTileProps> = ({ device, connected, onOpenSheet }) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending, showToast } = usePendingStore();

    // Das Abfangen des Klicks (sonst öffnet die Kachel darunter das Sheet) und
    // die spürbare Quittung erledigt HapticButton.
    const handleOpen = () => {
        if (!device.upDp) return;
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.upDp, true);
        markPending(device.key, targetRaw);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true);
        // Stopp hat kein Ziel und damit kein Bild – der Auftrags-Zustand endet,
        // und nur hier meldet sich die Einblendung zu Wort.
        clearPending(device.key);
        showToast('Gestoppt');
    };

    const handleClose = () => {
        if (!device.downDp) return;
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.downDp, true);
        markPending(device.key, targetRaw);
    };

    const handleCardClick = () => {
        onOpenSheet(device);
    };

    const handleCardKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenSheet(device);
        }
    };

    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Auftrags-Zustand: laeuft, solange die Box Bewegung meldet ODER ein von
    // hier abgeschickter Befehl noch nicht am Ziel angekommen ist.
    const busy = state.isMoving || state.isActing;
    const showTarget = state.targetOpen !== null && !state.isUnknown;

    return (
        <div
            className={`shutter-tile${busy ? ' tile-busy' : ''}`}
            data-key={device.key}
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
            style={{
                opacity: !connected ? 0.5 : 1,
            }}
        >
            {/* Kopfzeile: Label + Badges */}
            <div className="tile-header">
                <div className="tile-label">{device.label}</div>
                <div className="tile-badges">{busy && <span className="tile-puls" aria-hidden="true" />}</div>
            </div>

            {/* Mitte: Visualisierung + Prozentwert */}
            <div className="tile-content">
                <ShutterViz
                    closedFrac={closedFrac}
                    isMoving={busy}
                    isUnknown={state.isUnknown}
                    direction={state.direction}
                    size="small"
                />
                {/* Gezaehlt wird der GESCHLOSSENE Anteil - dieselbe Richtung wie im
                    Feinregler und im Rollos-Tab. Zwei Zaehlrichtungen im selben Haus
                    waeren eine Verwechslungsquelle. */}
                <div className="tile-percent">
                    <b>{state.isUnknown ? '−' : `${Math.round(closedFrac ?? 0)}%`}</b>
                    <span>zu</span>
                </div>
                {busy && showTarget && (
                    <span
                        className="tile-ziel"
                        aria-label={`Ziel ${Math.round(100 - (state.targetOpen ?? 0))} Prozent geschlossen`}
                    >
                        → {Math.round(100 - (state.targetOpen ?? 0))}%
                    </span>
                )}
            </div>

            {/* Unten: 3 Tasten. HapticButton statt <button>, damit der Finger den
                versteckten Schalter trifft und iOS spürbar quittiert. */}
            <div className="tile-actions">
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleOpen}
                    disabled={!connected}
                    title="Öffnen"
                    label={`${device.label} öffnen`}
                    stopPropagation
                >
                    <ChevronUp size={16} />
                </HapticButton>
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleStop}
                    disabled={!connected}
                    title="Stopp"
                    label={`${device.label} stoppen`}
                    stopPropagation
                >
                    <Square size={13} />
                </HapticButton>
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleClose}
                    disabled={!connected}
                    title="Schließen"
                    label={`${device.label} schließen`}
                    stopPropagation
                >
                    <ChevronDown size={16} />
                </HapticButton>
            </div>
        </div>
    );
};
