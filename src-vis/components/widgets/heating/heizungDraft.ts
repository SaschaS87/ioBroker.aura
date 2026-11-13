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

export type HeizungDraft = 'ALT' | 'A' | 'B' | 'C' | 'D';

export const HEIZUNG_DRAFTS: { key: HeizungDraft; label: string; name: string }[] = [
    { key: 'ALT', label: 'Alt', name: 'Heutige Seite' },
    { key: 'A', label: 'A', name: 'Liste, Auswertungen als Pop-up' },
    { key: 'B', label: 'B', name: 'Status groß, Kacheln, Unterseiten' },
    { key: 'C', label: 'C', name: 'Aufklappen in der Karte' },
    { key: 'D', label: 'D', name: 'Alles auf einer Seite' },
];

const KEY = 'aura.heizung.facelift';

function read(): HeizungDraft {
    try {
        const v = localStorage.getItem(KEY);
        // Unbekannte Werte (spätere Runden) fallen auf den ersten Entwurf zurück
        return HEIZUNG_DRAFTS.some((d) => d.key === v) ? (v as HeizungDraft) : 'A';
    } catch {
        return 'A';
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
