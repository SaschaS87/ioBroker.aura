/**
 * Garten-Widget — Bewaesserungskreise mit Zeitplan, Modusschalter und
 * Handbetrieb (Adapter sprinklecontrol).
 *
 * Das Widget ist Oberflaeche und Speicher, der Motor ist der bestehende
 * 30-Sekunden-Scheduler des Aura-Adapters: Der Zeitplan lebt in
 * `WidgetConfig.options` (also in aura.X.config.dashboard) und wird pro Kreis
 * in einen `aura.X.timers.<seg>-<slug>`-Kanal gespiegelt. Alles danach —
 * Einreihen, Oeffnen, Herunterzaehlen, Schliessen — macht der
 * Sprinklecontrol-Adapter selbst. Kein zweiter Scheduler, kein zweiter
 * Config-State.
 *
 * Beim Anlegen des Widgets wird nichts an der Anlage geschrieben: weder
 * `runningTime` noch `autoOn`, nur auf ausdrueckliche Bedienung.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CloudOff } from 'lucide-react';
import type { GartenWidgetOptions, TimerEvent, WidgetProps } from '../../../types';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { setStateDirect } from '../../../hooks/useIoBroker';
import { saveAll, saveToIoBroker } from '../../../store/persistManager';
import { NS } from '../../../utils/namespace';
import { publishGartenCircle } from '../../../utils/publishTimerConfig';
import { DEFAULT_MANUAL_MINUTES, PARALLEL_HINT } from './gartenConstants';
import { GartenCircleCard } from './GartenCircleCard';
import { GartenSwitch } from './GartenSwitch';
import { useSprinkleCircles } from './useSprinkleCircles';
import './GartenWidget.css';

/**
 * Dashboard-Konfiguration sofort nach einer Bedienung nach ioBroker schreiben.
 * Wortlaut aus TimerWidget: Das `only: ['aura-dashboard']` ist wichtig — ein
 * ungescoptes Speichern aus dem Frontend schiebt auch Theme- und
 * Popup-Konfiguration dieses Geraets hoch.
 */
function flushDashboard() {
    try {
        saveAll();
        saveToIoBroker({ only: ['aura-dashboard'] });
    } catch {
        /* offline / nicht konfiguriert */
    }
}

/** Belegte Statusdatenpunkte der Gardena-Anbindung (Stufe 2 zeigt nur die
 *  Erreichbarkeit; die Zuordnung Kreis → Ventil-UUID ist nicht belegt und
 *  bleibt Stufe 3). */
const SMARTGARDEN_ALIVE_DP = 'system.adapter.smartgarden.0.alive';
const SMARTGARDEN_CONNECTION_DP = 'smartgarden.0.info.connection';

/** In der Dev-Vorschau haelt devWriteGuard.ts jeden Schreibbefehl ausserhalb
 *  von aura.X.* zurueck — die Anlagenschalter tun dort sichtbar nichts. Die
 *  Termine dagegen liegen in aura.X.timers und werden vom Adapter-Prozess
 *  ausgeloest, also an der Sperre vorbei. Im Produktivbuild immer false. */
const DEV_WRITES_BLOCKED = import.meta.env.DEV && import.meta.env.VITE_AURA_ALLOW_WRITES !== '1';

/** Schluessel eines Termins fuer die Kollisionserkennung: "wochentag|HH:MM". */
function slotKeys(ev: TimerEvent): string[] {
    if (ev.trigger.kind !== 'time') return [];
    const hhmm = `${String(ev.trigger.hour).padStart(2, '0')}:${String(ev.trigger.minute).padStart(2, '0')}`;
    return ev.weekdays.map((d) => `${d}|${hhmm}`);
}

export function GartenWidget({ config, editMode, onConfigChange }: WidgetProps) {
    const o = (config.options ?? {}) as GartenWidgetOptions;
    const instance = o.instance || 'sprinklecontrol.0';
    const manualDefaultMinutes = o.manualDefaultMinutes ?? DEFAULT_MANUAL_MINUTES;
    const confirmManualStart = o.confirmManualStart !== false;
    const showSoilMoisture = o.showSoilMoisture !== false;
    const showCloudStatus = o.showCloudStatus !== false;

    // Stabile Referenzen: eine frische Hilfsliste bei jedem Render wuerde die
    // Kreis-Erkennung und den Publish-Vergleich unnoetig neu anwerfen.
    const hiddenCircles = useMemo(() => o.hiddenCircles ?? [], [o.hiddenCircles]);
    const circleLabels = useMemo(() => o.circleLabels ?? {}, [o.circleLabels]);
    const schedules = useMemo(() => o.schedules ?? {}, [o.schedules]);
    const scheduleEnabled = useMemo(() => o.scheduleEnabled ?? {}, [o.scheduleEnabled]);

    const interactive = !editMode;
    // Anlagenschalter (Hauptschalter, Modus, Handbetrieb) zusaetzlich in der
    // Dev-Vorschau gesperrt: Die Schreibsperre haelt ihre Befehle ohnehin
    // zurueck, ausgegraut ist eindeutiger als ein Schalter, der stumm bleibt.
    const plantInteractive = interactive && !DEV_WRITES_BLOCKED;

    // ── a) stateBaseId einmalig stempeln ─────────────────────────────────────
    // Kopien und Gruppen-Klone bekommen dadurch einen eigenen Backend-Pfad und
    // kollidieren nie mit dem Original.
    //
    // Abhaengig von stateBaseId statt nur beim Einhaengen: Laedt die
    // Dashboard-Konfiguration nach dem Einhaengen vom Server nach, ersetzt sie
    // den Stempel wieder durch den gespeicherten Stand ohne Kennung. Ohne
    // Kennung publiziert das Widget keinen Timer-Kanal — Termine wuerden
    // gespeichert, aber nie ausgeloest (gemessen am 14.09.2026). Deshalb wird
    // nachgestempelt, sobald die Kennung fehlt, und sofort gespeichert.
    useLayoutEffect(() => {
        if (o.stateBaseId) return;
        const seg =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        onConfigChange({ ...config, options: { ...o, stateBaseId: `${NS}.timers.${seg}` } });
        if (!editMode) setTimeout(flushDashboard, 0);
    }, [o.stateBaseId]); // eslint-disable-line react-hooks/exhaustive-deps

    const backendKey = (o.stateBaseId as string | undefined)?.split('.').pop() || null;

    // ── b) Kopfbereich ───────────────────────────────────────────────────────
    const autoOnOff = useDatapoint(`${instance}.control.autoOnOff`);
    const nextAutoStart = useDatapoint(`${instance}.info.nextAutoStart`);
    const cloudAlive = useDatapoint(showCloudStatus ? SMARTGARDEN_ALIVE_DP : '');
    const cloudConn = useDatapoint(showCloudStatus ? SMARTGARDEN_CONNECTION_DP : '');

    // Gating wie im Rollladen-Widget: Der Warnstreifen erscheint erst, wenn
    // beide Datenpunkte tatsaechlich geantwortet haben — sonst blitzt er bei
    // jedem Tabwechsel kurz auf, obwohl der Adapter laeuft.
    const cloudLoaded = cloudAlive.state !== null && cloudConn.state !== null;
    const cloudOk = cloudAlive.state?.val === true && cloudConn.state?.val === true;
    const showCloudWarning = showCloudStatus && cloudLoaded && !cloudOk;

    // ── c) Kreisliste ────────────────────────────────────────────────────────
    const { circles, loading, source } = useSprinkleCircles(instance, hiddenCircles, circleLabels);

    // ── d) Kollisionserkennung ───────────────────────────────────────────────
    // Stufe 2 markiert nur, dass zwei Kreise zur selben Zeit starten sollen.
    // Die exakte Vorschau der tatsaechlichen Startzeiten braucht die Dauer der
    // vorherigen Laeufe plus switchingDistance und bleibt Stufe 3.
    const collisions = useMemo(() => {
        const buckets = new Map<string, string[]>();
        for (const c of circles) {
            for (const ev of schedules[c.sprinkleName] ?? []) {
                if (!ev.enabled) continue;
                for (const key of slotKeys(ev)) {
                    const list = buckets.get(key);
                    if (list) list.push(ev.id);
                    else buckets.set(key, [ev.id]);
                }
            }
        }
        const hit = new Set<string>();
        for (const ids of buckets.values()) if (ids.length > 1) for (const id of ids) hit.add(id);
        return hit;
    }, [circles, schedules]);

    // ── e) Publish-Effekt ────────────────────────────────────────────────────
    // Ein Effekt fuer alle sichtbaren Kreise (React laesst keinen Hook je
    // Listeneintrag zu), der Serialisierungs-Vergleich laeuft je Kreis. Ohne
    // ihn publiziert das Widget bei jedem Tastendruck neu und flutet den
    // Objektbaum.
    const lastPublishedRef = useRef<Map<string, string>>(new Map());
    useEffect(() => {
        if (!backendKey) return;
        for (const c of circles) {
            const events = schedules[c.sprinkleName] ?? [];
            const armed = scheduleEnabled[c.sprinkleName] !== false;
            const title = `${config.title || 'Garten'} – ${c.label}`;
            const targetDp = `${instance}.sprinkle.${c.sprinkleName}.runningTime`;
            const serialized = JSON.stringify({ events, armed, title, targetDp });
            if (lastPublishedRef.current.get(c.sprinkleName) === serialized) continue;
            publishGartenCircle(backendKey, c.sprinkleName, targetDp, events, armed, title);
            lastPublishedRef.current.set(c.sprinkleName, serialized);
        }
    }, [backendKey, circles, schedules, scheduleEnabled, instance, config.title]);

    // ── f) Speichern ─────────────────────────────────────────────────────────
    const patchOptions = (patch: Partial<GartenWidgetOptions>) => {
        onConfigChange({ ...config, options: { ...o, ...patch } });
        setTimeout(flushDashboard, 0);
    };

    const setEvents = (sprinkleName: string, events: TimerEvent[]) =>
        patchOptions({ schedules: { ...schedules, [sprinkleName]: events } });

    const setArmed = (sprinkleName: string, armed: boolean) =>
        patchOptions({ scheduleEnabled: { ...scheduleEnabled, [sprinkleName]: armed } });

    const [busy, setBusy] = useState(false);
    const toggleMaster = () => {
        if (!plantInteractive || busy) return;
        const cur = autoOnOff.state;
        if (!cur || cur.ack !== true) return;
        setBusy(true);
        // Bewusst setStateDirect statt autoOnOff.setValue: setValue zeigt den
        // neuen Wert sofort mit ack:false an. Kommt keine Bestaetigung (Adapter
        // aus, Dev-Schreibsperre), bliebe der Schalter fuer immer gesperrt, weil
        // die Schranke oben ack:true verlangt. So zeigt er bis zur Bestaetigung
        // den echten Ist-Wert — wie der Modusschalter in useSprinkleCircle.
        setStateDirect(`${instance}.control.autoOnOff`, cur.val !== true, false);
        setTimeout(() => setBusy(false), 500);
    };

    const masterOn = autoOnOff.state?.val === true;

    return (
        <div className="garten-widget">
            {showCloudWarning && (
                <div className="garten-cloud-banner" role="status">
                    <span className="garten-cloud-title">
                        <CloudOff size={14} /> Gardena-Cloud nicht erreichbar
                    </span>
                    <span className="garten-cloud-text">
                        Termine laufen ins Leere, auch wenn der Zeitplan hier weiterläuft.
                    </span>
                </div>
            )}

            {/* Kopfkarte im Artefakt-Stil: schmale Karte, Schalter rechts. */}
            <div className="garten-card garten-tight">
                <div className="garten-card-t">
                    <span className="garten-tight-main">
                        <span className="garten-name">Anlage {masterOn ? 'ein' : 'aus'}</span>
                        <span className="garten-sub">
                            Nächster Automatikstart: {String(nextAutoStart.value ?? '—') || '—'}
                        </span>
                    </span>
                    <GartenSwitch
                        on={masterOn}
                        disabled={!plantInteractive || busy}
                        onToggle={toggleMaster}
                        label="Anlage ein/aus"
                        title="Hauptschalter der ganzen Anlage (Automatik ein/aus)"
                    />
                </div>
                <p className="garten-note">{PARALLEL_HINT}</p>
                {DEV_WRITES_BLOCKED && (
                    <p className="garten-note garten-dev-note">
                        Lokale Vorschau: Hauptschalter, Modus und „Jetzt gießen“ sind hier ausgegraut – sie
                        schalten erst auf dem Pi. Aktive Termine laufen dagegen echt.
                    </p>
                )}
            </div>

            {loading && circles.length === 0 && <div className="garten-empty">Kreise werden gesucht …</div>}

            {!loading && circles.length === 0 && (
                <div className="garten-empty">
                    {source === 'none'
                        ? 'Keine Kreise gefunden – bitte Adapter-Instanz prüfen.'
                        : 'Keine Bewässerungskreise gefunden'}
                </div>
            )}

            <div className="garten-cards">
                {circles.map((c) => (
                    <GartenCircleCard
                        key={c.sprinkleName}
                        circle={c}
                        instance={instance}
                        events={schedules[c.sprinkleName] ?? []}
                        scheduleEnabled={scheduleEnabled[c.sprinkleName] !== false}
                        collisions={collisions}
                        confirmManualStart={confirmManualStart}
                        manualDefaultMinutes={manualDefaultMinutes}
                        showSoilMoisture={showSoilMoisture}
                        interactive={interactive}
                        plantInteractive={plantInteractive}
                        onEventsChange={(events) => setEvents(c.sprinkleName, events)}
                        onScheduleEnabledChange={(armed) => setArmed(c.sprinkleName, armed)}
                    />
                ))}
            </div>
        </div>
    );
}
