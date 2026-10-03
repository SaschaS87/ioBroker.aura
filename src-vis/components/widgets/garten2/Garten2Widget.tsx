/**
 * Garten2 — Bewaesserungs-Steuerpult (Übersicht).
 *
 * Anders als das bestehende Garten-Widget (Tab „Garten") ist Garten2 KEIN
 * Zeitplan-Editor. Es schreibt ausschliesslich über den unveraenderten Hook
 * `useSprinkleCircle` (Handstart/Stopp = `runningTime`, Modus = `autoOn`) und
 * — im Einstellungen-Sheet — die Regensperre der Adapterinstanz. Termine
 * (`options.schedules`, `aura.X.timers.*` Config) bleiben exklusiv beim Tab
 * „Garten": Garten2 liest sie nur read-only aus dessen Timer-Spiegel
 * (siehe useGartenSchedule), damit es nie zwei Schreiber fuer denselben
 * Zeitplan-Kanal gibt.
 *
 * Aufbau von oben nach unten:
 *   Hero          laufender Kreis (valveOn/countdown) oder Ruhezustand.
 *   Wetter+Boden  ETp heute/gestern, Regen heute/gestern/morgen, Restfeuchte.
 *   Wochenplan    reine Anzeige (Plaettchen, „Naechster Lauf"), Modusschalter
 *                 bedienbar, Zahnrad oeffnet das Einstellungen-Sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Garten2WidgetOptions, WidgetProps } from '../../../types';
import { DEFAULT_MANUAL_MINUTES } from '../garten/gartenConstants';
import { useSprinkleCircle, type SprinkleCircleState } from '../garten/useSprinkleCircle';
import { useSprinkleCircles } from '../garten/useSprinkleCircles';
import { useGartenSchedule, type GartenScheduleState } from './useGartenSchedules';
import { useSprinkleWeather } from './useSprinkleWeather';
import { Garten2Hero } from './Garten2Hero';
import { Garten2WeatherSoil } from './Garten2WeatherSoil';
import { Garten2WeekPlan } from './Garten2WeekPlan';
import { Garten2SettingsSheet } from './Garten2SettingsSheet';
import '../garten/GartenWidget.css';
import '../garten/GartenCircleCard.css';
import './Garten2Widget.css';

export interface CircleProbeData {
    label: string;
    sprinkleName: string;
    state: SprinkleCircleState;
    schedule: GartenScheduleState;
}

/** In der Dev-Vorschau haelt devWriteGuard.ts jeden Schreibbefehl ausserhalb
 *  von aura.X.* zurueck (siehe GartenWidget.tsx). Modus, Handbetrieb UND die
 *  Regensperre (system.adapter.*) sind davon betroffen. */
const DEV_WRITES_BLOCKED = import.meta.env.DEV && import.meta.env.VITE_AURA_ALLOW_WRITES !== '1';

/**
 * Ein Hook-Aufruf je Kreis ist in React nur ueber eine eigene
 * Kind-Komponente moeglich (kein Hook in einer Schleife) — dasselbe Prinzip
 * wie GartenCircleCard fuer das Garten-Widget. Die Probe rendert selbst
 * nichts, sie meldet nur Aenderungen nach oben.
 */
function Garten2CircleProbe({
    instance,
    sourceStateBaseId,
    sprinkleName,
    label,
    onUpdate,
}: {
    instance: string;
    sourceStateBaseId: string;
    sprinkleName: string;
    label: string;
    onUpdate: (sprinkleName: string, data: CircleProbeData) => void;
}) {
    const state = useSprinkleCircle(instance, sprinkleName);
    const schedule = useGartenSchedule(sourceStateBaseId, sprinkleName);

    // Serialisierter Vergleich statt Objekt-Referenz: useSprinkleCircle liefert
    // bei jedem Render ein frisches Objekt (frische Closures fuer
    // startManual/stop/setMode), ein Referenzvergleich wuerde also bei jedem
    // Tastendruck im Widget unnoetig nach oben melden.
    const sig = JSON.stringify({
        valveOn: state.valveOn,
        countdown: state.countdown,
        runningTime: state.runningTime,
        soilMoisture: state.soilMoisture,
        lastOn: state.lastOn,
        mode: state.mode,
        status: state.status,
        events: schedule.events,
        enabled: schedule.enabled,
        label,
    });
    const lastSig = useRef('');
    useEffect(() => {
        if (lastSig.current === sig) return;
        lastSig.current = sig;
        onUpdate(sprinkleName, { label, sprinkleName, state, schedule });
    });

    return null;
}

export function Garten2Widget({ config, editMode }: WidgetProps) {
    const o = (config.options ?? {}) as Garten2WidgetOptions;
    const instance = o.instance || 'sprinklecontrol.0';
    const sourceStateBaseId = o.sourceStateBaseId || '';
    const manualDefaultMinutes = o.manualDefaultMinutes ?? DEFAULT_MANUAL_MINUTES;
    const confirmManualStart = o.confirmManualStart !== false;
    const showSoilMoisture = o.showSoilMoisture !== false;

    const hiddenCircles = useMemo(() => o.hiddenCircles ?? [], [o.hiddenCircles]);
    const circleLabels = useMemo(() => o.circleLabels ?? {}, [o.circleLabels]);

    const interactive = !editMode;
    const plantInteractive = interactive && !DEV_WRITES_BLOCKED;

    const { circles, loading, source } = useSprinkleCircles(instance, hiddenCircles, circleLabels);

    const [probes, setProbes] = useState<Record<string, CircleProbeData>>({});
    const onUpdate = useCallback((sprinkleName: string, data: CircleProbeData) => {
        setProbes((prev) => ({ ...prev, [sprinkleName]: data }));
    }, []);

    // Beim Ausblenden/Umbenennen eines Kreises die Probe-Leiche entfernen,
    // sonst zeigt der Wochenplan einen Kreis, der gar nicht mehr da ist.
    useEffect(() => {
        setProbes((prev) => {
            const names = new Set(circles.map((c) => c.sprinkleName));
            let changed = false;
            const next: Record<string, CircleProbeData> = {};
            for (const [k, v] of Object.entries(prev)) {
                if (names.has(k)) next[k] = v;
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [circles]);

    const orderedProbes = circles.map((c) => probes[c.sprinkleName]).filter((p): p is CircleProbeData => Boolean(p));
    const running = orderedProbes.find((p) => p.state.valveOn === true) ?? null;
    const anyRunning = orderedProbes.some((p) => p.state.valveOn === true);

    const weather = useSprinkleWeather(instance);

    const [settingsOpen, setSettingsOpen] = useState(false);

    return (
        <div className="garten2-widget">
            {circles.map((c) => (
                <Garten2CircleProbe
                    key={c.sprinkleName}
                    instance={instance}
                    sourceStateBaseId={sourceStateBaseId}
                    sprinkleName={c.sprinkleName}
                    label={c.label}
                    onUpdate={onUpdate}
                />
            ))}

            {loading && circles.length === 0 && <div className="garten-empty">Kreise werden gesucht …</div>}
            {!loading && circles.length === 0 && (
                <div className="garten-empty">
                    {source === 'none'
                        ? 'Keine Kreise gefunden – bitte Adapter-Instanz prüfen.'
                        : 'Keine Bewässerungskreise gefunden'}
                </div>
            )}

            {circles.length > 0 && (
                <>
                    <Garten2Hero running={running} plantInteractive={plantInteractive} />

                    <Garten2WeatherSoil weather={weather} circles={orderedProbes} showSoilMoisture={showSoilMoisture} />

                    <Garten2WeekPlan
                        circles={orderedProbes}
                        plantInteractive={plantInteractive}
                        confirmManualStart={confirmManualStart}
                        manualDefaultMinutes={manualDefaultMinutes}
                        onOpenSettings={() => setSettingsOpen(true)}
                    />
                </>
            )}

            {DEV_WRITES_BLOCKED && (
                <p className="garten-note garten-dev-note">
                    Lokale Vorschau: Modus, Handbetrieb und die Regensperre sind hier ausgegraut – sie schalten erst auf
                    dem Pi.
                </p>
            )}

            {settingsOpen && (
                <Garten2SettingsSheet
                    instance={instance}
                    anyRunning={anyRunning}
                    plantInteractive={plantInteractive}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
        </div>
    );
}
