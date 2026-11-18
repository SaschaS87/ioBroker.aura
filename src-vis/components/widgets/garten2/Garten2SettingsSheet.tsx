/**
 * Grenzen der Regensperre (`native.thresholdRain` der Adapter-Instanz). Das frühere Einstellungen-Pop-up ist mit
 * der Umstellung auf das Facelift entfallen (UI-Facelift, 18.11.2026): Die Unterseite „Einstellungen" in
 * GartenFacelift.tsx nutzt nur noch diese Grenzen.
 *
 * Die Regensperre ist KEIN normaler State, sondern ein Feld der Adapter-Instanz-Konfiguration — geschrieben über
 * `extendObjectDirect('system.adapter.<instance>', { native: {...} })`. Sascha's Vorgabe vom 22.09.2026:
 * **immer** eine Bestätigung vor dem Schreiben, UND gesperrt, solange irgendein Kreis `valveOn === true` ist.
 */
export const MIN_THRESHOLD = 0;
export const MAX_THRESHOLD = 20;
export const STEP = 0.1;

export function clampThreshold(n: number): number {
    if (!Number.isFinite(n)) return 0;
    const rounded = Math.round(n * 10) / 10;
    if (rounded < MIN_THRESHOLD) return MIN_THRESHOLD;
    if (rounded > MAX_THRESHOLD) return MAX_THRESHOLD;
    return rounded;
}
