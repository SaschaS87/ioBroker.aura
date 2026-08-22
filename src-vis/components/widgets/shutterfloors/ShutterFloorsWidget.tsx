import React, { useEffect, useMemo, useState } from 'react';
import type { WidgetProps } from '../../../types';
import type { PendingState } from '../shutterrooms/useShutterDevice';
import { PendingContext } from '../shutterrooms/useShutterDevice';
import { ShutterSheet } from '../shutterrooms/ShutterSheet';
import { FloorHeader } from './FloorHeader';
import { ShutterRow } from './ShutterRow';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from './types';
import './ShutterFloorsWidget.css';

interface ShutterFloorsOptions {
    floors?: ShutterFloorDef[];
    /** Optik des Etagenkopfs: a = schlicht, b = typografisch abgesetzt, c = Akzentstreifen */
    headVariant?: 'a' | 'b' | 'c';
}

export const ShutterFloorsWidget: React.FC<WidgetProps> = ({ config }) => {
    const options = (config.options as ShutterFloorsOptions) || {};
    const {
        floors = [],
        headVariant = 'b',
    } = options;

    // Sheet-State
    const [sheetDevice, setSheetDevice] = useState<ShutterFloorDeviceDef | null>(null);
    // Zaehlt jedes Oeffnen hoch und dient als key: so entsteht garantiert eine
    // frische Sheet-Instanz. Ohne das bliebe ein Sheet, das waehrend seines
    // Ausgleitens erneut geoeffnet wird, unsichtbar im Schliess-Zustand haengen.
    const [sheetSeq, setSheetSeq] = useState(0);

    // Pending Store mit 45s Cleanup
    const [pending, setPending] = useState<Record<string, PendingState>>({});

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setPending((prev) => {
                const updated = { ...prev };
                let changed = false;
                Object.keys(updated).forEach((key) => {
                    if (now - updated[key].startedAt > 45000) {
                        delete updated[key];
                        changed = true;
                    }
                });
                return changed ? updated : prev;
            });
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const pendingStore = useMemo(
        () => ({
            pending,
            markPending: (key: string, targetRaw: number) => {
                setPending((prev) => ({
                    ...prev,
                    [key]: { targetRaw, startedAt: Date.now() },
                }));
            },
            clearPending: (key: string) => {
                setPending((prev) => {
                    const updated = { ...prev };
                    delete updated[key];
                    return updated;
                });
            },
            showToast: (_text: string) => {
                // Toast-Anzeige folgt in Baustein 2
            },
        }),
        [pending],
    );

    const handleOpenSheet = (device: ShutterFloorDeviceDef) => {
        setSheetSeq((n) => n + 1);
        setSheetDevice(device);
    };

    const handleCloseSheet = () => {
        setSheetDevice(null);
    };

    const connected = true; // Verbindungs-Sperrung folgt in Baustein 2

    if (!floors || floors.length === 0) {
        return (
            <div className="shutter-floors-widget">
                <div className="empty-state">Keine Etagen konfiguriert</div>
            </div>
        );
    }

    return (
        <PendingContext.Provider value={pendingStore}>
            <div className="shutter-floors-widget">
                <div className="floors-scroll">
                    {floors.map((floor) => (
                        <div key={floor.name} className="floor-section">
                            <FloorHeader name={floor.name} connected={connected} variant={headVariant} />

                            <div className="floor-devices">
                                {floor.devices.map((device) => (
                                    <ShutterRow
                                        key={device.key}
                                        device={device}
                                        connected={connected}
                                        onOpenSheet={handleOpenSheet}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Sheet-Overlay */}
                {sheetDevice && (
                    <ShutterSheet
                        key={sheetSeq}
                        device={sheetDevice}
                        room={sheetDevice.room || ''}
                        room_facade=""
                        connected={connected}
                        showFacade={false}
                        onClose={handleCloseSheet}
                    />
                )}
            </div>
        </PendingContext.Provider>
    );
};
