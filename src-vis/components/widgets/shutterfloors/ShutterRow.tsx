import React from 'react';
import { Square } from 'lucide-react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from '../shutterrooms/useShutterDevice';
import { useYellowForeground } from '../shutterrooms/useYellowForeground';
import { HapticButton } from '../shutterrooms/HapticButton';
import { WindowIcon, RoofWindowIcon, RaffstoreIcon } from '../../icons/ShutterTypeIcons';
import { ArrowToTopIcon, ArrowToBottomIcon } from '../../icons/ShutterActionIcons';
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
    const stopFgColor = useYellowForeground();

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
                <div className={`row-status${state.isEstimate ? ' is-estimate' : ''}`}>{statusText}</div>
            </div>

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
                            className="row-btn nodrag aura-widget-action"
                            onPress={handleOpen}
                            disabled={!connected}
                            title="Öffnen"
                            label={`${device.label} öffnen`}
                            stopPropagation
                        >
                            <ArrowToTopIcon size={20} />
                        </HapticButton>
                        <HapticButton
                            className="row-btn nodrag aura-widget-action"
                            onPress={handleClose}
                            disabled={!connected}
                            title="Schließen"
                            label={`${device.label} schließen`}
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
