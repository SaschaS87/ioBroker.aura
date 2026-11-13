/**
 * UI-Facelift, Entwurfsphase Heizung (nur Dev-Vorschau): Welcher Entwurf der Heizungs-Seite gezeigt wird.
 * Der gelbe Umschalter (FaceliftChrome) zeigt die Buchstaben nur auf der Heizungs-Seite und nur bei „Neu".
 * „ALT" ist die heutige Seite (Statuskarte, Kacheln, Klappboxen) im neuen Rahmen. Die Wahl liegt in
 * localStorage.
 *
 * Nur `zustand` und `react` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { create } from 'zustand';
import { useFaceliftVariant } from '../../layout/facelift/faceliftVariant';

export type HeizungDraft = 'ALT' | 'E' | 'F' | 'G';

export const HEIZUNG_DRAFTS: { key: HeizungDraft; label: string; name: string }[] = [
    { key: 'ALT', label: 'Alt', name: 'Heutige Seite' },
    // Runde 2 (13.11.2026): Kopf aus C, Auswertungen als Unterseiten (aus B); offen ist nur die Form der
    // aktuellen Werte. Runde 1 (A–D) steht in Commit 4673aa9de.
    { key: 'E', label: 'E', name: 'Werte als Liste mit Symbolen' },
    { key: 'F', label: 'F', name: 'Werte als Kacheln' },
    { key: 'G', label: 'G', name: 'Werte als schlichte Zeilen' },
];

const KEY = 'aura.heizung.facelift';

function read(): HeizungDraft {
    try {
        const v = localStorage.getItem(KEY);
        // Unbekannte Werte (spätere Runden) fallen auf den ersten Entwurf zurück
        return HEIZUNG_DRAFTS.some((d) => d.key === v) ? (v as HeizungDraft) : 'E';
    } catch {
        return 'E';
    }
}

export const useHeizungDraftStore = create<{ draft: HeizungDraft; setDraft: (d: HeizungDraft) => void }>((set) => ({
    draft: read(),
    setDraft: (draft) => {
        set({ draft });
        try {
            localStorage.setItem(KEY, draft);
        } catch {
            /* privater Modus */
        }
    },
}));

/** Aktiver Heizungs-Entwurf; null bei „Ist", bei „Alt" und im Pi-Build. */
export function useHeizungDraft(): Exclude<HeizungDraft, 'ALT'> | null {
    const flv = useFaceliftVariant();
    const draft = useHeizungDraftStore((s) => s.draft);
    if (!import.meta.env.DEV || !flv || draft === 'ALT') return null;
    return draft;
}

/**
 * Betrieb zum Ansehen nachstellen (nur Dev-Vorschau, nicht gespeichert): „Echt" zeigt die Werte vom Pi, die
 * anderen Szenen setzen Betrieb, Verdichter, Pumpe/Abtauen/Heizstab und Beispielwerte nur in der Anzeige.
 */
export type HeizungScene = 'ECHT' | 'HEIZEN' | 'WASSER' | 'BEREIT' | 'ABTAUEN';
export const HEIZUNG_SCENES: { key: HeizungScene; label: string }[] = [
    { key: 'ECHT', label: 'Echt' },
    { key: 'HEIZEN', label: 'Heizen' },
    { key: 'WASSER', label: 'Wasser' },
    { key: 'BEREIT', label: 'Bereit' },
    { key: 'ABTAUEN', label: 'Abtauen' },
];
export const useHeizungSceneStore = create<{ scene: HeizungScene; setScene: (s: HeizungScene) => void }>((set) => ({
    scene: 'ECHT',
    setScene: (scene) => set({ scene }),
}));

/**
 * Runde 3 (13.11.2026): Kopf-Karte getrennt wählbar, unabhängig von der Form der Werte (E/F/G).
 * A–D sind die Köpfe aus Runde 1 (nicht eingefärbt, B nur zart), 1–15 färben die ganze Karte in der
 * Betriebsfarbe (Heizen grün, Warmwasser blau); bei „Bereit" bleibt die Karte neutral.
 *   lay  = Aufbau,  fill = Art der Einfärbung
 */
export type HeizungHeadLay = 'row' | 'pills' | 'hero' | 'mark' | 'line' | 'list' | 'value';
export type HeizungHeadFill = 'none' | 'soft' | 'solid' | 'tint' | 'grad' | 'edge' | 'glow';
export const HEIZUNG_HEADS: { key: string; name: string; lay: HeizungHeadLay; fill: HeizungHeadFill }[] = [
    { key: 'A', name: 'Runde 1: Liste mit Ein/Aus', lay: 'list', fill: 'none' },
    { key: 'B', name: 'Runde 1: Status groß, zart getönt', lay: 'hero', fill: 'soft' },
    { key: 'C', name: 'Runde 1: Zeile mit Marken', lay: 'row', fill: 'none' },
    { key: 'D', name: 'Runde 1: eine Zeile', lay: 'line', fill: 'none' },
    { key: '1', name: 'Zeile mit Marken, kräftig', lay: 'row', fill: 'solid' },
    { key: '2', name: 'Zeile mit Marken, zart', lay: 'row', fill: 'tint' },
    { key: '3', name: 'Zeile mit Marken, Farbverlauf', lay: 'row', fill: 'grad' },
    { key: '4', name: 'Zeile mit Marken, zart mit Rand', lay: 'row', fill: 'edge' },
    { key: '5', name: 'Zeile mit Marken, Schein aus der Ecke', lay: 'row', fill: 'glow' },
    { key: '6', name: 'Marken als Kapseln, kräftig', lay: 'pills', fill: 'solid' },
    { key: '7', name: 'Status groß, kräftig', lay: 'hero', fill: 'solid' },
    { key: '8', name: 'Status groß, zart', lay: 'hero', fill: 'tint' },
    { key: '9', name: 'Status groß, Farbverlauf', lay: 'hero', fill: 'grad' },
    { key: '10', name: 'Großes Symbol im Hintergrund, kräftig', lay: 'mark', fill: 'solid' },
    { key: '11', name: 'Großes Symbol im Hintergrund, Farbverlauf', lay: 'mark', fill: 'grad' },
    { key: '12', name: 'Eine Zeile, kräftig', lay: 'line', fill: 'solid' },
    { key: '13', name: 'Eine Zeile, zart', lay: 'line', fill: 'tint' },
    { key: '14', name: 'Liste mit Ein/Aus, kräftig', lay: 'list', fill: 'solid' },
    { key: '15', name: 'Vorlauf groß daneben, Farbverlauf', lay: 'value', fill: 'grad' },
];

const HEAD_KEY = 'aura.heizung.kopf';
function readHead(): string {
    try {
        const v = localStorage.getItem(HEAD_KEY);
        return HEIZUNG_HEADS.some((h) => h.key === v) ? (v as string) : '1';
    } catch {
        return '1';
    }
}
export const useHeizungHeadStore = create<{ head: string; setHead: (h: string) => void }>((set) => ({
    head: readHead(),
    setHead: (head) => {
        set({ head });
        try {
            localStorage.setItem(HEAD_KEY, head);
        } catch {
            /* privater Modus */
        }
    },
}));
