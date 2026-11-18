/**
 * Hilfen der Garten-Seite für den laufenden Kreis. Die frühere Hero-Kachel des Garten2-Steuerpults ist mit der
 * Umstellung auf das Facelift entfallen (UI-Facelift, 18.11.2026); GartenFacelift braucht nur noch diese beiden.
 *
 * Die Wassermenge ist ein FESTER Platzhalter ("999 l", bewusst offensichtlich falsch) — Sascha wollte die
 * echte Berechnung aus `pipeFlow` (l/h) erst in einem späteren Schritt, siehe Feature-Doku.
 */

/** Platzhalter-Wassermenge — bewusst nicht aus pipeFlow berechnet, siehe Kopf. */
export const PLACEHOLDER_WATER_AMOUNT = '999 l';

/** "09:45" -> 585. Unbekanntes/leeres Format liefert null. */
export function countdownToSeconds(countdown: string): number | null {
    const m = /^(\d+):(\d{2})$/.exec(countdown.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}
