import logoSchwarz from '../../assets/aura-header-logo-schwarz.png';
import logoWeiss from '../../assets/aura-header-logo-weiss.png';

/**
 * Logo im Kopf der App. Zeigt je nach Theme das passende Motiv:
 * helles Theme -> schwarzes Logo, dunkles Theme -> weisses Logo.
 * Die Umschaltung laeuft ueber die Klasse 'dark' am <html>-Element, die der
 * ThemeProvider fuer jedes dunkle Preset setzt – deshalb ohne eigenen State
 * und ohne Neu-Rendern beim Theme-Wechsel.
 *
 * Ohne Rahmen und ohne eigene Hintergrundflaeche (Saschas Wunsch vom
 * 07.08.2026): Das Logo steht frei in der Kopfzeile. Der frueher runde Chip
 * hatte zuletzt ohnehin die Farbe der Kopfzeile – sichtbar war nur noch seine
 * Umrandung. Weil die Kreisflaeche wegfaellt, nutzt das Motiv jetzt die vollen
 * 40x40 px statt 32x32 px.
 */
export function HeaderLogo() {
    return (
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <img src={logoSchwarz} alt="Aura" className="w-10 h-10 object-contain dark:hidden" draggable={false} />
            <img src={logoWeiss} alt="" aria-hidden="true" className="w-10 h-10 object-contain hidden dark:block" draggable={false} />
        </div>
    );
}
