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
 *   npm run logo:build              alles Neue erzeugen
 *   npm run logo:build -- --dry-run nur pruefen, nichts schreiben
 *   npm run logo:build -- --force   auch unveraenderte Quellen neu erzeugen
 *   npm run logo:restore            letztes Backup zurueckholen
 *   npm run logo:restore -- --liste vorhandene Backups auflisten
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

const EINGANG_STANDARD = path.join(
    os.homedir(),
    'OneDrive - viadico GmbH',
    'Dokumente',
    'DENKFABRIK',
    '02 Arbeitsbereich',
    'ioBroker',
    'Logo-Eingang',
);

/** Hintergrundfarbe fuer das Homescreen-Symbol, wenn Sascha kein eigenes Bild liefert.
 *  #111827 ist die Farbe, die auch in public/manifest.json als background_color steht. */
const HINTERGRUND_FARBE = '#111827';
/** Anteil freier Rand um das Logo im Homescreen-Symbol (0.15 = 15% je Seite).
 *  Android schneidet "maskable"-Symbole rund zu – ohne Rand wuerde das Motiv beschnitten. */
const ICON_RAND = 0.15;
/** Anteil freier Rand um das Logo im Header-Chip und in den Favicons.
 *  0.06 = 6 % je Seite – genug, damit das Motiv im runden Chip nicht an der
 *  Kante klebt, aber deutlich weniger als beim Homescreen-Symbol. */
const LOGO_RAND = 0.06;

/** Welches Zielbild entsteht aus welcher Quelle. */
const ZIELE = [
    { quelle: 'schwarz', datei: 'src-vis/assets/aura-header-logo-schwarz.png', groesse: 160, art: 'transparent', zweck: 'Header-Logo bei hellem Theme' },
    { quelle: 'weiss', datei: 'src-vis/assets/aura-header-logo-weiss.png', groesse: 160, art: 'transparent', zweck: 'Header-Logo bei dunklem Theme' },
    { quelle: 'schwarz', datei: 'public/favicon-32.png', groesse: 32, art: 'transparent', zweck: 'Browser-Tab (Rueckfall)' },
    { quelle: 'schwarz', datei: 'public/favicon-64.png', groesse: 64, art: 'transparent', zweck: 'Lesezeichen (Rueckfall)' },
    { quelle: 'icon', datei: 'public/icons/icon-192.png', groesse: 192, art: 'deckend', zweck: 'iPhone-Homescreen' },
    { quelle: 'icon', datei: 'public/icons/icon-512.png', groesse: 512, art: 'deckend', zweck: 'iPad, Android, Startbildschirm' },
];
/** Das SVG-Tab-Symbol entsteht aus beiden Motiven zusammen und steht deshalb nicht in ZIELE. */
const SVG_ZIEL = { datei: 'public/favicon-theme.svg', groesse: 64, zweck: 'Browser-Tab, folgt dem Hell/Dunkel-Modus' };

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
    quelle: flagWert('--quelle') || process.env.AURA_LOGO_EINGANG || EINGANG_STANDARD,
    backup: flagWert('--backup'),
};

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
    for (const name of NAMENS_VARIANTEN[basisName] || [basisName]) {
        for (const e of ENDUNGEN) {
            const p = path.join(ordner, name + e);
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
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

            if (alleQuellen) {
                // Quellbilder sind seit letztem Backup unveraendert
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
    // Zustandsdatei entwerten, damit der naechste Lauf wieder alles erzeugt.
    if (fs.existsSync(STATE)) fs.rmSync(STATE);
    console.log(gruen(`\nFertig: ${anzahl} Datei(en) wiederhergestellt.`));
    console.log('Danach noch bauen und ausrollen (npm run build + Deploy).\n');
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
async function bildSkalieren(page, url, groesse, rand = 0) {
    const b64 = await page.evaluate(
        async ({ u, g, r }) => {
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
            const versatz = (g - innen) / 2;
            octx.drawImage(cur, versatz, versatz, innen, innen);
            return out.toDataURL('image/png').split(',')[1];
        },
        { u: url, g: groesse, r: rand },
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

async function hauptlauf() {
    console.log('\n=== Aura Logo-Werkstatt ===\n');
    console.log('Eingangsordner: ' + OPT.quelle);
    if (OPT.dryRun) console.log(gelb('Trockenlauf – es wird nichts geschrieben.'));

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

    // Beide Motive sind Pflicht für das Umschalten zwischen Themes
    if (!quellen.schwarz || !quellen.weiss) {
        const fehlend = !quellen.schwarz ? 'logo-schwarz.png' : 'logo-weiss.png';
        abbruch(
            `Fuer das Umschalten zwischen hellem und dunklem Theme werden BEIDE Motive gebraucht.\n` +
            `Es fehlt: ${fehlend}`
        );
    }

    // Was hat sich seit dem letzten Lauf geaendert?
    const state = stateLesen();
    const zuTun = {};

    // Prüfe Quelldateien: Schwarz, Weiß und optional Hintergrund
    const zuAenderndeArten = [];
    for (const art of ['schwarz', 'weiss', 'hintergrund']) {
        if (!quellen[art]) {
            if (art !== 'hintergrund') {
                // Das sollte nicht vorkommen, da wir oben schon abgebrochen haben
                // aber sicherheitshalber nochmal behandeln
                console.log(`  ${art}: kein Bild vorhanden`);
            }
            continue;
        }
        const hash = sha256(quellen[art]);
        if (!OPT.force && state[art]?.sha256 === hash) {
            console.log(`  ${art}: unveraendert seit letztem Lauf`);
            continue;
        }
        zuAenderndeArten.push(art);
    }

    // Wenn eines der beiden Motive (schwarz/weiss) neu ist, müssen BEIDE als zu verarbeiten markiert werden
    if (zuAenderndeArten.includes('schwarz') || zuAenderndeArten.includes('weiss')) {
        if (!zuAenderndeArten.includes('schwarz')) zuAenderndeArten.push('schwarz');
        if (!zuAenderndeArten.includes('weiss')) zuAenderndeArten.push('weiss');
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
        // Mindestgroessen pro Quelle: schwarzer und weisser Motiv haben die groeßten Ziele,
        // auch wenn sie nicht direkt in ZIELE stehen (Icon-Ziele sind separate quelle: 'icon')
        const mindestgroesse = {
            schwarz: 160,  // wird zu 160er Header, 32er Favicon, 64er Favicon
            weiss: 512,    // wird zu 160er Header UND 512er Icon ohne Hintergrundbild
            hintergrund: 512, // wird zu 192er und 512er Icon
        };

        // Quellbilder pruefen
        for (const [art, info] of Object.entries(zuTun)) {
            const url = dataUrl(info.datei);
            const a = await bildAnalysieren(page, url);
            info.url = url;
            info.analyse = a;

            const kante = Math.min(a.breite, a.hoehe);
            const groessteZielgroesse = mindestgroesse[art] || 512;

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
                // Logo-Hintergrundbild verwenden (wie bisher)
                buf = await bildSkalieren(page, info.url, ziel.groesse);
                bericht.push({ ...ziel, status: 'neu (aus logo-hintergrund)', ist: `${ziel.groesse}x${ziel.groesse}` });
            } else if (isIcon && ikonArt === 'weiss') {
                // Weißes Logo freistellen, mit Rand einpassen, dann auf die Hintergrundfarbe legen
                const logoSkaliert = await bildSkalieren(page, info.url, ziel.groesse, ICON_RAND);
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

        // SVG-Favicon mit beiden Motiven erzeugen
        if (zuTun.schwarz && zuTun.weiss && !OPT.dryRun) {
            const pngSchwarz = await bildSkalieren(page, zuTun.schwarz.url, SVG_ZIEL.groesse, LOGO_RAND);
            const pngWeiss = await bildSkalieren(page, zuTun.weiss.url, SVG_ZIEL.groesse, LOGO_RAND);
            const svg = svgFaviconBauen(pngSchwarz, pngWeiss, SVG_ZIEL.groesse);
            const pfadSvg = path.join(REPO, SVG_ZIEL.datei);
            fs.mkdirSync(path.dirname(pfadSvg), { recursive: true });
            fs.writeFileSync(pfadSvg, svg);

            // Verifikation
            const inhalt = fs.readFileSync(pfadSvg, 'utf8');
            const hatSchwarzPng = inhalt.includes('data:image/png;base64,');
            const hatWeissPng = (inhalt.match(/data:image\/png;base64,/g) || []).length >= 2;
            const hatMediaQuery = inhalt.includes('prefers-color-scheme: dark');
            const groesse = fs.statSync(pfadSvg).size;

            if (!hatSchwarzPng || !hatWeissPng) {
                abbruch(`SVG-Favicon konnte nicht korrekt erzeugt werden (fehlende Base64-Daten).`);
            }
            if (!hatMediaQuery) {
                abbruch(`SVG-Favicon fehlt prefers-color-scheme: dark.`);
            }
            if (groesse < 1024) {
                abbruch(`SVG-Favicon ist zu klein (${groesse} Bytes, erwartet > 1 KB).`);
            }

            bericht.push({ ...SVG_ZIEL, status: 'neu', ist: `SVG (${groesse} Bytes)` });
        } else if (!OPT.dryRun) {
            // SVG existiert bereits, aber nichts zu tun
            if (fs.existsSync(path.join(REPO, SVG_ZIEL.datei))) {
                bericht.push({ ...SVG_ZIEL, status: 'unveraendert' });
            }
        }
    } finally {
        await browser.close();
    }

    // Zustand fortschreiben
    if (!OPT.dryRun) {
        const neu = stateLesen();
        for (const [art, info] of Object.entries(zuTun)) {
            neu[art] = { datei: path.basename(info.datei), sha256: info.sha256, stand: new Date().toISOString() };
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

try {
    if (OPT.restore || OPT.liste) {
        backupZurueckholen();
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
