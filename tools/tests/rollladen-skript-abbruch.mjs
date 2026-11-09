// Feature 30, Phase 2 - Abbruch einer Szene im Rollladen-Skript (iobroker-scripts/rollladen/Rollladen_Wochenplan.js).
//
//   node tools/tests/rollladen-skript-abbruch.mjs     (npm run test:rollladen-skript)
//
// Ohne Pi und ohne Netz: Der Skripttext wird gelesen, nur Konstanten (TROCKENLAUF, REAKTION_MS, PAUSE_MS,
// TROCKENLAUF_FAHRZEIT_MS und der Sekundentakt der Wartestellen) werden per Regex fuer den Test verkleinert,
// dann laeuft er in node:vm mit nachgebauten ioBroker-Funktionen (getState, setState, setStateAsync,
// existsState, existsObject, setObjectAsync, extendObjectAsync, createStateAsync, on, schedule, log,
// getAstroDate, getDateObject). Ein simulierter TaHoma-Antrieb bestaetigt Befehle nach kurzer Zeit und
// meldet MovingState. Nichts davon beruehrt ein echtes ioBroker.
//
// Faelle: (1) Live, Abbruch waehrend des Wartens auf Stillstand: keine Lamelle, letzte30 abgebrochen:true;
// (2) Abbruch zwischen zwei Sendeversuchen; (3) Abbruch sofort bestaetigt und nicht ueberschrieben;
// (4) ohne Abbruch wie bisher; (5) Trockenlauf: nie etwas auf tahoma.1.*, simulierte Fahrzeit;
// (6) Abbruch einer Szene, die nicht laeuft; (7) alte Befehlsformen und ungueltige Befehle.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// ROLLLADEN_SKRIPT: anderer Skriptpfad (z. B. fuer eine absichtlich kaputte Fassung, um den Test selbst zu pruefen)
const SCRIPT = readFileSync(
    process.env.ROLLLADEN_SKRIPT ?? join(here, '../../iobroker-scripts/rollladen/Rollladen_Wochenplan.js'),
    'utf8',
);

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const ROOT = '0_userdata.0.Rollladen_Dev';
const BEFEHL = `${ROOT}.Befehl`;
const STATUS = `${ROOT}.Status`;
const WOHNZ = 'tahoma.1.devices.Wohnz_gross.states.core:ClosureState';
const WOHNZ_MOVING = 'tahoma.1.devices.Wohnz_gross.states.core:MovingState';
const RAFF = 'tahoma.1.devices.Raffstore_(Garten).states.core:ClosureState';
const RAFF_MOVING = 'tahoma.1.devices.Raffstore_(Garten).states.core:MovingState';
const RAFF_SLAT = 'tahoma.1.devices.Raffstore_(Garten).states.core:SlateOrientationState';

const SCENES = [
    {
        id: 's-test',
        name: 'Test',
        icon: 'sun',
        targets: [
            { key: 'Wohnz_gross', closed: 100 },
            { key: 'Raffstore_(Garten)', closed: 100, slat: 90 },
        ],
    },
    { id: 's-eins', name: 'Eins', icon: 'sun', targets: [{ key: 'Wohnz_gross', closed: 100 }] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 6000, what = '') {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (cond()) {
            return true;
        }
        await sleep(15);
    }
    throw new Error(`timeout waiting for ${what || cond}`);
}

/** Skripttext fuer den Test: nur Konstanten werden ersetzt (und geprueft, dass sie existieren). */
function patched({ trockenlauf, reaktionMs = 400, pauseMs = 150, fahrzeitMs = 600 }) {
    let s = SCRIPT;
    const sub = (re, to, min = 1) => {
        const n = (s.match(re) || []).length;
        if (n < min) {
            throw new Error(`script drift: ${re} not found`);
        }
        s = s.replace(re, to);
    };
    sub(/const TROCKENLAUF = (true|false);/, `const TROCKENLAUF = ${trockenlauf};`);
    sub(/const REAKTION_MS = \d+;/, `const REAKTION_MS = ${reaktionMs};`);
    sub(/const PAUSE_MS = \d+;/, `const PAUSE_MS = ${pauseMs};`);
    sub(/const TROCKENLAUF_FAHRZEIT_MS = \d+;/, `const TROCKENLAUF_FAHRZEIT_MS = ${fahrzeitMs};`);
    sub(/setTimeout\(r, 1000\)/g, 'setTimeout(r, 40)', 2);
    return s;
}

/** Nachgebautes ioBroker mit simuliertem Antrieb. */
async function start(opts) {
    const o = { reaktion: true, fahrMs: 500, connected: true, ...opts };
    const states = new Map();
    const writes = [];
    const logs = [];
    const handlers = [];
    const t0 = Date.now();
    const put = (id, val, ack = true) => {
        const now = Date.now();
        const prev = states.get(id);
        states.set(id, { val, ack, ts: now, lc: prev && prev.val === val ? prev.lc : now });
    };
    const rec = (kind, id, val, ack) => writes.push({ kind, id, val, ack, t: Date.now() - t0 });
    const fire = (id, val, ack) => {
        if (ack) {
            return;
        }
        for (const h of handlers) {
            if (h.pattern.id === id && h.pattern.ack === false) {
                h.fn({ id, state: states.get(id) });
            }
        }
    };
    const sim = (dp, val) => {
        if (!dp.startsWith('tahoma.1.')) {
            return;
        }
        if (!o.reaktion) {
            return; // der Antrieb antwortet nicht
        }
        setTimeout(() => put(dp, val, true), 30);
        if (/ClosureState$/.test(dp)) {
            const moving = dp.replace(/ClosureState$/, 'MovingState');
            setTimeout(() => put(moving, true, true), 30);
            setTimeout(() => put(moving, false, true), 30 + o.fahrMs);
        }
    };

    // Geraete und Verbindung
    put('tahoma.1.info.connection', o.connected, true);
    for (const [pos, moving] of [
        [WOHNZ, WOHNZ_MOVING],
        [RAFF, RAFF_MOVING],
    ]) {
        put(pos, 0, true);
        put(moving, false, true);
    }
    put(RAFF_SLAT, 0, true);
    put(`${ROOT}.Szenen`, JSON.stringify(SCENES), true);
    put(`${ROOT}.Wochenplan`, '[]', true);
    put(`${ROOT}.Einstellungen`, JSON.stringify({ master: false, pausedTodayDate: null, holidayMode: 'sunday' }), true);
    put(BEFEHL, '', true);

    const sandbox = {
        getState: (id) => states.get(id) ?? null,
        setState: (id, val, ack = false) => {
            rec('sync', id, val, ack);
            put(id, val, ack);
            fire(id, val, ack);
        },
        setStateAsync: async (id, val, ack = false) => {
            rec('async', id, val, ack);
            put(id, val, ack);
            sim(id, val);
        },
        existsState: (id) => states.has(id),
        existsObject: () => true,
        setObjectAsync: async () => {},
        extendObjectAsync: async () => {},
        createStateAsync: async (id, val) => put(id, val, true),
        on: (pattern, fn) => handlers.push({ pattern, fn }),
        schedule: () => {},
        log: (msg, level = 'info') => logs.push({ msg, level }),
        getAstroDate: (name, d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), name === 'sunrise' ? 7 : 18, 0),
        getDateObject: (x) => (x instanceof Date ? x : new Date(x)),
        setTimeout,
        clearTimeout,
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(patched(o), ctx, { filename: 'Rollladen_Wochenplan.js' });
    await until(() => logs.some((l) => /gestartet/.test(l.msg)), 4000, 'script start');
    // Der Zeitgeber-Takt (schedule) laeuft im Test nicht: nur Sofort-Befehle
    const api = {
        states,
        writes,
        logs,
        /** Wert von aussen schreiben (ack:false), wie die App es tut */
        extern(id, val) {
            put(id, val, false);
            fire(id, val, false);
        },
        status: () => JSON.parse(states.get(STATUS).val),
        running: () => vm.runInContext('laeufe.size', ctx),
        idle: () => until(() => vm.runInContext('laeufe.size', ctx) === 0, 8000, 'runs finished'),
        befehl: () => states.get(BEFEHL),
        writesTo: (id) => writes.filter((w) => w.id === id),
        tahomaWrites: () => writes.filter((w) => w.id.startsWith('tahoma.1.')),
        evalIn: (code) => vm.runInContext(code, ctx),
    };
    return api;
}

const SZENE_FAHREN = JSON.stringify({ sceneId: 's-test' });
const SZENE_ABBRUCH = JSON.stringify({ abort: 's-test' });

// ── (0) befehlLesen: reine Funktion ──
{
    const sc = await start({ trockenlauf: true });
    const lesen = (v) => JSON.stringify(sc.evalIn(`befehlLesen(${JSON.stringify(v)})`));
    check('befehlLesen: reiner String = sceneId', lesen('s-test') === '{"sceneId":"s-test"}', lesen('s-test'));
    check('befehlLesen: {"sceneId"} = sceneId', lesen('{"sceneId":"s-test"}') === '{"sceneId":"s-test"}');
    check('befehlLesen: {"abort"} = abort', lesen('{"abort":"s-test"}') === '{"abort":"s-test"}');
    check('befehlLesen: beide Felder sind ungueltig', lesen('{"sceneId":"a","abort":"b"}') === 'null');
    check('befehlLesen: leer, kaputt und {} sind ungueltig', ['', '   ', '{', '{}', '{"abort":""}', '{"x":1}'].every((v) => lesen(v) === 'null'));
}

// ── (1) Live: Abbruch waehrend des Wartens auf Stillstand, danach keine Lamelle ──
{
    const sc = await start({ trockenlauf: false, fahrMs: 900 });
    sc.extern(BEFEHL, SZENE_FAHREN);
    // Raffstore: Position ist gesendet, MovingState true (Warten auf Stillstand)
    await until(() => sc.states.get(RAFF_MOVING).val === true && sc.writesTo(RAFF).length === 1, 3000, 'raffstore driving');
    await sleep(120);
    sc.extern(BEFEHL, SZENE_ABBRUCH);
    await sc.idle();
    const slat = sc.writesTo(RAFF_SLAT);
    check('1) Live: nach dem Abbruch kein Befehl an die Lamelle', slat.length === 0, JSON.stringify(slat));
    const st = sc.status();
    const lauf = st.letzte30.find((e) => e.abgebrochen === true);
    const raff = lauf && lauf.ziele.find((z) => z.key === 'Raffstore_(Garten)');
    check(
        '1) Live: letzte30-Eintrag der Szene mit abgebrochen:true, Lamelle "abgebrochen"',
        !!lauf && !!raff && raff.lamelle && raff.lamelle.ergebnis === 'abgebrochen',
        JSON.stringify(st.letzte30.map((e) => [e.auslöser, e.abgebrochen])),
    );
    check(
        '1) Live: der Abbruch steht mit Zeit, "Abbruch → Szene" und 1 Lauf in letzte30',
        st.letzte30.some((e) => /^Abbruch → Szene "s-test"$/.test(e.auslöser) && e.laeufe === 1 && /1 Lauf/.test(e.hinweis) && !!e.zeit),
        JSON.stringify(st.letzte30.map((e) => [e.auslöser, e.laeufe])),
    );
    check('1) Live: ein Abbruch ist kein Fehler (letzterFehler leer)', st.letzterFehler === null, String(st.letzterFehler));
    check('1) Live: das Skript sendet selbst kein commands.stop', sc.writes.every((w) => !/commands\.stop/.test(w.id)));
}

// ── (2) Live: Abbruch zwischen zwei Sendeversuchen ──
{
    const sc = await start({ trockenlauf: false, reaktion: false, reaktionMs: 300, pauseMs: 500 });
    sc.extern(BEFEHL, JSON.stringify({ sceneId: 's-eins' }));
    await until(() => sc.writesTo(WOHNZ).length === 1, 2000, 'first attempt');
    // erster Versuch wartet 300 ms auf eine Reaktion, dann folgt die Pause von 500 ms
    await sleep(300 + 120);
    sc.extern(BEFEHL, JSON.stringify({ abort: 's-eins' }));
    await sc.idle();
    await sleep(700);
    check('2) Live: nach dem Abbruch in der Pause kein weiterer Sendeversuch', sc.writesTo(WOHNZ).length === 1, String(sc.writesTo(WOHNZ).length));
    const st = sc.status();
    check('2) Live: der Lauf steht als abgebrochen in letzte30', st.letzte30.some((e) => e.abgebrochen === true && e.ziele[0] && e.ziele[0].position.ergebnis === 'abgebrochen'), JSON.stringify(st.letzte30.map((e) => [e.auslöser, e.abgebrochen])));
    check('2) Live: kein Fehler "keine Reaktion" wegen des Abbruchs', st.letzterFehler === null, String(st.letzterFehler));
}

// ── (3) Abbruch sofort bestaetigt, Szenen-Befehl danach nicht zurueckgeschrieben ──
{
    const sc = await start({ trockenlauf: false, fahrMs: 700 });
    sc.extern(BEFEHL, SZENE_FAHREN);
    await until(() => sc.states.get(RAFF_MOVING).val === true, 3000, 'driving');
    sc.extern(BEFEHL, SZENE_ABBRUCH);
    const sofort = sc.befehl();
    check('3) der Abbruch ist sofort bestaetigt (ack:true, im selben Augenblick)', sofort.val === SZENE_ABBRUCH && sofort.ack === true, JSON.stringify(sofort));
    await sc.idle();
    await sleep(200);
    const fin = sc.befehl();
    check('3) .Befehl behaelt den Abbruch-Wert mit ack:true', fin.val === SZENE_ABBRUCH && fin.ack === true, JSON.stringify(fin));
    const spaet = sc.writesTo(BEFEHL).filter((w) => w.ack === true && w.val === SZENE_FAHREN);
    check('3) die Bestaetigung des Szenen-Befehls wurde nicht mehr zurueckgeschrieben', spaet.length === 0, JSON.stringify(spaet));
}

// ── (4) Ohne Abbruch: wie bisher ──
{
    const sc = await start({ trockenlauf: false, fahrMs: 300 });
    sc.extern(BEFEHL, SZENE_FAHREN);
    await sc.idle();
    const conf = sc.writesTo(BEFEHL).filter((w) => w.ack === true && w.val === SZENE_FAHREN);
    check('4) ohne Abbruch: Bestaetigung mit dem Szenen-Wert (ack:true)', conf.length === 1 && sc.befehl().ack === true && sc.befehl().val === SZENE_FAHREN, JSON.stringify(sc.writesTo(BEFEHL)));
    check('4) ohne Abbruch: die Lamelle wird gesendet', sc.writesTo(RAFF_SLAT).length === 1 && sc.writesTo(RAFF_SLAT)[0].val === 90, JSON.stringify(sc.writesTo(RAFF_SLAT)));
    const st = sc.status();
    check('4) ohne Abbruch: kein abgebrochen-Eintrag', st.letzte30.length === 1 && st.letzte30[0].abgebrochen === undefined, JSON.stringify(st.letzte30.map((e) => [e.auslöser, e.abgebrochen])));
}

// ── (5) Trockenlauf: nie etwas auf tahoma.1.*, simulierte Fahrzeit, Abbruch protokolliert ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 700 });
    const t = Date.now();
    sc.extern(BEFEHL, SZENE_FAHREN);
    await sc.idle();
    const dauer = Date.now() - t;
    const st0 = sc.status();
    check('5) Trockenlauf: die Fahrt dauert die simulierte Zeit (Position + Lamelle beim Raffstore)', dauer >= 1300, `${dauer} ms`);
    check('5) Trockenlauf: alle Ziele "würde fahren (Trockenlauf)"', st0.letzte30[0].ziele.every((z) => /würde fahren/.test(z.position.ergebnis)) && /würde fahren/.test(st0.letzte30[0].ziele[1].lamelle.ergebnis), JSON.stringify(st0.letzte30[0].ziele));
    check('5) Trockenlauf: Bestaetigung mit dem Szenen-Wert', sc.befehl().val === SZENE_FAHREN && sc.befehl().ack === true);

    sc.extern(BEFEHL, SZENE_FAHREN);
    await until(() => sc.running() === 1, 1000, 'run');
    await sleep(200);
    sc.extern(BEFEHL, SZENE_ABBRUCH);
    await sc.idle();
    const st = sc.status();
    const e = st.letzte30.find((x) => x.abgebrochen === true);
    check(
        '5) Trockenlauf: ein Abbruch in der simulierten Fahrzeit wird protokolliert (Position und Lamelle "abgebrochen")',
        !!e && e.ziele.every((z) => z.position.ergebnis === 'abgebrochen') && e.ziele[1].lamelle.ergebnis === 'abgebrochen',
        JSON.stringify(e),
    );
    check('5) Trockenlauf: keine einzige Schreiboperation auf tahoma.1.* (auch nicht beim Abbruch)', sc.tahomaWrites().length === 0, JSON.stringify(sc.tahomaWrites()));
}

// ── (6) Abbruch einer Szene, die nicht laeuft ──
{
    const sc = await start({ trockenlauf: false });
    const vorher = sc.writes.length;
    sc.extern(BEFEHL, SZENE_ABBRUCH);
    await sleep(100);
    const neu = sc.writes.slice(vorher);
    const st = sc.status();
    check('6) kein Lauf: der Abbruch wird bestaetigt (ack:true)', sc.befehl().val === SZENE_ABBRUCH && sc.befehl().ack === true);
    check('6) kein Lauf: Eintrag "0 Läufe" in letzte30', st.letzte30.length === 1 && st.letzte30[0].laeufe === 0 && /0 Läufe/.test(st.letzte30[0].hinweis), JSON.stringify(st.letzte30));
    check('6) kein Lauf: sonst nichts (nur Befehl-Bestaetigung und Status, nichts auf tahoma.1.*)', neu.every((w) => w.id === BEFEHL || w.id === STATUS) && sc.tahomaWrites().length === 0, JSON.stringify(neu.map((w) => w.id)));
}

// ── (7) Alte Befehlsformen und ungueltige Befehle ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 100 });
    sc.extern(BEFEHL, 's-eins');
    await sc.idle();
    check(
        '7) reiner String startet die Szene und wird mit demselben Wert bestaetigt',
        sc.status().letzte30[0].auslöser === 'Sofort-Befehl → Szene "s-eins"' && sc.befehl().val === 's-eins' && sc.befehl().ack === true,
        JSON.stringify(sc.status().letzte30[0]),
    );
    sc.extern(BEFEHL, JSON.stringify({ sceneId: 's-eins' }));
    await sc.idle();
    check(
        '7) {"sceneId"} startet die Szene und wird bestaetigt',
        sc.status().letzte30.length === 2 && sc.befehl().val === '{"sceneId":"s-eins"}' && sc.befehl().ack === true,
    );
    const n = sc.status().letzte30.length;
    sc.extern(BEFEHL, '{"sceneId":"s-eins","abort":"s-eins"}');
    await sleep(100);
    check(
        '7) beide Felder: Warnung im Log, bestaetigt, nichts gestartet',
        sc.logs.some((l) => l.level === 'warn' && /ohne gueltige sceneId/.test(l.msg)) && sc.befehl().ack === true && sc.status().letzte30.length === n && sc.running() === 0,
    );
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
