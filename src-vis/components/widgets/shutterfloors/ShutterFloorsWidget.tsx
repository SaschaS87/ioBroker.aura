import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { WidgetProps } from '../../../types';
import type { PendingState } from '../shutterrooms/useShutterDevice';
import { PendingContext, PENDING_MAX_AGE_MS } from '../shutterrooms/useShutterDevice';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { ShutterSheet } from '../shutterrooms/ShutterSheet';
import { FloorHeader } from './FloorHeader';
import { ShutterRow } from './ShutterRow';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from './types';
import './ShutterFloorsWidget.css';

interface ShutterFloorsOptions {
    floors?: ShutterFloorDef[];
    /** Optik des Etagenkopfs: a = schlicht, b = typografisch abgesetzt, c = Akzentstreifen */
    headVariant?: 'a' | 'b' | 'c';
    /** Meldet der Adapter eine stehende Verbindung zur Box? */
    connectionDp?: string;
    /** Laeuft die Adapter-Instanz ueberhaupt? Traegt `expire`, faellt also von
     *  selbst auf false, sobald der Adapter beendet wird. */
    aliveDp?: string;
    instanceLabel?: string;
    showFooter?: boolean;
}

export const ShutterFloorsWidget: React.FC<WidgetProps> = ({ config }) => {
    const options = (config.options as ShutterFloorsOptions) || {};
    const {
        floors = [],
        headVariant = 'b',
        connectionDp = '',
        aliveDp = '',
        instanceLabel = 'tahoma.1',
        showFooter = false,
    } = options;

    // Sheet-State
    const [sheetDevice, setSheetDevice] = useState<ShutterFloorDeviceDef | null>(null);
    // Zaehlt jedes Oeffnen hoch und dient als key: so entsteht garantiert eine
    // frische Sheet-Instanz. Ohne das bliebe ein Sheet, das waehrend seines
    // Ausgleitens erneut geoeffnet wird, unsichtbar im Schliess-Zustand haengen.
    const [sheetSeq, setSheetSeq] = useState(0);

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

    // Rueckkehr aus dem Hintergrund. iOS haelt Timer an, solange die App nicht
    // sichtbar ist – der Aufraeumer oben lief in dieser Zeit also gar nicht.
    // Ohne diesen Handler stehen alte Auftraege beim Aufwecken noch als
    // laufende Fahrt in der Liste. Die Altersgrenze greift zwar auch beim
    // Lesen (siehe useShutterDevice), aber wer hier aufraeumt, wirft den
    // Ballast auch wirklich weg statt ihn nur zu verstecken.
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

    // Erreichbarkeit der Instanz. Beides muss stimmen: Der Adapter muss laufen
    // (alive) UND eine Verbindung zur Box melden (connection). Steht hier nur
    // eines von beiden, ist die Aussage falsch – `info.connection` behaelt bei
    // einem beendeten Adapter seinen letzten Wert und meldet weiter "true".
    //
    // Das stand bis 30.08.2026 hart auf `true` ("Verbindungs-Sperrung folgt in
    // Baustein 2") – die Datenpunkte waren in der Konfiguration hinterlegt und
    // wurden schlicht nicht gelesen. Folge: Als ein Blockly-Skript den Adapter
    // nachts von 23:01 bis 06:01 abschaltete, sah der Tab voellig normal aus.
    // Sascha drueckte um 5 Uhr auf Zu, der Befehl verpuffte, und nichts in der
    // App deutete darauf hin, warum.
    const connState = useDatapoint(connectionDp);
    const aliveState = useDatapoint(aliveDp);
    // Ohne konfigurierten Datenpunkt gibt es nichts zu pruefen – dann gilt
    // erreichbar, sonst sperrte ein unvollstaendig eingerichtetes Widget sich
    // selbst aus.
    const connOk = !connectionDp || connState.state?.val === true;
    const aliveOk = !aliveDp || aliveState.state?.val === true;
    const connected = connOk && aliveOk;

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
                {/* Warnstreifen. Steht bewusst OBEN und nicht als Pille in der
                    Fusszeile: Wer nachts einen Rollladen fahren will, soll den
                    Grund sehen, bevor er drueckt – nicht danach. */}
                {!connected && (
                    <div className="conn-banner" role="status">
                        <span className="conn-banner-title">{instanceLabel} nicht erreichbar</span>
                        <span className="conn-banner-text">
                            {aliveOk
                                ? 'Der Adapter läuft, meldet aber keine Verbindung zur Box. Befehle kommen nicht an.'
                                : 'Die Adapter-Instanz läuft nicht. Befehle kommen nicht an.'}
                        </span>
                    </div>
                )}

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

                {/* Fusszeile: eine Pille wie im Rollos-Tab, meldet den Zustand
                    der Instanz auch im Normalfall. `showFooter` stand schon in
                    der Konfiguration, wurde bisher aber nicht gelesen. */}
                {showFooter && (
                    <div className="widget-footer">
                        <span className={`instance-pill ${connected ? 'ok' : 'fail'}`}>
                            {instanceLabel} {connected ? 'aktiv' : 'nicht erreichbar'}
                        </span>
                    </div>
                )}

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
