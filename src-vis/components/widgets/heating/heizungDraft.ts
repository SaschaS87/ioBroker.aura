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
