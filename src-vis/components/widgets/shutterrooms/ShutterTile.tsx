import React from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useShutterDevice } from './useShutterDevice';
import { ShutterViz } from './ShutterViz';
import { ShutterDeviceDef } from './types';
import './ShutterTile.css';

interface ShutterTileProps {
  device: ShutterDeviceDef;
  connected: boolean;
  onOpenSheet: (device: ShutterDeviceDef) => void;
}

export const ShutterTile: React.FC<ShutterTileProps> = ({
  device,
  connected,
  onOpenSheet,
}) => {
  const { setState } = useIoBroker();
  const state = useShutterDevice(device);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!device.upDp) return;
    setState(device.upDp, true);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!device.stopDp) return;
    setState(device.stopDp, true);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!device.downDp) return;
    setState(device.downDp, true);
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

  return (
    <div
      className="shutter-tile"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      style={{
        opacity: !connected ? 0.5 : 1,
      }}
    >
      {/* Kopfzeile: Label + Badge */}
      <div className="tile-header">
        <div className="tile-label">{device.label}</div>
        {device.badge && (
          <div className={`tile-badge badge-${device.badge}`}>
            {device.badge === 'raffstore' ? 'Raffstore' : 'Dachfenster'}
          </div>
        )}
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
          {state.isUnknown ? '−' : `${Math.round(state.posOpen ?? 0)}%`}
        </div>
      </div>

      {/* Unten: 3 Buttons */}
      <div className="tile-actions">
        <button
          className="nodrag aura-widget-action"
          onClick={handleOpen}
          disabled={!connected}
          title="Öffnen"
        >
          ▲
        </button>
        <button
          className="nodrag aura-widget-action"
          onClick={handleStop}
          disabled={!connected}
          title="Stopp"
        >
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
