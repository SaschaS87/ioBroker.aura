import { createContext, useContext, useEffect, useRef } from 'react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ShutterDeviceDef } from './types';

export interface PendingState {
    targetRaw: number | null;
    startedAt: number;
}

interface PendingStore {
    pending: Record<string, PendingState>;
    markPending: (key: string, targetRaw: number) => void;
    clearPending: (key: string) => void;
    /** Kurze Einblendung am unteren Rand – nur fuer Aktionen ohne eigenes Bild (Stopp). */
    showToast: (text: string) => void;
}

export const PendingContext = createContext<PendingStore | null>(null);

export const usePendingStore = () => {
    const ctx = useContext(PendingContext);
    if (!ctx) throw new Error('usePendingStore must be used within ShutterRoomsWidget');
    return ctx;
};

/** Schlüssel für einen laufenden Lamellen-Auftrag. Eigener Eintrag im
 *  Pending-Store, damit Position und Lamelle sich nicht gegenseitig
 *  überschreiben – die Kachel liest weiterhin nur den Positions-Eintrag. */
export const slatPendingKey = (deviceKey: string) => `${deviceKey}::slat`;

interface ShutterDeviceState {
    ackedPos: number | null;
    lastKnownAckedPos: number | null;
    posOpen: number | null;
    isUnknown: boolean;
    isMoving: boolean;
    isActing: boolean;
    /** Fahrtrichtung eines laufenden Auftrags – null, wenn nicht ableitbar. */
    direction: 'up' | 'down' | null;
    /** Zielwert des laufenden Auftrags, als Offen-Prozent wie die Anzeige. */
    targetOpen: number | null;
    slatAckedPos: number | null;
    isSlatUnknown: boolean;
    /** Zielwert eines laufenden Lamellen-Auftrags (Rohwert wie der Datenpunkt). */
    slatTarget: number | null;
    /** Läuft gerade ein Lamellen-Befehl? */
    isSlatActing: boolean;
    /** Letzter bekannter bestätigter Lamellenwinkel (für Fallback-Anzeige). */
    slatShownPos: number | null;
    /** Startwert (Rohwert) der aktuellen Fahrt, null wenn nicht in Fahrt. Eingefroren bei Fahrtbeginn. */
    startOpen: number | null;
}

export const useShutterDevice = (dev: ShutterDeviceDef): ShutterDeviceState => {
    const store = usePendingStore();

    // Position DP (acknowledged)
    const posRaw = useDatapoint(dev.posDp);
    const posAcked = posRaw.state?.val;
    const posAck = posRaw.state?.ack;

    // Activity DP (MovingState)
    const activityState = useDatapoint(dev.activityDp ?? '');
    const activityVal = activityState.state?.val;

    // Slat DP (SlateOrientationState)
    const slatState = useDatapoint(dev.slatDp ?? '');
    const slatAcked = slatState.state?.val;
    const slatAck = slatState.state?.ack;

    // Nur ack:true und typeof number übernehmen
    const ackedPos = typeof posAcked === 'number' && posAck === true ? posAcked : null;
    const slatAckedPos = typeof slatAcked === 'number' && slatAck === true ? slatAcked : null;

    // Letzte bekannte Position (für Referenz)
    const lastKnownRef = useRef<number | null>(ackedPos);
    useEffect(() => {
        if (ackedPos !== null) {
            lastKnownRef.current = ackedPos;
        }
    }, [ackedPos]);

    // Der Rohwert bleibt streng (nur ack:true) – daran hängt die Auftragslogik.
    // Für die ANZEIGE fällt die App auf den letzten bestätigten Wert zurück,
    // solange ein unquittierter Wunschwert obendrauf liegt (from: web.0).
    const shownPos = ackedPos !== null ? ackedPos : lastKnownRef.current;

    // Position invertieren
    const posOpen = shownPos !== null ? (dev.invertPosition ? 100 - shownPos : shownPos) : null;

    // Pending State auslesen
    const pendingEntry = store.pending[dev.key];
    const isActing = !!pendingEntry;

    // isMoving: aus ActivityDP wenn vorhanden, sonst aus pendingEntry
    const isMoving = dev.activityDp ? !!activityVal : isActing;

    // Lamellen Pending State auslesen
    const slatPendingEntry = store.pending[slatPendingKey(dev.key)];
    const isSlatActing = !!slatPendingEntry;
    const slatTarget = slatPendingEntry?.targetRaw ?? null;

    // Letzte bekannte Lamellenposition (für Fallback-Anzeige)
    const lastKnownSlatRef = useRef<number | null>(slatAckedPos);
    useEffect(() => {
        if (slatAckedPos !== null) {
            lastKnownSlatRef.current = slatAckedPos;
        }
    }, [slatAckedPos]);

    // Fallback für Lamellen-Anzeige (wie shownPos für Position)
    const slatShownPos = slatAckedPos !== null ? slatAckedPos : lastKnownSlatRef.current;

    // Toleranzband ±3%: wenn Position nah bei Ziel, Pending zurücksetzen
    // WICHTIG: Streng auf ackedPos prüfen (ack:true), nie auf Fallback (shownPos).
    // Mit Fallback würde ein echter Auftrag (z.B. 20 → 80) sofort nach dem
    // Absenden „am Ziel" erscheinen, und die Fahrtanzeige samt Animation
    // verschwände im selben Moment. Das ist die gefährlichste Falle des Umbaus.
    useEffect(() => {
        if (pendingEntry && ackedPos !== null) {
            const targetRaw = pendingEntry.targetRaw;
            if (targetRaw !== null && Math.abs(ackedPos - targetRaw) <= 3) {
                store.clearPending(dev.key);
            }
        }
    }, [ackedPos, pendingEntry, dev.key, store]);

    // Toleranzband ±3: meldet die Box den Lamellenwinkel nah am Ziel, ist der
    // Auftrag erledigt. Der 45s-Aufräumer im Widget fängt den Rest ab.
    // WICHTIG: Streng auf slatAckedPos prüfen (ack:true), nie auf Fallback.
    // Dasselbe Risiko wie beim Position-Effekt oben.
    useEffect(() => {
        if (slatPendingEntry && slatAckedPos !== null) {
            const target = slatPendingEntry.targetRaw;
            if (target !== null && Math.abs(slatAckedPos - target) <= 3) {
                store.clearPending(slatPendingKey(dev.key));
            }
        }
    }, [slatAckedPos, slatPendingEntry, dev.key, store]);

    // Richtung und Ziel eines laufenden Auftrags. Rohwert = Closure (100 = zu),
    // die Anzeige rechnet in Offen-Prozent – deshalb hier einmal umdrehen.
    const targetRaw = pendingEntry?.targetRaw ?? null;
    const targetOpen = targetRaw !== null ? (dev.invertPosition ? 100 - targetRaw : targetRaw) : null;

    // Startwert der Fahrt einfrieren: wird bei Fahrtbeginn gespeichert und
    // bleibt stehen, bis die Fahrt endet. Verhindert, dass zwischenzeitliche
    // Position-Updates (von der Box) die Startzahl mitwandern lassen.
    const prevBusyRef = useRef(false);
    const moveStartRef = useRef<number | null>(null);
    const busy = isMoving || isActing;
    useEffect(() => {
        if (busy && !prevBusyRef.current) moveStartRef.current = lastKnownRef.current;
        if (!busy) moveStartRef.current = null;
        prevBusyRef.current = busy;
    }, [busy]);

    const startOpen = moveStartRef.current !== null
        ? (dev.invertPosition ? 100 - moveStartRef.current : moveStartRef.current)
        : null;

    let direction: 'up' | 'down' | null = null;
    if (targetRaw !== null && shownPos !== null && Math.abs(targetRaw - shownPos) > 3) {
        direction = targetRaw > shownPos ? 'down' : 'up';
    }

    return {
        ackedPos,
        lastKnownAckedPos: lastKnownRef.current,
        posOpen,
        isUnknown: shownPos === null,
        isMoving,
        isActing,
        direction,
        targetOpen,
        slatAckedPos,
        isSlatUnknown: slatShownPos === null,
        slatShownPos,
        slatTarget,
        isSlatActing,
        startOpen,
    };
};
