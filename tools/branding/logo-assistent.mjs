#!/usr/bin/env node
/**
 * logo-assistent.mjs – der komplette Logo-Tausch ohne Claude.
 *
 * Stellt dieselben Fragen wie der /logo-tausch-Skill und faehrt danach die
 * ganze Kette ab: Bilder erzeugen, App bauen, auf den Pi ausrollen,
 * nachpruefen, lokal sichern.
 *
 * Aufruf:  npm run logo        (oder Doppelklick auf "Logo tauschen.cmd")
 *
 * Antworten lassen sich auch vorgeben, dann laeuft nichts interaktiv – das
 * ist vor allem zum Testen gedacht:
 *   npm run logo -- --ziele kopfzeile --anzeigen kopfzeile,tab,app --kreis ja
 *   npm run logo -- --nur-stil --anzeigen keine --kreis nein
 *   npm run logo -- --nur-stil --kreis ja --logo-groesse 96 --logo-x -1 --logo-y 0
 *   npm run logo -- --ziele app --app-groesse 80 --app-y -4
 *   npm run logo -- ... --kein-deploy      baut, rollt aber nicht aus
 *
 * --logo-* richtet das Motiv im Kopfzeilen-Kreis aus (rechnet die App zur
 * Laufzeit), --app-* das Motiv im Homescreen-Symbol (wird ins Bild gerendert).
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '..', '..');
const PI = 'pi@192.168.1.200';
const APP_URL = 'http://192.168.1.200:8095';

/**
 * Wo die Quellbilder liegen, steht NICHT im Quelltext – der Pfad enthaelt
 * Benutzer- und Firmennamen. Gemerkt wird er in branding/eingang.txt, und
 * dieser Ordner ist von der Versionierung ausgenommen. Reihenfolge:
 * Umgebungsvariable, dann Merkdatei. Ist beides leer, fragt der Assistent
 * einmalig nach (siehe eingangKlaeren weiter unten).
 */
const EINGANG_MERKDATEI = path.join(REPO, 'branding', 'eingang.txt');

function eingangLesen() {
    if (process.env.AURA_LOGO_EINGANG) return process.env.AURA_LOGO_EINGANG;
    try {
        const zeilen = fs.readFileSync(EINGANG_MERKDATEI, 'utf8').split(/\r?\n/);
        return zeilen.map((z) => z.trim()).find((z) => z && !z.startsWith('#')) || null;
    } catch {
        return null;
    }
}

function eingangMerken(pfad) {
    fs.mkdirSync(path.dirname(EINGANG_MERKDATEI), { recursive: true });
    fs.writeFileSync(
        EINGANG_MERKDATEI,
        '# Wo die Logo-Quellbilder liegen. Nur auf diesem Rechner, nicht im Git.\n' +
            '# Aendern: einfach die Zeile darunter ersetzen.\n' +
            pfad +
            '\n',
    );
}

let EINGANG = eingangLesen();

const GRUPPEN = [
    { schluessel: 'kopfzeile', name: 'Logo in der Kopfzeile', wo: 'oben links neben dem Titel' },
    { schluessel: 'tab', name: 'Browser-Tab-Symbol', wo: 'im Browser-Reiter und in Lesezeichen' },
    { schluessel: 'app', name: 'App-Symbol auf dem Homescreen', wo: 'auf iPhone, iPad und Android' },
];

const rot = (t) => `\x1b[31m${t}\x1b[0m`;
const gruen = (t) => `\x1b[32m${t}\x1b[0m`;
const gelb = (t) => `\x1b[33m${t}\x1b[0m`;
const fett = (t) => `\x1b[1m${t}\x1b[0m`;

const argv = process.argv.slice(2);
const hatFlag = (n) => argv.includes(n);
const flagWert = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const VORGABE = {
    ziele: flagWert('--ziele'),
    anzeigen: flagWert('--anzeigen'),
    kreis: flagWert('--kreis'),
    nurStil: hatFlag('--nur-stil'),
    keinDeploy: hatFlag('--kein-deploy'),
    logoGroesse: flagWert('--logo-groesse'),
    logoX: flagWert('--logo-x'),
    logoY: flagWert('--logo-y'),
    appGroesse: flagWert('--app-groesse'),
    appX: flagWert('--app-x'),
    appY: flagWert('--app-y'),
};
const NICHT_INTERAKTIV = Boolean(VORGABE.ziele || VORGABE.anzeigen || VORGABE.kreis || VORGABE.nurStil);

/** Grenzen der Feinstellung – muessen zu build-logos.mjs passen. */
const FEIN_GRENZEN = { groesse: [50, 150], x: [-8, 8], y: [-8, 8] };
const APP_GRENZEN = { groesse: [40, 130], x: [-25, 25], y: [-25, 25] };
const VORSCHAU_BILD = path.join(REPO, 'branding', 'vorschau-kopfzeile.png');
const VORSCHAU_APP_BILD = path.join(REPO, 'branding', 'vorschau-appsymbol.png');

function ende(text, code = 1) {
    console.error('');
    console.error(rot(text));
    console.error('');
    process.exit(code);
}

/** Merkt sich, ob der Deploy schon gelaufen ist – fuer ehrliche Fehlermeldungen. */
let schonAusgerollt = false;

/** Fuehrt einen Befehl aus und zeigt seine Ausgabe direkt an. */
function lauf(befehl, beschreibung) {
    console.log(gelb(`\n> ${beschreibung}`));
    const r = spawnSync(befehl, { cwd: REPO, shell: true, stdio: 'inherit' });
    if (r.status !== 0) {
        ende(
            `Abgebrochen bei: ${beschreibung}\n` +
                `Der Befehl endete mit Fehlercode ${r.status}. Die Meldung steht oben.\n\n` +
                (schonAusgerollt
                    ? 'ACHTUNG: Auf dem Pi ist der neue Stand bereits eingespielt – nur dieser\n' +
                      'letzte Schritt hat nicht geklappt. In der App aendert sich dadurch nichts mehr.'
                    : 'Es wurde nichts ausgerollt.') +
                '\nBei Unklarheiten: Claude fragen und diese Meldung zeigen.',
        );
    }
    return r;
}

/** Wie lauf(), aber die Ausgabe wird eingefangen statt angezeigt. */
function still(befehl) {
    const r = spawnSync(befehl, { cwd: REPO, shell: true, encoding: 'utf8' });
    return { code: r.status, aus: (r.stdout || '') + (r.stderr || '') };
}

// ----------------------------------------------------------------- Zustand

function standLesen() {
    const stil = path.join(REPO, 'src-vis/components/common/headerLogoStil.ts');
    let mitKreis = false;
    let kopfzeileAn = true;
    // 88 % mittig entspricht dem frueheren festen Motiv von 28 auf 32 px.
    let fein = { groesse: 88, x: 0, y: 0 };
    try {
        const t = fs.readFileSync(stil, 'utf8');
        mitKreis = /HEADER_LOGO_MIT_KREIS\s*=\s*true/.test(t);
        kopfzeileAn = !/HEADER_LOGO_ANZEIGEN\s*=\s*false/.test(t);
        const zahl = (name, standard) => {
            const m = t.match(new RegExp(`${name}\\s*=\\s*(-?\\d+)`));
            return m ? parseInt(m[1], 10) : standard;
        };
        fein = {
            groesse: zahl('HEADER_LOGO_GROESSE', fein.groesse),
            x: zahl('HEADER_LOGO_X', fein.x),
            y: zahl('HEADER_LOGO_Y', fein.y),
        };
    } catch {
        /* Datei fehlt: Standardwerte */
    }
    let html = '';
    try {
        html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    } catch {
        /* egal */
    }
    const blockAn = (bereich) => {
        const m = html.match(new RegExp(`AURA-${bereich}-START[^]*?-->([^]*?)<!-- AURA-${bereich}-ENDE`, 'm'));
        return m ? !/ausgeschaltet ueber \/logo-tausch/.test(m[1]) : true;
    };
    let letzteZiele = null;
    try {
        letzteZiele = JSON.parse(fs.readFileSync(path.join(REPO, 'branding/logo-state.json'), 'utf8')).letzteZiele;
    } catch {
        /* noch nie gelaufen */
    }
    // Ausrichtung des Homescreen-Symbols. Anders als beim Kopfzeilen-Logo steht
    // sie im Repo (tools/branding/app-symbol.json): Sie steckt im erzeugten
    // Bild, und ohne sie liesse sich das Symbol nach einem Klon nicht
    // identisch nachbauen. 70 % ist der Stand von vor der Justage.
    let app = { groesse: 70, x: 0, y: 0 };
    try {
        const d = JSON.parse(fs.readFileSync(path.join(REPO, 'tools/branding/app-symbol.json'), 'utf8'));
        app = {
            groesse: Number.isInteger(d.groesse) ? d.groesse : app.groesse,
            x: Number.isInteger(d.x) ? d.x : app.x,
            y: Number.isInteger(d.y) ? d.y : app.y,
        };
    } catch {
        /* noch nie eingestellt */
    }
    return {
        mitKreis,
        fein,
        app,
        sichtbar: { kopfzeile: kopfzeileAn, tab: blockAn('TAB-SYMBOL'), app: blockAn('APP-SYMBOL') },
        letzteZiele,
    };
}

function bilderImEingang() {
    const gefunden = {};
    if (!EINGANG || !fs.existsSync(EINGANG)) return gefunden;
    const varianten = { schwarz: ['logo-schwarz'], weiss: ['logo-weiss', 'logo-weiß', 'logo-weis'], hintergrund: ['logo-hintergrund'] };
    for (const [art, namen] of Object.entries(varianten)) {
        for (const n of namen) {
            for (const e of ['.png', '.webp', '.jpg', '.jpeg']) {
                const p = path.join(EINGANG, n + e);
                if (fs.existsSync(p)) {
                    gefunden[art] = path.basename(p);
                    break;
                }
            }
            if (gefunden[art]) break;
        }
    }
    return gefunden;
}

// ------------------------------------------------------------------ Fragen

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const frage = (t) => new Promise((a) => rl.question(t, a));

async function mehrfachauswahl(titel, vorauswahl) {
    console.log('\n' + fett(titel));
    GRUPPEN.forEach((g, i) => {
        const an = vorauswahl.includes(g.schluessel) ? 'x' : ' ';
        console.log(`  [${an}] ${i + 1}) ${g.name} – ${g.wo}`);
    });
    const vorgabeText = vorauswahl.length ? vorauswahl.map((s) => GRUPPEN.findIndex((g) => g.schluessel === s) + 1).join(',') : 'keine';
    const a = (await frage(`  Nummern mit Komma, "0" fuer keine [Enter = ${vorgabeText}]: `)).trim();
    if (!a) return vorauswahl;
    if (a === '0') return [];
    const gewaehlt = [];
    for (const teil of a.split(',')) {
        const i = parseInt(teil.trim(), 10) - 1;
        if (!GRUPPEN[i]) {
            console.log(rot(`  "${teil.trim()}" ist keine gueltige Nummer – bitte noch einmal.`));
            return mehrfachauswahl(titel, vorauswahl);
        }
        gewaehlt.push(GRUPPEN[i].schluessel);
    }
    return gewaehlt;
}

/**
 * Sorgt dafuer, dass EINGANG gesetzt ist. Beim ersten Lauf auf einem Rechner
 * ist die Merkdatei noch nicht da – dann einmal fragen und merken. Danach
 * kommt die Frage nie wieder.
 */
async function eingangKlaeren() {
    if (EINGANG) return true;
    console.log(gelb('\nNoch nicht festgelegt, wo deine Logo-Bilder liegen.'));
    console.log('Das wird einmal gefragt und dann gemerkt (nur auf diesem Rechner).');
    console.log('Gemeint ist der Ordner mit logo-schwarz.png und logo-weiss.png.');
    for (;;) {
        const a = (await frage('\n  Pfad zum Ordner (Enter = ueberspringen): ')).trim().replace(/^"|"$/g, '');
        if (!a) {
            console.log(gelb('  Uebersprungen – es lassen sich nur Aussehen und Sichtbarkeit aendern.'));
            return false;
        }
        if (!fs.existsSync(a)) {
            console.log(rot(`  Diesen Ordner gibt es nicht: ${a}`));
            continue;
        }
        EINGANG = a;
        eingangMerken(a);
        console.log(gruen(`  Gemerkt in ${path.relative(REPO, EINGANG_MERKDATEI)}`));
        return true;
    }
}

async function jaNein(titel, vorgabeJa) {
    const a = (await frage(`\n${fett(titel)} [Enter = ${vorgabeJa ? 'ja' : 'nein'}] (j/n): `)).trim().toLowerCase();
    if (!a) return vorgabeJa;
    return a.startsWith('j');
}

/** Fragt eine ganze Zahl ab und laesst nicht locker, bis sie im Bereich liegt. */
async function zahlFrage(titel, hinweis, vorgabe, [min, max]) {
    for (;;) {
        console.log('\n' + fett(titel));
        console.log('  ' + hinweis);
        const a = (await frage(`  Zahl von ${min} bis ${max} [Enter = ${vorgabe}]: `)).trim().replace('%', '');
        if (!a) return vorgabe;
        const n = Number(a);
        if (!Number.isInteger(n) || n < min || n > max) {
            console.log(rot(`  "${a}" passt nicht – bitte eine ganze Zahl von ${min} bis ${max}.`));
            continue;
        }
        return n;
    }
}

/** Oeffnet eine Datei mit dem Standardprogramm des Systems. */
function bildOeffnen(pfad) {
    const befehl =
        process.platform === 'win32' ? `start "" "${pfad}"` : process.platform === 'darwin' ? `open "${pfad}"` : `xdg-open "${pfad}"`;
    spawnSync(befehl, { cwd: REPO, shell: true, stdio: 'ignore' });
}

/**
 * Groesse und Position des Motivs im Kreis einstellen – mit Vorschaubild nach
 * jedem Durchgang, damit Sascha sieht, was er einstellt, ohne dafuer jedes Mal
 * bauen und ausrollen zu muessen.
 *
 * Laeuft erst NACH dem Erzeugen der Bilder: die Vorschau zeigt sonst noch das
 * alte Motiv.
 */
async function feinjustage(start, ausEingang) {
    let f = { ...start };
    for (;;) {
        f.groesse = await zahlFrage(
            'Wie gross soll das Logo im Kreis sein?',
            '100 = randfuellend (wird an der Rundung beschnitten), 88 = Normalgroesse, kleiner = mehr Luft.',
            f.groesse,
            FEIN_GRENZEN.groesse,
        );
        f.x = await zahlFrage(
            'Nach links oder rechts verschieben?',
            'Minus schiebt nach links, Plus nach rechts. 0 = mittig.',
            f.x,
            FEIN_GRENZEN.x,
        );
        f.y = await zahlFrage(
            'Nach oben oder unten verschieben?',
            'Minus schiebt nach oben, Plus nach unten. 0 = mittig.',
            f.y,
            FEIN_GRENZEN.y,
        );

        console.log(gelb('\n> Vorschaubild erzeugen'));
        // Werden neue Bilder getauscht, zeigt die Vorschau das kommende Motiv
        // aus dem Eingangsordner statt des noch eingebauten.
        const r = still(
            `npm run logo:vorschau -- --logo-groesse ${f.groesse} --logo-x ${f.x} --logo-y ${f.y}${ausEingang ? ' --aus-eingang' : ''}`,
        );
        if (r.code !== 0) {
            // Die Vorschau ist Komfort, kein Muss – der Rest laeuft trotzdem weiter.
            console.log(rot('  Das Vorschaubild hat nicht geklappt:'));
            console.log('  ' + r.aus.trim().split('\n').slice(-6).join('\n  '));
            console.log(gelb('  Weiter geht es trotzdem – nur eben ohne Bild zum Anschauen.'));
            if (await jaNein(`Mit ${f.groesse} %, x ${f.x}, y ${f.y} weitermachen?`, true)) return f;
            continue;
        }
        console.log(`  ${VORSCHAU_BILD}`);
        bildOeffnen(VORSCHAU_BILD);
        console.log('  Das Bild sollte sich gerade geoeffnet haben.');
        if (await jaNein('Passt das so?', true)) return f;
        console.log(gelb('\nDann noch einmal – die letzten Werte stehen als Vorgabe drin.'));
    }
}

/**
 * Ausrichtung des Motivs im Homescreen-Symbol. Laeuft VOR dem Erzeugen der
 * Bilder – anders als beim Kopfzeilen-Logo wandert die Ausrichtung ins Bild
 * selbst, sie muss also feststehen, bevor gerendert wird.
 */
async function appJustage(start) {
    let f = { ...start };
    for (;;) {
        f.groesse = await zahlFrage(
            'Wie gross soll das Logo auf der Kachel sein?',
            '70 = Normalgroesse mit Rand, 100 = randfuellend. Android schneidet rund zu –\n  je groesser, desto mehr faellt dabei weg.',
            f.groesse,
            APP_GRENZEN.groesse,
        );
        f.x = await zahlFrage(
            'Nach links oder rechts verschieben?',
            'In Prozent der Kantenlaenge. Minus schiebt nach links, Plus nach rechts. 0 = mittig.',
            f.x,
            APP_GRENZEN.x,
        );
        f.y = await zahlFrage(
            'Nach oben oder unten verschieben?',
            'In Prozent der Kantenlaenge. Minus schiebt nach oben, Plus nach unten. 0 = mittig.',
            f.y,
            APP_GRENZEN.y,
        );

        console.log(gelb('\n> Vorschaubild erzeugen'));
        const r = still(`npm run logo:vorschau -- --was app --app-groesse ${f.groesse} --app-x ${f.x} --app-y ${f.y}`);
        if (r.code !== 0) {
            console.log(rot('  Das Vorschaubild hat nicht geklappt:'));
            console.log('  ' + r.aus.trim().split('\n').slice(-6).join('\n  '));
            console.log(gelb('  Weiter geht es trotzdem – nur eben ohne Bild zum Anschauen.'));
            if (await jaNein(`Mit ${f.groesse} %, x ${f.x}, y ${f.y} weitermachen?`, true)) return f;
            continue;
        }
        console.log(`  ${VORSCHAU_APP_BILD}`);
        bildOeffnen(VORSCHAU_APP_BILD);
        console.log('  Drei Ansichten: ganze Kachel, iPhone (abgerundet), Android (kreisrund).');
        if (await jaNein('Passt das so?', true)) return f;
        console.log(gelb('\nDann noch einmal – die letzten Werte stehen als Vorgabe drin.'));
    }
}

// ----------------------------------------------------------------- Hauptlauf

console.log(fett('\n=== Aura Logo-Assistent ===\n'));
// Beim allerersten Lauf auf einem Rechner ist noch nicht bekannt, wo die
// Bilder liegen – dann einmal fragen. Bei vorgegebenen Antworten (Testlauf)
// wird nicht gefragt, dort zaehlt nur, was auf der Kommandozeile steht.
if (!EINGANG && !NICHT_INTERAKTIV) await eingangKlaeren();
console.log('Eingangsordner: ' + (EINGANG || gelb('nicht festgelegt')));

const stand = standLesen();
const bilder = bilderImEingang();

console.log('\nBilder im Eingangsordner:');
if (Object.keys(bilder).length === 0) {
    console.log('  (keine – dann koennen nur Aussehen und Sichtbarkeit geaendert werden)');
} else {
    for (const [art, datei] of Object.entries(bilder)) console.log(`  ${datei}  (${art})`);
}

console.log('\nAktuell sichtbar:');
for (const g of GRUPPEN) console.log(`  ${stand.sichtbar[g.schluessel] ? 'ja  ' : 'nein'}  ${g.name}`);
console.log(`  Kopfzeilen-Logo ${stand.mitKreis ? 'mit' : 'ohne'} Kreis`);
if (stand.mitKreis) {
    console.log(`  Logo im Kreis: ${stand.fein.groesse} %, versetzt um x ${stand.fein.x} px, y ${stand.fein.y} px`);
}

let ziele, sichtbar, kreis;
/** Groesse/Position des Motivs im Kreis – null heisst "nicht anfassen". */
let fein = null;
/** Dasselbe fuer das Homescreen-Symbol. */
let appFein = null;
/** Ob im weiteren Verlauf noch nach der Symbol-Ausrichtung gefragt wird. */
let appAusrichten = false;

if (NICHT_INTERAKTIV) {
    ziele = VORGABE.nurStil ? [] : (VORGABE.ziele || '').split(',').map((s) => s.trim()).filter(Boolean);
    sichtbar = VORGABE.anzeigen === null ? null : VORGABE.anzeigen === 'keine' ? [] : VORGABE.anzeigen.split(',').map((s) => s.trim()).filter(Boolean);
    kreis = VORGABE.kreis === null ? null : ['ja', 'true', '1'].includes(VORGABE.kreis);
    if (VORGABE.logoGroesse !== null || VORGABE.logoX !== null || VORGABE.logoY !== null) {
        fein = {
            groesse: VORGABE.logoGroesse === null ? stand.fein.groesse : Number(VORGABE.logoGroesse),
            x: VORGABE.logoX === null ? stand.fein.x : Number(VORGABE.logoX),
            y: VORGABE.logoY === null ? stand.fein.y : Number(VORGABE.logoY),
        };
    }
    if (VORGABE.appGroesse !== null || VORGABE.appX !== null || VORGABE.appY !== null) {
        appFein = {
            groesse: VORGABE.appGroesse === null ? stand.app.groesse : Number(VORGABE.appGroesse),
            x: VORGABE.appX === null ? stand.app.x : Number(VORGABE.appX),
            y: VORGABE.appY === null ? stand.app.y : Number(VORGABE.appY),
        };
    }
    rl.close();
} else {
    const hatBilder = Object.keys(bilder).length > 0;
    ziele = hatBilder
        ? await mehrfachauswahl('Was soll mit den Bildern im Eingangsordner getauscht werden?', stand.letzteZiele || GRUPPEN.map((g) => g.schluessel))
        : [];
    if (!hatBilder) console.log(gelb('\nKeine Bilder da – es wird nur Aussehen/Sichtbarkeit geaendert.'));

    sichtbar = await mehrfachauswahl(
        'Was soll ueberhaupt angezeigt werden? (nicht Angekreuztes wird ausgeblendet,\ndie Bilddateien bleiben liegen und kommen beim Wiedereinschalten zurueck)',
        GRUPPEN.filter((g) => stand.sichtbar[g.schluessel]).map((g) => g.schluessel),
    );
    if (!sichtbar.includes('app')) {
        console.log(gelb('  Hinweis: Ohne App-Symbol nimmt iOS beim Hinzufuegen zum Homescreen einen'));
        console.log(gelb('           Bildschirmausschnitt der Seite – das sieht meist schlechter aus.'));
    }

    kreis = sichtbar.includes('kopfzeile')
        ? await jaNein('Soll das Logo in der Kopfzeile in einem runden Kreis sitzen?', stand.mitKreis)
        : null;

    // Das Homescreen-Symbol laesst sich ebenfalls ausrichten. Bewusst als
    // Ja/Nein-Vorfrage: Wer nur Bilder tauschen will, soll nicht jedes Mal
    // durch drei Zahlen und eine Vorschau muessen.
    if (sichtbar.includes('app')) {
        console.log(
            `\n  (Symbol steht jetzt auf ${stand.app.groesse} % der Kachel, x ${stand.app.x} %, y ${stand.app.y} %)`,
        );
        appAusrichten = await jaNein('Das App-Symbol auf dem Homescreen ausrichten?', false);
    }

    // Die Eingabe bleibt offen, solange noch etwas zu fragen ist: die
    // Symbol-Ausrichtung kommt vor dem Erzeugen der Bilder, die Ausrichtung im
    // Kreis danach – erst dann zeigt die Vorschau das neue Motiv.
    if (kreis !== true && !appAusrichten) rl.close();
}

if (!ziele.length && sichtbar === null && kreis === null && fein === null && appFein === null && !appAusrichten) {
    ende('Nichts ausgewaehlt – es gibt nichts zu tun.', 0);
}

// 1. Ausrichten – BEIDES vor dem Erzeugen, damit die zwei Justagen direkt
// hintereinander kommen und nicht durch die Ausgabe des Bildbaus getrennt
// werden. Moeglich wird das, weil beide Vorschauen ihr Motiv notfalls selbst
// aus dem Eingangsordner rendern, statt auf die gebauten Dateien zu warten.
const anzahlJustagen = (kreis === true ? 1 : 0) + (appAusrichten ? 1 : 0);
if (anzahlJustagen > 1) {
    console.log(fett('\n=== Zwei Sachen zum Ausrichten ==='));
    console.log('Erst das Logo in der Kopfzeile, dann das App-Symbol.');
    console.log('Fuer beide gibt es ein eigenes Vorschaubild.');
}

if (kreis === true && !NICHT_INTERAKTIV) {
    console.log(fett(`\n--- ${anzahlJustagen > 1 ? '1 von 2: ' : ''}Logo in der Kopfzeile ausrichten ---`));
    console.log('Der Kreis selbst bleibt unveraendert – er muss zu den Knoepfen rechts passen.');
    console.log('Eingestellt wird nur das Motiv darin. Nach jedem Durchgang gibt es ein Bild zum Anschauen.');
    fein = await feinjustage(stand.fein, ziele.includes('kopfzeile'));
}

if (appAusrichten) {
    console.log(fett(`\n--- ${anzahlJustagen > 1 ? '2 von 2: ' : ''}App-Symbol ausrichten ---`));
    console.log('Das Symbol ist ein fertiges Bild – die Ausrichtung wird hineingerechnet.');
    console.log('Nach jedem Durchgang gibt es ein Bild mit drei Ansichten zum Anschauen.');
    appFein = await appJustage(stand.app);
}

// Ab hier wird nichts mehr gefragt – die Eingabe darf zu, sonst haengt der
// Assistent am Ende und beendet sich nicht.
if (!NICHT_INTERAKTIV && (kreis === true || appAusrichten)) rl.close();

// 2. Bilder erzeugen. Wurde nur die Ausrichtung geaendert, muss das App-Symbol
// trotzdem neu entstehen – das Werkzeug erkennt das an der Ausrichtung selbst
// und baut die Gruppe neu, auch ohne neue Quellbilder.
const anzeigenWert = sichtbar === null ? null : sichtbar.length ? sichtbar.join(',') : 'keine';
const appGeaendert =
    appFein && (appFein.groesse !== stand.app.groesse || appFein.x !== stand.app.x || appFein.y !== stand.app.y);
const zielListe = [...ziele];
if (appGeaendert && !zielListe.includes('app')) zielListe.push('app');

if (zielListe.length) {
    let b = `npm run logo:build -- --ziele ${zielListe.join(',')}`;
    if (appFein) b += ` --app-groesse ${appFein.groesse} --app-x ${appFein.x} --app-y ${appFein.y}`;
    const r = spawnSync(b, { cwd: REPO, shell: true, stdio: 'inherit' });
    if (r.status === 2) console.log(gelb('\nDie Bilder waren unveraendert – es wurden keine neuen Symbole erzeugt.'));
    else if (r.status !== 0) ende('Abgebrochen beim Erzeugen der Symbole. Die Meldung steht oben.\nEs wurde nichts ausgerollt.');
}

// 3. Sichtbarkeit und Aussehen setzen – gebuendelt in einem Aufruf. Kreis und
// Feinstellung laufen bewusst hierueber und nicht ueber logo:build: so steht
// die Reihenfolge fest und die Werte aus Schritt 1 kommen sicher an.
const stilTeile = [];
if (anzeigenWert !== null) stilTeile.push(`--anzeigen ${anzeigenWert}`);
if (kreis !== null) stilTeile.push(`--kreis ${kreis ? 'ja' : 'nein'}`);
if (fein) stilTeile.push(`--logo-groesse ${fein.groesse}`, `--logo-x ${fein.x}`, `--logo-y ${fein.y}`);
if (stilTeile.length) lauf(`npm run logo:stil -- ${stilTeile.join(' ')}`, 'Sichtbarkeit und Aussehen setzen');

// 4. Bauen
lauf('npm run build', 'App bauen (dauert etwa 15 Sekunden)');

if (VORGABE.keinDeploy) {
    console.log(gruen('\nFertig – gebaut, aber wie gewuenscht nicht ausgerollt.\n'));
    process.exit(0);
}

// 5. Ausrollen
fs.rmSync(path.join(REPO, 'aura-www.tar.gz'), { force: true });
lauf('tar -czf aura-www.tar.gz www', 'Paket schnueren');
lauf(`scp -q aura-www.tar.gz ${PI}:/tmp/`, 'Auf den Pi kopieren');
lauf(
    `ssh ${PI} "rm -rf /tmp/aura-deploy && mkdir -p /tmp/aura-deploy && tar -xzf /tmp/aura-www.tar.gz -C /tmp/aura-deploy && ` +
        `cp -rf /tmp/aura-deploy/www/. /opt/iobroker/node_modules/iobroker.aura/www/ && iobroker upload aura && iobroker restart aura.0"`,
    'Auf dem Pi einspielen und Aura neu starten',
);
schonAusgerollt = true;

// 6. Nachpruefen
console.log(gelb('\n> Nachpruefen, ob es angekommen ist'));
let erreichbar = false;
for (let i = 0; i < 10; i++) {
    const { aus } = still(`curl -s -o /dev/null -w "%{http_code}" --max-time 5 ${APP_URL}/index.html`);
    if (aus.trim() === '200') {
        erreichbar = true;
        break;
    }
}
if (!erreichbar) {
    ende(
        `Die App ist unter ${APP_URL} nicht erreichbar.\n` +
            'Ausgerollt wurde bereits – Aura braucht nach dem Neustart manchmal einen Moment.\n' +
            'Einfach im Browser nachsehen. Bleibt es dabei: Claude fragen.',
    );
}
const html = still(`curl -s ${APP_URL}/index.html`).aus;
const zeigtTab = /rel="icon"/.test(html);
const zeigtApp = /apple-touch-icon/.test(html);
console.log(`  App erreichbar: ja`);
console.log(`  Tab-Symbol eingebunden: ${zeigtTab ? 'ja' : 'nein (ausgeblendet)'}`);
console.log(`  App-Symbol eingebunden: ${zeigtApp ? 'ja' : 'nein (ausgeblendet)'}`);

// 7. Lokal sichern
// Erst vormerken, dann pruefen, ob wirklich etwas dabei ist: "git commit" ohne
// Aenderungen endet mit Fehlercode 1 und wuerde den Assistenten sonst am
// letzten Schritt abbrechen lassen, obwohl alles gut gegangen ist.
console.log(gelb('\n> Stand lokal sichern (kein Push)'));
still('git add -A index.html public src-vis/components/common src-vis/assets www');
if (still('git diff --cached --quiet').code === 0) {
    console.log('  Nichts zu sichern – an den Symbolen hat sich nichts geaendert.');
} else {
    const c = still('git commit -q -m "Logo-Tausch ueber den Assistenten"');
    if (c.code !== 0) {
        console.log(rot('  Das Sichern hat nicht geklappt:'));
        console.log('  ' + c.aus.trim().split('\n').join('\n  '));
        console.log(gelb('  Auf dem Pi ist der neue Stand trotzdem drauf – nur die lokale'));
        console.log(gelb('  Sicherung fehlt. Das laesst sich jederzeit nachholen.'));
    } else {
        console.log('  gesichert');
    }
}
fs.rmSync(path.join(REPO, 'aura-www.tar.gz'), { force: true });

console.log(gruen('\n=== Fertig ==='));
console.log(`
Das musst du noch tun:

  Browser      Strg+F5 druecken, sonst zeigt der Zwischenspeicher das Alte.
  iPhone/iPad  App vom Homescreen loeschen und ueber "Zum Home-Bildschirm"
               neu hinzufuegen. iOS tauscht ein gespeichertes Symbol sonst nie aus.

Gefaellt es nicht?  npm run logo:restore   holt den vorherigen Stand zurueck
                    (danach noch einmal "npm run logo -- --nur-stil" oder diesen
                     Assistenten laufen lassen, damit es auf den Pi kommt).
`);
