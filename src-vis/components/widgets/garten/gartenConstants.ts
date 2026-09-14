/**
 * Konstanten und kleine Helfer des Garten-Widgets.
 *
 * Der 59-Minuten-Deckel ist kein Geschmacksurteil: Das Blockly-Skript
 * `SprinkleControl_Hilfsfunktion` schickt fest 3540 Sekunden an die
 * Gardena-Box, die danach von selbst schliesst. Eine laengere Dauer wuerde
 * still gekappt — deshalb klemmt das Frontend sie an drei Stellen ab
 * (Eingabefeld, Speichern, Publish).
 */

/** Hoechste Dauer, die die Gardena-Box durchhaelt (Blockly sendet fest 3540 s). */
export const MAX_MINUTES = 59;
/** Kuerzeste sinnvolle Dauer — 0 waere ein Abschaltbefehl, kein Termin. */
export const MIN_MINUTES = 1;
/** Vorschlag im Handbetrieb, wenn die Widget-Option nichts anderes sagt. */
export const DEFAULT_MANUAL_MINUTES = 10;

export const MAX_MINUTES_HINT =
    'Höchstens 59 Minuten. Die Gardena-Box schließt nach 59 Minuten selbst — längere Termine würden still gekappt.';
export const PARALLEL_HINT = 'Es läuft immer nur ein Kreis. Weitere Termine warten und starten nacheinander.';
export const TIMER_MODE_MOISTURE_HINT = 'Wird im Zeitplan-Modus nicht nachgeführt.';

/**
 * Minuten auf 1…59 klemmen. Alles, was keine Zahl ergibt (leeres Feld, Text,
 * `null`), wird zu MIN_MINUTES — nie zu 0, weil 0 im Adapter „aus“ bedeutet.
 */
export function clampMinutes(raw: unknown): number {
    const text = String(raw ?? '').replace(',', '.');
    const n = typeof raw === 'number' ? raw : Number(text.trim());
    if (!Number.isFinite(n)) return MIN_MINUTES;
    const rounded = Math.round(n);
    if (rounded < MIN_MINUTES) return MIN_MINUTES;
    if (rounded > MAX_MINUTES) return MAX_MINUTES;
    return rounded;
}

/**
 * Kanalschluessel eines Kreises: 'Rasen_Küche' -> 'rasen-kueche'.
 * Umlaute werden ausgeschrieben, alles ausserhalb von [a-z0-9-] wird zu '-'.
 * Der Wert bildet den zweiten Teil des Backend-Kanals (<seg>-<slug>).
 */
export function circleSlug(sprinkleName: string): string {
    return String(sprinkleName ?? '')
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');
}
