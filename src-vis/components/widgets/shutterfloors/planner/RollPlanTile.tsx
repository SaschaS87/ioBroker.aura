/**
 * Rolllaeden-Planer (Feature 23, Einbau Feature 27, Unterseiten Feature 30) – sitzt in
 * ShutterFloorsWidget.tsx, nur wenn `showPlanner === true`. Baut das PlanModel aus echten Daten
 * (Geraetestellungen vom Pi, Sonnenzeiten aus javascript.0.variables.astro.*, Szenen/Wochenplan/
 * Einstellungen aus useRollPlanData) und fuehrt Szenen ueber useSceneCommand wirklich aus (im
 * Dev-Trockenlauf gegen Rollladen_Dev, siehe ShutterFloorsWidget.tsx fuer die ROOT-Weiche).
 *
 * Gibt kein eigenes Wurzelelement zurueck: Was gezeichnet wird, bestimmt `render` (der Stapel mit
 * Zeitplan- und Szenen-Unterseiten, PlannerStack.tsx). Das Modell und der Laufzustand der Szenen
 * (useSceneRun) stehen dort per Context zur Verfuegung.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { useRollPlanData } from './useRollPlanData';
import { useLivePlanModel } from './useLivePlanModel';
import { useSceneCommand } from './useSceneCommand';
import { SceneRunContext, useSceneRunValue } from './useSceneRun';
import { Toast } from './parts';
import type { PlanModel } from './planModel';
import './RollPlan.css';

/** Liest die aktuelle Stellung eines Antriebs und meldet sie nach oben: ein useDatapoint-Aufruf je
 *  Geraet, als eigene Komponente statt in einer Schleife (Regeln der Hooks). */
function PosProbe({ k, dp, onUpdate }: { k: string; dp: string; onUpdate: (k: string, v: number | null) => void }) {
    const { value } = useDatapoint(dp);
    const v = typeof value === 'number' ? value : null;
    useEffect(() => {
        onUpdate(k, v);
    }, [k, v, onUpdate]);
    return null;
}

/** Wie PosProbe, fuer core:MovingState (faehrt der Antrieb gerade?). */
function MovingProbe({ k, dp, onUpdate }: { k: string; dp: string; onUpdate: (k: string, v: boolean) => void }) {
    const { value } = useDatapoint(dp);
    const v = value === true;
    useEffect(() => {
        onUpdate(k, v);
    }, [k, v, onUpdate]);
    return null;
}

function parseSunDp(v: unknown): string | null {
    return typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v : null;
}

export function RollPlanTile({
    floors,
    root,
    render,
}: {
    floors: ShutterFloorDef[];
    root: string;
    render: (model: PlanModel) => ReactNode;
}) {
    const [positions, setPositions] = useState<Record<string, number | null>>({});
    const onPos = useCallback((k: string, v: number | null) => {
        setPositions((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    }, []);
    const [moving, setMoving] = useState<Record<string, boolean>>({});
    const onMoving = useCallback((k: string, v: boolean) => {
        setMoving((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    }, []);
    const sunrise = useDatapoint('javascript.0.variables.astro.sunrise');
    const sunset = useDatapoint('javascript.0.variables.astro.sunset');
    const dawn = useDatapoint('javascript.0.variables.astro.dawn');
    const dusk = useDatapoint('javascript.0.variables.astro.dusk');

    const data = useRollPlanData(root);
    const cmd = useSceneCommand(`${root}.Befehl`);
    const runScene = useCallback((id: string) => cmd.run(id), [cmd]);
    const model = useLivePlanModel(
        floors,
        positions,
        {
            sunrise: parseSunDp(sunrise.value),
            sunset: parseSunDp(sunset.value),
            dawn: parseSunDp(dawn.value),
            dusk: parseSunDp(dusk.value),
        },
        data,
        runScene,
    );
    const sceneRun = useSceneRunValue({ floors, scenes: model.scenes, cmd, moving });

    // 5 Sekunden ohne Quittierung durch das Skript -> Hinweis ueber den
    // vorhandenen Toast-Mechanismus des Modells (Portal, gleiche Optik wie
    // die anderen Rueckmeldungen der Kachel).
    useEffect(() => {
        if (cmd.status === 'timeout') model.showToast('Skript antwortet nicht');
    }, [cmd.status, model.showToast]);

    const devices = floors.flatMap((f) => f.devices);
    return (
        <SceneRunContext.Provider value={sceneRun}>
            {devices.map((d) => (
                <PosProbe key={d.key} k={d.key} dp={d.posDp} onUpdate={onPos} />
            ))}
            {devices
                .filter((d) => d.activityDp)
                .map((d) => (
                    <MovingProbe key={d.key} k={d.key} dp={d.activityDp as string} onUpdate={onMoving} />
                ))}
            {render(model)}
            <Toast model={model} />
        </SceneRunContext.Provider>
    );
}
