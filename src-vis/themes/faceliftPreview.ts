import { create } from 'zustand';

/**
 * Dev-Vorschau des UI-Facelifts: Steht der Entwurfs-Umschalter auf „Neu", zeigt die Vorschau statt
 * „Dark"/„Hell" die Themes „iOS Dunkel"/„iOS Hell". So lassen sich die neuen Farben ansehen, ohne die
 * Theme-Wahl am Pi umzustellen. Das ist wichtig, solange der Pi-Build die neuen Themes noch nicht kennt:
 * Eine dort gespeicherte unbekannte Theme-Kennung fiele auf „Dark" zurück.
 *
 * Im Pi-Build (kein DEV) ist das Ganze wirkungslos; dort entscheidet allein die Theme-Wahl im Backend.
 */
export const FACELIFT_KEY = 'aura.facelift.preview';

function readNeu(): boolean {
    try {
        return localStorage.getItem(FACELIFT_KEY) !== 'IST';
    } catch {
        return true;
    }
}

export const useFaceliftPreviewStore = create<{ neu: boolean; setNeu: (neu: boolean) => void }>((set) => ({
    neu: readNeu(),
    setNeu: (neu) => set({ neu }),
}));

const PREVIEW_PAIR: Record<string, string> = { dark: 'ios-dark', light: 'ios-light' };

/** Theme-Kennung für die Anzeige: in der Dev-Vorschau mit „Neu" das iOS-Gegenstück, sonst unverändert. */
export function usePreviewThemeId(id: string): string {
    const neu = useFaceliftPreviewStore((s) => s.neu);
    if (!import.meta.env.DEV || !neu) return id;
    return PREVIEW_PAIR[id] ?? id;
}
