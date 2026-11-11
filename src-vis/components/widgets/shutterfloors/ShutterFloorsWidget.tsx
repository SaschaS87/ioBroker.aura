import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronRight } from 'lucide-react';
import type { WidgetProps } from '../../../types';
import type { PendingState } from '../shuttershared/useShutterDevice';
import { PendingContext, PENDING_MAX_AGE_MS } from '../shuttershared/useShutterDevice';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { DataSourceHealthBox, type HealthSourceDef } from '../shared/DataSourceHealthBox';
import { SignalStrengthBox } from '../shared/SignalStrengthBox';
import { FloorGroup } from './FloorGroup';
import { ShutterRow } from './ShutterRow';
import { ShutterDetailSheet } from './ShutterDetailSheet';
import { useFavorites } from './useFavorites';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from './types';
import { RollPlanTile } from './planner/RollPlanTile';
import { PlannerStack } from './planner/PlannerStack';
import { PlanTiles, type Tab } from './planner/PlanWindows';
import { useFaceliftVariant } from '../../layout/facelift/faceliftVariant';
import './ShutterFloorsWidget.css';
import './ShutterFloorsFacelift.css';

interface ShutterFloorsOptions {
    floors?: ShutterFloorDef[];
    /** Meldet der Adapter eine stehende Verbindung zur Box? */
    connectionDp?: string;
    /** Laeuft die Adapter-Instanz ueberhaupt? Traegt `expire`, faellt also von
     *  selbst auf false, sobald der Adapter beendet wird. */
    aliveDp?: string;
    instanceLabel?: string;
    showFooter?: boolean;
    /** Signalstaerke-Aufklappbox (Feature 16). Default sichtbar - kein Eintrag
     *  in aura.0.config.dashboard noetig, bis Sascha sie abschalten will. */
    showSignalBox?: boolean;
    /** Rolllaeden-Planer-Kachel (Feature 23). Default aus - auf aura.0
     *  (Familie) bleibt sie vorerst unsichtbar (S1-Entscheidung Sascha). */
    showPlanner?: boolean;
    /** Wurzel der drei Planer-Datenpunkte (Szenen/Wochenplan/Einstellungen/
     *  Befehl). Im Dev-Build IMMER durch Rollladen_Dev ersetzt, siehe die
     *  Sicherheits-Weiche weiter unten - diese Option zaehlt nur im Pi-Build. */
    plannerRoot?: string;
}

export const ShutterFloorsWidget: React.FC<WidgetProps> = ({ config }) => {
    const options = (config.options as ShutterFloorsOptions) || {};
    const {
        floors = [],
        connectionDp = '',
        aliveDp = '',
        instanceLabel = 'tahoma.1',
        showFooter = false,
        showSignalBox,
        showPlanner = false,
        plannerRoot = '0_userdata.0.Rollladen',
    } = options;
    const signalBoxVisible = showSignalBox !== false;

    // Sicherheits-Weiche (Feature 23, S1-Entscheidung Sascha): die lokale
    // Dev-Vorschau darf NIE gegen die echten Familien-Datenpunkte schreiben,
    // egal was in der Widget-Konfiguration steht. Deshalb hart auf
    // Rollladen_Dev verdrahtet im Dev-Build (die Dev-Abfrage faellt im
    // Pi-Build zur Kompilierzeit auf false, dieser Zweig verschwindet dort
    // komplett) - keine Konfigurationsoption, die sich versehentlich
    // umschalten liesse.
    const effectivePlannerRoot = import.meta.env.DEV ? '0_userdata.0.Rollladen_Dev' : plannerRoot;

    // Favoriten der Liste (Regel 203): ein Datenpunkt fuers ganze Haus, gleiche
    // Dev-/Live-Weiche wie der Planer. Vor dem fruehen Return unten, damit die
    // Reihenfolge der Hooks gleich bleibt.
    const fav = useFavorites(`${effectivePlannerRoot}.Favoriten`);

    // Facelift-Entwurf (nur Dev-Vorschau, sonst null): bestimmt Aufbau und Platz des Status-Blocks
    const flv = useFaceliftVariant();

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
                // Kein Auftrag, wenn das Geraet den Zielwert schon (in derselben
                // Toleranz wie der Aufraeum-Effekt in useShutterDevice.ts) haelt -
                // z.B. "Auf" auf einem bereits offenen Rollladen. Sonst legt sich
                // hier ein Pending-Eintrag an, den der Toleranzband-Effekt im
                // selben Tick wieder wegraeumt (ackedPos hat sich ja nicht
                // veraendert) - sichtbar als Stopp-Taste, die nur einen
                // Wimpernschlag lang aufblitzt. Von Sascha am 02.09.2026 am
                // Wohnzimmer-Rollladen gemeldet.
                if (startRaw !== null && Math.abs(startRaw - targetRaw) <= 3) return;
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
    // Bevor die erste echte Antwort da ist, liefert useDatapoint `state: null`
    // (auch mit Cache-Vorbefuellung, wenn der jeweilige State beim allerersten
    // Aufruf dieser Session noch nie gelesen wurde – z.B. nach jedem Reload
    // oder beim ersten Sprung auf diesen Tab). connOk/aliveOk werten das
    // faelschlich als "false" statt als "laedt noch", der Banner blitzte
    // dadurch bei jedem Refresh/Tab-Wechsel kurz auf, obwohl der Adapter lief.
    // Von Sascha am 03.09.2026 gemeldet. Gleiches Loaded-Gating wie in
    // DataSourceHealthBox (siehe deren Bugfix-Abschnitt in der Doku): banner
    // erst zeigen, wenn beide Datenpunkte tatsaechlich geantwortet haben.
    const connLoaded = !connectionDp || connState.state !== null;
    const aliveLoaded = !aliveDp || aliveState.state !== null;
    const loaded = connLoaded && aliveLoaded;
    const connected = !loaded || (connOk && aliveOk);

    // Instanz-Id fuer den Neustart-Knopf aus aliveDp ableiten (z.B.
    // "system.adapter.tahoma.1.alive" -> "tahoma.1"), statt sie hart zu
    // verdrahten – so laufen Beschriftung und Neustart-Ziel nie auseinander.
    // main.js prueft dieselbe Form serverseitig (^[a-z0-9_-]+\.\d+$).
    const restartAdapterId = useMemo(() => {
        const m = aliveDp.match(/^system\.adapter\.([a-z0-9_-]+\.\d+)\.alive$/i);
        return m ? m[1] : undefined;
    }, [aliveDp]);

    // updateDp fuer den "Neu messen"-Knopf der SignalStrengthBox: dieselbe
    // Instanz wie restartAdapterId, per derselben Regex aus aliveDp gezogen,
    // nur als *.update statt *.alive. Laesst sich nichts ableiten, gibt es
    // keinen Knopf - kein neuer Konfigurationseintrag noetig.
    const updateDp = useMemo(() => {
        const m = aliveDp.match(/^system\.adapter\.([a-z0-9_-]+\.\d+)\.alive$/i);
        return m ? `${m[1]}.update` : undefined;
    }, [aliveDp]);

    // Geraeteliste fuer die SignalStrengthBox: alle Antriebe aller Etagen,
    // flach. posDp liefert tahomaRadio.ts die drei Funk-Datenpunkte.
    const signalDevices = useMemo(
        () => floors.flatMap((f) => f.devices).map((d) => ({ key: d.key, label: d.label, posDp: d.posDp })),
        [floors],
    );

    // Fuer die aufklappbare Status-Box: reicht ein reines Alterskriterium
    // nicht, weil connectionDp seinen letzten Wert behaelt und weiter "true"
    // meldet, wenn der Adapter laengst beendet ist (siehe Kommentar oben zu
    // connState/aliveState). requireTrueDps verlangt stattdessen, dass beide
    // Datenpunkte tatsaechlich true sind.
    const healthSources: HealthSourceDef[] = useMemo(() => {
        if (!aliveDp) return [];
        return [
            {
                id: 'tahoma',
                label: instanceLabel,
                watchDp: aliveDp,
                // Wirkungslos, solange requireTrueDps gesetzt ist (immer der
                // Fall hier, da aliveDp vorhanden ist) – dient nur als
                // Rueckfallwert fuer den (in der Praxis nicht vorkommenden)
                // Fall ohne requireTrueDps.
                maxAgeMin: 30,
                requireTrueDps: [aliveDp, connectionDp].filter((dp) => dp),
                restartAdapterId,
            },
        ];
    }, [aliveDp, connectionDp, instanceLabel, restartAdapterId]);

    if (!floors || floors.length === 0) {
        return (
            <div className="shutter-floors-widget">
                <div className="empty-state">Keine Etagen konfiguriert</div>
            </div>
        );
    }

    const banner = (
        <>
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
        </>
    );
    const footer = (
        <>
            {/* Aufklappbare Status-Box statt Fusszeilen-Pille (Muster
                    Wetter-Tab, DataSourceHealthBox). Meldet den Zustand der
                    Instanz auch im Normalfall, mit Neustart-Knopf im
                    Stoerfall. `showFooter` stand schon in der Konfiguration. */}
            {showFooter && <DataSourceHealthBox sources={healthSources} />}

            {/* Signalstaerke-Aufklappbox (Feature 16, 02.09.2026): alle
                    TaHoma-Funk-States gebuendelt statt einer Zeile pro Sheet. */}
            {signalBoxVisible && (
                <div style={{ marginTop: showFooter ? 8 : 0 }}>
                    <SignalStrengthBox devices={signalDevices} updateDp={updateDp} />
                </div>
            )}
        </>
    );

    const floorList = floors.map((floor) => (
        <FloorGroup
            key={floor.name}
            floor={floor}
            isFav={fav.has}
            row={(d, firstRest) => (
                <ShutterRow
                    key={d.key}
                    device={d}
                    connected={connected}
                    firstRest={firstRest}
                    onOpenSheet={handleOpenSheet}
                />
            )}
        />
    ));

    // Sheet-Overlay
    const sheet = sheetDevice && (
        <ShutterDetailSheet
            key={sheetSeq}
            device={sheetDevice}
            connected={connected}
            fav={fav}
            onClose={handleCloseSheet}
        />
    );

    // Liste mit Etagen und Fuss. Mit Planer (showPlanner) steht darueber die Kopfgruppe Zeitplan/Szenen, und die
    // Liste ist die unterste Seite des Stapels (Feature 30, Phase 2); ohne Planer bleibt es die Liste allein.
    const classicBody = (head?: React.ReactNode) => (
        <div className={`sf${connected ? '' : ' is-offline'}`}>
            {head}
            {floorList}
            <div className="sf-foot">{footer}</div>
        </div>
    );

    // Facelift: vier Rubriken – Etagen, „Automatik" (Zeitplan, Szenen) und „Status". Datenquellen und
    // Signalstärke stehen nicht mehr als zwei lose Boxen am Seitenende, sondern hinter EINER Zeile
    // „Verbindung & Funk" mit beiden Kurzständen; sie führt auf die Unterseite „Status" mit zwei Blöcken
    // samt Begleittext. Ohne Planer-Stapel gibt es keine Unterseite, dann klappen die Zeilen in der Karte auf.
    const hasHealth = showFooter && healthSources.length > 0;
    const hasStatus = hasHealth || signalBoxVisible;
    const faceliftBody = (head?: React.ReactNode, open?: (t: Tab) => void) => (
        <div className={`sf aura-fl-scope${connected ? '' : ' is-offline'}`}>
            <div className="aura-fl-stack sf-block sf-block--floors">{floorList}</div>
            {head && (
                <section className="aura-fl-section sf-block sf-block--plan">
                    <div className="aura-fl-section-head sf-block-head">
                        <h2 className="aura-fl-section-title sf-block-title">Automatik</h2>
                    </div>
                    {head}
                </section>
            )}
            {hasStatus && (
                <section className="aura-fl-section sf-block sf-block--status">
                    <div className="aura-fl-section-head sf-block-head">
                        <h2 className="aura-fl-section-title sf-block-title">Status</h2>
                    </div>
                    <div className="aura-fl-card sf-group sf-status-card">
                        {open ? (
                            <button
                                type="button"
                                className="sf-row sf-row--nav aura-fl-row aura-fl-row--nav sf-status-row"
                                onClick={() => open('status')}
                            >
                                <span className="sf-ico is-status aura-fl-row-icon">
                                    <Activity size={16} />
                                </span>
                                <span className="sf-main aura-fl-row-main">
                                    <span className="sf-name aura-fl-row-title">Verbindung &amp; Funk</span>
                                    <span className="sf-val aura-fl-row-sub sf-status-bits">
                                        {hasHealth && <DataSourceHealthBox sources={healthSources} appearance="bit" />}
                                        {signalBoxVisible && (
                                            <SignalStrengthBox
                                                devices={signalDevices}
                                                updateDp={updateDp}
                                                appearance="bit"
                                            />
                                        )}
                                    </span>
                                </span>
                                <ChevronRight size={18} className="sf-chev aura-fl-chev" />
                            </button>
                        ) : (
                            <>
                                {hasHealth && <DataSourceHealthBox sources={healthSources} appearance="row" />}
                                {signalBoxVisible && (
                                    <SignalStrengthBox devices={signalDevices} updateDp={updateDp} appearance="row" />
                                )}
                            </>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
    const statusPage = flv ? (
        <>
            {hasHealth && (
                <DataSourceHealthBox
                    sources={healthSources}
                    appearance="page"
                    footnote={`Zeigt, ob der Adapter ${instanceLabel} läuft und mit der TaHoma-Box verbunden ist. Über ihn gehen alle Fahrbefehle an die Rollläden. Bei einer Störung lässt er sich hier neu starten.`}
                />
            )}
            {signalBoxVisible && (
                <SignalStrengthBox
                    devices={signalDevices}
                    updateDp={updateDp}
                    appearance="page"
                    footnote="Funkempfang jedes Antriebs von 0 bis 100, der schwächste steht oben. Rechts steht, seit wann sich der Wert nicht geändert hat. „Neu messen“ fragt alle Antriebe frisch ab."
                />
            )}
        </>
    ) : undefined;
    const listBody = flv ? faceliftBody : classicBody;

    return (
        <PendingContext.Provider value={pendingStore}>
            <div className="shutter-floors-widget">
                {banner}
                {showPlanner ? (
                    <RollPlanTile
                        floors={floors}
                        root={effectivePlannerRoot}
                        render={(m) => (
                            <PlannerStack
                                m={m}
                                statusPage={statusPage}
                                list={(open) => listBody(<PlanTiles m={m} open={open} />, open)}
                            />
                        )}
                    />
                ) : (
                    listBody()
                )}
                {sheet}
            </div>
        </PendingContext.Provider>
    );
};
