import React, { useState } from 'react';
import type { ShutterRoomDef } from '../widgets/shutterrooms/types';

interface ShutterRoomsConfigProps {
    options: Record<string, unknown>;
    onOptionsChange: (opts: Record<string, unknown>) => void;
}

export const ShutterRoomsConfig: React.FC<ShutterRoomsConfigProps> = ({ options, onOptionsChange }) => {
    const [roomsJsonError, setRoomsJsonError] = useState<string>('');

    const headerTitle = (options.headerTitle as string) || 'Rollläden';
    const statusText = (options.statusText as string) || 'lokal · tahoma.1';
    const footerNote = (options.footerNote as string) || '';
    const connectionDp = (options.connectionDp as string) || '';
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

    const handleHeaderTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, headerTitle: e.target.value });
    };

    const handleStatusTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, statusText: e.target.value });
    };

    const handleFooterNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onOptionsChange({ ...options, footerNote: e.target.value });
    };

    const handleConnectionDpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onOptionsChange({ ...options, connectionDp: e.target.value });
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
            {/* Header Title */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Kopfzeilen-Titel
                </label>
                <input
                    type="text"
                    value={headerTitle}
                    onChange={handleHeaderTitleChange}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                    }}
                />
            </div>

            {/* Status Text */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Status-Text
                </label>
                <input
                    type="text"
                    value={statusText}
                    onChange={handleStatusTextChange}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                    }}
                />
            </div>

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

            {/* Footer Note */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
                    Fußzeilen-Text
                </label>
                <textarea
                    value={footerNote}
                    onChange={handleFooterNoteChange}
                    style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid var(--app-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        minHeight: '60px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                    }}
                />
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
