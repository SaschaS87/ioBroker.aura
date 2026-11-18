/**
 * Wetter-Entwürfe (nur Dev-Vorschau, nie im Build): Welcher Entwurf der Wetter-Seite gezeigt wird.
 * Der gelbe Umschalter (WetterDraftSwitch) zeigt die Buchstaben nur auf der Wetter-Seite. „ALT" ist die
 * heutige Seite (Statuskarte, Tagesstreifen, Kennzahlen-Blöcke, Regen-Karten). Die Wahl liegt in
 * localStorage.
 *
 * Alle Verwender hängen hinter import.meta.env.DEV; im Build bleibt davon nichts übrig.
 * Nur `zustand` importieren.
 */
import { create } from 'zustand';

export type WetterDraft = 'ALT' | 'A' | 'B' | 'C' | 'D';

export const WETTER_DRAFTS: { key: WetterDraft; label: string; name: string }[] = [
    { key: 'ALT', label: 'Alt', name: 'Heutige Seite' },
    { key: 'A', label: 'A', name: 'Liste, alles Weitere auf Unterseiten' },
    { key: 'B', label: 'B', name: 'Heute mit Diagramm' },
    { key: 'C', label: 'C', name: 'Kacheln' },
    { key: 'D', label: 'D', name: 'Eine Seite mit Reitern' },
];

const KEY = 'aura.wetter.facelift';

function read(): WetterDraft {
    try {
        const v = localStorage.getItem(KEY);
        // Unbekannte Werte (spätere Runden) fallen auf den ersten Entwurf zurück
        return WETTER_DRAFTS.some((d) => d.key === v) ? (v as WetterDraft) : 'A';
    } catch {
        return 'A';
    }
}

export const useWetterDraftStore = /* @__PURE__ */ create<{ draft: WetterDraft; setDraft: (d: WetterDraft) => void }>(
    (set) => ({
        draft: read(),
        setDraft: (draft) => {
            set({ draft });
            try {
                localStorage.setItem(KEY, draft);
            } catch {
                /* privater Modus */
            }
        },
    }),
);

/** Aktiver Wetter-Entwurf; null bei „Alt". */
export function useWetterDraft(): Exclude<WetterDraft, 'ALT'> | null {
    const draft = useWetterDraftStore((s) => s.draft);
    return draft === 'ALT' ? null : draft;
}
