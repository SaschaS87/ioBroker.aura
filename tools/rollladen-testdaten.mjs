/**
 * Testdaten für den Rollläden-Planer der Dev-Vorschau.
 *
 * Schreibt AUSSCHLIESSLICH in die Test-Datenpunkte 0_userdata.0.Rollladen_Dev.Szenen und
 * .Wochenplan (die liest die Dev-Vorschau, siehe ShutterFloorsWidget.tsx). Die echten Szenen und
 * der echte Wochenplan unter 0_userdata.0.Rollladen bleiben unberührt.
 *
 *   node tools/rollladen-testdaten.mjs              nur prüfen und anzeigen, schreibt nichts
 *   node tools/rollladen-testdaten.mjs --schreiben  einspielen
 *   node tools/rollladen-testdaten.mjs --entfernen  die Testeinträge wieder herausnehmen
 *
 * - Vorhandene Einträge bleiben stehen. Ersetzt werden nur Einträge, deren id mit "test-" beginnt
 *   (das Skript kann also beliebig oft laufen).
 * - Vor dem Schreiben wird geprüft, dass das Dev-Skript auf dem Pi im Trockenlauf steht. Sonst
 *   Abbruch, denn aktive Zeitpunkte würden sonst echte Rollläden fahren.
 * - Der alte Stand wird vorher als Datei gesichert (Pfad steht in der Ausgabe).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PI = 'pi@192.168.1.200';
const ROOT = '0_userdata.0.Rollladen_Dev';
const DEV_SKRIPT = 'script.js.Tahoma.Rollladen_Wochenplan_Dev';
const PREFIX = 'test-';

// Fenster mit Leise-Antrieb (slowPosDp in der GERAETE-Tabelle des Skripts), Stand 12.11.2026
const LEISE_FAEHIG = [
    'Wohnz_gross',
    'Wohnz_klein',
    'Küchenfenster',
    'Gäste_WC',
    'SPK',
    'Eltern_links',
    'Eltern_rechts',
    'Bad',
    'Kinderzimmer',
    'Kinderzimmer_2',
];

const q = (key, closed) => ({ key, closed, quiet: true });
const n = (key, closed) => ({ key, closed });
const raff = (key, closed, slat) => ({ key, closed, slat });

const SZENEN = [
    {
        id: 'test-alle-leise',
        name: 'Test: alle leise',
        icon: 'moon',
        favorite: true,
        targets: LEISE_FAEHIG.map((k) => q(k, 100)),
    },
    {
        id: 'test-keiner-leise',
        name: 'Test: keiner leise',
        icon: 'sunset',
        targets: LEISE_FAEHIG.map((k) => n(k, 100)),
    },
    {
        id: 'test-gemischt',
        name: 'Test: gemischt',
        icon: 'heat',
        favorite: true,
        targets: [
            q('Wohnz_gross', 78),
            n('Wohnz_klein', 78),
            q('Küchenfenster', 40),
            n('Gäste_WC', 100),
            raff('Raffstore_(Garten)', 100, 50),
            n('Ankleide', 30),
        ],
    },
    {
        id: 'test-raffstores',
        name: 'Test: nur Raffstores',
        icon: 'sun',
        targets: [raff('Raffstore_(Garten)', 100, 45), raff('Raffstore_(Nachbar)', 60, 0)],
    },
    {
        id: 'test-ein-leise',
        name: 'Test: ein Fenster leise',
        icon: 'home',
        targets: [q('Kinderzimmer', 50)],
    },
    {
        id: 'test-ohne-leise-antrieb',
        name: 'Test: ohne Leise-Antrieb',
        icon: 'sunrise',
        targets: [n('Ankleide', 0), n('Bad_Dachfenster', 0), n('Flur_DG', 0)],
    },
    {
        id: 'test-kinder-halb',
        name: 'Test: Kinder halb leise',
        icon: 'tv',
        targets: [q('Kinderzimmer', 100), n('Kinderzimmer_2', 100)],
    },
    {
        id: 'test-dach-leise',
        name: 'Test: Dachgeschoss leise',
        icon: 'moon',
        targets: [q('Eltern_links', 85), q('Eltern_rechts', 85), q('Bad', 100), n('Ankleide', 100), n('Flur_DG', 100)],
    },
];

const WERKTAGS = [true, true, true, true, true, false, false];
const WOCHENENDE = [false, false, false, false, false, true, true];
const TAEGLICH = [true, true, true, true, true, true, true];
const MITTWOCH = [false, false, true, false, false, false, false];

const uhr = (time) => ({ kind: 'time', time, offset: 0, earliest: null, latest: null });
const sonne = (kind, offset, earliest = null, latest = null) => ({ kind, time: '07:00', offset, earliest, latest });
const szene = (sceneId) => ({ kind: 'scene', sceneId });
const geraet = (key, closed) => ({ kind: 'device', key, closed });
const eintrag = (id, days, trigger, target, enabled, quiet) => ({
    id,
    days,
    trigger,
    target,
    enabled,
    ...(quiet ? { quiet: true } : {}),
});

const ZEITPUNKTE = [
    // aktiv
    eintrag('test-e-01', WERKTAGS, uhr('06:30'), szene('test-alle-leise'), true, false),
    eintrag('test-e-02', WERKTAGS, uhr('07:15'), szene('test-keiner-leise'), true, true),
    eintrag('test-e-03', TAEGLICH, sonne('sunset', 15, null, '21:30'), szene('test-gemischt'), true, true),
    eintrag('test-e-04', WOCHENENDE, sonne('sunrise', -10, '06:00', null), szene('test-gemischt'), true, false),
    eintrag('test-e-05', TAEGLICH, uhr('20:00'), geraet('Kinderzimmer', 100), true, true),
    eintrag('test-e-06', MITTWOCH, uhr('13:00'), geraet('Raffstore_(Garten)', 80), true, true),
    eintrag('test-e-07', TAEGLICH, uhr('21:45'), szene('test-dach-leise'), true, false),
    // inaktiv
    eintrag('test-e-08', TAEGLICH, uhr('22:00'), szene('test-alle-leise'), false, true),
    eintrag('test-e-09', WOCHENENDE, uhr('12:30'), szene('test-raffstores'), false, false),
    eintrag('test-e-10', WERKTAGS, uhr('09:00'), geraet('Ankleide', 0), false, false),
    eintrag('test-e-11', TAEGLICH, sonne('sunset', 0), szene('test-ein-leise'), false, false),
    eintrag('test-e-12', WERKTAGS, sonne('sunrise', 20, '06:15', '08:00'), szene('test-kinder-halb'), false, true),
    eintrag('test-e-13', WOCHENENDE, uhr('08:30'), szene('test-ohne-leise-antrieb'), false, true),
];

function ssh(cmd, input) {
    return execFileSync('ssh', ['-o', 'ConnectTimeout=15', PI, cmd], {
        encoding: 'utf-8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
}

function lies(dp) {
    const raw = ssh(`iobroker state getvalue ${ROOT}.${dp}`).trim();
    if (!raw || raw === 'null') return { raw, liste: [] };
    const liste = JSON.parse(raw);
    if (!Array.isArray(liste)) throw new Error(`${dp}: kein JSON-Array, breche ab`);
    return { raw, liste };
}

function schreibe(dp, liste) {
    // JSON reist base64-verpackt, damit Anführungszeichen und Umlaute die Shell nicht stören
    const b64 = Buffer.from(JSON.stringify(liste), 'utf-8').toString('base64');
    ssh(`iobroker state set ${ROOT}.${dp} "$(echo ${b64} | base64 -d)"`);
}

const modus = process.argv.includes('--schreiben')
    ? 'schreiben'
    : process.argv.includes('--entfernen')
      ? 'entfernen'
      : 'pruefen';

let szenen, plan;
try {
    szenen = lies('Szenen');
    plan = lies('Wochenplan');
} catch (e) {
    console.error(`Der Pi (${PI}) ist nicht erreichbar oder die Daten sind nicht lesbar:\n${e.stderr || e.message}`);
    process.exit(1);
}

const fremd = (liste) => liste.filter((x) => !(typeof x?.id === 'string' && x.id.startsWith(PREFIX)));
const neuSzenen = [...fremd(szenen.liste), ...(modus === 'entfernen' ? [] : SZENEN)];
const neuPlan = [...fremd(plan.liste), ...(modus === 'entfernen' ? [] : ZEITPUNKTE)];

console.log(`Szenen:     ${szenen.liste.length} vorhanden → ${neuSzenen.length} (davon ${neuSzenen.length - fremd(szenen.liste).length} Test)`);
console.log(`Zeitpunkte: ${plan.liste.length} vorhanden → ${neuPlan.length} (davon ${neuPlan.length - fremd(plan.liste).length} Test)`);

if (modus === 'pruefen') {
    console.log('\nNur geprüft, nichts geschrieben. Einspielen mit --schreiben.');
    process.exit(0);
}

// Sicherung: aktive Zeitpunkte dürfen nur im Trockenlauf landen
const quelle = ssh(`iobroker object get ${DEV_SKRIPT}`);
// Nur die Zuweisung zählt, nicht Kommentare wie "(TROCKENLAUF=false)"
if (!/const TROCKENLAUF = true\b/.test(quelle) || /const TROCKENLAUF = false\b/.test(quelle)) {
    console.error(`Abbruch: ${DEV_SKRIPT} steht nicht eindeutig im Trockenlauf. Nichts geschrieben.`);
    process.exit(1);
}

const sicherung = path.join(os.tmpdir(), `rollladen-dev-sicherung-${Date.now()}.json`);
fs.writeFileSync(sicherung, JSON.stringify({ Szenen: szenen.raw, Wochenplan: plan.raw }, null, 2));
console.log(`\nAlter Stand gesichert: ${sicherung}`);

schreibe('Szenen', neuSzenen);
schreibe('Wochenplan', neuPlan);

const kontrolleS = lies('Szenen').liste.length;
const kontrolleP = lies('Wochenplan').liste.length;
if (kontrolleS !== neuSzenen.length || kontrolleP !== neuPlan.length) {
    console.error(`Kontrolle fehlgeschlagen: gelesen ${kontrolleS} Szenen / ${kontrolleP} Zeitpunkte.`);
    process.exit(1);
}
console.log(`Fertig: ${kontrolleS} Szenen und ${kontrolleP} Zeitpunkte stehen in ${ROOT}.`);
