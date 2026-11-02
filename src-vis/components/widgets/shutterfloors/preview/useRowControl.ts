/**
 * Bedien-Logik einer Rollladen-Zeile fuer die Entwuerfe 31–40 (nur
 * Dev-Vorschau). Inhaltlich eine Kopie von ShutterRow.tsx: Auf/Zu sofort,
 * Stopp nur waehrend der Fahrt, 6-Sekunden-Stoppfenster gegen Nachflackern,
 * „unbekannt" statt geschaetzter Werte. Kopie statt Umbau, damit die
 * Produktion unberuehrt bleibt – nach der Wahl wird sie richtig eingebaut.
 *
 * Schreibbefehle laufen wie im Ist-Stand ueber setState; in der Dev-Vorschau
 * haelt devWriteGuard sie auf (es faehrt nichts), die Zeile zeigt die Fahrt
 * dann bis zur 45-Sekunden-Altersgrenze an.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore } from '../../shuttershared/useShutterDevice';
import { radioDpsFromPosDp, isRadioOffline } from '../../shuttershared/tahomaRadio';
import type { ShutterFloorDeviceDef } from '../types';

/** Wie STOP_IGNORE_MOVING_MS in ShutterRow.tsx (Feature 17, Ziel C). */
const STOP_IGNORE_MOVING_MS = 6000;

export interface RowControl {
    /** Prozent zu (0 = offen, 100 = zu), null = unbekannt */
    closed: number | null;
    /** „Offen", „40 % zu", „fährt zu", „unbekannt" … */
    status: string;
    /** Kurzform fuer kleine Kacheln: „Offen", „40 %", „Zu", „–" */
    short: string;
    busy: boolean;
    dir: 'up' | 'down' | null;
    unknown: boolean;
    estimate: boolean;
    offline: boolean;
    /** Lamellenwinkel, falls Raffstore und bekannt */
    slat: number | null;
    open: () => void;
    stop: () => void;
    close: () => void;
}

export function useRowControl(device: ShutterFloorDeviceDef): RowControl {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending } = usePendingStore();
    const [stoppedAt, setStoppedAt] = useState<number | null>(null);

    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: radioStatusState } = useDatapoint(radioDps?.statusDp ?? '');
    const offline = isRadioOffline(radioStatusState?.val);

    const closed = state.isUnknown ? null : 100 - (state.posOpen ?? 0);
    const inStopWindow = stoppedAt !== null && Date.now() - stoppedAt < STOP_IGNORE_MOVING_MS;
    const busy = state.isActing || (state.isMoving && !inStopWindow);

    useEffect(() => {
        if (stoppedAt === null) return;
        const rest = STOP_IGNORE_MOVING_MS - (Date.now() - stoppedAt);
        if (rest <= 0) {
            setStoppedAt(null);
            return;
        }
        const t = window.setTimeout(() => setStoppedAt(null), rest);
        return () => window.clearTimeout(t);
    }, [stoppedAt]);

    let status: string;
    let short: string;
    if (busy) {
        status = state.direction === 'up' ? 'fährt auf' : state.direction === 'down' ? 'fährt zu' : 'fährt';
        short = status;
    } else if (closed === null) {
        status = 'unbekannt';
        short = '–';
    } else if (state.isEstimate) {
        status = `~ ${Math.round(closed)} % zu`;
        short = `~${Math.round(closed)} %`;
    } else if (closed <= 3) {
        status = 'Offen';
        short = 'Offen';
    } else if (closed >= 97) {
        status = 'Geschlossen';
        short = 'Zu';
    } else {
        status = `${Math.round(closed)} % zu`;
        short = `${Math.round(closed)} %`;
    }
    const slat = device.slatDp && state.slatAckedPos !== null ? state.slatAckedPos : null;
    if (slat !== null && !busy) status += ` · ${slat}°`;

    const open = () => {
        if (!device.upDp) return;
        setState(device.upDp, true, { diag: true });
        markPending(device.key, device.invertPosition ? 0 : 100, state.lastKnownAckedPos);
        setStoppedAt(null);
    };
    const stop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true, { diag: true });
        clearPending(device.key);
        setStoppedAt(Date.now());
    };
    const close = () => {
        if (!device.downDp) return;
        setState(device.downDp, true, { diag: true });
        markPending(device.key, device.invertPosition ? 100 : 0, state.lastKnownAckedPos);
        setStoppedAt(null);
    };

    return {
        closed,
        status,
        short,
        busy,
        dir: state.direction,
        unknown: closed === null,
        estimate: state.isEstimate,
        offline,
        slat,
        open,
        stop,
        close,
    };
}
