import logoSchwarz from '../../assets/aura-header-logo-schwarz.png';
import logoWeiss from '../../assets/aura-header-logo-weiss.png';
import {
    HEADER_LOGO_MIT_KREIS,
    HEADER_LOGO_ANZEIGEN,
    HEADER_LOGO_GROESSE,
    HEADER_LOGO_X,
    HEADER_LOGO_Y,
} from './headerLogoStil';

/** Kantenlaenge des runden Chips in px – so gross wie die Knoepfe rechts. */
const KREIS_PX = 32;

/** Kantenlaenge der freien Logo-Flaeche ohne Kreis in px (w-10 h-10). */
const FREI_PX = 40;

/** Haelt einen Wert in seinen Grenzen, damit ein verkorkster Wert in der
 *  erzeugten Stil-Datei die Kopfzeile nicht zerlegt. */
const begrenzen = (wert: number, min: number, max: number) =>
    Number.isFinite(wert) ? Math.min(max, Math.max(min, wert)) : min;

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
 * Das Motiv laesst sich mit oder ohne Kreis verkleinern, vergroessern und
 * verschieben (HEADER_LOGO_GROESSE/_X/_Y). Der Kreis bzw. die freie Flaeche
 * selbst bleibt dabei unberuehrt – der Kreis muss zu den runden Knoepfen
 * rechts passen, die freie Flaeche behaelt ihre 40 px.
 *
 * Die Klassen stehen bewusst als vollstaendige Zeichenketten da: Tailwind
 * durchsucht den Quelltext und wuerde zusammengesetzte Namen nicht finden –
 * die weggelassene Variante fehlte dann im gebauten CSS. Die Feinstellung
 * geht deshalb ueber style statt ueber Tailwind-Groessenklassen: ihre Werte
 * stehen erst zur Laufzeit fest.
 */
export function HeaderLogo({ immer }: { /** UI-Facelift: Logo auch zeigen, wenn es im alten Kopf abgeschaltet ist */ immer?: boolean } = {}) {
    // Ganz abgeschaltet: nichts rendern, damit auch der Abstand zum Titel
    // (gap-3 der Kopfzeile) verschwindet und kein leerer Platzhalter bleibt.
    if (!HEADER_LOGO_ANZEIGEN && !immer) return null;

    // Mit Kreis: exakt so gross wie die runden Knoepfe rechts in der Kopfzeile
    // (Theme-Umschalter und Admin-Link, beide w-8 h-8, Flaeche --app-bg, 1px
    // --app-border in App.tsx) – sonst wirkt die Kopfzeile links und rechts
    // unterschiedlich schwer. Ohne Kreis steht das Logo frei (durchsichtiger
    // Hintergrund, sonst zeigt sich im Facelift eine weisse Flaeche auf dem
    // grauen Seitengrund) und bekommt die vollen 40 px.
    const rahmenKlassen = HEADER_LOGO_MIT_KREIS
        ? 'w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden'
        : 'w-10 h-10 flex items-center justify-center shrink-0';
    const rahmenStil = HEADER_LOGO_MIT_KREIS
        ? { background: 'var(--app-bg)', border: '1px solid var(--app-border)' }
        : { background: 'transparent' };
    // Groesse und Position des Motivs gelten in beiden Faellen: im Kreis
    // bezogen auf die 32 px des Kreises, ohne Kreis auf die 40 px der freien
    // Flaeche. 100 % ist also jeweils die volle Flaeche, darunter wird das Logo
    // kleiner. Gerundet wird genauso wie in der Vorschau (build-logos.mjs).
    // shrink-0 muss mit, sonst staucht die Flexbox das Motiv wieder auf
    // Rahmengroesse zusammen, sobald es ueber 100 % hinausgeht.
    const bildKlassen = 'object-contain shrink-0';
    const flaechePx = HEADER_LOGO_MIT_KREIS ? KREIS_PX : FREI_PX;
    const kante = Math.round((flaechePx * begrenzen(HEADER_LOGO_GROESSE, 50, 150)) / 100);
    const bildStil = {
        width: `${kante}px`,
        height: `${kante}px`,
        // Tailwind gibt jedem Bild max-width: 100%. Ohne dieses "none"
        // stutzt diese Grundregel das Motiv ueber 100 % wieder auf die
        // Rahmenbreite zurueck – es waere dann breitgedrueckt statt
        // vergroessert (30x38 statt 38x38 bei 120 %).
        maxWidth: 'none',
        transform: `translate(${begrenzen(HEADER_LOGO_X, -8, 8)}px, ${begrenzen(HEADER_LOGO_Y, -8, 8)}px)`,
    };

    return (
        <div className={rahmenKlassen} style={rahmenStil}>
            <img
                src={logoSchwarz}
                alt="Aura"
                className={`${bildKlassen} dark:hidden`}
                style={bildStil}
                draggable={false}
            />
            <img
                src={logoWeiss}
                alt=""
                aria-hidden="true"
                className={`${bildKlassen} hidden dark:block`}
                style={bildStil}
                draggable={false}
            />
        </div>
    );
}
