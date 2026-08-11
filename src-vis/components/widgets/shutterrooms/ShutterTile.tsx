import React from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice, usePendingStore } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import type { ShutterDeviceDef } from './types';
import './ShutterTile.css';

interface ShutterTileProps {
    device: ShutterDeviceDef;
    connected: boolean;
    roomFacade: string;
    onOpenSheet: (device: ShutterDeviceDef) => void;
}

export const ShutterTile: React.FC<ShutterTileProps> = ({ device, connected, roomFacade, onOpenSheet }) => {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending } = usePendingStore();

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!device.upDp) return;
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.upDp, true);
        markPending(device.key, targetRaw);
    };

    const handleStop = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!device.stopDp) return;
        const targetRaw = state.ackedPos !== null ? state.ackedPos : 50;
        setState(device.stopDp, true);
        markPending(device.key, targetRaw);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
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
    const facadeMismatch = device.facade && device.facade !== roomFacade;

    return (
        <div
            className="shutter-tile"
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
                <div className="tile-badges">
                    {facadeMismatch && <div className="tile-badge badge-facade">{device.facade}</div>}
                    {device.badge && (
                        <div className={`tile-badge badge-${device.badge}`}>
                            {device.badge === 'raffstore' ? 'Raffstore' : 'Dachfenster'}
                        </div>
                    )}
                </div>
            </div>

            {/* Mitte: Visualisierung + Prozentwert */}
            <div className="tile-content">
                <ShutterViz
                    closedFrac={closedFrac}
                    isMoving={state.isMoving}
                    isUnknown={state.isUnknown}
                    size="small"
                />
                <div className="tile-percent">
                    <b>{state.isUnknown ? '−' : `${Math.round(state.posOpen ?? 0)}%`}</b>
                    <span>offen</span>
                </div>
            </div>

            {/* Unten: 3 Buttons */}
            <div className="tile-actions">
                <button className="nodrag aura-widget-action" onClick={handleOpen} disabled={!connected} title="Öffnen">
                    ▲
                </button>
                <button className="nodrag aura-widget-action" onClick={handleStop} disabled={!connected} title="Stopp">
                    ⏸
                </button>
                <button
                    className="nodrag aura-widget-action"
                    onClick={handleClose}
                    disabled={!connected}
                    title="Schließen"
                >
                    ▼
                </button>
            </div>
        </div>
    );
};
