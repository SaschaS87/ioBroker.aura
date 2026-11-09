/**
 * Sofort-Fahren und Abbrechen einer Szene: schreibt `${root}.Befehl` und wartet auf die
 * Quittierung durch das Wochenplan-Skript (iobroker-scripts/rollladen/
 * Rollladen_Wochenplan.js, Abschnitt `sofortBefehl`).
 *
 * Befehlsformate (das Skript liest sie so, ab Version 0.3.0):
 *   - Fahren:    {"sceneId": "..."}    (reiner String geht auch, wird hier nicht benutzt)
 *   - Abbrechen: {"abort": "<sceneId>"} (Feature 30, Phase 2; aeltere Skripte loggen den Befehl als
 *     "ohne gueltige sceneId" und bestaetigen ihn, ohne etwas abzubrechen)
 * Das Skript quittiert, indem es GENAU denselben Wert, den es empfangen hat, mit `ack:true`
 * zurueckschreibt. Deshalb erkennt dieser Hook die Quittierung ueber Wert-Gleichheit + `ack:true`,
 * nicht ueber eine id.
 *
 * ABWEICHUNG vom urspruenglichen Auftrag: Sascha hatte das Format `{ id, sceneId, ts, quelle }`
 * vorgegeben. Das Skript liest tatsaechlich nur `sceneId`; ein `id`-Feld wird weder gelesen noch
 * zurueckgegeben.
 *
 * Fuer die Oberflaeche: `pendingSceneId` = Szene, deren Befehl noch nicht quittiert ist (laeuft),
 * `startedAt`/`startedSceneId` = letzter Start auf diesem Geraet (bleibt nach der Quittierung stehen,
 * die Fahrt kann dann noch laufen).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { setStateDirect } from '../../../../hooks/useIoBroker';

export type SceneCommandStatus = 'idle' | 'pending' | 'timeout';

const TIMEOUT_MS = 5000;

export interface SceneCommand {
    /** `silent`: Befehl senden, aber keinen Laufzustand zeigen (alle Ziele stehen schon). */
    run: (sceneId: string, silent?: boolean) => void;
    /** Bricht die Szene im Skript ab. Die Quittierung wird nicht beachtet und nicht gemeldet. */
    abort: (sceneId: string) => void;
    status: SceneCommandStatus;
    pendingSceneId: string | null;
    startedSceneId: string | null;
    startedAt: number | null;
}

export function useSceneCommand(befehlId: string): SceneCommand {
    const { state } = useDatapoint(befehlId);
    const [status, setStatus] = useState<SceneCommandStatus>('idle');
    const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);
    const [started, setStarted] = useState<{ sceneId: string; at: number } | null>(null);
    const pendingVal = useRef<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dropPending = useCallback(() => {
        pendingVal.current = null;
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setPendingSceneId(null);
        setStatus('idle');
    }, []);

    // Quittierung erkennen: derselbe Wert kommt mit ack:true zurueck.
    useEffect(() => {
        if (!pendingVal.current) return;
        if (state && state.ack === true && state.val === pendingVal.current) dropPending();
    }, [state, dropPending]);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const run = useCallback(
        (sceneId: string, silent = false) => {
            const val = JSON.stringify({ sceneId });
            if (silent) {
                // Alle Ziele stehen schon: Befehl trotzdem senden (das Skript prueft selbst nach und
                // protokolliert), aber keinen Laufzustand zeigen - sonst blitzt der Stopp-Knopf auf.
                dropPending();
                setStateDirect(befehlId, val, false);
                return;
            }
            pendingVal.current = val;
            setStatus('pending');
            setPendingSceneId(sceneId);
            setStarted({ sceneId, at: Date.now() });
            setStateDirect(befehlId, val, false);
            if (timer.current) clearTimeout(timer.current);
            // Die 5 Sekunden melden nur "Skript antwortet nicht". Die Szene gilt weiter als laufend,
            // bis das Skript quittiert (Raffstore-Szenen quittieren erst nach dem Stillstand).
            timer.current = setTimeout(() => {
                if (pendingVal.current === val) setStatus('timeout');
            }, TIMEOUT_MS);
        },
        [befehlId, dropPending],
    );

    const abort = useCallback(
        (sceneId: string) => {
            // Ein noch offener Szenen-Auftrag wird verworfen: danach darf kein "Skript antwortet nicht" kommen.
            dropPending();
            setStateDirect(befehlId, JSON.stringify({ abort: sceneId }), false);
        },
        [befehlId, dropPending],
    );

    return {
        run,
        abort,
        status,
        pendingSceneId,
        startedSceneId: started?.sceneId ?? null,
        startedAt: started?.at ?? null,
    };
}
