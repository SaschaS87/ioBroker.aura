import React from 'react';
import { ChevronUp, Square, ChevronDown } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from '../shutterrooms/useShutterDevice';
import { HapticButton } from '../shutterrooms/HapticButton';
import { WindowIcon, RoofWindowIcon, RaffstoreIcon } from '../../icons/ShutterTypeIcons';
import { ShutterBar } from './ShutterBar';
import type { ShutterFloorDeviceDef } from './types';
import './ShutterRow.css';

interface ShutterRowProps {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    onOpenSheet: (device: ShutterFloorDeviceDef) => void;
}

export const ShutterRow: React.FC<ShutterRowProps> = ({ device, connected, onOpenSheet }) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending } = usePendingStore();

    // Berechne geschlossenen Anteil für Statustext
    const closedFrac = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Bewegungs-Zustand: läuft, solange die Box Bewegung meldet ODER ein von
    // hier abgeschickter Befehl noch nicht am Ziel angekommen ist
    const busy = state.isMoving || state.isActing;

    // Statuszeile-Text
    let statusText = '';
    if (state.isUnknown) {
        statusText = 'unbekannt';
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
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.upDp, true);
        markPending(device.key, targetRaw);
    };

    const handleStop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true);
        clearPending(device.key);
    };

    const handleClose = () => {
        if (!device.downDp) return;
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.downDp, true);
        markPending(device.key, targetRaw);
    };

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
            style={{
                opacity: !connected ? 0.5 : 1,
            }}
        >
            {/* Icon */}
            <div className="row-icon">
                <TypeIcon size={18} />
            </div>

            {/* Zweizeilig: Label + Status */}
            <div className="row-labels">
                <div className="row-label">{device.label}</div>
                <div className="row-status">{statusText}</div>
            </div>

            {/* Blinkender Punkt wenn Bewegung läuft */}
            <div className="row-pulse-container">{busy && <span className="row-pulse" aria-hidden="true" />}</div>

            {/* Positionsbalken */}
            <div className="row-bar">
                <ShutterBar closedFrac={closedFrac} />
            </div>

            {/* Drei Knöpfe */}
            <div className="row-actions">
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleOpen}
                    disabled={!connected}
                    title="Öffnen"
                    label={`${device.label} öffnen`}
                    stopPropagation
                >
                    <ChevronUp size={14} />
                </HapticButton>
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleStop}
                    disabled={!connected}
                    title="Stopp"
                    label={`${device.label} stoppen`}
                    stopPropagation
                >
                    <Square size={12} />
                </HapticButton>
                <HapticButton
                    className="nodrag aura-widget-action"
                    onPress={handleClose}
                    disabled={!connected}
                    title="Schließen"
                    label={`${device.label} schließen`}
                    stopPropagation
                >
                    <ChevronDown size={14} />
                </HapticButton>
            </div>
        </div>
    );
};
