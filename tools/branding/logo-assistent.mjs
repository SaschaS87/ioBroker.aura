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
 *   npm run logo -- ... --kein-deploy      baut, rollt aber nicht aus
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, '..', '..');
const PI = 'pi@192.168.1.200';
const APP_URL = 'http://192.168.1.200:8095';

const EINGANG =
    process.env.AURA_LOGO_EINGANG ||
    path.join(os.homedir(), 'OneDrive - viadico GmbH', 'Dokumente', 'DENKFABRIK', '02 Arbeitsbereich', 'ioBroker', 'Logo-Eingang');

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
};
const NICHT_INTERAKTIV = Boolean(VORGABE.ziele || VORGABE.anzeigen || VORGABE.kreis || VORGABE.nurStil);

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
    try {
        const t = fs.readFileSync(stil, 'utf8');
        mitKreis = /HEADER_LOGO_MIT_KREIS\s*=\s*true/.test(t);
        kopfzeileAn = !/HEADER_LOGO_ANZEIGEN\s*=\s*false/.test(t);
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
    return {
        mitKreis,
        sichtbar: { kopfzeile: kopfzeileAn, tab: blockAn('TAB-SYMBOL'), app: blockAn('APP-SYMBOL') },
        letzteZiele,
    };
}

function bilderImEingang() {
    const gefunden = {};
    if (!fs.existsSync(EINGANG)) return gefunden;
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

async function jaNein(titel, vorgabeJa) {
    const a = (await frage(`\n${fett(titel)} [Enter = ${vorgabeJa ? 'ja' : 'nein'}] (j/n): `)).trim().toLowerCase();
    if (!a) return vorgabeJa;
    return a.startsWith('j');
}

// ----------------------------------------------------------------- Hauptlauf

console.log(fett('\n=== Aura Logo-Assistent ===\n'));
console.log('Eingangsordner: ' + EINGANG);

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

let ziele, sichtbar, kreis;

if (NICHT_INTERAKTIV) {
    ziele = VORGABE.nurStil ? [] : (VORGABE.ziele || '').split(',').map((s) => s.trim()).filter(Boolean);
    sichtbar = VORGABE.anzeigen === null ? null : VORGABE.anzeigen === 'keine' ? [] : VORGABE.anzeigen.split(',').map((s) => s.trim()).filter(Boolean);
    kreis = VORGABE.kreis === null ? null : ['ja', 'true', '1'].includes(VORGABE.kreis);
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
    rl.close();
}

if (!ziele.length && sichtbar === null && kreis === null) {
    ende('Nichts ausgewaehlt – es gibt nichts zu tun.', 0);
}

// 1. Bilder bzw. Einstellungen
const anzeigenWert = sichtbar === null ? null : sichtbar.length ? sichtbar.join(',') : 'keine';
if (ziele.length) {
    let b = `npm run logo:build -- --ziele ${ziele.join(',')}`;
    if (kreis !== null && ziele.includes('kopfzeile')) b += ` --kreis ${kreis ? 'ja' : 'nein'}`;
    const r = spawnSync(b, { cwd: REPO, shell: true, stdio: 'inherit' });
    if (r.status === 2) console.log(gelb('\nDie Bilder waren unveraendert – es wurden keine neuen Symbole erzeugt.'));
    else if (r.status !== 0) ende('Abgebrochen beim Erzeugen der Symbole. Die Meldung steht oben.\nEs wurde nichts ausgerollt.');
    // Sichtbarkeit/Kreis separat setzen, falls die Kopfzeile nicht getauscht wurde
    if (anzeigenWert !== null || (kreis !== null && !ziele.includes('kopfzeile'))) {
        let s = 'npm run logo:stil --';
        if (anzeigenWert !== null) s += ` --anzeigen ${anzeigenWert}`;
        if (kreis !== null) s += ` --kreis ${kreis ? 'ja' : 'nein'}`;
        lauf(s, 'Sichtbarkeit und Aussehen setzen');
    }
} else {
    let s = 'npm run logo:stil --';
    if (anzeigenWert !== null) s += ` --anzeigen ${anzeigenWert}`;
    if (kreis !== null) s += ` --kreis ${kreis ? 'ja' : 'nein'}`;
    lauf(s, 'Sichtbarkeit und Aussehen setzen');
}

// 2. Bauen
lauf('npm run build', 'App bauen (dauert etwa 15 Sekunden)');

if (VORGABE.keinDeploy) {
    console.log(gruen('\nFertig – gebaut, aber wie gewuenscht nicht ausgerollt.\n'));
    process.exit(0);
}

// 3. Ausrollen
lauf('rm -f aura-www.tar.gz && tar -czf aura-www.tar.gz www', 'Paket schnueren');
lauf(`scp -q aura-www.tar.gz ${PI}:/tmp/`, 'Auf den Pi kopieren');
lauf(
    `ssh ${PI} "rm -rf /tmp/aura-deploy && mkdir -p /tmp/aura-deploy && tar -xzf /tmp/aura-www.tar.gz -C /tmp/aura-deploy && ` +
        `cp -rf /tmp/aura-deploy/www/. /opt/iobroker/node_modules/iobroker.aura/www/ && iobroker upload aura && iobroker restart aura.0"`,
    'Auf dem Pi einspielen und Aura neu starten',
);
schonAusgerollt = true;

// 4. Nachpruefen
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

// 5. Lokal sichern
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
still('rm -f aura-www.tar.gz');

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
