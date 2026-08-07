/**
 * Aussehen des Logos in der Kopfzeile.
 *
 * ERZEUGT von tools/branding/build-logos.mjs – nicht von Hand bearbeiten.
 * Umschalten mit:  /logo-tausch stil
 * (oder npm run logo:stil -- --kreis ja|nein --anzeigen kopfzeile,tab,app)
 *
 * HEADER_LOGO_MIT_KREIS
 *   true  = Logo sitzt in einem runden Chip, genau so gross wie die runden
 *           Knoepfe rechts in der Kopfzeile (32x32 px, Flaeche --app-bg,
 *           Rand --app-border), Motiv 28x28 px
 *   false = Logo steht frei in der Kopfzeile (Flaeche --app-surface, also die
 *           Farbe der Kopfzeile selbst), Motiv 40x40 px
 *
 * HEADER_LOGO_ANZEIGEN
 *   false = gar kein Logo in der Kopfzeile, nur der Titel
 */
export const HEADER_LOGO_MIT_KREIS = true;
export const HEADER_LOGO_ANZEIGEN = true;
