import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WidgetProps } from '../../../types';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import type { ShutterRoomDef, ShutterDeviceDef } from './types';
import type { PendingState } from './useShutterDevice';
import { PendingContext, PENDING_MAX_AGE_MS } from './useShutterDevice';
import { ShutterTile } from './ShutterTile';
import { ShutterSheet } from './ShutterSheet';
import { DataSourceHealthBox, type HealthSourceDef } from '../shared/DataSourceHealthBox';
import './ShutterRoomsWidget.css';

interface ShutterRoomsOptions {
    connectionDp?: string;
    aliveDp?: string;
    instanceLabel?: string;
    showFooter?: boolean;
    facades?: string[];
    rooms?: ShutterRoomDef[];
}

export const ShutterRoomsWidget: React.FC<WidgetProps> = ({ config }) => {
    const options = (config.options as ShutterRoomsOptions) || {};
    const {
        connectionDp = '',
        aliveDp = 'system.adapter.tahoma.1.alive',
        instanceLabel = 'tahoma.1',
        showFooter = true,
        facades: configFacades = ['Alle', 'SO', 'SW', 'NW', 'NO'],
        rooms = [],
    } = options;

    // Connection Status
    const connState = useDatapoint(connectionDp);
    const connected = connState.state?.val === true;

    // Portal-Ziel fuer den Toast (01.09.2026, Rollläden-Umbau): das Widget ist
    // seit dem Wegfall von fillTab ein normales react-grid-layout-Kind, dessen
    // Vorfahre ein CSS-`transform` traegt (useCSSTransforms) - das macht ihn
    // zum Containing Block fuer `position: fixed`. Ohne Portal deckt der Toast
    // nur die Kachel ab statt den Bildschirm. Gleiches Muster wie ShutterSheet.
    const adminPortalTarget = usePortalTarget();
    const toastPortalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;

    // Instanz-Id fuer den Neustart-Knopf aus aliveDp ableiten (z.B.
    // "system.adapter.tahoma.1.alive" -> "tahoma.1"), statt sie hart zu
    // verdrahten – so laufen Beschriftung und Neustart-Ziel nie auseinander.
    // main.js prueft dieselbe Form serverseitig (^[a-z0-9_-]+\.\d+$).
    const restartAdapterId = useMemo(() => {
        const m = aliveDp.match(/^system\.adapter\.([a-z0-9_-]+\.\d+)\.alive$/i);
        return m ? m[1] : undefined;
    }, [aliveDp]);

    // Fuer die aufklappbare Status-Box (siehe ShutterFloorsWidget fuer die
    // ausfuehrliche Begruendung): requireTrueDps statt reinem Alterskriterium,
    // weil connectionDp seinen letzten Wert behaelt, wenn der Adapter laengst
    // beendet ist.
    const healthSources: HealthSourceDef[] = useMemo(() => {
        if (!aliveDp) return [];
        return [
            {
                id: 'tahoma',
                label: instanceLabel,
                watchDp: aliveDp,
                // Wirkungslos, solange requireTrueDps gesetzt ist (immer der
                // Fall hier, da aliveDp vorhanden ist).
                maxAgeMin: 30,
                requireTrueDps: [aliveDp, connectionDp].filter((dp) => dp),
                restartAdapterId,
            },
        ];
    }, [aliveDp, connectionDp, instanceLabel, restartAdapterId]);

    // Fassaden-Filter
    const [activeFacade, setActiveFacade] = useState<string>(configFacades[0] || 'Alle');

    // Sheet-State
    const [selectedDevice, setSelectedDevice] = useState<ShutterDeviceDef | null>(null);
    // Siehe ShutterFloorsWidget: erzwingt eine frische Sheet-Instanz je Oeffnen.
    const [sheetSeq, setSheetSeq] = useState(0);
    const [selectedRoom, setSelectedRoom] = useState<ShutterRoomDef | null>(null);

    // Toast. Traegt einen Zaehler mit, damit zweimal dieselbe Meldung
    // hintereinander die Einblendung neu startet statt still zu verpuffen.
    const [toast, setToast] = useState<{ text: string; n: number }>({ text: '', n: 0 });
    useEffect(() => {
        if (toast.text) {
            const timer = setTimeout(() => setToast((t) => ({ text: '', n: t.n })), 900);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Pending Store mit Aufraeumer
    const [pending, setPending] = useState<Record<string, PendingState>>({});

    const sweepPending = useCallback(() => {
        const now = Date.now();
        setPending((prev) => {
            const updated = { ...prev };
            let changed = false;
            Object.keys(updated).forEach((key) => {
                if (now - updated[key].startedAt > PENDING_MAX_AGE_MS) {
                    delete updated[key];
                    changed = true;
                }
            });
            return changed ? updated : prev;
        });
    }, []);

    useEffect(() => {
        const interval = setInterval(sweepPending, 5000);
        return () => clearInterval(interval);
    }, [sweepPending]);

    // Rueckkehr aus dem Hintergrund – iOS haelt Timer an, der Aufraeumer oben
    // lief in dieser Zeit nicht. Siehe ShutterFloorsWidget, gleicher Grund.
    useEffect(() => {
        const onWake = () => {
            if (document.visibilityState === 'visible') sweepPending();
        };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        window.addEventListener('pageshow', onWake);
        return () => {
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
            window.removeEventListener('pageshow', onWake);
        };
    }, [sweepPending]);

    const pendingStore = useMemo(
        () => ({
            pending,
            markPending: (key: string, targetRaw: number, startRaw: number | null = null) => {
                setPending((prev) => ({
                    ...prev,
                    [key]: { targetRaw, startedAt: Date.now(), startRaw },
                }));
            },
            clearPending: (key: string) => {
                setPending((prev) => {
                    const updated = { ...prev };
                    delete updated[key];
                    return updated;
                });
            },
            showToast: (text: string) => {
                setToast((t) => ({ text, n: t.n + 1 }));
            },
        }),
        [pending],
    );

    // Filter Logik
    const filteredRooms = useMemo(() => {
        if (!rooms || rooms.length === 0) return [];

        return rooms
            .map((room) => {
                const filteredDevices = room.devices.filter((dev) => {
                    const effFacade = dev.facade || room.facade;
                    return activeFacade === 'Alle' || (effFacade && effFacade.includes(activeFacade));
                });
                return { ...room, devices: filteredDevices };
            })
            .filter((room) => room.devices.length > 0);
    }, [rooms, activeFacade]);

    const handleOpenSheet = (device: ShutterDeviceDef, room: ShutterRoomDef) => {
        setSheetSeq((n) => n + 1);
        setSelectedDevice(device);
        setSelectedRoom(room);
    };

    const handleCloseSheet = () => {
        setSelectedDevice(null);
        setSelectedRoom(null);
    };

    if (!rooms || rooms.length === 0) {
        return (
            <div className="shutter-rooms-widget">
                <div className="empty-state">Keine Räume konfiguriert</div>
            </div>
        );
    }

    return (
        <PendingContext.Provider value={pendingStore}>
            <div className="shutter-rooms-widget">
                {/* Fassaden-Chips (horizontal scrollbar) */}
                <div className="facades-bar">
                    <div className="facades-scroll">
                        {configFacades.map((facade) => (
                            <button
                                key={facade}
                                className={`facade-chip ${activeFacade === facade ? 'active' : ''}`}
                                onClick={() => setActiveFacade(facade)}
                            >
                                {facade}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scroll-Bereich mit Räumen */}
                <div className="rooms-scroll">
                    {filteredRooms.length === 0 ? (
                        <div className="empty-state">Keine Geräte für {activeFacade} sichtbar</div>
                    ) : (
                        filteredRooms.map((room) => (
                            <section key={room.name} className="room-section">
                                <div className="room-header">
                                    <h2 className="room-name">{room.name}</h2>
                                    {room.facade && <span className="room-facade">{room.facade}</span>}
                                </div>

                                <div className="devices-grid">
                                    {room.devices.map((device) => (
                                        <ShutterTile
                                            key={device.key}
                                            device={device}
                                            connected={connected}
                                            onOpenSheet={(dev) => handleOpenSheet(dev, room)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>

                {/* Aufklappbare Status-Box statt Fusszeilen-Pille (Muster
                    Wetter-Tab, DataSourceHealthBox – siehe ShutterFloorsWidget). */}
                {showFooter && <DataSourceHealthBox sources={healthSources} />}

                {/* Toast – key erzwingt den Neustart der Animation bei Wiederholung.
                    Portal (siehe Kommentar oben) statt Inline-Rendering. */}
                {toast.text &&
                    createPortal(
                        <div className="widget-toast" key={toast.n} role="status">
                            {toast.text}
                        </div>,
                        toastPortalTarget,
                    )}

                {/* Sheet-Overlay */}
                {selectedDevice && selectedRoom && (
                    <ShutterSheet
                        key={sheetSeq}
                        device={selectedDevice}
                        room={selectedRoom.name}
                        room_facade={selectedRoom.facade}
                        connected={connected}
                        onClose={handleCloseSheet}
                    />
                )}
            </div>
        </PendingContext.Provider>
    );
};
