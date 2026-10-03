/**
 * Persistenz-Layer des Garten-Zeitplans (Feature 24). Liest/schreibt zwei
 * JSON-Datenpunkte und liest einen dritten:
 *   ${root}.Zeitplan       — GartenPlanEntry[]            (lesen + schreiben)
 *   ${root}.Einstellungen  — GartenPlanSettings           (lesen + schreiben)
 *   ${root}.Status         — vom Skript geschrieben       (nur lesen)
 *
 * Anzeige läuft über useDatapoint (live, abonniert). Schreiben läuft NICHT über
 * den davon gelieferten (u. U. veralteten) React-State: jede Schreibfunktion
 * liest den aktuellen Datenpunktwert zuerst frisch über getStateDirect, ändert
 * darin NUR den betroffenen Eintrag per `id` bzw. Kreis und schreibt die
 * komplette Liste zurück — Schutz gegen die Race-Condition, wenn zwei Geräte
 * gleichzeitig Termine bearbeiten (Muster: useRollPlanData.ts).
 *
 * Beim Speichern läuft jeder Termin durch normalizeEntry (zweite Schranke für
 * den 59-Minuten-Deckel, die erste sitzt im Termin-Dialog).
 *
 * Ist der Datenpunkt beim frischen Lesen unlesbar (kaputtes JSON), wird NICHT
 * zurückgeschrieben — sonst würde ein Bedienfehler den Rest überschreiben.
 */
import { useEffect, useMemo, useState } from 'react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { getStateDirect, setStateDirect } from '../../../hooks/useIoBroker';
import {
    normalizeEntry,
    parseEinstellungen,
    parseZeitplan,
    DEFAULT_GARTEN_SETTINGS,
    type GartenPlanEntry,
    type GartenPlanSettings,
} from './gartenPlanModel';

/** Skript-Takt ist eine Minute; ab dieser Zeit ohne frischen Tick gilt das Skript als nicht aktiv. */
export const SCRIPT_STALE_MS = 3 * 60 * 1000;

/** Auswertung des Status-Datenpunkts (schreibt nur das Skript). */
export interface GartenPlanStatus {
    version: string | null;
    trockenlauf: boolean;
    /** Zeitpunkt des letzten Skript-Takts (Millisekunden seit 1970) oder null. */
    letzterTickMs: number | null;
    letzterFehler: string | null;
}

const EMPTY_STATUS: GartenPlanStatus = { version: null, trockenlauf: false, letzterTickMs: null, letzterFehler: null };

/** Tolerant: kaputtes/leeres JSON ergibt den leeren Status, wirft nie. */
export function parseStatus(raw: string | null | undefined): GartenPlanStatus {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return EMPTY_STATUS;
    try {
        const o: unknown = JSON.parse(trimmed);
        if (typeof o !== 'object' || o === null || Array.isArray(o)) return EMPTY_STATUS;
        const r = o as Record<string, unknown>;
        const tick = typeof r.letzterTick === 'string' ? Date.parse(r.letzterTick) : NaN;
        return {
            version: typeof r.version === 'string' ? r.version : null,
            trockenlauf: r.trockenlauf === true,
            letzterTickMs: Number.isNaN(tick) ? null : tick,
            letzterFehler: typeof r.letzterFehler === 'string' && r.letzterFehler ? r.letzterFehler : null,
        };
    } catch {
        return EMPTY_STATUS;
    }
}

export interface GartenPlanData {
    entries: GartenPlanEntry[];
    settings: GartenPlanSettings;
    status: GartenPlanStatus;
    /** null = beim letzten Lesen kein Fehler. */
    entriesError: string | null;
    settingsError: string | null;
    /** Einstellungen-Datenpunkt hat schon geantwortet (sonst keine Warnhinweise zeigen). */
    settingsLoaded: boolean;
    /** Status-Datenpunkt hat schon geantwortet. */
    statusLoaded: boolean;
    /** true = Status ist da, aber der letzte Skript-Takt ist älter als SCRIPT_STALE_MS. */
    scriptStale: boolean;
    saveEntry: (entry: GartenPlanEntry) => Promise<void>;
    deleteEntry: (id: string) => Promise<void>;
    toggleEntry: (id: string) => Promise<void>;
    setScharf: (kreis: string, scharf: boolean) => Promise<void>;
    setAnsaat: (kreis: string, ansaat: boolean) => Promise<void>;
}

async function readRawFresh(id: string): Promise<string> {
    const state = await getStateDirect(id);
    return typeof state?.val === 'string' ? state.val : '';
}

/** Frisch lesen; unlesbarer Inhalt (nicht leer, aber kein Ergebnis) → Fehler statt Überschreiben. */
async function readEntriesFresh(id: string): Promise<GartenPlanEntry[]> {
    const raw = await readRawFresh(id);
    const parsed = parseZeitplan(raw);
    if (parsed.error && parsed.value.length === 0 && raw.trim() !== '' && raw.trim() !== '[]') {
        throw new Error(`Zeitplan ist nicht lesbar (${parsed.error}) – nichts überschrieben`);
    }
    return parsed.value;
}

async function readSettingsFresh(id: string): Promise<GartenPlanSettings> {
    const raw = await readRawFresh(id);
    // Leer heißt: das Skript hat den Datenpunkt noch nie angelegt. Ein
    // Zurückschreiben würde dann aktiv=false (Standardwert) festschreiben.
    if (raw.trim() === '') throw new Error('Einstellungen fehlen (Skript noch nicht gestartet?) – nichts geschrieben');
    const parsed = parseEinstellungen(raw);
    if (parsed.error) throw new Error(`Einstellungen sind nicht lesbar (${parsed.error}) – nichts überschrieben`);
    return parsed.value;
}

export function useGartenPlanData(root: string): GartenPlanData {
    const entriesId = `${root}.Zeitplan`;
    const settingsId = `${root}.Einstellungen`;
    const statusId = `${root}.Status`;

    const entriesDp = useDatapoint(entriesId);
    const settingsDp = useDatapoint(settingsId);
    const statusDp = useDatapoint(statusId);

    const entriesRaw = entriesDp.value;
    const settingsRaw = settingsDp.value;
    const statusRaw = statusDp.value;

    const entriesParsed = useMemo(() => parseZeitplan(typeof entriesRaw === 'string' ? entriesRaw : ''), [entriesRaw]);
    const settingsParsed = useMemo(
        () => parseEinstellungen(typeof settingsRaw === 'string' ? settingsRaw : ''),
        [settingsRaw],
    );
    const status = useMemo(() => parseStatus(typeof statusRaw === 'string' ? statusRaw : ''), [statusRaw]);

    // „Jetzt" nie im Memo lesen (Gelernte Fallstricke, Abschnitt React): ein
    // Takt-State, damit „Skript läuft nicht" auch ohne neue Daten auftaucht.
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const t = globalThis.setInterval(() => setNowMs(Date.now()), 30_000);
        return () => globalThis.clearInterval(t);
    }, []);

    const statusLoaded = statusDp.state !== null;
    const scriptStale =
        statusLoaded && (status.letzterTickMs === null || nowMs - status.letzterTickMs > SCRIPT_STALE_MS);

    // Schreibfunktionen: IMMER zuerst frisch lesen, dann nur den betroffenen
    // Eintrag ersetzen/einfügen/löschen — nie die Liste aus entriesParsed
    // (Bildschirmzustand) zurückschreiben.
    async function saveEntry(entry: GartenPlanEntry): Promise<void> {
        const clean = normalizeEntry(entry);
        if (!clean) throw new Error('Termin ist unvollständig – nicht gespeichert');
        const current = await readEntriesFresh(entriesId);
        const next = current.some((e) => e.id === clean.id)
            ? current.map((e) => (e.id === clean.id ? clean : e))
            : [...current, clean];
        setStateDirect(entriesId, JSON.stringify(next));
    }

    async function deleteEntry(id: string): Promise<void> {
        const current = await readEntriesFresh(entriesId);
        const next = current.filter((e) => e.id !== id);
        setStateDirect(entriesId, JSON.stringify(next));
    }

    async function toggleEntry(id: string): Promise<void> {
        const current = await readEntriesFresh(entriesId);
        const next = current.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
        setStateDirect(entriesId, JSON.stringify(next));
    }

    async function patchSettings(patch: (cur: GartenPlanSettings) => GartenPlanSettings): Promise<void> {
        const current = await readSettingsFresh(settingsId);
        setStateDirect(settingsId, JSON.stringify(patch(current)));
    }

    const setScharf = (kreis: string, scharf: boolean) =>
        patchSettings((cur) => ({ ...cur, scharf: { ...cur.scharf, [kreis]: scharf } }));

    const setAnsaat = (kreis: string, ansaat: boolean) =>
        patchSettings((cur) => ({ ...cur, ansaat: { ...cur.ansaat, [kreis]: ansaat } }));

    return {
        entries: entriesParsed.value,
        settings: settingsParsed.value ?? DEFAULT_GARTEN_SETTINGS,
        status,
        entriesError: entriesParsed.error,
        settingsError: settingsParsed.error,
        settingsLoaded: settingsDp.state !== null,
        statusLoaded,
        scriptStale,
        saveEntry,
        deleteEntry,
        toggleEntry,
        setScharf,
        setAnsaat,
    };
}
