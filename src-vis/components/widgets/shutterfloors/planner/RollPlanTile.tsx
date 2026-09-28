/**
 * Rolllaeden-Planer-Kachel (Produktion, Feature 23) — sitzt in
 * ShutterFloorsWidget.tsx ueber der unveraenderten Etagenliste, nur wenn
 * `showPlanner === true`. Baut das PlanModel aus echten Daten (Geraete-
 * stellungen vom Pi, Sonnenzeiten aus javascript.0.variables.astro.*,
 * Szenen/Wochenplan/Einstellungen aus useRollPlanData) und fuehrt Szenen
 * ueber useSceneCommand wirklich aus (im Dev-Trockenlauf gegen
 * Rollladen_Wochenplan_Dev, siehe ShutterFloorsWidget.tsx fuer die
 * ROOT-Weiche).
 *
 * Herkunft: Runde 5 des inzwischen entfernten Entwurfs (KachelX) — die Ansichtseinstellungen liegen
 * jetzt in useRollPlanView.ts statt lokal in dieser Komponente.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { useRollPlanData } from './useRollPlanData';
import { useLivePlanModel } from './useLivePlanModel';
import { useSceneCommand } from './useSceneCommand';
import { useRollPlanViewStore } from './useRollPlanView';
import { PlanKachel } from './PlanPages';
import './RollPlan.css';

/** Liest die aktuelle Stellung eines Antriebs und meldet sie nach oben —
 *  gleiche Idee wie im inzwischen entfernten Entwurf (PosProbe), unveraendert
 *  uebernommen: ein useDatapoint-Aufruf je Geraet, als eigene Komponente
 *  statt in einer Schleife (Regeln der Hooks). */
function PosProbe({ k, dp, onUpdate }: { k: string; dp: string; onUpdate: (k: string, v: number | null) => void }) {
    const { value } = useDatapoint(dp);
    const v = typeof value === 'number' ? value : null;
    useEffect(() => {
        onUpdate(k, v);
    }, [k, v, onUpdate]);
    return null;
}

function parseSunDp(v: unknown): string | null {
    return typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v : null;
}

export function RollPlanTile({ floors, root }: { floors: ShutterFloorDef[]; root: string }) {
    const [positions, setPositions] = useState<Record<string, number | null>>({});
    const onPos = useCallback((k: string, v: number | null) => {
        setPositions((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
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
    const { list, first, scenes: sceneView } = useRollPlanViewStore();

    // 5 Sekunden ohne Quittierung durch das Skript -> Hinweis ueber den
    // vorhandenen Toast-Mechanismus des Modells (Portal, gleiche Optik wie
    // die anderen Rueckmeldungen der Kachel).
    useEffect(() => {
        if (cmd.status === 'timeout') model.showToast('Skript antwortet nicht');
    }, [cmd.status, model.showToast]);

    return (
        <div className="rpp">
            {floors.flatMap((f) => f.devices).map((d) => (
                <PosProbe key={d.key} k={d.key} dp={d.posDp} onUpdate={onPos} />
            ))}
            <PlanKachel model={model} listStyle={list} first={first} favOnly layout={sceneView === 'S' ? 'list' : 2} paged={sceneView === 'W'} />
        </div>
    );
}
