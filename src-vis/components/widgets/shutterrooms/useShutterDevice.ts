import { createContext, useContext, useEffect } from 'react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ShutterDeviceDef } from './types';

export interface PendingState {
    targetRaw: number | null;
    startedAt: number;
    /** Rohwert bei Fahrtbeginn. Liegt bewusst im Auftrag und nicht im Fenster:
     *  der Auftrag lebt im Widget und ueberlebt das Schliessen des
     *  Detail-Fensters, ein useRef im Fenster tut das nicht. */
    startRaw: number | null;
}

interface PendingStore {
    pending: Record<string, PendingState>;
    markPending: (key: string, targetRaw: number, startRaw?: number | null) => void;
    clearPending: (key: string) => void;
    /** Kurze Einblendung am unteren Rand – nur fuer Aktionen ohne eigenes Bild (Stopp). */
    showToast: (text: string) => void;
}

/** Letzter BESTAETIGTER Wert je Datenpunkt - bewusst ausserhalb von React.
 *  Liste und Detail-Fenster teilen sich diesen Merkzettel. Frueher lag er in
 *  einem useRef je Komponente; das Detail-Fenster wird aber bei jedem Oeffnen
 *  frisch erzeugt (key={sheetSeq}, Fix vom 18.08. gegen haengende Sheets) und
 *  startete deshalb blind. Lag gleichzeitig ein unquittierter Wunschwert im
 *  Datenpunkt - also bei JEDER Fahrt aus der App - stand dort "-" statt einer
 *  Zahl. Von Sascha am 25.08.2026 am Gaeste-WC gemeldet. */
const lastAckedByDp = new Map<string, number>();

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
    /** Angezeigter Wert ist nicht von der Box bestaetigt - Oberflaeche kennzeichnet ihn. */
    isEstimate: boolean;
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

    // Der UNQUITTIERTE Wert im Datenpunkt: unser eigener Wunschwert, den die
    // Box noch nicht bestaetigt hat (from: web.0). Nur als Notnagel fuer die
    // Anzeige - niemals fuer die Auftragslogik.
    const unackedPos = typeof posAcked === 'number' && posAck !== true ? posAcked : null;

    // Pending State auslesen
    const pendingEntry = store.pending[dev.key];
    const isActing = !!pendingEntry;

    // isMoving: aus ActivityDP wenn vorhanden, sonst aus pendingEntry
    const isMoving = dev.activityDp ? !!activityVal : isActing;

    // Letzte bestaetigte Position - je DATENPUNKT, nicht je Komponente.
    useEffect(() => {
        if (ackedPos !== null && dev.posDp) lastAckedByDp.set(dev.posDp, ackedPos);
    }, [ackedPos, dev.posDp]);
    const lastKnownPos = ackedPos !== null ? ackedPos : dev.posDp ? (lastAckedByDp.get(dev.posDp) ?? null) : null;

    // Der Rohwert bleibt streng (nur ack:true) – daran hängt die Auftragslogik.
    // Fuer die ANZEIGE gilt eine Rangfolge:
    //   1. der bestaetigte Wert,
    //   2. laeuft KEIN Auftrag mehr und liegt ein unquittierter Wunschwert vor:
    //      diesen zeigen. Genau der Fall, wenn der Adapter stumm bleibt -
    //      "vermutlich 40 %" ist ehrlicher als ein falsches "offen",
    //   3. sonst der letzte bestaetigte Wert.
    // Waehrend ein Auftrag laeuft, bleibt es bei 3.: Fenster und Animation
    // zeigen dann ohnehin Start -> Ziel.
    const shownPos = ackedPos !== null ? ackedPos : !isActing && unackedPos !== null ? unackedPos : lastKnownPos;

    // Angezeigter Wert ohne Quittung - die Oberflaeche kennzeichnet ihn.
    const isEstimate = ackedPos === null && shownPos !== null;

    // Position invertieren
    const posOpen = shownPos !== null ? (dev.invertPosition ? 100 - shownPos : shownPos) : null;

    // Lamellen Pending State auslesen
    const slatPendingEntry = store.pending[slatPendingKey(dev.key)];
    const isSlatActing = !!slatPendingEntry;
    const slatTarget = slatPendingEntry?.targetRaw ?? null;

    // Letzter bestaetigter Lamellenwinkel - ebenfalls je Datenpunkt.
    useEffect(() => {
        if (slatAckedPos !== null && dev.slatDp) lastAckedByDp.set(dev.slatDp, slatAckedPos);
    }, [slatAckedPos, dev.slatDp]);
    const lastKnownSlat =
        slatAckedPos !== null ? slatAckedPos : dev.slatDp ? (lastAckedByDp.get(dev.slatDp) ?? null) : null;

    // Fallback fuer die Lamellen-Anzeige, dieselbe Rangfolge wie bei der Position.
    const unackedSlat = typeof slatAcked === 'number' && slatAck !== true ? slatAcked : null;
    const slatShownPos =
        slatAckedPos !== null ? slatAckedPos : !isSlatActing && unackedSlat !== null ? unackedSlat : lastKnownSlat;

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

    // Startwert der Fahrt kommt aus dem AUFTRAG. Der liegt im Widget und
    // ueberlebt das Schliessen des Detail-Fensters; das fruehere useRef je
    // Komponente war nach dem Neuoeffnen leer, und die Start-Ziel-Anzeige
    // verschwand mitten in der Fahrt. Der Wert steht ab Fahrtbeginn fest,
    // spaetere Meldungen der Box lassen ihn nicht mitwandern.
    const startRaw = pendingEntry?.startRaw ?? null;
    const startOpen = startRaw !== null ? (dev.invertPosition ? 100 - startRaw : startRaw) : null;

    let direction: 'up' | 'down' | null = null;
    if (targetRaw !== null && shownPos !== null && Math.abs(targetRaw - shownPos) > 3) {
        direction = targetRaw > shownPos ? 'down' : 'up';
    }

    return {
        ackedPos,
        lastKnownAckedPos: lastKnownPos,
        posOpen,
        isUnknown: shownPos === null,
        isEstimate,
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
