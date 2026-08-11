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
}

export const PendingContext = createContext<PendingStore | null>(null);

export const usePendingStore = () => {
    const ctx = useContext(PendingContext);
    if (!ctx) throw new Error('usePendingStore must be used within ShutterRoomsWidget');
    return ctx;
};

interface ShutterDeviceState {
    ackedPos: number | null;
    lastKnownAckedPos: number | null;
    posOpen: number | null;
    isUnknown: boolean;
    isMoving: boolean;
    isActing: boolean;
    slatAckedPos: number | null;
    isSlatUnknown: boolean;
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

    // Position invertieren
    const posOpen = ackedPos !== null ? (dev.invertPosition ? 100 - ackedPos : ackedPos) : null;

    // Pending State auslesen
    const pendingEntry = store.pending[dev.key];
    const isActing = !!pendingEntry;

    // isMoving: aus ActivityDP wenn vorhanden, sonst aus pendingEntry
    const isMoving = dev.activityDp ? !!activityVal : isActing;

    // Toleranzband ±3%: wenn Position nah bei Ziel, Pending zurücksetzen
    useEffect(() => {
        if (pendingEntry && ackedPos !== null) {
            const targetRaw = pendingEntry.targetRaw;
            if (targetRaw !== null && Math.abs(ackedPos - targetRaw) <= 3) {
                store.clearPending(dev.key);
            }
        }
    }, [ackedPos, pendingEntry, dev.key, store]);

    return {
        ackedPos,
        lastKnownAckedPos: lastKnownRef.current,
        posOpen,
        isUnknown: ackedPos === null,
        isMoving,
        isActing,
        slatAckedPos,
        isSlatUnknown: slatAckedPos === null,
    };
};
