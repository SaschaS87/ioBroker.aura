/**
 * „Letzte Fahrten" – Entwürfe (nur Dev-Vorschau, nie im Build).
 *
 * Liest das Fahrtenprotokoll, das das Skript `Rollladen_Wochenplan` schon führt
 * (`<root>.Status` → `letzte30`), und macht daraus Läufe zum Anzeigen. Namen von
 * Szenen und Zeitpunkten kommen aus `<root>.Szenen` und `<root>.Wochenplan`.
 *
 * Wichtig für die Entwürfe: Die Dev-Vorschau liest hier bewusst den ECHTEN Stand
 * `0_userdata.0.Rollladen` (nur lesen, kein Schreiben). Das Dev-Skript unter
 * `Rollladen_Dev` läuft im Trockenlauf und hat nur Testeinträge.
 */
import { useMemo } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { useFahrtenDraftStore } from './fahrtenDraft';

export const LIVE_ROOT = '0_userdata.0.Rollladen';

export type ZielStatus = 'gefahren' | 'stand' | 'fehler' | 'abgebrochen' | 'trocken' | 'unbekannt';
export type LaufArt = 'plan' | 'befehl' | 'abbruch' | 'unbekannt';

export interface LaufZiel {
    key: string;
    label: string;
    floor: string;
    kind: 'fenster' | 'dachfenster' | 'raffstore';
    status: ZielStatus;
    /** % zu, das Ziel */
    ziel: number | null;
    /** % zu, Stand VOR dem Befehl */
    ist: number | null;
    leise: boolean;
    lamelle: { status: ZielStatus; ziel: number | null; ist: number | null } | null;
    meldung: string;
}

export interface Lauf {
    id: string;
    zeit: Date;
    art: LaufArt;
    /** Was gefahren ist: Szenenname, Name des Zeitpunkts, Gerät */
    titel: string;
    /** Wodurch: „Zeitplan 06:10", „Aus der App", „Abbruch" */
    quelle: string;
    /** kurz für Unterzeilen: „Zeitplan", „App", „Abbruch" */
    quelleKurz: string;
    ziele: LaufZiel[];
    n: { gefahren: number; stand: number; fehler: number; abgebrochen: number; trocken: number };
    abgebrochen: boolean;
    hinweis: string | null;
    /** schlechtester Zustand des Laufs, für Symbolfarbe */
    lage: 'ok' | 'warn' | 'fehler';
}

interface RawZiel {
    aktion?: string;
    ziel?: number;
    ist?: number;
    ergebnis?: string;
    leise?: boolean;
}
interface RawEintrag {
    zeit?: string;
    auslöser?: string;
    ziele?: { key: string; position?: RawZiel | null; lamelle?: RawZiel | null }[];
    hinweis?: string;
    abgebrochen?: boolean;
    trockenlauf?: boolean;
}

function zielStatus(e: string | undefined): ZielStatus {
    if (!e) return 'unbekannt';
    if (e.startsWith('gesendet')) return 'gefahren';
    if (e.startsWith('bereits')) return 'stand';
    if (e.startsWith('fehlgeschlagen')) return 'fehler';
    if (e.startsWith('abgebrochen')) return 'abgebrochen';
    if (e.startsWith('würde')) return 'trocken';
    return 'unbekannt';
}

const RANG: Record<ZielStatus, number> = { stand: 0, gefahren: 1, trocken: 1, unbekannt: 2, abgebrochen: 3, fehler: 4 };

/** Erfundener Fehler (jüngster Zeitplan-Lauf, erster gefahrener Rollladen) und ein Abbruch – klar markiert */
function mitBeispiel(list: RawEintrag[]): RawEintrag[] {
    const out = list.map((e) => ({
        ...e,
        ziele: e.ziele?.map((z) => ({ ...z, position: z.position ? { ...z.position } : z.position })),
    }));
    const plan = out.find(
        (e) => /^Plan /.test(e.auslöser ?? '') && e.ziele?.some((z) => z.position?.ergebnis?.startsWith('gesendet')),
    );
    const z = plan?.ziele?.find((x) => x.position?.ergebnis?.startsWith('gesendet'));
    if (z?.position) z.position.ergebnis = 'fehlgeschlagen nach 3 Versuchen: BEISPIEL, erfunden';
    if (out.length > 1) {
        const t = new Date(new Date(out[1].zeit ?? 0).getTime() + 20_000).toISOString();
        const sc = /Szene "([^"]+)"/.exec(out[1].auslöser ?? '')?.[1] ?? 'x';
        out.splice(1, 0, {
            zeit: t,
            auslöser: `Abbruch → Szene "${sc}"`,
            ziele: [],
            hinweis: 'BEISPIEL: 1 Lauf gestoppt',
        });
    }
    return out;
}

function parse(raw: unknown): RawEintrag[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const s = JSON.parse(raw) as { letzte30?: RawEintrag[] };
        return Array.isArray(s.letzte30) ? s.letzte30 : [];
    } catch {
        return [];
    }
}

function parseList<T>(raw: unknown): T[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? (v as T[]) : [];
    } catch {
        return [];
    }
}

interface RawScene {
    id: string;
    name: string;
}
interface RawEntry {
    id: string;
    name?: string;
    trigger?: { kind: string; time?: string; offset?: number };
}

function triggerText(t: RawEntry['trigger']): string {
    if (!t) return 'Zeitplan';
    if (t.kind === 'time') return `Zeitplan ${t.time ?? ''}`.trim();
    const off = t.offset ? ` ${t.offset > 0 ? '+' : '−'}${Math.abs(t.offset)} min` : '';
    if (t.kind === 'sunrise') return `Zeitplan, Sonnenaufgang${off}`;
    if (t.kind === 'sunset') return `Zeitplan, Sonnenuntergang${off}`;
    return 'Zeitplan';
}

/** Ersetzt `Szene "s-…"` und `Gerät "Key"` im Auslösertext durch lesbare Namen. */
function namen(text: string, sceneName: (id: string) => string | null, devLabel: (k: string) => string | null): string {
    return text
        .replace(/Szene "([^"]+)"/g, (_m, id: string) => sceneName(id) ?? 'Szene (gelöscht)')
        .replace(/Gerät "([^"]+)"/g, (_m, k: string) => devLabel(k) ?? k)
        .replace(/^"(.*)"$/, '$1');
}

export function useFahrtenLog(floors: ShutterFloorDef[]): { laeufe: Lauf[]; geladen: boolean } {
    const status = useDatapoint(`${LIVE_ROOT}.Status`);
    const szenen = useDatapoint(`${LIVE_ROOT}.Szenen`);
    const plan = useDatapoint(`${LIVE_ROOT}.Wochenplan`);
    const beispiel = useFahrtenDraftStore((s) => s.beispiel);

    const laeufe = useMemo(() => {
        const devs = new Map(
            floors.flatMap((f) =>
                f.devices.map((d) => [d.key, { label: d.label, floor: f.name, kind: d.kind }] as const),
            ),
        );
        const scenes = parseList<RawScene>(szenen.value);
        const entries = parseList<RawEntry>(plan.value);
        const sceneName = (id: string) => scenes.find((s) => s.id === id)?.name ?? null;
        const devLabel = (k: string) => devs.get(k)?.label ?? null;

        const raw = parse(status.value);
        return (beispiel ? mitBeispiel(raw) : raw).map((e, i): Lauf => {
            const a = e.auslöser ?? '';
            let art: LaufArt = 'unbekannt';
            let titel = a;
            let quelle = '';
            let m: RegExpMatchArray | null;
            if ((m = a.match(/^Plan (\S+) → (.*)$/))) {
                art = 'plan';
                const entry = entries.find((x) => x.id === m![1]);
                titel = namen(m[2], sceneName, devLabel);
                quelle = entry ? triggerText(entry.trigger) : 'Zeitplan (Zeitpunkt gelöscht)';
            } else if ((m = a.match(/^Sofort-Befehl → (.*)$/))) {
                art = 'befehl';
                titel = namen(m[1], sceneName, devLabel);
                quelle = 'Aus der App';
            } else if ((m = a.match(/^Abbruch → (.*)$/))) {
                art = 'abbruch';
                titel = namen(m[1], sceneName, devLabel);
                quelle = 'Abbruch';
            }

            const ziele: LaufZiel[] = (e.ziele ?? []).map((z) => {
                const d = devs.get(z.key);
                const p = z.position ?? null;
                const l = z.lamelle ?? null;
                return {
                    key: z.key,
                    label: d?.label ?? z.key,
                    floor: d?.floor ?? '',
                    kind: d?.kind ?? 'fenster',
                    status: zielStatus(p?.ergebnis),
                    ziel: typeof p?.ziel === 'number' ? p.ziel : null,
                    ist: typeof p?.ist === 'number' ? p.ist : null,
                    leise: p?.leise === true,
                    lamelle: l
                        ? {
                              status: zielStatus(l.ergebnis),
                              ziel: typeof l.ziel === 'number' ? l.ziel : null,
                              ist: typeof l.ist === 'number' ? l.ist : null,
                          }
                        : null,
                    meldung: [p?.ergebnis, l?.ergebnis ? `Lamelle ${l.ergebnis}` : null].filter(Boolean).join(' · '),
                };
            });
            const n = { gefahren: 0, stand: 0, fehler: 0, abgebrochen: 0, trocken: 0 };
            let worst: ZielStatus = 'stand';
            for (const z of ziele) {
                // Ein Rollladen zählt als gefahren, wenn Position ODER Lamelle gesendet wurde
                const s = z.lamelle && RANG[z.lamelle.status] > RANG[z.status] ? z.lamelle.status : z.status;
                if (s === 'gefahren') n.gefahren++;
                else if (s === 'stand') n.stand++;
                else if (s === 'fehler') n.fehler++;
                else if (s === 'abgebrochen') n.abgebrochen++;
                else if (s === 'trocken') n.trocken++;
                if (RANG[s] > RANG[worst]) worst = s;
            }
            const abgebr = e.abgebrochen === true;
            const lage: Lauf['lage'] =
                worst === 'fehler' ? 'fehler' : abgebr || worst === 'abgebrochen' || art === 'abbruch' ? 'warn' : 'ok';
            return {
                id: `${e.zeit ?? ''}#${i}`,
                zeit: new Date(e.zeit ?? 0),
                art,
                titel,
                quelle,
                quelleKurz: art === 'plan' ? 'Zeitplan' : art === 'befehl' ? 'App' : art === 'abbruch' ? 'Abbruch' : '',
                ziele,
                n,
                abgebrochen: abgebr,
                hinweis: e.hinweis ?? null,
                lage,
            };
        });
    }, [status.value, szenen.value, plan.value, floors, beispiel]);

    return { laeufe, geladen: status.state !== null };
}

// ── Anzeige-Helfer ─────────────────────────────────────────────────────

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayStart(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** „Heute", „Gestern", „Mi, 18.11." */
export function tagText(d: Date, now = new Date()): string {
    const diff = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Gestern';
    return `${WD[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/** „Heute 19:00" bzw. „Mi 18.11. 19:00" */
export function wannText(d: Date, now = new Date()): string {
    return `${tagText(d, now).replace(',', '')} ${hhmm(d)}`;
}

export function nachTag(laeufe: Lauf[]): { tag: string; laeufe: Lauf[] }[] {
    const out: { tag: string; laeufe: Lauf[] }[] = [];
    for (const l of laeufe) {
        const t = tagText(l.zeit);
        const last = out[out.length - 1];
        if (last && last.tag === t) last.laeufe.push(l);
        else out.push({ tag: t, laeufe: [l] });
    }
    return out;
}

/** Kurzfassung für Unterzeilen: „2 von 15 gefahren", „1 Fehler · 2 von 15 gefahren" */
export function ergebnisKurz(l: Lauf): string {
    if (l.art === 'abbruch') return l.hinweis ?? 'Abgebrochen';
    if (!l.ziele.length) return l.hinweis ?? 'Keine Rollläden';
    const bewegt = l.n.gefahren + l.n.trocken;
    const p: string[] = [];
    if (l.n.fehler) p.push(`${l.n.fehler} Fehler`);
    if (l.n.abgebrochen) p.push(`${l.n.abgebrochen} abgebrochen`);
    p.push(bewegt === l.ziele.length ? `alle ${bewegt} gefahren` : `${bewegt} von ${l.ziele.length} gefahren`);
    return p.join(' · ');
}

/** Langfassung eines Laufs: „2 gefahren, 13 standen schon" */
export function ergebnisText(l: Lauf): string {
    if (l.art === 'abbruch') return l.hinweis ?? 'Abgebrochen';
    if (!l.ziele.length) return l.hinweis ?? 'Keine Rollläden';
    const p: string[] = [];
    if (l.n.fehler) p.push(`${l.n.fehler} Fehler`);
    if (l.n.abgebrochen) p.push(`${l.n.abgebrochen} abgebrochen`);
    if (l.n.gefahren) p.push(`${l.n.gefahren} gefahren`);
    if (l.n.trocken) p.push(`${l.n.trocken} Probelauf`);
    if (l.n.stand) p.push(`${l.n.stand} ${l.n.stand === 1 ? 'stand' : 'standen'} schon`);
    return p.join(', ');
}

export function zielText(z: LaufZiel): string {
    const pos = (v: number | null) => (v === null ? '–' : v === 0 ? 'offen' : v === 100 ? 'zu' : `${v} % zu`);
    const lam = z.lamelle ? ` · Lamelle ${z.lamelle.ziel ?? '–'}°` : '';
    switch (z.status) {
        case 'stand':
            return z.lamelle?.status === 'gefahren'
                ? `stand schon ${pos(z.ziel)}, Lamelle auf ${z.lamelle.ziel ?? '–'}°`
                : `stand schon ${pos(z.ziel)}${lam}`;
        case 'gefahren':
            return `${pos(z.ist)} → ${pos(z.ziel)}${lam}${z.leise ? ' · leise' : ''}`;
        case 'fehler':
            return `nicht angekommen (3 Versuche) · Ziel ${pos(z.ziel)}`;
        case 'abgebrochen':
            return `abgebrochen · Ziel ${pos(z.ziel)}`;
        case 'trocken':
            return `Probelauf · würde ${pos(z.ziel)} fahren`;
        default:
            return z.meldung || '–';
    }
}

/** Status eines Rollladens im Lauf, Lamelle eingerechnet */
export function zielLage(z: LaufZiel): ZielStatus {
    return z.lamelle && RANG[z.lamelle.status] > RANG[z.status] ? z.lamelle.status : z.status;
}
