import logoSchwarz from '../../assets/aura-header-logo-schwarz.png';
import logoWeiss from '../../assets/aura-header-logo-weiss.png';
import { HEADER_LOGO_MIT_KREIS } from './headerLogoStil';

/**
 * Logo im Kopf der App. Zeigt je nach Theme das passende Motiv:
 * helles Theme -> schwarzes Logo, dunkles Theme -> weisses Logo.
 * Die Umschaltung laeuft ueber die Klasse 'dark' am <html>-Element, die der
 * ThemeProvider fuer jedes dunkle Preset setzt – deshalb ohne eigenen State
 * und ohne Neu-Rendern beim Theme-Wechsel.
 *
 * Ob das Logo in einem runden Chip sitzt (Motiv 32x32) oder frei in der
 * Kopfzeile steht (Motiv 40x40), steuert HEADER_LOGO_MIT_KREIS in
 * headerLogoStil.ts. Diese Datei schreibt das Werkzeug
 * (tools/branding/build-logos.mjs), damit Sascha das Aussehen ueber
 * /logo-tausch umstellen kann, ohne Code anzufassen.
 *
 * Die Klassen stehen bewusst als vollstaendige Zeichenketten da: Tailwind
 * durchsucht den Quelltext und wuerde zusammengesetzte Namen nicht finden –
 * die weggelassene Variante fehlte dann im gebauten CSS.
 */
export function HeaderLogo() {
    const rahmenKlassen = HEADER_LOGO_MIT_KREIS
        ? 'w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden'
        : 'w-10 h-10 flex items-center justify-center shrink-0';
    const rahmenStil = HEADER_LOGO_MIT_KREIS
        ? { background: 'var(--app-surface)', border: '1px solid var(--app-border)' }
        : undefined;
    const bildKlassen = HEADER_LOGO_MIT_KREIS ? 'w-8 h-8 object-contain' : 'w-10 h-10 object-contain';

    return (
        <div className={rahmenKlassen} style={rahmenStil}>
            <img src={logoSchwarz} alt="Aura" className={`${bildKlassen} dark:hidden`} draggable={false} />
            <img src={logoWeiss} alt="" aria-hidden="true" className={`${bildKlassen} hidden dark:block`} draggable={false} />
        </div>
    );
}
