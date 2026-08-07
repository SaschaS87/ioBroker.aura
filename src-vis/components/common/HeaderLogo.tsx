import logoSchwarz from '../../assets/aura-header-logo-schwarz.png';
import logoWeiss from '../../assets/aura-header-logo-weiss.png';

/**
 * Logo-Chip im Kopf der App. Zeigt je nach Theme das passende Motiv:
 * helles Theme -> schwarzes Logo, dunkles Theme -> weisses Logo.
 * Die Umschaltung laeuft ueber die Klasse 'dark' am <html>-Element, die der
 * ThemeProvider fuer jedes dunkle Preset setzt – deshalb ohne eigenen State
 * und ohne Neu-Rendern beim Theme-Wechsel.
 */
export function HeaderLogo() {
    return (
        <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
            }}
        >
            <img src={logoSchwarz} alt="Aura" className="w-8 h-8 object-contain dark:hidden" draggable={false} />
            <img src={logoWeiss} alt="" aria-hidden="true" className="w-8 h-8 object-contain hidden dark:block" draggable={false} />
        </div>
    );
}
