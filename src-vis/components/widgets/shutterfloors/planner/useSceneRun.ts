/**
 * "Szene laeuft" und Stopp (Feature 30, Phase 2). Es gibt keinen Datenpunkt, der den Laufzustand einer
 * Szene meldet. Eine Szene gilt deshalb nur dann als laufend, wenn sie auf DIESEM Geraet gestartet wurde
 * und (a) das Skript den Befehl noch nicht quittiert hat oder (b) mindestens ein Antrieb der Szene laut
 * MovingState faehrt. Hoechstens 180 s nach dem Start. Nach einem Stopp wird MovingState 6 s lang
 * ignoriert (der Adapter meldet "steht" erst beim naechsten Poll, siehe useShutterControl.ts).
 *
 * Stopp = zuerst Abbruch-Befehl ans Skript ({"abort": "<id>"}, bricht Wartestellen und Lamellenbefehl ab),
 * dann je Antrieb der Szene derselbe Stopp wie in der Zeile (stopDp = true, Auftrag verwerfen).
 * Startet der Zeitplan oder ein anderes Geraet die Szene, erscheint hier kein Stopp-Knopf.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { usePendingStore } from '../../shuttershared/useShutterDevice';
import { STOP_IGNORE_MOVING_MS } from '../useShutterControl';
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
}): SceneRun {
    const { floors, scenes, cmd, moving } = args;
    const { setState } = useIoBroker();
    const { clearPending } = usePendingStore();
    const [stoppedAt, setStoppedAt] = useState<number | null>(null);
    const [tick, setTick] = useState(() => Date.now());

    const { pendingSceneId, startedSceneId, startedAt, run: cmdRun, abort: cmdAbort } = cmd;
    // Sekundentakt nur, solange ein Start oder Stopp noch Folgen haben kann (180-s-Grenze, 6-s-Fenster).
    useEffect(() => {
        const until =
            Math.max(
                startedAt !== null ? startedAt + RUN_MAX_MS : 0,
                stoppedAt !== null ? stoppedAt + STOP_IGNORE_MOVING_MS : 0,
            ) + 1000;
        if (until - Date.now() <= 0) return;
        setTick(Date.now());
        const id = window.setInterval(() => {
            const n = Date.now();
            setTick(n);
            if (n > until) window.clearInterval(id);
        }, 1000);
        return () => window.clearInterval(id);
    }, [startedAt, stoppedAt]);

    const isRunning = useCallback(
        (sceneId: string) => {
            if (startedAt === null || startedSceneId !== sceneId) return false;
            // Zeitstempelvergleich statt Zeitgeber: iOS haelt Timer im Hintergrund an (wie in useShutterControl)
            const now = Math.max(tick, Date.now());
            if (now - startedAt > RUN_MAX_MS) return false;
            if (pendingSceneId === sceneId) return true;
            if (stoppedAt !== null && stoppedAt >= startedAt && now - stoppedAt < STOP_IGNORE_MOVING_MS) return false;
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

    return useMemo(() => ({ isRunning, run: cmdRun, stop }), [isRunning, cmdRun, stop]);
}
