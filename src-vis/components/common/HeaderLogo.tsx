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
 * Mit Kreis laesst sich das Motiv darin zusaetzlich vergroessern und
 * verschieben (HEADER_LOGO_GROESSE/_X/_Y). Der Kreis selbst bleibt dabei
 * unberuehrt – er muss zu den runden Knoepfen rechts passen.
 *
 * Die Klassen stehen bewusst als vollstaendige Zeichenketten da: Tailwind
 * durchsucht den Quelltext und wuerde zusammengesetzte Namen nicht finden –
 * die weggelassene Variante fehlte dann im gebauten CSS. Die Feinstellung
 * geht deshalb ueber style statt ueber Tailwind-Groessenklassen: ihre Werte
 * stehen erst zur Laufzeit fest.
 */
export function HeaderLogo() {
    // Ganz abgeschaltet: nichts rendern, damit auch der Abstand zum Titel
    // (gap-3 der Kopfzeile) verschwindet und kein leerer Platzhalter bleibt.
    if (!HEADER_LOGO_ANZEIGEN) return null;

    // Mit Kreis: exakt so gross wie die runden Knoepfe rechts in der Kopfzeile
    // (Theme-Umschalter und Admin-Link, beide w-8 h-8, Flaeche --app-bg, 1px
    // --app-border in App.tsx) – sonst wirkt die Kopfzeile links und rechts
    // unterschiedlich schwer. Ohne Kreis nimmt das Logo die Farbe der Kopfzeile
    // selbst (--app-surface) und die vollen 40 px, weil keine Kreisflaeche
    // Platz kostet.
    const rahmenKlassen = HEADER_LOGO_MIT_KREIS
        ? 'w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden'
        : 'w-10 h-10 flex items-center justify-center shrink-0';
    const rahmenStil = HEADER_LOGO_MIT_KREIS
        ? { background: 'var(--app-bg)', border: '1px solid var(--app-border)' }
        : { background: 'var(--app-surface)' };
    // Ohne Kreis bleibt es bei den festen Tailwind-Klassen. Mit Kreis kommt die
    // Groesse aus der Feinstellung: 88 % von 32 px sind die 28 px, die frueher
    // fest als w-7 h-7 dastanden – der Standard aendert also nichts am Bild.
    // shrink-0 muss mit, sonst staucht die Flexbox das Motiv wieder auf
    // Kreisgroesse zusammen, sobald es ueber 100 % hinausgeht.
    const bildKlassen = HEADER_LOGO_MIT_KREIS ? 'object-contain shrink-0' : 'w-10 h-10 object-contain';
    const kante = Math.round((KREIS_PX * begrenzen(HEADER_LOGO_GROESSE, 50, 150)) / 100);
    const bildStil = HEADER_LOGO_MIT_KREIS
        ? {
              width: `${kante}px`,
              height: `${kante}px`,
              // Tailwind gibt jedem Bild max-width: 100%. Ohne dieses "none"
              // stutzt diese Grundregel das Motiv ueber 100 % wieder auf die
              // Kreisbreite zurueck – es waere dann breitgedrueckt statt
              // vergroessert (30x38 statt 38x38 bei 120 %).
              maxWidth: 'none',
              transform: `translate(${begrenzen(HEADER_LOGO_X, -8, 8)}px, ${begrenzen(HEADER_LOGO_Y, -8, 8)}px)`,
          }
        : undefined;

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
