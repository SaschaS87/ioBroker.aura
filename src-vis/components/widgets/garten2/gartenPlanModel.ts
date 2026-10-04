/**
 * Datenmodell des Garten-Zeitplans in ioBroker (Feature 24).
 *
 * Der Zeitplan liegt NICHT mehr im Dashboard bzw. in aura.X.timers.*, sondern
 * als JSON in drei Datenpunkten unter einer Wurzel (Dev: 0_userdata.0.Garten_Dev,
 * live: 0_userdata.0.Garten):
 *
 *   <Wurzel>.Zeitplan       Liste der Termine (GartenPlanEntry[])
 *   <Wurzel>.Einstellungen  { aktiv, scharf: {Kreis: bool}, ansaat: {Kreis: bool} }
 *   <Wurzel>.Status         schreibt nur das Skript (Version, letzterTick, ...)
 *
 * Ausgeloest wird vom ioBroker-Skript iobroker-scripts/garten/Garten_Zeitplan.js.
 *
 * WICHTIG: parallel zu iobroker-scripts/garten/Garten_Zeitplan.js pflegen. Das
 * Skript kann dieses TypeScript nicht importieren und hat deshalb einen
 * eigenstaendigen Nachbau von normalizeEntry/parseZeitplan/parseEinstellungen.
 * Aenderungen an einem der beiden Orte IMMER auch am anderen nachziehen, sonst
 * laufen Frontend-Parser und Skript-Parser auseinander.
 *
 * Ein Termin hat dieselbe Form wie ein TimerEvent des Garten-Tabs plus `kreis`,
 * damit GartenEventModal und GartenScheduleList unveraendert weiterlaufen.
 */
import type { TimerEvent, TimerWeekday } from '../../../types';
import { clampMinutes } from '../garten/gartenConstants';

/** Ein Termin: TimerEvent plus der Kreis (sprinkleName, z. B. "Rasen_Küche"). */
export type GartenPlanEntry = TimerEvent & { kreis: string };

export interface GartenPlanSettings {
    /** Technischer Hauptschalter des Ausfuehrers (Skript): false = Skript loest nichts aus. */
    aktiv: boolean;
    /** Zeitplan je Kreis scharf. Fehlender Kreis gilt als scharf (nur `false` schaltet ab). */
    scharf: Record<string, boolean>;
    /** Neuansaat je Kreis: Termine laufen dann auch im Verdunstungsmodus (autoOn=true). */
    ansaat: Record<string, boolean>;
}

export const DEFAULT_GARTEN_SETTINGS: GartenPlanSettings = {
    aktiv: false,
    scharf: {},
    ansaat: {},
};

export interface GartenParseResult<T> {
    value: T;
    error: string | null;
}

const WEEKDAYS: TimerWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Prueft und bereinigt einen einzelnen Termin. Gibt null zurueck, wenn er
 * unbrauchbar ist (Skript und Frontend ueberspringen ihn dann).
 * - Dauer ueber clampMinutes auf 1…59 (zweite Schranke neben dem Eingabefeld)
 * - Ausloeser nur `time` (Stunde 0…23, Minute 0…59), Filter immer `all-days`
 * - `enabled` zaehlt nur bei echtem `true`
 */
export function normalizeEntry(v: unknown): GartenPlanEntry | null {
    if (!isRecord(v)) return null;
    if (typeof v.id !== 'string' || !v.id) return null;
    if (typeof v.kreis !== 'string' || !v.kreis) return null;
    if (!isRecord(v.trigger) || v.trigger.kind !== 'time') return null;
    const hour = Number(v.trigger.hour);
    const minute = Number(v.trigger.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (typeof v.value !== 'string' && typeof v.value !== 'number') return null;
    if (!Array.isArray(v.weekdays)) return null;
    const weekdays = WEEKDAYS.filter((d) => (v.weekdays as unknown[]).includes(d));
    const out: GartenPlanEntry = {
        id: v.id,
        kreis: v.kreis,
        enabled: v.enabled === true,
        weekdays,
        trigger: { kind: 'time', hour, minute },
        filter: 'all-days',
        value: String(clampMinutes(v.value)),
    };
    if (typeof v.label === 'string' && v.label) out.label = v.label;
    return out;
}

/** Liest den `Zeitplan`-Datenpunkt. Einzelne kaputte Termine werden uebersprungen,
 *  kaputtes JSON ergibt eine leere Liste plus Fehlertext. Wirft nie. */
export function parseZeitplan(raw: string | null | undefined): GartenParseResult<GartenPlanEntry[]> {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return { value: [], error: null };
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        return { value: [], error: `Ungültiges JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!Array.isArray(parsed)) return { value: [], error: 'Erwartete eine JSON-Liste (Array)' };
    const entries = parsed.map(normalizeEntry).filter((e): e is GartenPlanEntry => e !== null);
    const skipped = parsed.length - entries.length;
    return { value: entries, error: skipped > 0 ? `${skipped} Termin(e) übersprungen (falsches Format)` : null };
}

function boolMap(v: unknown): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (!isRecord(v)) return out;
    for (const [k, val] of Object.entries(v)) if (typeof val === 'boolean') out[k] = val;
    return out;
}

/** Liest den `Einstellungen`-Datenpunkt. Faellt bei kaputtem/leerem JSON auf die
 *  Standardwerte zurueck (aktiv=false), wirft nie. */
export function parseEinstellungen(raw: string | null | undefined): GartenParseResult<GartenPlanSettings> {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return { value: DEFAULT_GARTEN_SETTINGS, error: null };
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        return {
            value: DEFAULT_GARTEN_SETTINGS,
            error: `Ungültiges JSON: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
    if (!isRecord(parsed)) return { value: DEFAULT_GARTEN_SETTINGS, error: 'Erwartete ein JSON-Objekt' };
    return {
        value: {
            aktiv: parsed.aktiv === true,
            scharf: boolMap(parsed.scharf),
            ansaat: boolMap(parsed.ansaat),
        },
        error: null,
    };
}

/** Schluessel eines Termins fuer die Kollisionserkennung: "wochentag|HH:MM"
 *  (Kopie aus garten/GartenWidget.tsx). */
export function slotKeys(ev: TimerEvent): string[] {
    if (ev.trigger.kind !== 'time') return [];
    const hhmm = `${String(ev.trigger.hour).padStart(2, '0')}:${String(ev.trigger.minute).padStart(2, '0')}`;
    return ev.weekdays.map((d) => `${d}|${hhmm}`);
}
