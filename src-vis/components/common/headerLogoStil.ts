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
 *   false = Logo steht frei in der Kopfzeile (durchsichtig, ohne Flaeche
 *           dahinter), Motiv bis 40x40 px
 *
 * HEADER_LOGO_ANZEIGEN
 *   false = gar kein Logo in der Kopfzeile, nur der Titel
 *
 * HEADER_LOGO_GROESSE / HEADER_LOGO_X / HEADER_LOGO_Y
 *   Feinstellung des Motivs – wirkt mit und ohne Kreis.
 *   Der Kreis bleibt immer 32x32, damit er zu den runden Knoepfen rechts in
 *   der Kopfzeile passt. Ohne Kreis ist die freie Flaeche immer 40x40.
 *     GROESSE  Prozent dieser Flaeche (50-150, Standard 88).
 *              100 = volle Flaeche, kleiner = kleineres Logo. Ueber 100 ragt
 *              das Motiv im Kreis ueber den Kreis hinaus und wird an der
 *              Rundung beschnitten – das ist der randfuellende Look.
 *     X        Verschiebung in Pixeln, negativ = nach links  (-8 bis 8)
 *     Y        Verschiebung in Pixeln, negativ = nach oben   (-8 bis 8)
 *   Aendern mit: npm run logo:stil -- --logo-groesse 96 --logo-x -1 --logo-y 0
 */
export const HEADER_LOGO_MIT_KREIS = false;
export const HEADER_LOGO_ANZEIGEN = true;
export const HEADER_LOGO_GROESSE = 80;
export const HEADER_LOGO_X = 0;
export const HEADER_LOGO_Y = 0;
