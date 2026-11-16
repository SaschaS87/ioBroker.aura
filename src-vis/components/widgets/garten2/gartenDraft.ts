/**
 * UI-Facelift, Entwurfsphase Garten (nur Dev-Vorschau): Welcher Entwurf der Garten-Seite gezeigt wird.
 * Der gelbe Umschalter (FaceliftChrome) zeigt die Buchstaben nur auf der Garten-Seite und nur bei „Neu".
 * „ALT" ist die heutige Seite (Steuerpult) im neuen Rahmen. Die Wahl liegt in localStorage.
 *
 * Nur `zustand` und `react` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { create } from 'zustand';
import { useFaceliftVariant } from '../../layout/facelift/faceliftVariant';

export type GartenDraft = 'ALT' | 'A' | 'B' | 'C' | 'D';

export const GARTEN_DRAFTS: { key: GartenDraft; label: string; name: string }[] = [
    { key: 'ALT', label: 'Alt', name: 'Heutige Seite' },
    { key: 'A', label: 'A', name: 'Liste, Kreis als Unterseite' },
    { key: 'B', label: 'B', name: 'Alles auf einer Seite' },
    { key: 'C', label: 'C', name: 'Übersicht, Kreis als Pop-up' },
    { key: 'D', label: 'D', name: 'Nach Aufgabe sortiert' },
];

const KEY = 'aura.garten.facelift';

function read(): GartenDraft {
    try {
        const v = localStorage.getItem(KEY);
        // Unbekannte Werte (spätere Runden) fallen auf den ersten Entwurf zurück
        return GARTEN_DRAFTS.some((d) => d.key === v) ? (v as GartenDraft) : 'A';
    } catch {
        return 'A';
    }
}

export const useGartenDraftStore = create<{ draft: GartenDraft; setDraft: (d: GartenDraft) => void }>((set) => ({
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

/** Aktiver Garten-Entwurf; null bei „Ist", bei „Alt" und im Pi-Build. */
export function useGartenDraft(): Exclude<GartenDraft, 'ALT'> | null {
    const flv = useFaceliftVariant();
    const draft = useGartenDraftStore((s) => s.draft);
    if (!import.meta.env.DEV || !flv || draft === 'ALT') return null;
    return draft;
}

/**
 * Zustand zum Ansehen nachstellen (nur Dev-Vorschau, nicht gespeichert). „Echt" zeigt die Werte vom Pi; dort
 * sind Modus und Handbetrieb gesperrt (devWriteGuard) und der Test-Zeitplan ist meist leer. „Beispiel" legt
 * Beispiel-Termine in die Anzeige und spielt Schalten, Gießen und Stoppen nur in der Vorschau nach: nichts
 * davon geht an den Pi. „Läuft" ist „Beispiel" mit einem laufenden Kreis.
 */
export type GartenScene = 'ECHT' | 'BEISPIEL' | 'LAEUFT';
export const GARTEN_SCENES: { key: GartenScene; label: string }[] = [
    { key: 'ECHT', label: 'Echt' },
    { key: 'BEISPIEL', label: 'Beispiel' },
    { key: 'LAEUFT', label: 'Läuft' },
];
export const useGartenSceneStore = create<{ scene: GartenScene; setScene: (s: GartenScene) => void }>((set) => ({
    scene: 'ECHT',
    setScene: (scene) => set({ scene }),
}));
