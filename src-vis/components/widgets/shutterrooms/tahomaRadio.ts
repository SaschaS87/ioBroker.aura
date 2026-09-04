/**
 * Ableitung der drei TaHoma-Funk-States aus dem vorhandenen Positions-Datenpunkt
 * (posDp) eines Antriebs, plus kleine Helfer rund um deren Werte.
 *
 * Belegt am 02.09.2026 live gegen alle 15 Antriebe (siehe Feature 16 – Funkzeile
 * und Signalstärke-Box):
 *  - core:StatusState        → 'available' | 'unavailable' (String)
 *  - core:RSSILevelState     → Zahl 0–100
 *  - core:DiscreteRSSILevelState → 'good' | 'normal' | 'low' (klein geschrieben)
 */

import { splitDpRef } from '../../../utils/dpRef';

const CLOSURE_SUFFIX = '.states.core:ClosureState';

export interface RadioDps {
    statusDp: string;
    rssiDp: string;
    discreteDp: string;
}

/**
 * Leitet aus einem posDp (…states.core:ClosureState) die drei Funk-Datenpunkte
 * desselben Antriebs ab. Liefert null, wenn posDp nicht auf ClosureState endet –
 * lieber nichts anzeigen als eine erfundene ID abonnieren.
 */
export function radioDpsFromPosDp(posDp: string): RadioDps | null {
    const { id } = splitDpRef(posDp);
    if (!id.endsWith(CLOSURE_SUFFIX)) return null;

    const base = id.slice(0, -CLOSURE_SUFFIX.length);
    return {
        statusDp: `${base}.states.core:StatusState`,
        rssiDp: `${base}.states.core:RSSILevelState`,
        discreteDp: `${base}.states.core:DiscreteRSSILevelState`,
    };
}

export type RadioLevel = 'good' | 'normal' | 'low' | null;

/** Case-insensitiver Vergleich gegen die drei gemessenen Discrete-Werte. */
export function radioLevel(val: unknown): RadioLevel {
    if (typeof val !== 'string') return null;
    const lower = val.toLowerCase();
    if (lower === 'good' || lower === 'normal' || lower === 'low') return lower;
    return null;
}

/**
 * true nur, wenn ein String vorliegt und dieser nicht 'available' ist.
 * Fehlender/null-Wert ergibt false (kein Fehlalarm ohne Beleg).
 */
export function isRadioOffline(statusVal: unknown): boolean {
    return typeof statusVal === 'string' && statusVal !== 'available';
}

export const RADIO_COLOR: Record<'good' | 'normal' | 'low', string | undefined> = {
    good: 'var(--accent-green)',
    normal: undefined,
    low: 'var(--accent-yellow)',
};

/**
 * Uhrzeit aus einem Unix-Zeitstempel (ms). Anders als localTime() in
 * utils/formatTime.ts, das einen ISO-String erwartet, arbeitet die Funkzeile
 * mit den ts/lc-Zahlen aus dem State direkt.
 */
export function clockTime(ts: number): string {
    if (ts <= 0) return '';
    return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
