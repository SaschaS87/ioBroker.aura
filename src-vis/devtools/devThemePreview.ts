/**
 * Nur Dev-Vorschau: Die lokale Vorschau zeigt statt „Dark"/„Hell" die Themes „iOS Dunkel"/„iOS Hell", damit
 * die Facelift-Farben zu sehen sind, ohne die Theme-Wahl am Pi umzustellen. Das ist nötig, solange der
 * Pi-Build die neuen Themes noch nicht kennt: Eine dort gespeicherte unbekannte Theme-Kennung fiele auf
 * „Dark" zurück.
 *
 * Im Build (kein DEV) wirkungslos; dort entscheidet allein die Theme-Wahl im Backend. Reine Funktion, kein
 * Store, kein Hook.
 */
const PREVIEW_PAIR: Record<string, string> = { dark: 'ios-dark', light: 'ios-light' };

/** Theme-Kennung für die Anzeige: in der Dev-Vorschau das iOS-Gegenstück, sonst unverändert. */
export function devPreviewThemeId(id: string): string {
    if (!import.meta.env.DEV) return id;
    return PREVIEW_PAIR[id] ?? id;
}
