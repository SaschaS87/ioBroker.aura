/**
 * UI-Facelift, Entwurfsphase Wohnklima (nur Dev-Vorschau): Welcher Entwurf der Wohnklima-Seite gezeigt wird.
 * Der gelbe Umschalter (FaceliftChrome) zeigt die Buchstaben nur auf der Wohnklima-Seite und nur bei „Neu".
 * „ALT" ist die heutige Seite (Einzelbalken) im neuen Rahmen. Die Wahl liegt in localStorage.
 *
 * Nur `zustand` und `react` importieren, damit kein Import-Kreis über FaceliftChrome oder Dashboard entsteht.
 */
import { create } from 'zustand';
import { useFaceliftVariant } from '../../layout/facelift/faceliftVariant';

export type WohnklimaDraft = 'ALT' | 'A' | 'B' | 'C' | 'D';

export const WOHNKLIMA_DRAFTS: { key: WohnklimaDraft; label: string; name: string }[] = [
    { key: 'ALT', label: 'Alt', name: 'Heutige Balken' },
    { key: 'A', label: 'A', name: 'Liste je Etage' },
    { key: 'B', label: 'B', name: 'Raster in der Karte' },
    { key: 'C', label: 'C', name: 'Überblick und Tabelle' },
    { key: 'D', label: 'D', name: 'Etagen als Unterseiten' },
];

const KEY = 'aura.wohnklima.facelift';

function read(): WohnklimaDraft {
    try {
        const v = localStorage.getItem(KEY);
        // Unbekannte Werte (spätere Runden) fallen auf den ersten Entwurf zurück
        return WOHNKLIMA_DRAFTS.some((d) => d.key === v) ? (v as WohnklimaDraft) : 'A';
    } catch {
        return 'A';
    }
}

export const useWohnklimaDraftStore = create<{ draft: WohnklimaDraft; setDraft: (d: WohnklimaDraft) => void }>(
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

/** Aktiver Wohnklima-Entwurf; null bei „Ist", bei „Alt" und im Pi-Build. */
export function useWohnklimaDraft(): Exclude<WohnklimaDraft, 'ALT'> | null {
    const flv = useFaceliftVariant();
    const draft = useWohnklimaDraftStore((s) => s.draft);
    if (!import.meta.env.DEV || !flv || draft === 'ALT') return null;
    return draft;
}
