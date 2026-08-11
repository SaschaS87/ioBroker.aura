import React, { useEffect, useMemo, useState } from 'react';
import type { WidgetProps } from '../../../types';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ShutterRoomDef, ShutterDeviceDef } from './types';
import type { PendingState } from './useShutterDevice';
import { PendingContext } from './useShutterDevice';
import { ShutterTile } from './ShutterTile';
import { ShutterSheet } from './ShutterSheet';
import './ShutterRoomsWidget.css';

interface ShutterRoomsOptions {
    headerTitle?: string;
    statusText?: string;
    footerNote?: string;
    connectionDp?: string;
    showFooter?: boolean;
    facades?: string[];
    posQuick?: number[];
    slatQuick?: Array<[number, string]>;
    rooms?: ShutterRoomDef[];
}

export const ShutterRoomsWidget: React.FC<WidgetProps> = ({ config }) => {
    const options = (config.options as ShutterRoomsOptions) || {};
    const {
        headerTitle = 'Rollläden',
        statusText = 'lokal · tahoma.1',
        footerNote = '',
        connectionDp = '',
        showFooter = true,
        facades: configFacades = ['Alle', 'SO', 'SW', 'NW', 'NO'],
        posQuick = [0, 25, 50, 75, 100],
        slatQuick = [
            [0, 'Waagerecht'],
            [50, 'Halb'],
            [90, 'Geschlossen'],
        ],
        rooms = [],
    } = options;

    // Connection Status
    const connState = useDatapoint(connectionDp);
    const connected = connState.state?.val === true;

    // Fassaden-Filter
    const [activeFacade, setActiveFacade] = useState<string>(configFacades[0] || 'Alle');

    // Sheet-State
    const [selectedDevice, setSelectedDevice] = useState<ShutterDeviceDef | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<ShutterRoomDef | null>(null);

    // Toast
    const [toast, setToast] = useState<string>('');
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(''), 900);
            return () => clearTimeout(timer);
        }
    }, [toast]);

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
                {/* Kopfzeile */}
                <div className="widget-header">
                    <h1 className="header-title">{headerTitle}</h1>
                    <div className="header-status">
                        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
                        <span className="status-text">{statusText}</span>
                    </div>
                </div>

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
                                            roomFacade={room.facade}
                                            onOpenSheet={(dev) => handleOpenSheet(dev, room)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>

                {/* Fußzeile */}
                {showFooter && (
                    <div className="widget-footer">
                        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
                        <span className="footer-text">{footerNote}</span>
                    </div>
                )}

                {/* Toast */}
                {toast && <div className="widget-toast">{toast}</div>}

                {/* Sheet-Overlay */}
                {selectedDevice && selectedRoom && (
                    <ShutterSheet
                        device={selectedDevice}
                        room={selectedRoom.name}
                        room_facade={selectedRoom.facade}
                        connected={connected}
                        posQuick={posQuick}
                        slatQuick={slatQuick}
                        onClose={handleCloseSheet}
                    />
                )}
            </div>
        </PendingContext.Provider>
    );
};
