/**
 * „Letzte Fahrten" – welcher Entwurf in der Dev-Vorschau gezeigt wird (nur DEV, nie im Build).
 * „Ist" ist der heutige Tab ohne Fahrtenprotokoll. Die Wahl liegt in localStorage.
 * Nur `zustand` importieren.
 */
import { create } from 'zustand';

export type FahrtenDraft = 'IST' | 'A' | 'B' | 'C';

export const FAHRTEN_DRAFTS: { key: FahrtenDraft; label: string; name: string }[] = [
    { key: 'IST', label: 'Ist', name: 'Heutiger Tab, ohne Protokoll' },
    { key: 'A', label: 'A', name: 'Zeile unter Automatik, Unterseite nach Tagen, Lauf als eigene Seite' },
    { key: 'B', label: 'B', name: 'Eigener Abschnitt im Tab, letzte drei, Zeile klappt auf' },
    { key: 'C', label: 'C', name: 'Unterseite mit Reitern „Fahrten | Rollläden", Lauf als Pop-up' },
];

const KEY = 'aura.shutterfloors.fahrten.preview';

function read(): FahrtenDraft {
    try {
        const v = localStorage.getItem(KEY);
        return FAHRTEN_DRAFTS.some((d) => d.key === v) ? (v as FahrtenDraft) : 'A';
    } catch {
        return 'A';
    }
}

export const useFahrtenDraftStore = /* @__PURE__ */ create<{
    draft: FahrtenDraft;
    setDraft: (d: FahrtenDraft) => void;
    /** Erfundenen Fehler und Abbruch einblenden (die echten Daten haben gerade keine) */
    beispiel: boolean;
    setBeispiel: (v: boolean) => void;
}>((set) => ({
    draft: read(),
    beispiel: false,
    setBeispiel: (beispiel) => set({ beispiel }),
    setDraft: (draft) => {
        set({ draft });
        try {
            localStorage.setItem(KEY, draft);
        } catch {
            /* privater Modus */
        }
    },
}));
