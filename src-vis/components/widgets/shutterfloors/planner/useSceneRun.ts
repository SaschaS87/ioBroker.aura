/**
 * "Szene laeuft" und Stopp (Feature 30, Phase 2). Es gibt keinen Datenpunkt, der den Laufzustand einer
 * Szene meldet. Eine Szene gilt deshalb nur dann als laufend, wenn sie auf DIESEM Geraet gestartet wurde
 * und (a) das Skript den Befehl noch nicht quittiert hat oder (b) mindestens ein Antrieb der Szene laut
 * MovingState faehrt. Hoechstens 180 s nach dem Start. Nach einem Stopp ist der Lauf endgueltig beendet,
 * spaetere "faehrt"-Meldungen holen die Stopp-Ansicht nicht zurueck.
 *
 * Stopp = zuerst Abbruch-Befehl ans Skript ({"abort": "<id>"}, bricht Wartestellen und Lamellenbefehl ab),
 * dann je Antrieb der Szene derselbe Stopp wie in der Zeile (stopDp = true, Auftrag verwerfen).
 * Startet der Zeitplan oder ein anderes Geraet die Szene, erscheint hier kein Stopp-Knopf.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { usePendingStore } from '../../shuttershared/useShutterDevice';
import type { ShutterFloorDef } from '../types';
import type { Scene } from './planModel';
import type { SceneCommand } from './useSceneCommand';

export const RUN_MAX_MS = 180_000;

export interface SceneRun {
    isRunning: (sceneId: string) => boolean;
    run: (sceneId: string) => void;
    stop: (sceneId: string) => void;
}

const NOOP: SceneRun = { isRunning: () => false, run: () => {}, stop: () => {} };
export const SceneRunContext = createContext<SceneRun>(NOOP);
export const useSceneRun = () => useContext(SceneRunContext);

export function useSceneRunValue(args: {
    floors: ShutterFloorDef[];
    scenes: Scene[];
    cmd: SceneCommand;
    /** MovingState je Antrieb-Schluessel */
    moving: Record<string, boolean>;
    /** Position (zu in %) und Lamelle je Antrieb-Schluessel; null = unbekannt */
    positions: Record<string, number | null>;
    slats: Record<string, number | null>;
}): SceneRun {
    const { floors, scenes, cmd, moving, positions, slats } = args;
    const { setState } = useIoBroker();
    const { clearPending } = usePendingStore();
    const [stoppedAt, setStoppedAt] = useState<number | null>(null);
    const [tick, setTick] = useState(() => Date.now());

    const { pendingSceneId, startedSceneId, startedAt, run: cmdRun, abort: cmdAbort } = cmd;
    // Sekundentakt nur, solange ein Start noch Folgen haben kann (180-s-Grenze). Ein Stopp braucht keinen
    // Takt: er beendet den Lauf endgueltig (isRunning unten).
    useEffect(() => {
        const until = (startedAt !== null ? startedAt + RUN_MAX_MS : 0) + 1000;
        if (until - Date.now() <= 0) return;
        setTick(Date.now());
        const id = window.setInterval(() => {
            const n = Date.now();
            setTick(n);
            if (n > until) window.clearInterval(id);
        }, 1000);
        return () => window.clearInterval(id);
    }, [startedAt]);

    const isRunning = useCallback(
        (sceneId: string) => {
            if (startedAt === null || startedSceneId !== sceneId) return false;
            // Zeitstempelvergleich statt Zeitgeber: iOS haelt Timer im Hintergrund an (wie in useShutterControl)
            const now = Math.max(tick, Date.now());
            if (now - startedAt > RUN_MAX_MS) return false;
            if (pendingSceneId === sceneId) return true;
            // Nach einem Stopp ist dieser Lauf beendet - fuer immer, nicht nur 6 s. Sonst kehrt die
            // Stopp-Ansicht von selbst zurueck, sobald irgendein Antrieb der Szene spaeter noch
            // "faehrt" meldet (Nachzuegler des Adapters, Wandschalter, Zeitplan).
            if (stoppedAt !== null && stoppedAt >= startedAt) return false;
            const scene = scenes.find((s) => s.id === sceneId);
            return !!scene && scene.targets.some((t) => moving[t.key]);
        },
        [startedAt, startedSceneId, pendingSceneId, stoppedAt, scenes, moving, tick],
    );

    const stop = useCallback(
        (sceneId: string) => {
            cmdAbort(sceneId);
            const scene = scenes.find((s) => s.id === sceneId);
            const devices = floors.flatMap((f) => f.devices);
            (scene?.targets ?? []).forEach((t) => {
                const d = devices.find((x) => x.key === t.key);
                if (!d?.stopDp) return;
                setState(d.stopDp, true, { diag: true });
                clearPending(d.key);
            });
            setStoppedAt(Date.now());
        },
        [cmdAbort, scenes, floors, setState, clearPending],
    );

    // Stehen schon alle Ziele (Position und Lamelle, +-3 wie im Skript), gibt es nichts zu fahren:
    // der Befehl geht raus, die Oberflaeche zeigt aber keinen Lauf (kein Aufblitzen des Stopp-Knopfs).
    const run = useCallback(
        (sceneId: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            const devices = floors.flatMap((f) => f.devices);
            const near = (is: number | null | undefined, goal: number) =>
                typeof is === 'number' && Math.abs(Math.round(is) - Math.round(goal)) <= 3;
            const allDone =
                !!scene &&
                scene.targets.length > 0 &&
                scene.targets.every((t) => {
                    const d = devices.find((x) => x.key === t.key);
                    if (!d) return false;
                    if (!near(positions[t.key], t.closed)) return false;
                    return !(d.slatDp && typeof t.slat === 'number') || near(slats[t.key], t.slat);
                });
            cmdRun(sceneId, allDone);
        },
        [cmdRun, scenes, floors, positions, slats],
    );

    return useMemo(() => ({ isRunning, run, stop }), [isRunning, run, stop]);
}
