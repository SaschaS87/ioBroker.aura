#!/usr/bin/env node
/**
 * build-logos.mjs – erzeugt alle Aura-Icon-Varianten aus zwei Quellbildern.
 *
 * Skaliert wird mit dem Chromium, das ohnehin über Playwright im Projekt liegt
 * (Canvas, mehrstufig halbierend). Das spart eine zusaetzliche Abhaengigkeit
 * wie sharp – wichtig, weil dieses Repo ein Fork ist und package.json schlank
 * bleiben soll.
 *
 * Aufruf:
 *   npm run logo:build                          alles Neue erzeugen
 *   npm run logo:build -- --dry-run             nur pruefen, nichts schreiben
 *   npm run logo:build -- --force               auch unveraenderte Quellen neu erzeugen
 *   npm run logo:build -- --ziele app,tab       nur diese Gruppen tauschen
 *                                               (kopfzeile, tab, app – Standard: alle)
 *   npm run logo:build -- --kreis ja|nein       Aussehen der Kopfzeile mitaendern
 *                                               (wirkt nur, wenn "kopfzeile" gewaehlt ist)
 *   npm run logo:stil -- --kreis ja|nein        NUR das Aussehen, ohne Bilder anzufassen
 *   npm run logo:stil -- --logo-groesse 96      Motiv im Kreis groesser/kleiner (50-150 %)
 *                        --logo-x -1 --logo-y 1 Motiv im Kreis verschieben (-8 bis 8 px)
 *   npm run logo:vorschau -- --logo-groesse 96  Vorschaubild erzeugen, ohne etwas zu aendern
 *   npm run logo:restore                        letztes Backup zurueckholen
 *   npm run logo:restore -- --liste             vorhandene Backups auflisten
 *   npm run logo:restore -- --backup <name>     ein bestimmtes Backup zurueckholen
 *
 * Nach jeder Aenderung muss gebaut und ausgerollt werden (npm run build + Deploy),
 * auch beim reinen Stilwechsel – headerLogoStil.ts ist Quelltext.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '..', '..');
const BRANDING = path.join(REPO, 'branding');
const BACKUPS = path.join(BRANDING, 'backup');
const STATE = path.join(BRANDING, 'logo-state.json');

/**
 * Wo der Eingangsordner liegt, steht NICHT im Quelltext: Der Pfad enthaelt
 * Benutzer- und Firmennamen und hat in einem oeffentlichen Repo nichts
 * verloren. Er wird in dieser Reihenfolge gesucht:
 *
 *   1. --quelle <pfad>                (einmalig, fuer diesen Aufruf)
 *   2. Umgebungsvariable AURA_LOGO_EINGANG
 *   3. branding/eingang.txt           (gemerkt, liegt im ignorierten Ordner)
 *
 * Findet sich nichts, fragt der Assistent danach und schreibt die Merkdatei.
 * Auf einem zweiten Rechner passiert also genau einmal eine Rueckfrage.
 */
const EINGANG_MERKDATEI = path.join(BRANDING, 'eingang.txt');

function eingangGemerkt() {
    try {
        // Nur die erste nicht-leere Zeile, Kommentarzeilen (#) ueberspringen.
        const zeilen = fs.readFileSync(EINGANG_MERKDATEI, 'utf8').split(/\r?\n/);
        const p = zeilen.map((z) => z.trim()).find((z) => z && !z.startsWith('#'));
        return p || null;
    } catch {
        return null;
    }
}

/** Geschrieben wird die Merkdatei vom Assistenten (logo-assistent.mjs) – hier
 *  wird sie nur gelesen. Dieses Skript laeuft direkt und hat Top-Level-await,
 *  laesst sich also nicht als Modul einbinden. */

/** Hintergrundfarbe fuer das Homescreen-Symbol, wenn Sascha kein eigenes Bild liefert.
 *  #111827 ist die Farbe, die auch in public/manifest.json als background_color steht. */
const HINTERGRUND_FARBE = '#111827';
/**
 * Ausrichtung des Motivs im Homescreen-Symbol.
 *
 * Anders als beim Kopfzeilen-Logo wird hier nichts zur Laufzeit gerechnet: Das
 * Symbol ist ein fertiges PNG, die Ausrichtung wandert also ins Bild selbst.
 * Deshalb muessen die Symbole nach jeder Aenderung neu erzeugt werden – das
 * erledigt das Werkzeug von allein (siehe justageSchluessel weiter unten).
 *
 *   groesse  Prozent der Kachelflaeche. 70 entspricht dem frueher festen Rand
 *            von 15 % je Seite. Ueber 100 ragt das Motiv ueber die Kachel
 *            hinaus und wird beschnitten.
 *   x / y    Verschiebung in Prozent der Kantenlaenge (nicht in Pixeln!) –
 *            das Symbol entsteht in 192 UND 512 px, ein fester Pixelwert saehe
 *            in den beiden Groessen unterschiedlich aus.
 *
 * Gespeichert in tools/branding/app-symbol.json – bewusst im versionierten
 * Teil des Repos, damit sich das Symbol nach einem Klon identisch neu erzeugen
 * laesst. (branding/ waere dafuer der falsche Ort, der ist lokal.)
 */
const APP_DATEI = path.join(HIER, 'app-symbol.json');
const APP_GRENZEN = { groesse: [40, 130], x: [-25, 25], y: [-25, 25] };
/** Standard je nach Quelle: Ein fertiges Hintergrundbild fuellt die Kachel
 *  vollstaendig (100), das weisse Logo auf Farbe laesst Rand (70 entspricht den
 *  frueher fest verdrahteten 15 % Rand je Seite, gegen Androids runden
 *  Zuschnitt). Beides ist das Verhalten von vor der Justage. */
const appStandard = (mitEigenemHintergrund) => ({ groesse: mitEigenemHintergrund ? 100 : 70, x: 0, y: 0 });

function appJustageLesen(mitEigenemHintergrund = false) {
    const standard = appStandard(mitEigenemHintergrund);
    try {
        const d = JSON.parse(fs.readFileSync(APP_DATEI, 'utf8'));
        return {
            groesse: Number.isInteger(d.groesse) ? d.groesse : standard.groesse,
            x: Number.isInteger(d.x) ? d.x : standard.x,
            y: Number.isInteger(d.y) ? d.y : standard.y,
        };
    } catch {
        return standard;
    }
}

function appJustageSchreiben(werte) {
    fs.writeFileSync(
        APP_DATEI,
        JSON.stringify(
            {
                _hinweis:
                    'Ausrichtung des Motivs im Homescreen-Symbol. groesse = Prozent der Kachelflaeche, ' +
                    'x/y = Verschiebung in Prozent der Kantenlaenge. Aendern ueber "npm run logo" ' +
                    'oder npm run logo:build -- --ziele app --force --app-groesse 80 --app-x 0 --app-y -3',
                ...werte,
            },
            null,
            2,
        ) + '\n',
    );
}
/** Anteil freier Rand um das Logo im Header-Chip und in den Favicons.
 *  0.06 = 6 % je Seite – genug, damit das Motiv im runden Chip nicht an der
 *  Kante klebt, aber deutlich weniger als beim Homescreen-Symbol. */
const LOGO_RAND = 0.06;

/** Zielgruppen für die Auswahl. */
const GRUPPEN = {
    kopfzeile: 'Logo in der Kopfzeile',
    tab: 'Browser-Tab-Symbol',
    app: 'App-Symbol auf dem Homescreen',
};

/** Welches Zielbild entsteht aus welcher Quelle. */
const ZIELE = [
    { quelle: 'schwarz', datei: 'src-vis/assets/aura-header-logo-schwarz.png', groesse: 160, art: 'transparent', zweck: 'Header-Logo bei hellem Theme', gruppe: 'kopfzeile' },
    { quelle: 'weiss', datei: 'src-vis/assets/aura-header-logo-weiss.png', groesse: 160, art: 'transparent', zweck: 'Header-Logo bei dunklem Theme', gruppe: 'kopfzeile' },
    { quelle: 'schwarz', datei: 'public/favicon-32.png', groesse: 32, art: 'transparent', zweck: 'Browser-Tab (Rueckfall)', gruppe: 'tab' },
    { quelle: 'schwarz', datei: 'public/favicon-64.png', groesse: 64, art: 'transparent', zweck: 'Lesezeichen (Rueckfall)', gruppe: 'tab' },
    { quelle: 'icon', datei: 'public/icons/icon-192.png', groesse: 192, art: 'deckend', zweck: 'iPhone-Homescreen', gruppe: 'app' },
    { quelle: 'icon', datei: 'public/icons/icon-512.png', groesse: 512, art: 'deckend', zweck: 'iPad, Android, Startbildschirm', gruppe: 'app' },
];
/** Das SVG-Tab-Symbol entsteht aus beiden Motiven zusammen und steht deshalb nicht in ZIELE. */
const SVG_ZIEL = { datei: 'public/favicon-theme.svg', groesse: 64, zweck: 'Browser-Tab, folgt dem Hell/Dunkel-Modus', gruppe: 'tab' };

/**
 * Dateien, die kein Bild sind, aber zum Erscheinungsbild gehoeren und deshalb
 * in jedes Backup muessen: die Kreis-/Anzeigen-Einstellung, die Symbol-Bloecke
 * in index.html und das icons-Array im Manifest. Ohne sie koennte
 * /logo-tausch zurueck ein ausgeblendetes Symbol nicht zurueckholen.
 */
const ZUSATZ_DATEIEN = ['src-vis/components/common/headerLogoStil.ts', 'index.html', 'public/manifest.json'];

const ENDUNGEN = ['.png', '.webp', '.jpg', '.jpeg'];
const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// ---------------------------------------------------------------- Hilfsmittel

const argv = process.argv.slice(2);
const hatFlag = (name) => argv.includes(name);
const flagWert = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const OPT = {
    dryRun: hatFlag('--dry-run'),
    force: hatFlag('--force'),
    restore: hatFlag('--restore'),
    liste: hatFlag('--liste'),
    quelle: flagWert('--quelle') || process.env.AURA_LOGO_EINGANG || eingangGemerkt(),
    backup: flagWert('--backup'),
    ziele: flagWert('--ziele'),
    kreis: flagWert('--kreis'),
    anzeigen: flagWert('--anzeigen'),
    nurStil: hatFlag('--nur-stil'),
    logoGroesse: flagWert('--logo-groesse'),
    logoX: flagWert('--logo-x'),
    logoY: flagWert('--logo-y'),
    appGroesse: flagWert('--app-groesse'),
    appX: flagWert('--app-x'),
    appY: flagWert('--app-y'),
    vorschau: hatFlag('--vorschau'),
    was: flagWert('--was') || 'kopfzeile',
};

/** Ist eine Feinstellung fuer das Motiv im Kreis angegeben worden? */
const hatFeinstellung = () => OPT.logoGroesse !== null || OPT.logoX !== null || OPT.logoY !== null;
/** Ist eine Ausrichtung fuer das Homescreen-Symbol angegeben worden? */
const hatAppJustage = () => OPT.appGroesse !== null || OPT.appX !== null || OPT.appY !== null;

const rot = (t) => `\x1b[31m${t}\x1b[0m`;
const gruen = (t) => `\x1b[32m${t}\x1b[0m`;
const gelb = (t) => `\x1b[33m${t}\x1b[0m`;

function abbruch(text) {
    console.error('');
    console.error(rot('FEHLER: ' + text));
    console.error('');
    process.exit(1);
}

/** Liest Breite, Hoehe und Farbtyp direkt aus dem PNG-Kopf – ohne Bibliothek. */
function pngInfo(buf) {
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return {
        breite: buf.readUInt32BE(16),
        hoehe: buf.readUInt32BE(20),
        bitTiefe: buf[24],
        farbTyp: buf[25], // 6 = RGBA, 2 = RGB, 3 = Palette, 0/4 = Graustufen
    };
}

function sha256(datei) {
    return crypto.createHash('sha256').update(fs.readFileSync(datei)).digest('hex');
}

function zeitstempel() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Schreibweisen, die als derselbe Basisname gelten. "logo-weiß" mit scharfem S
 *  tippt sich auf einer deutschen Tastatur genauso natuerlich wie "logo-weiss" –
 *  beides muss gefunden werden, sonst scheitert der Tausch an einem Buchstaben. */
const NAMENS_VARIANTEN = {
    'logo-weiss': ['logo-weiss', 'logo-weiß', 'logo-weis'],
    'logo-schwarz': ['logo-schwarz'],
    'logo-hintergrund': ['logo-hintergrund'],
    'logo-transparent': ['logo-transparent'],
};

function quelleFinden(ordner, basisName) {
    // Ohne bekannten Eingangsordner gibt es nichts zu finden. Wichtig fuer
    // --nur-stil und --vorschau: die brauchen gar keine Quellbilder und
    // sollen auch ohne festgelegten Ordner laufen.
    if (!ordner) return null;
    for (const name of NAMENS_VARIANTEN[basisName] || [basisName]) {
        for (const e of ENDUNGEN) {
            const p = path.join(ordner, name + e);
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

/**
 * Welche Quellmotive eine Zielgruppe braucht.
 *
 * 'icon' in ZIELE ist keine Datei, sondern loest sich auf: das eigene
 * Hintergrundbild, wenn eines vorliegt – sonst das weisse Motiv auf Farbe.
 * Das Tab-SVG steht nicht in ZIELE und enthaelt BEIDE Motive in einer Datei,
 * deshalb braucht 'tab' auch das weisse.
 */
function artenFuerGruppe(gruppe, quellen) {
    const arten = new Set();
    for (const z of ZIELE) {
        if (z.gruppe !== gruppe) continue;
        if (z.quelle === 'icon') arten.add(quellen.hintergrund ? 'hintergrund' : 'weiss');
        else arten.add(z.quelle);
    }
    if (gruppe === 'tab') {
        arten.add('schwarz');
        arten.add('weiss');
    }
    return [...arten];
}

function dataUrl(datei) {
    const ext = path.extname(datei).toLowerCase();
    return `data:${MIME[ext]};base64,${fs.readFileSync(datei).toString('base64')}`;
}

function stateLesen() {
    try {
        return JSON.parse(fs.readFileSync(STATE, 'utf8'));
    } catch {
        return {};
    }
}

// ------------------------------------------------------------------- Backups

function backupsAuflisten() {
    if (!fs.existsSync(BACKUPS)) return [];
    return fs
        .readdirSync(BACKUPS)
        .filter((n) => fs.statSync(path.join(BACKUPS, n)).isDirectory())
        .sort();
}

function backupAnlegen(quellen) {
    // Pruefen, ob die Quellbilder seit dem neuesten Backup unveraendert sind
    const vorhanden = backupsAuflisten();
    if (vorhanden.length > 0) {
        const neuestesBackup = vorhanden[vorhanden.length - 1];
        const backupOrdner = path.join(BACKUPS, neuestesBackup);
        const quellenOrdner = path.join(backupOrdner, 'quellen');

        if (fs.existsSync(quellenOrdner)) {
            let alleQuellen = true;
            for (const [art, datei] of Object.entries(quellen)) {
                if (!datei) continue;

                const imBackup = path.join(quellenOrdner, `logo-${art}${path.extname(datei)}`);
                if (!fs.existsSync(imBackup)) {
                    alleQuellen = false;
                    break;
                }

                const hashAktuell = sha256(datei);
                const hashBackup = sha256(imBackup);
                if (hashAktuell !== hashBackup) {
                    alleQuellen = false;
                    break;
                }
            }

            // Auch die Einstellungsdateien pruefen (Kreis, Sichtbarkeit der
            // Symbole) – aendert sich nur eine davon, ist der alte Stand NICHT
            // mehr gesichert und es braucht ein neues Backup.
            for (const rel of ZUSATZ_DATEIEN) {
                const pfadZ = path.join(REPO, rel);
                const kopieZ = path.join(backupOrdner, rel.replace(/\//g, '__'));
                if (fs.existsSync(pfadZ) && fs.existsSync(kopieZ)) {
                    if (sha256(pfadZ) !== sha256(kopieZ)) alleQuellen = false;
                } else if (fs.existsSync(pfadZ) !== fs.existsSync(kopieZ)) {
                    alleQuellen = false;
                }
                if (!alleQuellen) break;
            }

            if (alleQuellen) {
                // Quellbilder und Stil sind seit letztem Backup unveraendert
                const anzahl = ZIELE.filter((z) => fs.existsSync(path.join(REPO, z.datei))).length;
                return { ordner: backupOrdner, anzahl, isNew: false };
            }
        }
    }

    // Neues Backup anlegen (neue oder veraenderte Quellbilder)
    const ordner = path.join(BACKUPS, zeitstempel());
    fs.mkdirSync(path.join(ordner, 'quellen'), { recursive: true });
    let anzahl = 0;
    for (const ziel of ZIELE) {
        const alt = path.join(REPO, ziel.datei);
        if (!fs.existsSync(alt)) continue;
        const kopie = path.join(ordner, ziel.datei.replace(/\//g, '__'));
        fs.copyFileSync(alt, kopie);
        anzahl++;
    }
    // SVG-Favicon auch sichern
    const altSvg = path.join(REPO, SVG_ZIEL.datei);
    if (fs.existsSync(altSvg)) {
        const kopieSvg = path.join(ordner, SVG_ZIEL.datei.replace(/\//g, '__'));
        fs.copyFileSync(altSvg, kopieSvg);
        anzahl++;
    }
    // Einstellungsdateien mitsichern: ohne sie koennte /logo-tausch zurueck
    // weder den Kreis noch ein ausgeblendetes Symbol wiederherstellen.
    for (const rel of ZUSATZ_DATEIEN) {
        const altZ = path.join(REPO, rel);
        if (!fs.existsSync(altZ)) continue;
        fs.copyFileSync(altZ, path.join(ordner, rel.replace(/\//g, '__')));
        anzahl++;
    }
    for (const [art, datei] of Object.entries(quellen)) {
        if (datei) fs.copyFileSync(datei, path.join(ordner, 'quellen', `logo-${art}${path.extname(datei)}`));
    }
    return { ordner, anzahl, isNew: true };
}

function backupZurueckholen() {
    const vorhanden = backupsAuflisten();
    if (!vorhanden.length) abbruch('Es gibt noch kein Backup – bisher wurde nie ein Logo getauscht.');

    if (OPT.liste) {
        console.log('\nVorhandene Backups (neuestes zuletzt):\n');
        vorhanden.forEach((n) => console.log('  ' + n));
        console.log('\nZurueckholen mit:  npm run logo:restore -- --backup <name>\n');
        return;
    }

    const name = OPT.backup || vorhanden[vorhanden.length - 1];
    const ordner = path.join(BACKUPS, name);
    if (!fs.existsSync(ordner)) abbruch(`Das Backup "${name}" gibt es nicht. Vorhanden: ${vorhanden.join(', ')}`);

    console.log(`\nHole Backup "${name}" zurueck ...\n`);
    let anzahl = 0;
    for (const ziel of ZIELE) {
        const kopie = path.join(ordner, ziel.datei.replace(/\//g, '__'));
        if (!fs.existsSync(kopie)) continue;
        fs.mkdirSync(path.dirname(path.join(REPO, ziel.datei)), { recursive: true });
        fs.copyFileSync(kopie, path.join(REPO, ziel.datei));
        console.log(`  wiederhergestellt: ${ziel.datei}`);
        anzahl++;
    }
    // SVG-Favicon auch wiederherstellen
    const kopieSvg = path.join(ordner, SVG_ZIEL.datei.replace(/\//g, '__'));
    if (fs.existsSync(kopieSvg)) {
        fs.mkdirSync(path.dirname(path.join(REPO, SVG_ZIEL.datei)), { recursive: true });
        fs.copyFileSync(kopieSvg, path.join(REPO, SVG_ZIEL.datei));
        console.log(`  wiederhergestellt: ${SVG_ZIEL.datei}`);
        anzahl++;
    }
    // Einstellungsdateien wiederherstellen (Kreis, Sichtbarkeit der Symbole)
    for (const rel of ZUSATZ_DATEIEN) {
        const kopieZ = path.join(ordner, rel.replace(/\//g, '__'));
        if (!fs.existsSync(kopieZ)) continue;
        const pfadZ = path.join(REPO, rel);
        fs.mkdirSync(path.dirname(pfadZ), { recursive: true });
        fs.copyFileSync(kopieZ, pfadZ);
        console.log(`  wiederhergestellt: ${rel}`);
        anzahl++;
    }
    // Zustandsdatei entwerten, damit der naechste Lauf wieder alles erzeugt.
    if (fs.existsSync(STATE)) fs.rmSync(STATE);
    console.log(gruen(`\nFertig: ${anzahl} Datei(en) wiederhergestellt.`));
    console.log('Danach noch bauen und ausrollen (npm run build + Deploy).\n');
}

// --------------------------------------------------------- Zielgruppen-Verwaltung

function auswahlVerarbeiten() {
    let ausgewaehlt = Object.keys(GRUPPEN);
    if (OPT.ziele) {
        ausgewaehlt = OPT.ziele.split(',').map(g => g.trim());
        for (const g of ausgewaehlt) {
            if (!GRUPPEN[g]) abbruch(`Unbekannte Zielgruppe: "${g}"\nGueltig sind: ${Object.keys(GRUPPEN).join(', ')}`);
        }
    }
    return ausgewaehlt;
}

const KREIS_JA = ['ja', 'true', '1'];
const KREIS_NEIN = ['nein', 'false', '0'];

const STIL_DATEI = 'src-vis/components/common/headerLogoStil.ts';

/**
 * Wendet `--anzeigen` an: Genannte Gruppen werden eingeblendet, nicht genannte
 * ausgeblendet. Gibt zurueck, was sich geaendert hat (fuer den Bericht).
 */
function anzeigenAnwenden(wert) {
    if (wert === null) return null;
    // "keine" blendet alles aus. Ein leerer Wert liesse sich auf der
    // Kommandozeile nicht zuverlaessig uebergeben, deshalb ein Schluesselwort.
    const sichtbar =
        wert === 'keine'
            ? []
            : wert
                  .split(',')
                  .map((g) => g.trim())
                  .filter(Boolean);
    for (const g of sichtbar) {
        if (!GRUPPEN[g]) {
            abbruch(
                `Unbekannte Gruppe bei --anzeigen: "${g}"\n` +
                    `Gueltig sind: ${Object.keys(GRUPPEN).join(', ')} – oder "keine", um alle auszublenden.`,
            );
        }
    }
    const aenderungen = [];
    for (const g of Object.keys(GRUPPEN)) {
        const an = sichtbar.includes(g);
        let geaendert = false;
        if (g === 'kopfzeile') {
            const vorher = stilLesen().anzeigen;
            if (vorher !== an) {
                stilDateiSchreiben({ anzeigen: an });
                geaendert = true;
            }
        } else if (g === 'tab') {
            geaendert = htmlBlockSchalten('TAB-SYMBOL', an);
        } else if (g === 'app') {
            const a = htmlBlockSchalten('APP-SYMBOL', an);
            const b = manifestSymbolSchalten(an);
            geaendert = a || b;
        }
        if (geaendert) aenderungen.push(`${GRUPPEN[g]}: ${an ? 'wird wieder angezeigt' : 'ausgeblendet'}`);
    }
    return aenderungen;
}

/** Standardwerte der Feinstellung: 88 % entspricht den frueheren festen 28 von
 *  32 px, mittig – so sieht ein frisch erzeugtes Logo aus wie bisher. */
const FEIN_STANDARD = { groesse: 88, x: 0, y: 0 };
/** Grenzen der Feinstellung. Ueber 150 % bliebe vom Motiv im Kreis nichts
 *  Erkennbares uebrig, ab 8 px Versatz haengt es halb heraus. */
const FEIN_GRENZEN = { groesse: [50, 150], x: [-8, 8], y: [-8, 8] };

/** Liest den aktuellen Stand aus der erzeugten Stil-Datei. */
function stilLesen() {
    try {
        const t = fs.readFileSync(path.join(REPO, STIL_DATEI), 'utf8');
        // Fehlt eine der Feinstellungs-Zeilen (Datei aus der Zeit davor),
        // gilt der Standard – dann sieht das Logo aus wie vorher.
        const zahl = (name, standard) => {
            const m = t.match(new RegExp(`${name}\\s*=\\s*(-?\\d+)`));
            return m ? parseInt(m[1], 10) : standard;
        };
        return {
            mitKreis: /HEADER_LOGO_MIT_KREIS\s*=\s*true/.test(t),
            anzeigen: !/HEADER_LOGO_ANZEIGEN\s*=\s*false/.test(t),
            groesse: zahl('HEADER_LOGO_GROESSE', FEIN_STANDARD.groesse),
            x: zahl('HEADER_LOGO_X', FEIN_STANDARD.x),
            y: zahl('HEADER_LOGO_Y', FEIN_STANDARD.y),
        };
    } catch {
        return { mitKreis: false, anzeigen: true, ...FEIN_STANDARD };
    }
}

/** Schreibt die Stil-Datei. Nicht angegebene Werte bleiben, wie sie sind. */
function stilDateiSchreiben(aenderung) {
    const alt = stilLesen();
    const mitKreis = aenderung.mitKreis ?? alt.mitKreis;
    const anzeigen = aenderung.anzeigen ?? alt.anzeigen;
    const groesse = aenderung.groesse ?? alt.groesse;
    const x = aenderung.x ?? alt.x;
    const y = aenderung.y ?? alt.y;
    const inhalt = `/**
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
 *
 * HEADER_LOGO_GROESSE / HEADER_LOGO_X / HEADER_LOGO_Y
 *   Feinstellung des Motivs INNERHALB des Kreises – wirkt nur mit Kreis.
 *   Der Kreis selbst bleibt immer 32x32, damit er zu den runden Knoepfen
 *   rechts in der Kopfzeile passt.
 *     GROESSE  Prozent der Kreisflaeche (${FEIN_GRENZEN.groesse[0]}-${FEIN_GRENZEN.groesse[1]}, Standard ${FEIN_STANDARD.groesse}).
 *              Ueber 100 ragt das Motiv ueber den Kreis hinaus und wird an
 *              der Rundung beschnitten – das ist der randfuellende Look.
 *     X        Verschiebung in Pixeln, negativ = nach links  (${FEIN_GRENZEN.x[0]} bis ${FEIN_GRENZEN.x[1]})
 *     Y        Verschiebung in Pixeln, negativ = nach oben   (${FEIN_GRENZEN.y[0]} bis ${FEIN_GRENZEN.y[1]})
 *   Aendern mit: npm run logo:stil -- --logo-groesse 96 --logo-x -1 --logo-y 0
 */
export const HEADER_LOGO_MIT_KREIS = ${mitKreis};
export const HEADER_LOGO_ANZEIGEN = ${anzeigen};
export const HEADER_LOGO_GROESSE = ${groesse};
export const HEADER_LOGO_X = ${x};
export const HEADER_LOGO_Y = ${y};
`;
    const pfad = path.join(REPO, STIL_DATEI);
    fs.mkdirSync(path.dirname(pfad), { recursive: true });
    fs.writeFileSync(pfad, inhalt);
}

/**
 * Was zwischen den Markern in index.html steht, wenn das Symbol an ist.
 * Die Zeilen stehen hier, damit sie beim Wiedereinschalten exakt so
 * zurueckkommen – ausgeschaltet werden sie naemlich entfernt, nicht
 * auskommentiert: HTML-Kommentare lassen sich nicht verschachteln, und die
 * Marker sind selbst Kommentare.
 */
const HTML_BLOECKE = {
    'TAB-SYMBOL': [
        '    <link rel="icon" type="image/svg+xml" href="/favicon-theme.svg" />',
        '    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
        '    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />',
    ],
    'APP-SYMBOL': ['    <link rel="apple-touch-icon" href="/icons/icon-192.png" />'],
};
const HTML_AUS = '    <!-- ausgeschaltet ueber /logo-tausch: der Browser zeigt sein Standardsymbol -->';

/** Blendet das Tab- bzw. App-Symbol in index.html ein oder aus. */
function htmlBlockSchalten(bereich, anzeigen) {
    const pfad = path.join(REPO, 'index.html');
    const html = fs.readFileSync(pfad, 'utf8');
    // Zeilenende der Datei uebernehmen – unter Windows ist es CRLF, ein fest
    // verdrahtetes \n wuerde die Datei uneinheitlich machen und den Vergleich
    // "schon im gewuenschten Zustand" immer fehlschlagen lassen.
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const re = new RegExp(`(<!-- AURA-${bereich}-START[^]*?-->\\r?\\n)([^]*?)([ \\t]*<!-- AURA-${bereich}-ENDE -->)`, 'm');
    const treffer = html.match(re);
    if (!treffer) {
        abbruch(
            `In index.html fehlt der Marker AURA-${bereich}-START oder -ENDE.\n` +
                'Die Marker steuern, ob das Symbol eingebunden wird – bitte nicht von Hand entfernen.',
        );
    }
    const neuerInhalt = (anzeigen ? HTML_BLOECKE[bereich].join(eol) : HTML_AUS) + eol;
    if (treffer[2] === neuerInhalt) return false; // schon im gewuenschten Zustand
    fs.writeFileSync(pfad, html.replace(re, `$1${neuerInhalt}$3`));
    return true;
}

/**
 * Leert bzw. fuellt das icons-Array in public/manifest.json.
 *
 * Bewusst per Textersetzung statt ueber JSON.parse/stringify: Letzteres wuerde
 * die kompakt geschriebenen Eintraege auf je fuenf Zeilen aufblaehen und bei
 * jedem Umschalten einen unnoetig grossen Unterschied erzeugen.
 */
const MANIFEST_ICONS_AN = [
    '  "icons": [',
    '    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },',
    '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },',
    '    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }',
    '  ]',
];
const MANIFEST_ICONS_AUS = ['  "icons": []'];

function manifestSymbolSchalten(anzeigen) {
    const pfad = path.join(REPO, 'public/manifest.json');
    const text = fs.readFileSync(pfad, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const re = /[ \t]*"icons":\s*\[[^\]]*\]/;
    if (!re.test(text)) abbruch('In public/manifest.json fehlt das icons-Feld.');
    const neu = (anzeigen ? MANIFEST_ICONS_AN : MANIFEST_ICONS_AUS).join(eol);
    const ersetzt = text.replace(re, neu);
    if (ersetzt === text) return false;
    fs.writeFileSync(pfad, ersetzt);
    // Gegenpruefen, dass die Datei gueltiges JSON geblieben ist
    try {
        JSON.parse(ersetzt);
    } catch (e) {
        abbruch(`public/manifest.json ist nach der Aenderung kein gueltiges JSON mehr: ${e.message}`);
    }
    return true;
}

function kreisSchreiben(wert) {
    if (wert === null) return;
    // Unsinnige Werte NICHT stillschweigend als "nein" durchgehen lassen –
    // ein Tippfehler wuerde sonst unbemerkt das Aussehen der App aendern.
    if (!KREIS_JA.includes(wert) && !KREIS_NEIN.includes(wert)) {
        abbruch(
            `Unbekannter Wert fuer --kreis: "${wert}"\n` +
                `Gueltig sind: ja (Logo im runden Chip, 32x32) oder nein (Logo frei stehend, 40x40)`,
        );
    }
    const istWahr = KREIS_JA.includes(wert);
    stilDateiSchreiben({ mitKreis: istWahr });
}

/**
 * Prueft eine Feinstellungs-Angabe von der Kommandozeile. Auch hier gilt:
 * lieber abbrechen als einen Tippfehler stillschweigend als 0 durchgehen
 * lassen – sonst springt das Logo unerklaerlich in die Mitte zurueck.
 */
function feinWertPruefen(name, wert, [min, max], einheit, erklaerung = '') {
    if (wert === null) return null;
    const zahl = Number(wert);
    if (!Number.isInteger(zahl)) {
        abbruch(`Unbekannter Wert fuer --${name}: "${wert}"\nErwartet wird eine ganze Zahl von ${min} bis ${max} (${einheit}).`);
    }
    if (zahl < min || zahl > max) {
        abbruch(
            `--${name} liegt ausserhalb des Bereichs: ${zahl}\n` +
                `Gueltig sind ${min} bis ${max} (${einheit}).` +
                (erklaerung ? `\n${erklaerung}` : ''),
        );
    }
    return zahl;
}

/**
 * Liest die Ausrichtung des Homescreen-Symbols: Kommandozeile schlaegt Datei,
 * Datei schlaegt Standard. Prueft dabei die Werte.
 */
function appJustageErmitteln(mitEigenemHintergrund = false) {
    const alt = appJustageLesen(mitEigenemHintergrund);
    return {
        groesse:
            feinWertPruefen(
                'app-groesse',
                OPT.appGroesse,
                APP_GRENZEN.groesse,
                'Prozent der Kachelflaeche',
                'Unter 40 % verliert sich das Motiv auf der Kachel, ueber 130 % ist nur noch ein Ausschnitt zu sehen.',
            ) ?? alt.groesse,
        x:
            feinWertPruefen(
                'app-x',
                OPT.appX,
                APP_GRENZEN.x,
                'Prozent der Kantenlaenge',
                'Bei mehr als 25 % haengt das Motiv zur Haelfte aus der Kachel heraus.',
            ) ?? alt.x,
        y:
            feinWertPruefen(
                'app-y',
                OPT.appY,
                APP_GRENZEN.y,
                'Prozent der Kantenlaenge',
                'Bei mehr als 25 % haengt das Motiv zur Haelfte aus der Kachel heraus.',
            ) ?? alt.y,
    };
}

/** Aus der Justage wird der Rand-Anteil, mit dem bildSkalieren arbeitet.
 *  70 % Motiv = 15 % Rand je Seite; ueber 100 % wird der Rand negativ und das
 *  Motiv ragt bewusst ueber die Kachel hinaus. */
const appRandVon = (groesse) => (100 - groesse) / 200;

/** Kurzform der Justage fuer den Zustand. Aendert sie sich, muessen die
 *  Symbole neu erzeugt werden – anders als beim Kopfzeilen-Logo steckt die
 *  Ausrichtung hier im Bild und nicht im Quelltext. */
const justageSchluessel = (j) => `${j.groesse}/${j.x}/${j.y}`;

/** Liest die drei Feinstellungs-Angaben und ergaenzt fehlende aus dem Ist-Stand. */
function feinstellungLesen() {
    const alt = stilLesen();
    return {
        groesse: feinWertPruefen('logo-groesse', OPT.logoGroesse, FEIN_GRENZEN.groesse, 'Prozent') ?? alt.groesse,
        x: feinWertPruefen('logo-x', OPT.logoX, FEIN_GRENZEN.x, 'Pixel') ?? alt.x,
        y: feinWertPruefen('logo-y', OPT.logoY, FEIN_GRENZEN.y, 'Pixel') ?? alt.y,
    };
}

/** Schreibt die Feinstellung in die Stil-Datei und meldet, was gesetzt wurde. */
function feinstellungSchreiben() {
    if (!hatFeinstellung()) return null;
    const fein = feinstellungLesen();
    stilDateiSchreiben(fein);
    return fein;
}

// ----------------------------------------- Nur Stil aendern (--nur-stil --kreis ja|nein)

function nurStilAendernMain() {
    if (!OPT.kreis && !OPT.anzeigen && !hatFeinstellung()) {
        abbruch(
            'Mit --nur-stil muss --kreis ja|nein, --anzeigen <gruppen> und/oder\n' +
                '--logo-groesse/--logo-x/--logo-y angegeben werden.',
        );
    }
    // Die Feinstellung wirkt nur im Kreis. Wer sie ohne Kreis setzt, wuerde
    // sonst bauen, ausrollen und sich wundern, dass sich nichts tut.
    if (hatFeinstellung()) {
        const kreisNachher = OPT.kreis ? KREIS_JA.includes(OPT.kreis) : stilLesen().mitKreis;
        if (!kreisNachher) {
            abbruch(
                'Groesse und Position des Logos lassen sich nur einstellen, wenn das Logo\n' +
                    'in einem Kreis sitzt. Ohne Kreis nutzt das Motiv immer die volle Flaeche.\n\n' +
                    'Entweder den Kreis mit einschalten (--kreis ja) oder die Angaben\n' +
                    '--logo-groesse/--logo-x/--logo-y weglassen.',
            );
        }
    }
    console.log('\n=== Aura Logo-Werkstatt (nur Stil) ===\n');
    const bk = backupAnlegen({ schwarz: quelleFinden(OPT.quelle, 'logo-schwarz'), weiss: quelleFinden(OPT.quelle, 'logo-weiss'), hintergrund: quelleFinden(OPT.quelle, 'logo-hintergrund'), });
    if (bk.isNew) console.log(`  Backup angelegt: branding/backup/${path.basename(bk.ordner)}`);
    else console.log(`  Der aktuelle Stand ist bereits gesichert.`);

    const sichtbarkeit = anzeigenAnwenden(OPT.anzeigen);
    if (sichtbarkeit) {
        if (sichtbarkeit.length) sichtbarkeit.forEach((z) => console.log(`  ${z}`));
        else console.log('  Sichtbarkeit: unveraendert');
    }

    if (OPT.kreis) {
        kreisSchreiben(OPT.kreis);
        console.log(`  Kreis-Einstellung geaendert: ${KREIS_JA.includes(OPT.kreis)}`);
    }
    const fein = feinstellungSchreiben();
    if (fein) console.log(`  Logo im Kreis: ${fein.groesse} %, versetzt um x ${fein.x} px, y ${fein.y} px`);

    const state = stateLesen();
    if (OPT.kreis) state.kreis = KREIS_JA.includes(OPT.kreis);
    if (fein) state.fein = fein;
    if (OPT.anzeigen) state.sichtbar = OPT.anzeigen.split(',').map((g) => g.trim()).filter(Boolean);
    fs.mkdirSync(BRANDING, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    console.log(gruen('\nFertig. Danach noch bauen und ausrollen (npm run build + Deploy).\n'));
}

// ---------------------------------------------------------------- Bildarbeit

async function bildAnalysieren(page, url) {
    return page.evaluate(async (u) => {
        const img = new Image();
        img.src = u;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        const d = ctx.getImageData(0, 0, 128, 128).data;
        let durchsichtig = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 250) durchsichtig++;
        return {
            breite: img.naturalWidth,
            hoehe: img.naturalHeight,
            anteilDurchsichtig: durchsichtig / (128 * 128),
        };
    }, url);
}

/**
 * Skaliert ein Bild auf ein Quadrat der Kantenlaenge `groesse`.
 *
 * Freigestellte Bilder haben oft viel leeren Rand, und das Motiv sitzt selten
 * exakt in der Bildmitte (Saschas erste Logos: Motiv auf 12 % der Flaeche,
 * 98 Pixel aus der Mitte nach links versetzt). Deshalb wird zuerst der
 * sichtbare Inhalt gesucht und das Quadrat um DESSEN Mitte gelegt – sonst
 * waere das Logo im runden Chip klein und schief.
 *
 * `rand` haelt danach bewusst Luft frei (0.06 = 6 % je Seite). Bei Bildern
 * ohne durchsichtige Stellen (fertiges Hintergrundbild) gibt es nichts zu
 * beschneiden – dann bleibt es beim mittigen quadratischen Zuschnitt.
 */
async function bildSkalieren(page, url, groesse, rand = 0, versatz = { x: 0, y: 0 }) {
    const b64 = await page.evaluate(
        async ({ u, g, r, vx, vy }) => {
            const img = new Image();
            img.src = u;
            await img.decode();
            const bw = img.naturalWidth;
            const bh = img.naturalHeight;

            // Sichtbaren Inhalt suchen (Alpha ueber 16 zaehlt als sichtbar)
            const mess = document.createElement('canvas');
            mess.width = bw;
            mess.height = bh;
            const mctx = mess.getContext('2d');
            mctx.drawImage(img, 0, 0);
            const daten = mctx.getImageData(0, 0, bw, bh).data;
            let minX = bw, maxX = -1, minY = bh, maxY = -1;
            for (let y = 0; y < bh; y++) {
                for (let x = 0; x < bw; x++) {
                    if (daten[(y * bw + x) * 4 + 3] > 16) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            // Quadratischen Ausschnitt festlegen
            let s, sx, sy;
            if (maxX < 0 || (minX === 0 && minY === 0 && maxX === bw - 1 && maxY === bh - 1)) {
                // nichts sichtbar oder randlos deckend -> wie bisher mittig zuschneiden
                s = Math.min(bw, bh);
                sx = (bw - s) / 2;
                sy = (bh - s) / 2;
            } else {
                const mw = maxX - minX + 1;
                const mh = maxY - minY + 1;
                s = Math.max(mw, mh);
                sx = minX + mw / 2 - s / 2;
                sy = minY + mh / 2 - s / 2;
            }

            // Ausschnitt in Originalaufloesung, danach schrittweise halbieren –
            // in einem Rutsch herunterrechnen wuerde ausfransen
            let cur = document.createElement('canvas');
            cur.width = cur.height = Math.round(s);
            let ctx = cur.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, s, s, 0, 0, cur.width, cur.height);

            const innen = Math.max(1, Math.round(g * (1 - 2 * r)));
            let kante = cur.width;
            while (kante / 2 > innen) {
                const next = document.createElement('canvas');
                next.width = next.height = Math.round(kante / 2);
                const nctx = next.getContext('2d');
                nctx.imageSmoothingEnabled = true;
                nctx.imageSmoothingQuality = 'high';
                nctx.drawImage(cur, 0, 0, next.width, next.height);
                cur = next;
                kante = next.width;
            }

            const out = document.createElement('canvas');
            out.width = out.height = g;
            const octx = out.getContext('2d');
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';
            // Mittig, plus die gewuenschte Verschiebung. Ragt das Motiv dabei
            // ueber den Rand hinaus (grosse Werte oder Groesse ueber 100 %),
            // beschneidet die Leinwand von selbst – genau wie gewollt.
            const mitte = (g - innen) / 2;
            octx.drawImage(cur, mitte + (g * vx) / 100, mitte + (g * vy) / 100, innen, innen);
            return out.toDataURL('image/png').split(',')[1];
        },
        { u: url, g: groesse, r: rand, vx: versatz.x || 0, vy: versatz.y || 0 },
    );
    return Buffer.from(b64, 'base64');
}

async function bildAufHintergrund(page, url, groesse, farbe, rand) {
    const b64 = await page.evaluate(
        async ({ u, g, f, r }) => {
            const img = new Image();
            img.src = u;
            await img.decode();
            const out = document.createElement('canvas');
            out.width = out.height = g;
            const ctx = out.getContext('2d');
            ctx.fillStyle = f;
            ctx.fillRect(0, 0, g, g);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Motiv mittig einpassen, mit Rand – Android schneidet Symbole rund zu
            const platz = g * (1 - 2 * r);
            const faktor = Math.min(platz / img.naturalWidth, platz / img.naturalHeight);
            const b = img.naturalWidth * faktor;
            const h = img.naturalHeight * faktor;
            ctx.drawImage(img, (g - b) / 2, (g - h) / 2, b, h);
            return out.toDataURL('image/png').split(',')[1];
        },
        { u: url, g: groesse, f: farbe, r: rand },
    );
    return Buffer.from(b64, 'base64');
}

function svgFaviconBauen(pngSchwarz, pngWeiss, kante) {
    const s = pngSchwarz.toString('base64');
    const w = pngWeiss.toString('base64');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${kante} ${kante}" width="${kante}" height="${kante}">
  <!-- Zwei Fassungen desselben Logos. Der Browser blendet die passende ein:
       heller Browser-Modus -> schwarzes Motiv, dunkler Modus -> weisses Motiv.
       Erzeugt von tools/branding/build-logos.mjs – nicht von Hand bearbeiten. -->
  <style>
    .aura-dunkles-motiv { display: inline }
    .aura-helles-motiv { display: none }
    @media (prefers-color-scheme: dark) {
      .aura-dunkles-motiv { display: none }
      .aura-helles-motiv { display: inline }
    }
  </style>
  <image class="aura-dunkles-motiv" width="${kante}" height="${kante}" href="data:image/png;base64,${s}"/>
  <image class="aura-helles-motiv" width="${kante}" height="${kante}" href="data:image/png;base64,${w}"/>
</svg>
`;
}

// ----------------------------------------------------------------- Hauptlauf

/**
 * Bricht mit einer erklaerenden Meldung ab, wenn niemand weiss, wo die
 * Quellbilder liegen. Tritt vor allem auf einem frisch geklonten Repo auf –
 * die Merkdatei ist absichtlich nicht versioniert.
 */
function eingangPruefen() {
    if (OPT.quelle) return;
    abbruch(
        'Es ist nicht festgelegt, wo die Logo-Bilder liegen.\n\n' +
            'Am einfachsten: den Assistenten starten ("Logo tauschen.cmd" bzw. npm run logo) –\n' +
            'er fragt einmalig nach dem Ordner und merkt ihn sich.\n\n' +
            'Von Hand geht auch eines davon:\n' +
            `  - den Pfad in ${path.relative(REPO, EINGANG_MERKDATEI)} schreiben\n` +
            '  - die Umgebungsvariable AURA_LOGO_EINGANG setzen\n' +
            '  - beim Aufruf --quelle <pfad> mitgeben',
    );
}

async function hauptlauf() {
    console.log('\n=== Aura Logo-Werkstatt ===\n');
    eingangPruefen();
    console.log('Eingangsordner: ' + OPT.quelle);
    if (OPT.dryRun) console.log(gelb('Trockenlauf – es wird nichts geschrieben.'));

    const ausgewaehltGruppen = auswahlVerarbeiten();
    console.log(`Zielgruppen: ${ausgewaehltGruppen.map(g => GRUPPEN[g]).join(', ')}\n`);

    if (!fs.existsSync(OPT.quelle)) {
        abbruch(
            `Den Eingangsordner gibt es nicht:\n  ${OPT.quelle}\n\n` +
                'Lege ihn an und lege dort logo-schwarz.png, logo-weiss.png (beide erforderlich) und optional logo-hintergrund.png hinein.',
        );
    }

    // Alte Datei-Warnung
    if (quelleFinden(OPT.quelle, 'logo-transparent')) {
        console.log(gelb(
            'Hinweis: "logo-transparent.png" wird nicht mehr verwendet. Es heisst jetzt\n' +
            '         logo-schwarz.png (Motiv in Schwarz) bzw. logo-weiss.png (Motiv in Weiss).'
        ));
    }

    const quellen = {
        schwarz: quelleFinden(OPT.quelle, 'logo-schwarz'),
        weiss: quelleFinden(OPT.quelle, 'logo-weiss'),
        hintergrund: quelleFinden(OPT.quelle, 'logo-hintergrund'), // optional
    };

    if (!quellen.schwarz && !quellen.weiss && !quellen.hintergrund) {
        abbruch(
            `Im Eingangsordner liegt kein passendes Bild:\n  ${OPT.quelle}\n\n` +
                'Erwartet werden diese Dateien:\n' +
                '  logo-schwarz.png      (Motiv in Schwarz, freigestellt – fuer helle Themes)\n' +
                '  logo-weiss.png        (Motiv in Weiss, freigestellt – fuer dunkle Themes)\n' +
                '  logo-hintergrund.png  (optional: fertiges Quadrat mit Hintergrund fuers Homescreen-Symbol)',
        );
    }

    // Bestimme, welche Bilder gebraucht werden
    const brauchtSchwarz = ausgewaehltGruppen.includes('kopfzeile') || ausgewaehltGruppen.includes('tab');
    const brauchtWeiss = ausgewaehltGruppen.includes('kopfzeile') || ausgewaehltGruppen.includes('tab') || (ausgewaehltGruppen.includes('app') && !quellen.hintergrund);
    if (brauchtSchwarz && !quellen.schwarz) {
        const woFuer = [];
        if (ausgewaehltGruppen.includes('kopfzeile')) woFuer.push(GRUPPEN.kopfzeile);
        if (ausgewaehltGruppen.includes('tab')) woFuer.push(GRUPPEN.tab);
        abbruch(`Es fehlt: logo-schwarz.png – wird gebraucht fuer: ${woFuer.join(', ')}`);
    }
    if (brauchtWeiss && !quellen.weiss) {
        const woFuer = [];
        if (ausgewaehltGruppen.includes('kopfzeile')) woFuer.push(GRUPPEN.kopfzeile);
        if (ausgewaehltGruppen.includes('tab')) woFuer.push(GRUPPEN.tab);
        if (ausgewaehltGruppen.includes('app') && !quellen.hintergrund) woFuer.push(GRUPPEN.app);
        abbruch(`Es fehlt: logo-weiss.png – wird gebraucht fuer: ${woFuer.join(', ')}`);
    }

    // Ausrichtung des Homescreen-Symbols. Wird hier einmal ermittelt und gilt
    // fuer beide Symbolgroessen (192 und 512) – deshalb sind x/y in Prozent.
    const appJustage = appJustageErmitteln(Boolean(quellen.hintergrund));
    const appRand = appRandVon(appJustage.groesse);
    const appVersatz = { x: appJustage.x, y: appJustage.y };
    if (ausgewaehltGruppen.includes('app')) {
        console.log(`  Symbol-Ausrichtung: ${appJustage.groesse} % der Kachel, x ${appJustage.x} %, y ${appJustage.y} %`);
    } else if (hatAppJustage()) {
        // Frueh melden, nicht erst am Ende: Steht die Gruppe nicht in der
        // Auswahl, endet der Lauf womoeglich vorher mit "nichts zu tun" – die
        // Angabe waere dann wirkungslos verpufft, ohne dass es jemand merkt.
        console.log(
            gelb(
                '  Hinweis: --app-groesse/--app-x/--app-y wirken nur, wenn "app" in --ziele steht.\n' +
                    '           Die Ausrichtung bleibt unveraendert. Gemeint war vermutlich:\n' +
                    `           npm run logo:build -- --ziele app${OPT.appGroesse ? ` --app-groesse ${OPT.appGroesse}` : ''}` +
                    `${OPT.appX ? ` --app-x ${OPT.appX}` : ''}${OPT.appY ? ` --app-y ${OPT.appY}` : ''}`,
            ),
        );
    }

    // Was hat sich seit dem letzten Lauf geaendert?
    const state = stateLesen();
    const zuTun = {};

    // Der Zustand wird PRO GRUPPE gefuehrt, nicht pro Motiv.
    //
    // Der Grund: Mehrere Gruppen teilen sich dieselben Quellbilder (Kopfzeile
    // und Tab-Symbol nutzen beide das schwarze und weisse Motiv; das App-Symbol
    // ohne eigenes Hintergrundbild nutzt ebenfalls das weisse). Ein Zustand pro
    // Motiv beantwortet nur "hat sich dieses Bild geaendert?" – gebraucht wird
    // aber "ist DIESE Gruppe mit diesem Bild schon gebaut worden?". Sonst gilt:
    // Wer erst das Tab-Symbol tauscht und danach die Kopfzeile nachziehen will,
    // bekommt "Nichts zu tun" und behaelt das alte Header-Logo.
    const gruppenState = state.gruppen || {};
    const hashCache = {};
    const hashVon = (art) => {
        if (!quellen[art]) return null;
        if (!hashCache[art]) hashCache[art] = sha256(quellen[art]);
        return hashCache[art];
    };

    const zuTuendeGruppen = [];
    for (const g of ausgewaehltGruppen) {
        const arten = artenFuerGruppe(g, quellen).filter((a) => quellen[a]);
        if (!arten.length) continue;
        // Beim App-Symbol zaehlt nicht nur das Quellbild: Aendert sich die
        // Ausrichtung, muss neu gerendert werden, obwohl das Bild dasselbe ist.
        // Beim Kopfzeilen-Logo entfaellt das – dort rechnet die App zur Laufzeit.
        const justageGleich = g !== 'app' || gruppenState.app?.justage === justageSchluessel(appJustage);
        const schonGebaut = arten.every((a) => gruppenState[g]?.[a] === hashVon(a)) && justageGleich;
        if (!OPT.force && schonGebaut) {
            console.log(`  ${GRUPPEN[g]}: unveraendert seit letztem Lauf`);
            continue;
        }
        if (!justageGleich && g === 'app') {
            console.log(`  ${GRUPPEN[g]}: Ausrichtung geaendert – Symbole werden neu erzeugt`);
        }
        zuTuendeGruppen.push(g);
    }

    // Fehlende Motive melden, damit der Bericht nachvollziehbar bleibt
    for (const art of ['schwarz', 'weiss']) {
        if (!quellen[art]) {
            console.log(`  ${art}: kein Bild vorhanden – wird fuer die gewaehlten Gruppen nicht gebraucht`);
        }
    }

    const zuAenderndeArten = [];
    for (const g of zuTuendeGruppen) {
        for (const art of artenFuerGruppe(g, quellen)) {
            if (quellen[art] && !zuAenderndeArten.includes(art)) zuAenderndeArten.push(art);
        }
    }

    // Beide Motive gehoeren zusammen: Die Kopfzeile zeigt sie im Wechsel, das
    // Tab-SVG enthaelt beide in EINER Datei. Aendert sich eines, muss das andere
    // mitgezogen werden – sonst stuende im SVG ein alter neben einem neuen Stand.
    // Nur wenn eine Gruppe gewaehlt ist, die beide braucht, und nur fuer Motive,
    // die auch wirklich im Eingangsordner liegen (wer nur das App-Symbol tauscht,
    // hat womoeglich gar kein schwarzes Motiv dabei).
    const brauchtBeideMotive = zuTuendeGruppen.includes('kopfzeile') || zuTuendeGruppen.includes('tab');
    if (brauchtBeideMotive && (zuAenderndeArten.includes('schwarz') || zuAenderndeArten.includes('weiss'))) {
        for (const art of ['schwarz', 'weiss']) {
            if (quellen[art] && !zuAenderndeArten.includes(art)) zuAenderndeArten.push(art);
        }
    }

    for (const art of zuAenderndeArten) {
        zuTun[art] = { datei: quellen[art], sha256: sha256(quellen[art]) };
    }

    if (!Object.keys(zuTun).length) {
        console.log(gruen('\nNichts zu tun – alle Bilder sind unveraendert.'));
        console.log('Trotzdem neu erzeugen?  npm run logo:build -- --force\n');
        process.exit(2);
    }

    const browser = await chromium.launch().catch((e) => {
        abbruch(
            'Chromium konnte nicht gestartet werden. Einmalig nachinstallieren mit:\n' +
                '  npx playwright install chromium\n\nUrspruengliche Meldung: ' + e.message,
        );
    });
    const page = await browser.newPage();

    const bericht = [];
    const warnungen = [];

    try {
        // Mindestgroessen pro Quelle: berechnet aus den tatsaechlich gewahlten Zielen
        const mindestgroesse = { schwarz: 0, weiss: 0, hintergrund: 512 };
        for (const z of ZIELE) {
            if (z.quelle === 'schwarz' && ausgewaehltGruppen.includes(z.gruppe)) mindestgroesse.schwarz = Math.max(mindestgroesse.schwarz, z.groesse);
        }
        for (const z of ZIELE) {
            if (z.quelle === 'weiss' && ausgewaehltGruppen.includes(z.gruppe)) mindestgroesse.weiss = Math.max(mindestgroesse.weiss, z.groesse);
        }
        if (ausgewaehltGruppen.includes('app') && !quellen.hintergrund) mindestgroesse.weiss = Math.max(mindestgroesse.weiss, 512);
        // Das Tab-SVG steht nicht in ZIELE, braucht aber beide Motive in SVG_ZIEL.groesse
        if (ausgewaehltGruppen.includes('tab')) {
            mindestgroesse.schwarz = Math.max(mindestgroesse.schwarz, SVG_ZIEL.groesse);
            mindestgroesse.weiss = Math.max(mindestgroesse.weiss, SVG_ZIEL.groesse);
        }

        // Quellbilder pruefen
        for (const [art, info] of Object.entries(zuTun)) {
            const url = dataUrl(info.datei);
            const a = await bildAnalysieren(page, url);
            info.url = url;
            info.analyse = a;

            const kante = Math.min(a.breite, a.hoehe);
            // Kein Rueckfall auf 512: Eine abgewaehlte Gruppe darf die Pruefung
            // nicht verschaerfen. mindestgroesse ist fuer jede gebrauchte Art
            // gesetzt – wird eine Art nicht gebraucht, steht sie gar nicht in zuTun.
            const groessteZielgroesse = mindestgroesse[art] ?? 0;

            console.log(`\n  ${path.basename(info.datei)}: ${a.breite}x${a.hoehe} Pixel`);

            if (kante < groessteZielgroesse) {
                abbruch(
                    `Das Bild "${path.basename(info.datei)}" ist mit ${kante} Pixel zu klein.\n` +
                        `Es wird mindestens ${groessteZielgroesse} Pixel Kantenlaenge gebraucht, besser 1024.`,
                );
            }
            if (kante < 512) {
                warnungen.push(
                    `${path.basename(info.datei)} ist nur ${kante} Pixel gross – auf modernen Bildschirmen kann das leicht unscharf wirken (empfohlen: 1024).`,
                );
            }
            if (Math.abs(a.breite - a.hoehe) > 2) {
                warnungen.push(
                    `${path.basename(info.datei)} ist nicht quadratisch (${a.breite}x${a.hoehe}) – kein Problem: der leere Rand wurde weggeschnitten und das Motiv zentriert.`,
                );
            }
            if ((art === 'schwarz' || art === 'weiss') && a.anteilDurchsichtig < 0.01) {
                abbruch(
                    `Das Bild "${path.basename(info.datei)}" hat keinen durchsichtigen Hintergrund.\n` +
                        'Fuer Header-Logo und Tab-Symbol wird ein freigestelltes Bild gebraucht (PNG mit Transparenz).\n' +
                        'Tipp: JPG kann grundsaetzlich keine Transparenz.',
                );
            }
            if (art === 'hintergrund' && a.anteilDurchsichtig > 0.02) {
                warnungen.push(
                    `${path.basename(info.datei)} hat durchsichtige Stellen – auf dem Homescreen erscheint dort der Systemhintergrund. Gewollt?`,
                );
            }
        }

        // Backup, dann erzeugen
        if (!OPT.dryRun) {
            const bk = backupAnlegen(quellen);
            if (bk.isNew) {
                console.log(`\n  Backup angelegt: branding/backup/${path.basename(bk.ordner)} (${bk.anzahl} Datei(en))`);
            } else {
                console.log(`\n  Der aktuelle Stand ist bereits gesichert in branding/backup/${path.basename(bk.ordner)} – kein neues Backup noetig.`);
            }
        }

        // Verarbeite Ziele
        // Icon-Quelle bestimmt sich nach den vorhandenen Quellen, nicht nach zuTun.
        // Wenn Sascha ein Hintergrundbild liefert, gewinnt es – auch wenn es unverändert ist.
        let iconQuelle = null; // Wird für icon-192.png und icon-512.png genutzt
        if (quellen.hintergrund) {
            // Hintergrundbild vorhanden – prüfen, ob es Info hat
            let info = zuTun.hintergrund;
            if (!info) {
                // Bild liegt vor, ist aber nicht neu. url trotzdem setzen, damit es verarbeitet wird.
                info = { datei: quellen.hintergrund, url: dataUrl(quellen.hintergrund), sha256: sha256(quellen.hintergrund) };
            }
            iconQuelle = { art: 'hintergrund', info: info };
        } else if (zuTun.weiss) {
            iconQuelle = { art: 'weiss', info: zuTun.weiss };
        }

        for (const ziel of ZIELE) {
            // Gruppe nicht gewählt -> überspringen
            if (!ausgewaehltGruppen.includes(ziel.gruppe)) {
                bericht.push({ ...ziel, status: 'nicht gewaehlt' });
                continue;
            }
            // Gewaehlt, aber mit diesen Quellbildern schon gebaut. Ohne diese
            // Weiche wuerde die Gruppe neu geschrieben, sobald eine ANDERE
            // gewaehlte Gruppe dasselbe Motiv anfasst.
            if (!zuTuendeGruppen.includes(ziel.gruppe)) {
                bericht.push({ ...ziel, status: 'unveraendert' });
                continue;
            }

            let info = zuTun[ziel.quelle];
            let isIcon = ziel.quelle === 'icon';
            let ikonArt = null;

            if (isIcon) {
                // Auflösen des Icon-Ziels
                if (!iconQuelle) {
                    bericht.push({ ...ziel, status: 'unveraendert' });
                    continue;
                }
                info = iconQuelle.info;
                ikonArt = iconQuelle.art;
            } else if (!info) {
                bericht.push({ ...ziel, status: 'unveraendert' });
                continue;
            }

            let buf;
            if (isIcon && ikonArt === 'hintergrund') {
                // Fertiges Hintergrundbild: nur zuschneiden – Groesse und
                // Versatz wirken hier wie ein Bildausschnitt (Zoom/Schieben).
                buf = await bildSkalieren(page, info.url, ziel.groesse, appRand, appVersatz);
                bericht.push({ ...ziel, status: 'neu (aus logo-hintergrund)', ist: `${ziel.groesse}x${ziel.groesse}` });
            } else if (isIcon && ikonArt === 'weiss') {
                // Weisses Logo freistellen, nach Justage einpassen, dann auf die
                // Hintergrundfarbe legen.
                const logoSkaliert = await bildSkalieren(page, info.url, ziel.groesse, appRand, appVersatz);
                const logoUrl = `data:image/png;base64,${logoSkaliert.toString('base64')}`;
                buf = await bildAufHintergrund(page, logoUrl, ziel.groesse, HINTERGRUND_FARBE, 0);
                bericht.push({ ...ziel, status: 'neu (aus logo-weiss + Hintergrund)', ist: `${ziel.groesse}x${ziel.groesse}` });
            } else {
                // Header-Logo und Favicons: freistellen, zentrieren, etwas Luft lassen
                buf = await bildSkalieren(page, info.url, ziel.groesse, LOGO_RAND);
                bericht.push({ ...ziel, status: 'neu', ist: `${ziel.groesse}x${ziel.groesse}` });
            }

            const pfad = path.join(REPO, ziel.datei);

            if (OPT.dryRun) {
                const kopf = pngInfo(buf);
                if (!kopf) abbruch(`Die erzeugte Datei ${ziel.datei} waere kein gueltiges PNG.`);
                continue;
            }

            fs.mkdirSync(path.dirname(pfad), { recursive: true });
            fs.writeFileSync(pfad, buf);

            // Verifikation: wirklich neu einlesen, nicht dem Schreibvorgang vertrauen
            const kopf = pngInfo(fs.readFileSync(pfad));
            if (!kopf) abbruch(`Die erzeugte Datei ${ziel.datei} ist kein gueltiges PNG.`);
            if (kopf.breite !== ziel.groesse || kopf.hoehe !== ziel.groesse) {
                abbruch(`${ziel.datei} hat ${kopf.breite}x${kopf.hoehe} statt ${ziel.groesse}x${ziel.groesse} Pixel.`);
            }
            if (kopf.farbTyp !== 6) {
                abbruch(`${ziel.datei} hat Farbtyp ${kopf.farbTyp} statt 6 (RGBA).`);
            }
        }

        // SVG-Favicon – nur wenn die Gruppe "tab" gewaehlt UND zu bauen ist
        if (zuTuendeGruppen.includes('tab')) {
            if (zuTun.schwarz && zuTun.weiss && !OPT.dryRun) {
                const pngSchwarz = await bildSkalieren(page, zuTun.schwarz.url, SVG_ZIEL.groesse, LOGO_RAND);
                const pngWeiss = await bildSkalieren(page, zuTun.weiss.url, SVG_ZIEL.groesse, LOGO_RAND);
                const svg = svgFaviconBauen(pngSchwarz, pngWeiss, SVG_ZIEL.groesse);
                const pfadSvg = path.join(REPO, SVG_ZIEL.datei);
                fs.mkdirSync(path.dirname(pfadSvg), { recursive: true });
                fs.writeFileSync(pfadSvg, svg);
                const inhalt = fs.readFileSync(pfadSvg, 'utf8');
                const hatSchwarzPng = inhalt.includes('data:image/png;base64,');
                const hatWeissPng = (inhalt.match(/data:image\/png;base64,/g) || []).length >= 2;
                const hatMediaQuery = inhalt.includes('prefers-color-scheme: dark');
                const groesse = fs.statSync(pfadSvg).size;
                if (!hatSchwarzPng || !hatWeissPng) abbruch(`SVG-Favicon konnte nicht korrekt erzeugt werden (fehlende Base64-Daten).`);
                if (!hatMediaQuery) abbruch(`SVG-Favicon fehlt prefers-color-scheme: dark.`);
                if (groesse < 1024) abbruch(`SVG-Favicon ist zu klein (${groesse} Bytes, erwartet > 1 KB).`);
                bericht.push({ ...SVG_ZIEL, status: 'neu', ist: `SVG (${groesse} Bytes)` });
            } else if (zuTun.schwarz && zuTun.weiss) {
                if (fs.existsSync(path.join(REPO, SVG_ZIEL.datei))) bericht.push({ ...SVG_ZIEL, status: 'unveraendert' });
                else bericht.push({ ...SVG_ZIEL, status: 'neu', ist: 'SVG' });
            } else if (!OPT.dryRun && fs.existsSync(path.join(REPO, SVG_ZIEL.datei))) {
                bericht.push({ ...SVG_ZIEL, status: 'unveraendert' });
            }
        } else {
            // Tab nicht gewählt
            if (fs.existsSync(path.join(REPO, SVG_ZIEL.datei))) bericht.push({ ...SVG_ZIEL, status: 'nicht gewaehlt' });
        }
    } finally {
        await browser.close();
    }

    // Zustand fortschreiben
    if (!OPT.dryRun) {
        const neu = stateLesen();
        // Pro Gruppe merken, mit WELCHEN Quellbildern sie gebaut wurde. Nur die
        // tatsaechlich gebauten Gruppen fortschreiben – eine uebersprungene
        // Gruppe behaelt ihren alten Eintrag und wird beim naechsten Mal
        // korrekt als "zu tun" erkannt.
        neu.gruppen = neu.gruppen || {};
        for (const g of zuTuendeGruppen) {
            const eintrag = {};
            for (const art of artenFuerGruppe(g, quellen)) {
                if (quellen[art]) eintrag[art] = zuTun[art]?.sha256 ?? sha256(quellen[art]);
            }
            // Beim App-Symbol gehoert die Ausrichtung zum Zustand: Sie steckt im
            // erzeugten Bild, nicht im Quelltext.
            if (g === 'app') eintrag.justage = justageSchluessel(appJustage);
            neu.gruppen[g] = eintrag;
        }
        // Die Ausrichtung selbst wird nur festgeschrieben, wenn das App-Symbol
        // auch wirklich gebaut wurde – sonst stuende in der Datei ein Wert, den
        // kein Bild abbildet.
        if (zuTuendeGruppen.includes('app')) appJustageSchreiben(appJustage);
        neu.stand = new Date().toISOString();
        neu.letzteZiele = ausgewaehltGruppen;
        if (OPT.kreis) {
            // Der Kreis gehoert zur Kopfzeile. Steht die nicht in der Auswahl,
            // wird das Aussehen NICHT heimlich mitgeaendert – sonst wundert sich
            // Sascha, warum ein Tausch des App-Symbols die Kopfzeile umbaut.
            // Hinweis statt Abbruch, damit ein zu viel gesetztes Flag den Lauf
            // nicht wegwirft.
            if (!ausgewaehltGruppen.includes('kopfzeile')) {
                warnungen.push(
                    '--kreis wurde angegeben, aber "Logo in der Kopfzeile" ist nicht ausgewaehlt – die Kreis-Einstellung bleibt unveraendert.',
                );
            } else {
                kreisSchreiben(OPT.kreis);
                neu.kreis = KREIS_JA.includes(OPT.kreis);
            }
        }
        if (hatFeinstellung()) {
            // Gleiche Ueberlegung wie beim Kreis: die Feinstellung gehoert zur
            // Kopfzeile und wird nur mitgeaendert, wenn die auch gewaehlt ist.
            if (!ausgewaehltGruppen.includes('kopfzeile')) {
                warnungen.push(
                    '--logo-groesse/--logo-x/--logo-y wurden angegeben, aber "Logo in der Kopfzeile" ist nicht ausgewaehlt – Groesse und Position bleiben unveraendert.',
                );
            } else {
                neu.fein = feinstellungSchreiben();
            }
        }
        fs.mkdirSync(BRANDING, { recursive: true });
        fs.writeFileSync(STATE, JSON.stringify(neu, null, 2));
    }

    // Bericht
    console.log('\n  ' + 'Datei'.padEnd(38) + 'Groesse'.padEnd(10) + 'Status');
    console.log('  ' + '-'.repeat(66));
    for (const z of bericht) {
        console.log('  ' + z.datei.padEnd(38) + `${z.groesse}x${z.groesse}`.padEnd(10) + z.status);
    }

    if (warnungen.length) {
        console.log('');
        warnungen.forEach((w) => console.log(gelb('  Hinweis: ' + w)));
    }

    console.log(gruen(`\nFertig.${OPT.dryRun ? ' (Trockenlauf – nichts geschrieben)' : ''}\n`));
}

// ------------------------------------------------- Vorschau (--vorschau)

/** Pfade der Vorschaubilder. Immer dieselben, damit ein offenes Bildfenster
 *  beim naechsten Durchgang den neuen Stand zeigt, statt Dateien anzuhaeufen. */
const VORSCHAU_BILD = path.join(BRANDING, 'vorschau-kopfzeile.png');
const VORSCHAU_APP_BILD = path.join(BRANDING, 'vorschau-appsymbol.png');

/** Vergroesserung der Lupen-Ansicht. 6-fach ist gross genug, um einen Pixel
 *  Versatz zu sehen, und laesst das Bild noch auf einen Bildschirm passen. */
const VORSCHAU_LUPE = 6;

/** Farben der Kopfzeile aus src-vis/themes/index.ts – das erste helle und das
 *  erste dunkle Preset, stellvertretend fuer alle. */
const VORSCHAU_THEMES = [
    { name: 'Helles Theme', bg: '#f9fafb', surface: '#ffffff', border: '#e5e7eb', text: '#111827', logo: 'schwarz' },
    { name: 'Dunkles Theme', bg: '#111827', surface: '#1f2937', border: '#374151', text: '#f9fafb', logo: 'weiss' },
];

/**
 * Zeichnet die Kopfzeile so, wie sie mit der gewaehlten Feinstellung aussehen
 * wird – einmal in echter Groesse (mit den runden Knoepfen rechts als Massstab)
 * und einmal achtfach vergroessert. Schreibt NUR das Vorschaubild, keine
 * Einstellung: Sascha soll erst schauen und dann entscheiden.
 */
async function vorschauMain() {
    const fein = feinstellungLesen();
    const assets = {
        schwarz: path.join(REPO, 'src-vis/assets/aura-header-logo-schwarz.png'),
        weiss: path.join(REPO, 'src-vis/assets/aura-header-logo-weiss.png'),
    };
    // Werden gerade neue Bilder getauscht, muss die Vorschau das KOMMENDE Motiv
    // zeigen, nicht das eingebaute. Dann wird direkt aus dem Eingangsordner
    // gerendert – mit derselben Rechnung wie beim Bauen. Nur so laesst sich die
    // Ausrichtung vor dem Bauen einstellen statt danach.
    const ausEingang = hatFlag('--aus-eingang');
    const quellen = ausEingang
        ? { schwarz: quelleFinden(OPT.quelle, 'logo-schwarz'), weiss: quelleFinden(OPT.quelle, 'logo-weiss') }
        : {};
    for (const art of ['schwarz', 'weiss']) {
        if (ausEingang) {
            if (!quellen[art]) {
                abbruch(
                    `Fuer die Vorschau fehlt das Quellbild logo-${art === 'weiss' ? 'weiss' : 'schwarz'}.png in:\n  ${OPT.quelle || '(Eingangsordner nicht festgelegt)'}`,
                );
            }
        } else if (!fs.existsSync(assets[art])) {
            abbruch(
                `Fuer die Vorschau fehlt das Kopfzeilen-Logo:\n  ${path.relative(REPO, assets[art])}\n\n` +
                    `Erst die Bilder erzeugen (npm run logo:build -- --ziele kopfzeile), dann die Vorschau.`,
            );
        }
    }

    // Genauso runden wie HeaderLogo.tsx, sonst zeigt die Lupe einen halben
    // Pixel mehr als die App spaeter wirklich rendert.
    const motivKante = Math.round((32 * fein.groesse) / 100);
    // Wird beim Rendern gefuellt – entweder aus den eingebauten Assets oder
    // frisch aus dem Eingangsordner.
    const motivUri = {};
    // Ein Chip in beliebigem Massstab. f=1 ist die echte Groesse in der App.
    const chip = (t, f) => `
      <div style="width:${32 * f}px;height:${32 * f}px;border-radius:9999px;display:flex;align-items:center;
                  justify-content:center;flex-shrink:0;overflow:hidden;
                  background:${t.bg};border:${f}px solid ${t.border}">
        <img src="${motivUri[t.logo]}" style="width:${motivKante * f}px;height:${motivKante * f}px;
             object-fit:contain;flex-shrink:0;max-width:none;
             transform:translate(${fein.x * f}px, ${fein.y * f}px)">
      </div>`;
    // Die runden Knoepfe rechts in der Kopfzeile – nur als Groessenvergleich.
    const knopf = (t) => `
      <div style="width:32px;height:32px;border-radius:9999px;background:${t.bg};
                  border:1px solid ${t.border};flex-shrink:0"></div>`;
    const zeile = (t) => `
      <div style="display:flex;align-items:center;gap:28px">
        <div style="width:118px;font:600 13px system-ui;color:#6b7280">${t.name}</div>
        <div style="width:360px;background:${t.surface};border:1px solid ${t.border};border-radius:10px;
                    padding:8px 12px;display:flex;align-items:center;gap:12px">
          ${chip(t, 1)}
          <div style="font:600 15px system-ui;color:${t.text};flex:1">Aura</div>
          ${knopf(t)}${knopf(t)}
        </div>
        <div style="background:${t.surface};border:1px solid ${t.border};border-radius:10px;padding:12px">
          ${chip(t, VORSCHAU_LUPE)}
        </div>
      </div>`;

    const versatzText = (wert, minus, plus) => (wert === 0 ? 'mittig' : `${Math.abs(wert)} px nach ${wert < 0 ? minus : plus}`);
    // Als Funktion, nicht als Wert: Die Motive stehen erst fest, wenn der
    // Browser laeuft (sie werden ggf. frisch aus dem Eingangsordner gerendert).
    const htmlBauen = () => `<body style="margin:0;background:#ffffff">
      <div id="blatt" style="display:inline-block;padding:26px 30px">
        <div style="font:700 17px system-ui;color:#111827">So sieht die Kopfzeile aus</div>
        <div style="font:400 13px system-ui;color:#6b7280;margin:6px 0 20px">
          Logo im Kreis: ${fein.groesse}&#8202;% &nbsp;·&nbsp; waagerecht ${versatzText(fein.x, 'links', 'rechts')}
          &nbsp;·&nbsp; senkrecht ${versatzText(fein.y, 'oben', 'unten')}
          <br>Links die echte Groesse – die beiden Kreise rechts daneben sind die Knoepfe der App als Massstab.
          Rechts dasselbe ${VORSCHAU_LUPE}-fach vergroessert.${ausEingang ? ' Gezeigt wird das neue Motiv aus dem Eingangsordner.' : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          ${VORSCHAU_THEMES.map(zeile).join('')}
        </div>
      </div>
    </body>`;

    const browser = await chromium.launch().catch((e) => {
        abbruch(
            'Chromium konnte nicht gestartet werden. Einmalig ausfuehren:\n' +
                '  npx playwright install chromium\n\nUrspruengliche Meldung: ' + e.message,
        );
    });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 2 });

        // Motive besorgen. Aus dem Eingangsordner wird mit derselben Rechnung
        // gerendert wie beim Bauen (160 px, LOGO_RAND) – so zeigt die Vorschau
        // genau das Motiv, das nachher im Bundle landet.
        for (const art of ['schwarz', 'weiss']) {
            if (ausEingang) {
                const p = quellen[art];
                const roh = `data:${MIME[path.extname(p).toLowerCase()] || 'image/png'};base64,${fs.readFileSync(p).toString('base64')}`;
                const fertig = await bildSkalieren(page, roh, 160, LOGO_RAND);
                motivUri[art] = `data:image/png;base64,${fertig.toString('base64')}`;
            } else {
                motivUri[art] = `data:image/png;base64,${fs.readFileSync(assets[art]).toString('base64')}`;
            }
        }

        await page.setContent(htmlBauen());
        fs.mkdirSync(BRANDING, { recursive: true });
        await page.locator('#blatt').screenshot({ path: VORSCHAU_BILD });
    } finally {
        await browser.close();
    }
    console.log(`\nVorschau Kopfzeile: ${fein.groesse} %, x ${fein.x} px, y ${fein.y} px`);
    console.log(`  ${VORSCHAU_BILD}`);
    console.log(gelb('  (nur ein Bild – es wurde nichts an der App geaendert)\n'));
}

/**
 * Zeigt, wie das Homescreen-Symbol mit der gewaehlten Ausrichtung aussieht –
 * und vor allem, was die Geraete davon abschneiden: iOS rundet zu einem
 * Squircle, Android schneidet "maskable"-Symbole zum Kreis. Genau dafuer gab
 * es frueher den festen Rand von 15 %.
 *
 * Das Symbol wird nur im Speicher erzeugt, nichts wird ueberschrieben.
 */
async function vorschauAppMain() {
    const quellen = {
        weiss: quelleFinden(OPT.quelle, 'logo-weiss'),
        hintergrund: quelleFinden(OPT.quelle, 'logo-hintergrund'),
    };
    if (!quellen.weiss && !quellen.hintergrund) {
        abbruch(
            'Fuer die Vorschau des App-Symbols fehlt das Quellbild.\n' +
                `Erwartet wird logo-weiss.png (oder logo-hintergrund.png) in:\n  ${OPT.quelle || '(Eingangsordner nicht festgelegt)'}`,
        );
    }
    const mitHintergrund = Boolean(quellen.hintergrund);
    const j = appJustageErmitteln(mitHintergrund);

    const browser = await chromium.launch().catch((e) => {
        abbruch(
            'Chromium konnte nicht gestartet werden. Einmalig ausfuehren:\n' +
                '  npx playwright install chromium\n\nUrspruengliche Meldung: ' + e.message,
        );
    });
    let symbolUri;
    try {
        const page = await browser.newPage({ deviceScaleFactor: 2 });
        // In 512 rendern und klein anzeigen: die Lupe bleibt so scharf.
        const quellUrl = `data:image/png;base64,${fs.readFileSync(mitHintergrund ? quellen.hintergrund : quellen.weiss).toString('base64')}`;
        const skaliert = await bildSkalieren(page, quellUrl, 512, appRandVon(j.groesse), { x: j.x, y: j.y });
        const buf = mitHintergrund
            ? skaliert
            : await bildAufHintergrund(
                  page,
                  `data:image/png;base64,${skaliert.toString('base64')}`,
                  512,
                  HINTERGRUND_FARBE,
                  0,
              );
        symbolUri = `data:image/png;base64,${buf.toString('base64')}`;

        // iOS rundet mit rund 22,4 % der Kante ab (Squircle-Naeherung),
        // Android maskiert kreisrund.
        const kachel = (titel, hinweis, radius) => `
          <div style="text-align:center">
            <div style="width:170px;height:170px;border-radius:${radius};overflow:hidden;
                        background:#e5e7eb;box-shadow:0 1px 4px rgba(0,0,0,.18)">
              <img src="${symbolUri}" style="width:170px;height:170px;display:block">
            </div>
            <div style="font:600 13px system-ui;color:#111827;margin-top:10px">${titel}</div>
            <div style="font:400 12px system-ui;color:#6b7280;margin-top:2px">${hinweis}</div>
          </div>`;

        const versatzText = (wert, minus, plus) => (wert === 0 ? 'mittig' : `${Math.abs(wert)} % nach ${wert < 0 ? minus : plus}`);
        const html = `<body style="margin:0;background:#ffffff">
          <div id="blatt" style="display:inline-block;padding:26px 30px">
            <div style="font:700 17px system-ui;color:#111827">So sieht das App-Symbol aus</div>
            <div style="font:400 13px system-ui;color:#6b7280;margin:6px 0 22px">
              Motiv: ${j.groesse}&#8202;% der Kachel &nbsp;·&nbsp; waagerecht ${versatzText(j.x, 'links', 'rechts')}
              &nbsp;·&nbsp; senkrecht ${versatzText(j.y, 'oben', 'unten')}
              ${mitHintergrund ? '&nbsp;·&nbsp; aus deinem eigenen Hintergrundbild' : '&nbsp;·&nbsp; weisses Motiv auf ' + HINTERGRUND_FARBE}
              <br>Was ueber den Rand ragt, ist weg – die Geraete schneiden unterschiedlich stark zu.
            </div>
            <div style="display:flex;gap:34px;align-items:flex-start">
              ${kachel('So wird es erzeugt', 'die ganze Kachel', '0')}
              ${kachel('iPhone / iPad', 'abgerundetes Quadrat', '22.4%')}
              ${kachel('Android', 'kreisrund beschnitten', '50%')}
            </div>
          </div>
        </body>`;
        await page.setContent(html);
        fs.mkdirSync(BRANDING, { recursive: true });
        await page.locator('#blatt').screenshot({ path: VORSCHAU_APP_BILD });
    } finally {
        await browser.close();
    }
    console.log(`\nVorschau App-Symbol: ${j.groesse} % der Kachel, x ${j.x} %, y ${j.y} %`);
    console.log(`  ${VORSCHAU_APP_BILD}`);
    console.log(gelb('  (nur ein Bild – es wurde nichts an der App geaendert)\n'));
}

try {
    // Zahlenwerte gleich zu Beginn pruefen, noch vor Backup und Bildarbeit:
    // Ein Tippfehler soll nicht erst nach einer Minute Rechnerei auffallen.
    if (!OPT.restore && !OPT.liste) {
        feinstellungLesen();
        appJustageErmitteln();
    }

    if (OPT.restore || OPT.liste) {
        backupZurueckholen();
    } else if (OPT.vorschau) {
        if (OPT.was === 'app') await vorschauAppMain();
        else if (OPT.was === 'kopfzeile') await vorschauMain();
        else abbruch(`Unbekannter Wert fuer --was: "${OPT.was}"\nGueltig sind: kopfzeile, app`);
    } else if (OPT.nurStil) {
        nurStilAendernMain();
    } else {
        await hauptlauf();
    }
} catch (e) {
    abbruch(
        'Unerwarteter Fehler beim Verarbeiten der Bilder:\n  ' + e.message +
        '\n\nHaeufigste Ursache: Die Datei ist kein echtes PNG oder WebP (z.B. ein umbenanntes HEIC oder SVG)' +
        '\noder sie ist noch nicht vollstaendig aus OneDrive heruntergeladen.',
    );
}
