/**
 * UI-Facelift, Entwurfsphase Wetter (nur Dev-Vorschau): Welcher Entwurf der Wetter-Seite gezeigt wird.
 * Der gelbe Umschalter (FaceliftChrome) zeigt die Buchstaben nur auf der Wetter-Seite und nur bei „Neu".
 * „ALT" ist die heutige Seite (Statuskarte, Tagesstreifen, Kennzahlen-Blöcke, Regen-Karten) im neuen Rahmen.
 * Die Wahl liegt in localStorage.
 *
 * Nur `zustand` und `react` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { create } from 'zustand';
import { useFaceliftVariant } from '../../layout/facelift/faceliftVariant';

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

export const useWetterDraftStore = create<{ draft: WetterDraft; setDraft: (d: WetterDraft) => void }>((set) => ({
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

/** Aktiver Wetter-Entwurf; null bei „Ist", bei „Alt" und im Pi-Build. */
export function useWetterDraft(): Exclude<WetterDraft, 'ALT'> | null {
    const flv = useFaceliftVariant();
    const draft = useWetterDraftStore((s) => s.draft);
    if (!import.meta.env.DEV || !flv || draft === 'ALT') return null;
    return draft;
}
