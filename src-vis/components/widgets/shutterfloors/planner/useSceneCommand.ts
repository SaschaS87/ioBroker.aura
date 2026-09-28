/**
 * Sofort-Fahren fuer eine Szene: schreibt `${root}.Befehl` und wartet auf die
 * Quittierung durch das Wochenplan-Skript (iobroker-scripts/rollladen/
 * Rollladen_Wochenplan.js, Abschnitt `sofortBefehl`).
 *
 * ABWEICHUNG vom Auftrag: Sascha hatte das Format
 * `{ id, sceneId, ts, quelle }` vorgegeben. Das Skript liest tatsaechlich nur
 * `sceneId` als reinen String ODER `{"sceneId": "..."}` — ein `id`-Feld wird
 * weder gelesen noch zurueckgegeben. Es quittiert, indem es GENAU denselben
 * Wert, den es empfangen hat, mit `ack:true` zurueckschreibt (siehe
 * `setState(`${ROOT}.Befehl`, wert, true)` im Skript). Deshalb schreibt dieser
 * Hook `{"sceneId": "..."}` (das vom Skript verstandene Format) und erkennt
 * die Quittierung ueber Wert-Gleichheit + `ack:true`, nicht ueber eine id.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { setStateDirect } from '../../../../hooks/useIoBroker';

export type SceneCommandStatus = 'idle' | 'pending' | 'timeout';

const TIMEOUT_MS = 5000;

export function useSceneCommand(befehlId: string) {
    const { state } = useDatapoint(befehlId);
    const [status, setStatus] = useState<SceneCommandStatus>('idle');
    const pendingVal = useRef<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Quittierung erkennen: derselbe Wert kommt mit ack:true zurueck.
    useEffect(() => {
        if (!pendingVal.current) return;
        if (state && state.ack === true && state.val === pendingVal.current) {
            pendingVal.current = null;
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            setStatus('idle');
        }
    }, [state]);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const run = useCallback(
        (sceneId: string) => {
            const val = JSON.stringify({ sceneId });
            pendingVal.current = val;
            setStatus('pending');
            setStateDirect(befehlId, val, false);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                if (pendingVal.current === val) setStatus('timeout');
            }, TIMEOUT_MS);
        },
        [befehlId],
    );

    return { run, status };
}
