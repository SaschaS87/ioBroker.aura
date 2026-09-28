/**
 * Persistenz-Layer für den Rolllaeden-Planer (Szenen + Wochenplan +
 * Einstellungen). Liest/schreibt drei JSON-Datenpunkte:
 *   ${root}.Szenen        — Scene[]
 *   ${root}.Wochenplan    — PlanEntry[]
 *   ${root}.Einstellungen — Settings
 *
 * Anzeige läuft über useDatapoint (live, abonniert) — dieselbe Quelle, die
 * jedes andere Widget im Projekt nutzt. Schreiben läuft NICHT über den davon
 * gelieferten (u.U. veralteten) React-State: jede Schreibfunktion liest den
 * aktuellen Datenpunktwert zuerst frisch über getStateDirect (kein Cache,
 * kein Abo nötig), ändert darin NUR den betroffenen Eintrag per `id` und
 * schreibt die komplette Liste zurück. Das ist der Schutz gegen die
 * Race-Condition, wenn zwei Geräte gleichzeitig am Planer arbeiten: ein
 * Schreiben aus dem alten Bildschirmzustand würde sonst die Änderung des
 * jeweils anderen Geräts überschreiben.
 */
import { useMemo } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { getStateDirect, setStateDirect } from '../../../../hooks/useIoBroker';
import { parsePlan, parseScenes, parseSettings, DEFAULT_SETTINGS } from './planModel';
import type { PlanEntry, Scene, Settings } from './planModel';

export interface RollPlanData {
    scenes: Scene[];
    entries: PlanEntry[];
    settings: Settings;
    /** null = beim letzten Lesen kein Fehler. Für einen künftigen Status-Datenpunkt gedacht. */
    scenesError: string | null;
    entriesError: string | null;
    settingsError: string | null;
    saveScene: (scene: Scene) => Promise<void>;
    deleteScene: (id: string) => Promise<void>;
    saveEntry: (entry: PlanEntry) => Promise<void>;
    deleteEntry: (id: string) => Promise<void>;
    saveSettings: (partial: Partial<Settings>) => Promise<void>;
}

/** Liest den Datenpunkt frisch (kein Cache) und parst ihn tolerant zu Scene[]. */
async function readScenesFresh(id: string): Promise<Scene[]> {
    const state = await getStateDirect(id);
    const raw = typeof state?.val === 'string' ? state.val : '';
    return parseScenes(raw).value;
}

/** Liest den Datenpunkt frisch (kein Cache) und parst ihn tolerant zu PlanEntry[]. */
async function readEntriesFresh(id: string): Promise<PlanEntry[]> {
    const state = await getStateDirect(id);
    const raw = typeof state?.val === 'string' ? state.val : '';
    return parsePlan(raw).value;
}

/** Liest den Datenpunkt frisch (kein Cache) und parst ihn tolerant zu Settings. */
async function readSettingsFresh(id: string): Promise<Settings> {
    const state = await getStateDirect(id);
    const raw = typeof state?.val === 'string' ? state.val : '';
    return parseSettings(raw).value;
}

export function useRollPlanData(root: string): RollPlanData {
    const scenesId = `${root}.Szenen`;
    const entriesId = `${root}.Wochenplan`;
    const settingsId = `${root}.Einstellungen`;

    // Live-Anzeige über den projektüblichen Datenpunkt-Hook — abonniert und
    // damit immer aktuell, ohne dass dieses Widget selbst pollen müsste.
    const { value: scenesRaw } = useDatapoint(scenesId);
    const { value: entriesRaw } = useDatapoint(entriesId);
    const { value: settingsRaw } = useDatapoint(settingsId);

    const scenesParsed = useMemo(() => parseScenes(typeof scenesRaw === 'string' ? scenesRaw : ''), [scenesRaw]);
    const entriesParsed = useMemo(() => parsePlan(typeof entriesRaw === 'string' ? entriesRaw : ''), [entriesRaw]);
    const settingsParsed = useMemo(
        () => parseSettings(typeof settingsRaw === 'string' ? settingsRaw : ''),
        [settingsRaw],
    );

    // Schreibfunktionen: IMMER zuerst frisch lesen, dann nur den betroffenen
    // Eintrag ersetzen/einfügen/löschen — nie die Liste aus scenesParsed/
    // entriesParsed (Bildschirmzustand) zurückschreiben.
    async function saveScene(scene: Scene): Promise<void> {
        const current = await readScenesFresh(scenesId);
        const next = current.some((s) => s.id === scene.id)
            ? current.map((s) => (s.id === scene.id ? scene : s))
            : [...current, scene];
        setStateDirect(scenesId, JSON.stringify(next));
    }

    async function deleteScene(id: string): Promise<void> {
        const current = await readScenesFresh(scenesId);
        const next = current.filter((s) => s.id !== id);
        setStateDirect(scenesId, JSON.stringify(next));
        // Wochenplan-Einträge, die genau diese Szene ansteuern, würden sonst auf
        // eine geloeschte Szene zeigen ("Szene gelöscht", siehe targetName in
        // planModel.ts) — hier ebenso frisch lesen statt aus altem State löschen.
        const currentEntries = await readEntriesFresh(entriesId);
        const nextEntries = currentEntries.filter((e) => !(e.target.kind === 'scene' && e.target.sceneId === id));
        if (nextEntries.length !== currentEntries.length) {
            setStateDirect(entriesId, JSON.stringify(nextEntries));
        }
    }

    async function saveEntry(entry: PlanEntry): Promise<void> {
        const current = await readEntriesFresh(entriesId);
        const next = current.some((e) => e.id === entry.id)
            ? current.map((e) => (e.id === entry.id ? entry : e))
            : [...current, entry];
        setStateDirect(entriesId, JSON.stringify(next));
    }

    async function deleteEntry(id: string): Promise<void> {
        const current = await readEntriesFresh(entriesId);
        const next = current.filter((e) => e.id !== id);
        setStateDirect(entriesId, JSON.stringify(next));
    }

    async function saveSettings(partial: Partial<Settings>): Promise<void> {
        const current = await readSettingsFresh(settingsId);
        const next: Settings = { ...current, ...partial };
        setStateDirect(settingsId, JSON.stringify(next));
    }

    return {
        scenes: scenesParsed.value,
        entries: entriesParsed.value,
        settings: settingsParsed.value ?? DEFAULT_SETTINGS,
        scenesError: scenesParsed.error,
        entriesError: entriesParsed.error,
        settingsError: settingsParsed.error,
        saveScene,
        deleteScene,
        saveEntry,
        deleteEntry,
        saveSettings,
    };
}
