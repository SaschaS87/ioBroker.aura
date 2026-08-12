import React, { useState } from 'react';
import type { ShutterRoomDef } from '../widgets/shutterrooms/types';

interface ShutterRoomsConfigProps {
    options: Record<string, unknown>;
    onOptionsChange: (opts: Record<string, unknown>) => void;
}

export const ShutterRoomsConfig: React.FC<ShutterRoomsConfigProps> = ({ options, onOptionsChange }) => {
    const [roomsJsonError, setRoomsJsonError] = useState<string>('');

    const connectionDp = (options.connectionDp as string) || '';
    const aliveDp = (options.aliveDp as string) || '';
    const instanceLabel = (options.instanceLabel as string) || 'tahoma.1';
    const showFooter = (options.showFooter as boolean | undefined) !== false;
    const roomsJson = JSON.stringify((options.rooms as ShutterRoomDef[]) || [], null, 2);

    let roomCount = 0;
    let deviceCount = 0;
    try {
        const parsed = JSON.parse(roomsJson);
        if (Array.isArray(parsed)) {
            roomCount = parsed.length;
            deviceCount = parsed.reduce((sum: number, r: ShutterRoomDef) => sum + (r.devices?.length || 0), 0);
        }
    } catch {
        // ignore
    }

    const handleConnectionDpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, connectionDp: e.target.value });
    };

    const handleAliveDpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, aliveDp: e.target.value });
    };

    const handleInstanceLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, instanceLabel: e.target.value });
    };

    const handleShowFooterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, showFooter: e.target.checked });
    };

    const handleRoomsJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setRoomsJsonError('');
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                onOptionsChange({ ...options, rooms: parsed });
            } else {
                setRoomsJsonError('Muss ein Array sein');
            }
        } catch (err) {
            setRoomsJsonError(`JSON Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Connection DP */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Verbindungs-Datenpunkt
                </label>
                <input
                    type="text"
                    value={connectionDp}
                    onChange={handleConnectionDpChange}
                    placeholder="z.B. tahoma.1.info.connection"
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                    }}
                />
            </div>

            {/* Alive DP */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Alive-Datenpunkt
                </label>
                <input
                    type="text"
                    value={aliveDp}
                    onChange={handleAliveDpChange}
                    placeholder="z.B. system.adapter.tahoma.1.alive"
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                    }}
                />
            </div>

            {/* Instance Label */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Instanz-Name (Fußzeile)
                </label>
                <input
                    type="text"
                    value={instanceLabel}
                    onChange={handleInstanceLabelChange}
                    placeholder="z.B. tahoma.1"
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                    }}
                />
            </div>

            {/* Info Text */}
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Grün nur, wenn beide Datenpunkte <code>true</code> sind.
            </div>

            {/* Show Footer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                    type="checkbox"
                    id="showFooter"
                    checked={showFooter}
                    onChange={handleShowFooterChange}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="showFooter" style={{ fontSize: '12px', cursor: 'pointer' }}>
                    Fußzeile anzeigen
                </label>
            </div>

            {/* Rooms JSON */}
            <div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                    }}
                >
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Räume & Geräte (JSON)</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {roomCount} Räume · {deviceCount} Geräte
                    </span>
                </div>
                <textarea
                    value={roomsJson}
                    onChange={handleRoomsJsonChange}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: roomsJsonError ? '1px solid var(--accent-red)' : '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        minHeight: '200px',
                        fontFamily: 'monospace',
                        resize: 'vertical',
                    }}
                />
                {roomsJsonError && (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--accent-red)' }}>
                        {roomsJsonError}
                    </div>
                )}
            </div>
        </div>
    );
};
