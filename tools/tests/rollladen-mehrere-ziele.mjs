// Mehrere Ziele je Zeitpunkt im Rollläden-Wochenplan: Parser/Speicherform/Auflösung in der App (planModel.ts,
// editorDirty.ts) und im Skript (iobroker-scripts/rollladen/Rollladen_Wochenplan.js).
//
//   node tools/tests/rollladen-mehrere-ziele.mjs     (npm run test:mehrere-ziele)
//
// Teil A (T1-T8): reine TypeScript-Funktionen, mit esbuild gebündelt, ohne Dev-Server.
// Teil B (S1-S11): Skripttext in node:vm mit nachgebauten ioBroker-Funktionen (Prüfstand aus
//   rollladen-skript-abbruch.mjs, hier kopiert). Immer Trockenlauf: nichts geht an tahoma.1.*.
import { build } from 'esbuild';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
/** Prüfung mit assert: wirft sie, ist der Fall rot. */
const checkFn = (name, fn) => {
    try {
        fn();
        check(name, true);
    } catch (e) {
        check(name, false, e.message);
    }
};

// ── Teil A: TypeScript ─────────────────────────────────────────────────

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-mehrere-ziele-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { parsePlan, serializePlan, entryToJson, resolveTargets, targetConflicts, quietSplit, entryNameOf, removeSceneFromEntries } from './src-vis/components/widgets/shutterfloors/planner/planModel.ts';" +
            "export { sameEntry } from './src-vis/components/widgets/shutterfloors/planner/editorDirty.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });
const { parsePlan, serializePlan, entryToJson, resolveTargets, targetConflicts, quietSplit, entryNameOf, removeSceneFromEntries, sameEntry } = m;

const DAYS = [true, true, true, true, true, false, false];
const TRIG = { kind: 'time', time: '06:30', offset: 0, earliest: null, latest: null };
const sceneT = (sceneId) => ({ kind: 'scene', sceneId });
const devT = (key, closed) => ({ kind: 'device', key, closed });
const scn = (id, targets) => ({ id, name: id, icon: 'sun', targets });

const TS_SCENES = [
    scn('s-a', [
        { key: 'Wohnz_gross', closed: 100 },
        { key: 'Wohnz_klein', closed: 100 },
    ]),
    scn('s-b', [
        { key: 'Wohnz_gross', closed: 40 },
        { key: 'Küchenfenster', closed: 60 },
    ]),
    scn('s-aq', [
        { key: 'Wohnz_gross', closed: 100, quiet: true },
        { key: 'Wohnz_klein', closed: 100, quiet: true },
    ]),
    scn('s-r', [{ key: 'Raffstore_(Garten)', closed: 100, slat: 90 }]),
];
const entryOf = (targets, extra = {}) => ({ id: 'e1', days: DAYS, trigger: TRIG, targets, enabled: true, ...extra });
const byKey = (list) => Object.fromEntries(list.map((r) => [r.key, r]));

// T1: altes Format bleibt Byte für Byte
checkFn('T1) altes Format mit `target`: ein Ziel, serializePlan gibt exakt die Eingabe zurück, ohne "targets"', () => {
    const raw = JSON.stringify([
        { id: 'e1', days: DAYS, trigger: TRIG, target: { kind: 'scene', sceneId: 's-a' }, enabled: true, quiet: true },
        { id: 'e2', days: DAYS, trigger: TRIG, target: { kind: 'device', key: 'Wohnz_gross', closed: 50 }, enabled: false },
    ]);
    const r = parsePlan(raw);
    assert.equal(r.error, null);
    assert.equal(r.value[0].targets.length, 1);
    const out = serializePlan(r.value);
    assert.equal(out, raw);
    assert.ok(!out.includes('"targets"'));
});

// T2: zwei Ziele
checkFn('T2) zwei Ziele: `targets` statt `target`, Hin-und-zurück gleich', () => {
    const e = entryOf([sceneT('s-a'), devT('Küchenfenster', 50)], { quiet: true, name: 'Abend' });
    const j = entryToJson(e);
    assert.ok('targets' in j);
    assert.ok(!('target' in j));
    assert.deepEqual(j.targets.length, 2);
    const back = parsePlan(serializePlan([e])).value;
    assert.deepStrictEqual(back, [e]);
});

// T3: Ungültiges
checkFn('T3) leere/ungültige Ziellisten werden verworfen, Namen getrimmt, leerer Name nicht geschrieben', () => {
    const base = { id: 'e1', days: DAYS, trigger: TRIG, enabled: true };
    const leer = parsePlan(JSON.stringify([{ ...base, targets: [] }]));
    assert.equal(leer.value.length, 0);
    assert.ok(leer.error);
    const nurUngueltig = parsePlan(JSON.stringify([{ ...base, targets: [{ kind: 'x' }, { kind: 'device', key: 1 }] }]));
    assert.equal(nurUngueltig.value.length, 0);
    assert.match(nurUngueltig.error, /1 Eintrag/);
    const einzelnUngueltig = parsePlan(JSON.stringify([{ ...base, target: { kind: 'x' } }]));
    assert.equal(einzelnUngueltig.value.length, 0);
    assert.ok(einzelnUngueltig.error);
    const rest = parsePlan(JSON.stringify([{ ...base, targets: [{ kind: 'x' }, sceneT('s-a')] }]));
    assert.deepEqual(rest.value[0].targets, [sceneT('s-a')]);
    const trim = parsePlan(JSON.stringify([{ ...base, target: sceneT('s-a'), name: '  x ' }]));
    assert.equal(trim.value[0].name, 'x');
    const ohneName = parsePlan(JSON.stringify([{ ...base, target: sceneT('s-a'), name: '' }]));
    assert.ok(!('name' in ohneName.value[0]));
    assert.ok(!('name' in entryToJson({ ...entryOf([sceneT('s-a')]), name: '' })));
});

// T4: Auflösung
checkFn('T4) resolveTargets: Einzeln schlägt Szene, unten schlägt oben, jeder Schlüssel einmal, leise vom Gewinner', () => {
    const wg = (e, canSlow) => byKey(resolveTargets(e, TS_SCENES, canSlow)).Wohnz_gross;
    // Einzeln schlägt Szene, vor und nach der Szene
    assert.equal(wg(entryOf([devT('Wohnz_gross', 10), sceneT('s-a')])).closed, 10);
    assert.equal(wg(entryOf([sceneT('s-a'), devT('Wohnz_gross', 10)])).closed, 10);
    assert.equal(wg(entryOf([sceneT('s-a'), devT('Wohnz_gross', 10)])).kind, 'device');
    // untere Szene schlägt obere
    assert.equal(wg(entryOf([sceneT('s-a'), sceneT('s-b')])).closed, 40);
    assert.equal(wg(entryOf([sceneT('s-a'), sceneT('s-b')])).from, 1);
    assert.equal(wg(entryOf([sceneT('s-b'), sceneT('s-a')])).closed, 100);
    // zwei Einzelziele: das untere
    assert.equal(wg(entryOf([devT('Wohnz_gross', 10), devT('Wohnz_gross', 20)])).closed, 20);
    // gelöschte Szene wird übergangen
    const r = resolveTargets(entryOf([sceneT('gibt-es-nicht'), devT('Wohnz_gross', 0)]), TS_SCENES);
    assert.deepEqual(r.map((x) => x.key), ['Wohnz_gross']);
    // jeder Schlüssel genau einmal, in Reihenfolge des ersten Auftretens
    const alle = resolveTargets(entryOf([sceneT('s-a'), sceneT('s-b'), devT('Raffstore_(Garten)', 30), devT('Wohnz_klein', 5)]), TS_SCENES);
    assert.deepEqual(alle.map((x) => x.key), ['Wohnz_gross', 'Wohnz_klein', 'Küchenfenster', 'Raffstore_(Garten)']);
    // leise vom gewinnenden Ziel
    assert.equal(wg(entryOf([sceneT('s-aq'), sceneT('s-b')])).quiet, false);
    assert.equal(wg(entryOf([sceneT('s-b'), sceneT('s-aq')])).quiet, true);
    // entry.quiet gilt für alle
    assert.ok(resolveTargets(entryOf([sceneT('s-a'), sceneT('s-r')], { quiet: true }), TS_SCENES).every((x) => x.quiet));
    // mit canSlow nur für Fähige
    const fae = resolveTargets(entryOf([sceneT('s-a'), sceneT('s-r')], { quiet: true }), TS_SCENES, (k) => k !== 'Raffstore_(Garten)');
    assert.equal(byKey(fae).Wohnz_gross.quiet, true);
    assert.equal(byKey(fae)['Raffstore_(Garten)'].quiet, false);
    // quietSplit nutzt dieselbe Auflösung
    const sp = quietSplit(entryOf([sceneT('s-a'), sceneT('s-r')], { quiet: true }), TS_SCENES, (k) => k !== 'Raffstore_(Garten)');
    assert.deepEqual(sp, { quiet: ['Wohnz_gross', 'Wohnz_klein'], normal: ['Raffstore_(Garten)'] });
});

// T5: Widersprüche
checkFn('T5) targetConflicts: abweichende Stellung meldet den Gewinner, gleiche keinen', () => {
    const c = targetConflicts(entryOf([sceneT('s-a'), sceneT('s-b')]), TS_SCENES);
    assert.equal(c.length, 1);
    assert.equal(c[0].key, 'Wohnz_gross');
    assert.deepEqual(c[0].sources, [0, 1]);
    assert.equal(c[0].winner.kind, 'scene');
    assert.equal(c[0].winner.from, 1);
    const d = targetConflicts(entryOf([sceneT('s-a'), devT('Wohnz_gross', 10)]), TS_SCENES);
    assert.equal(d.length, 1);
    assert.equal(d[0].winner.kind, 'device');
    assert.equal(targetConflicts(entryOf([sceneT('s-a'), devT('Wohnz_gross', 100)]), TS_SCENES).length, 0);
    assert.equal(targetConflicts(entryOf([sceneT('s-a'), sceneT('s-aq')]), TS_SCENES).length, 0);
});

// T6: Namen
checkFn('T6) entryNameOf: eigener Name, ein Ziel, „+ 1 weiteres", „+ 2 weitere"', () => {
    const nm = (t) => (t.kind === 'scene' ? `Szene ${t.sceneId}` : `Gerät ${t.key}`);
    assert.equal(entryNameOf({ targets: [sceneT('a')], name: '  Feierabend ' }, nm), 'Feierabend');
    assert.equal(entryNameOf({ targets: [sceneT('a')] }, nm), 'Szene a');
    assert.equal(entryNameOf({ targets: [sceneT('a'), devT('K', 1)] }, nm), 'Szene a + 1 weiteres');
    assert.equal(entryNameOf({ targets: [sceneT('a'), devT('K', 1), sceneT('b')] }, nm), 'Szene a + 2 weitere');
});

// T7: Szene löschen
checkFn('T7) removeSceneFromEntries: zählt removed/shortened, Reihenfolge der übrigen Ziele bleibt', () => {
    const list = [
        entryOf([sceneT('s-a')], { id: 'x1' }),
        entryOf([devT('K', 1), sceneT('s-a'), sceneT('s-b')], { id: 'x2' }),
        entryOf([sceneT('s-b')], { id: 'x3' }),
        entryOf([sceneT('s-a'), sceneT('s-a')], { id: 'x4' }),
    ];
    const r = removeSceneFromEntries(list, 's-a');
    assert.equal(r.removed, 2);
    assert.equal(r.shortened, 1);
    assert.deepEqual(r.entries.map((e) => e.id), ['x2', 'x3']);
    assert.deepEqual(r.entries[0].targets, [devT('K', 1), sceneT('s-b')]);
});

// T8: Änderungserkennung
checkFn('T8) sameEntry: Reihenfolge zählt, leerer Name gleich keinem Namen', () => {
    const a = entryOf([sceneT('s-a'), sceneT('s-b')]);
    const b = entryOf([sceneT('s-b'), sceneT('s-a')]);
    assert.equal(sameEntry(a, b), false);
    assert.equal(sameEntry(a, entryOf([sceneT('s-a'), sceneT('s-b')])), true);
    assert.equal(sameEntry(a, { ...a, name: '' }), true);
    assert.equal(sameEntry(a, { ...a, name: '  ' }), true);
    assert.equal(sameEntry(a, { ...a, name: 'x' }), false);
});

// ── Teil B: Skript ─────────────────────────────────────────────────────

// ROLLLADEN_SKRIPT: anderer Skriptpfad (z. B. um den Test selbst zu prüfen)
const SCRIPT = readFileSync(process.env.ROLLLADEN_SKRIPT ?? join(here, '../../iobroker-scripts/rollladen/Rollladen_Wochenplan.js'), 'utf8');

const ROOT = '0_userdata.0.Rollladen_Dev';
const BEFEHL = `${ROOT}.Befehl`;
const STATUS = `${ROOT}.Status`;

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

/** Skripttext für den Test: nur Konstanten werden ersetzt (und geprüft, dass sie existieren). */
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

const SK_SCENES = [
    { id: 's-a', name: 'A', icon: 'sun', targets: [
        { key: 'Wohnz_gross', closed: 100 },
        { key: 'Wohnz_klein', closed: 100 },
    ] },
    { id: 's-b', name: 'B', icon: 'sun', targets: [
        { key: 'Wohnz_gross', closed: 40 },
        { key: 'Küchenfenster', closed: 60 },
    ] },
    { id: 's-aq', name: 'Aq', icon: 'moon', targets: [
        { key: 'Wohnz_gross', closed: 100, quiet: true },
        { key: 'Wohnz_klein', closed: 100, quiet: true },
    ] },
    { id: 's-r', name: 'R', icon: 'sun', targets: [{ key: 'Raffstore_(Garten)', closed: 100, slat: 90 }] },
    { id: 's-leise', name: 'Leise', icon: 'moon', targets: [
        { key: 'Wohnz_gross', closed: 100, quiet: true },
        { key: 'Raffstore_(Garten)', closed: 100, slat: 90, quiet: true },
    ] },
];

/** Nachgebautes ioBroker mit simuliertem Antrieb (immer mit Verbindung und Antwort). */
async function start(opts) {
    const o = { fahrMs: 500, ...opts };
    const states = new Map();
    const writes = [];
    const logs = [];
    const handlers = [];
    const put = (id, val, ack = true) => {
        const now = Date.now();
        const prev = states.get(id);
        states.set(id, { val, ack, ts: now, lc: prev && prev.val === val ? prev.lc : now });
    };
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
        const real = dp.replace(/TargetClosureState:slow$/, 'ClosureState');
        setTimeout(() => put(real, val, true), 30);
        if (/ClosureState$/.test(real)) {
            const moving = real.replace(/ClosureState$/, 'MovingState');
            setTimeout(() => put(moving, true, true), 30);
            setTimeout(() => put(moving, false, true), 30 + o.fahrMs);
        }
    };

    put('tahoma.1.info.connection', true, true);
    for (const k of ['Wohnz_gross', 'Wohnz_klein', 'Küchenfenster', 'Raffstore_(Garten)']) {
        put(`tahoma.1.devices.${k}.states.core:ClosureState`, 0, true);
        put(`tahoma.1.devices.${k}.states.core:MovingState`, false, true);
    }
    put('tahoma.1.devices.Raffstore_(Garten).states.core:SlateOrientationState', 0, true);
    put(`${ROOT}.Szenen`, JSON.stringify(o.szenen ?? SK_SCENES), true);
    put(`${ROOT}.Wochenplan`, '[]', true);
    put(`${ROOT}.Einstellungen`, JSON.stringify({ master: false, pausedTodayDate: null, holidayMode: 'normal' }), true);
    put(BEFEHL, '', true);

    const sandbox = {
        getState: (id) => states.get(id) ?? null,
        setState: (id, val, ack = false) => {
            writes.push({ kind: 'sync', id, val, ack });
            put(id, val, ack);
            fire(id, val, ack);
        },
        setStateAsync: async (id, val, ack = false) => {
            writes.push({ kind: 'async', id, val, ack });
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
    const api = {
        states,
        writes,
        logs,
        /** Wert wie das Skript selbst setzen (ack:true), ohne Handler auszulösen */
        put: (id, val) => put(id, val, true),
        extern(id, val) {
            put(id, val, false);
            fire(id, val, false);
        },
        status: () => JSON.parse(states.get(STATUS).val),
        running: () => vm.runInContext('laeufe.size', ctx),
        idle: () => until(() => vm.runInContext('laeufe.size', ctx) === 0, 8000, 'runs finished'),
        tahomaWrites: () => writes.filter((w) => w.id.startsWith('tahoma.1.')),
        evalIn: (code) => vm.runInContext(code, ctx),
        /** Daten schreiben und vom Skript neu einlesen lassen */
        reload({ szenen, plan, einstellungen }) {
            if (szenen) put(`${ROOT}.Szenen`, JSON.stringify(szenen), true);
            if (plan) put(`${ROOT}.Wochenplan`, JSON.stringify(plan), true);
            if (einstellungen) put(`${ROOT}.Einstellungen`, JSON.stringify(einstellungen), true);
            vm.runInContext('ladeSzenen(); ladeWochenplan(); ladeEinstellungen()', ctx);
        },
        /** Zeitpunkt (als Objekt) durch den Skript-Parser schicken und ausführen */
        async fahreEintrag(eintrag) {
            return vm.runInContext(`fuehreEintragAus(zuPlanEintrag(${JSON.stringify(eintrag)}))`, ctx);
        },
        /** Aufgelöste Ziele des Skripts als einfache Liste (JSON-Umweg wegen eigener Realm) */
        zieleSkript: (eintrag) =>
            JSON.parse(vm.runInContext(`JSON.stringify(zieleAusEintrag(zuPlanEintrag(${JSON.stringify(eintrag)})))`, ctx)),
    };
    return api;
}

const plan = (targets, extra = {}) => ({ id: 'p1', days: DAYS, trigger: TRIG, targets, enabled: true, ...extra });
const norm = (z) => ({ key: z.key, closed: z.closed, slat: z.slat ?? null, quiet: z.quiet === true });
const ohneVon = (z) => {
    const { von: _von, ...rest } = z;
    return rest;
};

// ── S1: altes Format gibt dasselbe wie zieleAusTarget ──
{
    const sc = await start({ trockenlauf: true });
    const faelle = [
        sceneT('s-leise'),
        sceneT('s-a'),
        devT('Wohnz_gross', 70),
        devT('Raffstore_(Garten)', 20),
    ];
    let alleGleich = true;
    let detail = '';
    for (const target of faelle) {
        for (const quiet of [true, false]) {
            const alt = { id: 'p1', days: DAYS, trigger: TRIG, target, enabled: true, ...(quiet ? { quiet: true } : {}) };
            const neu = sc.zieleSkript(alt).map(ohneVon);
            const ref = JSON.parse(sc.evalIn(`JSON.stringify(zieleAusTarget(${JSON.stringify(target)}, ${quiet}))`));
            try {
                assert.deepStrictEqual(neu, ref);
            } catch {
                alleGleich = false;
                detail += `${JSON.stringify(target)}/${quiet}: ${JSON.stringify(neu)} vs ${JSON.stringify(ref)}; `;
            }
        }
    }
    check('S1) altes Format (`target`): zieleAusEintrag == zieleAusTarget (Szene und Gerät, quiet true/false)', alleGleich, detail);
}

// ── S2: mehrere Ziele im Trockenlauf ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 100 });
    sc.reload({ szenen: SK_SCENES });
    const e = plan([sceneT('s-a'), sceneT('s-b'), devT('Raffstore_(Garten)', 30)]);
    await sc.fahreEintrag(e);
    await sc.idle();
    const l = sc.status().letzte30[0];
    const keys = l.ziele.map((z) => z.key).sort();
    check(
        'S2) zwei Szenen + ein Rollladen: alle Schlüssel genau einmal in letzte30',
        JSON.stringify(keys) === JSON.stringify(['Küchenfenster', 'Raffstore_(Garten)', 'Wohnz_gross', 'Wohnz_klein']),
        JSON.stringify(keys),
    );
    check('S2) Auslöser beginnt mit "Plan p1 →"', /^Plan p1 → /.test(l.auslöser), l.auslöser);
    check('S2) nichts geht an tahoma.1.*', sc.tahomaWrites().length === 0, JSON.stringify(sc.tahomaWrites()));
}

// ── S3 bis S6: Auflösung im Skript ──
{
    const sc = await start({ trockenlauf: true });
    const z = (targets, extra) => byKey(sc.zieleSkript(plan(targets, extra)));
    check('S3) Einzeln schlägt Szene (vor und nach der Szene)',
        z([devT('Wohnz_gross', 10), sceneT('s-a')]).Wohnz_gross.closed === 10 && z([sceneT('s-a'), devT('Wohnz_gross', 10)]).Wohnz_gross.closed === 10);
    check('S4) untere Szene schlägt obere',
        z([sceneT('s-a'), sceneT('s-b')]).Wohnz_gross.closed === 40 && z([sceneT('s-b'), sceneT('s-a')]).Wohnz_gross.closed === 100);
    check('S5) leise: Szene leise, darunter normal -> nicht leise',
        z([sceneT('s-aq'), sceneT('s-b')]).Wohnz_gross.quiet === false);
    check('S5) leise: Szene normal, darunter leise -> leise',
        z([sceneT('s-b'), sceneT('s-aq')]).Wohnz_gross.quiet === true);
    const rq = z([sceneT('s-a'), sceneT('s-r')], { quiet: true });
    check('S5) Eintrag quiet: alle Ziele gewünscht leise', rq.Wohnz_gross.quiet === true && rq['Raffstore_(Garten)'].quiet === true);
    const r6 = sc.zieleSkript(plan([sceneT('gibt-es-nicht'), devT('Wohnz_gross', 0)]));
    check('S6) gelöschte Szene wird übergangen, das Gerät bleibt', r6.length === 1 && r6[0].key === 'Wohnz_gross', JSON.stringify(r6));
}
{
    // S5 und S6 am echten Lauf: Wirkung (dp endet auf :slow) und Weiterfahren ohne die gelöschte Szene
    const sc = await start({ trockenlauf: true, fahrzeitMs: 100 });
    await sc.fahreEintrag(plan([sceneT('s-a'), sceneT('s-r')], { quiet: true }));
    await sc.idle();
    const zs = sc.status().letzte30[0].ziele;
    const w = zs.find((x) => x.key === 'Wohnz_gross');
    const r = zs.find((x) => x.key === 'Raffstore_(Garten)');
    check('S5) Eintrag quiet: Wohnz_gross fährt leise (dp endet auf :slow), Raffstore nicht',
        w.position.leise === true && /:slow$/.test(w.position.dp) && !r.position.leise && !/:slow$/.test(r.position.dp), JSON.stringify([w.position, r.position]));
    await sc.fahreEintrag(plan([sceneT('gibt-es-nicht'), devT('Wohnz_gross', 100)]));
    await sc.idle();
    const l6 = sc.status().letzte30[0];
    check('S6) gelöschte Szene: das Gerät fährt trotzdem', l6.ziele.length === 1 && l6.ziele[0].key === 'Wohnz_gross' && /würde fahren/.test(l6.ziele[0].position.ergebnis), JSON.stringify(l6));
}

// ── S7: leere Ziele ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 100 });
    const parsed = sc.evalIn(`zuPlanEintrag(${JSON.stringify(plan([]))})`);
    check('S7) targets: [] -> zuPlanEintrag liefert null', parsed === null);
    const r = JSON.parse(sc.evalIn(`JSON.stringify(parseWochenplanJson(${JSON.stringify(JSON.stringify([plan([])]))}))`));
    check('S7) Parser meldet 1 Eintrag übersprungen', /^1 Eintrag/.test(r.fehler ?? ''), JSON.stringify(r));
    const jetzt = new Date();
    const hhmm = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
    sc.reload({
        plan: [plan([], { trigger: { kind: 'time', time: hhmm, offset: 0, earliest: null, latest: null } })],
        einstellungen: { master: true, pausedTodayDate: null, holidayMode: 'normal' },
    });
    sc.evalIn('minuetlicherTakt()');
    await sleep(100);
    check('S7) minuetlicherTakt startet keinen Lauf', sc.running() === 0 && sc.evalIn('status.letzte30.length') === 0);
}

// ── S8: Beschreibung ──
{
    const sc = await start({ trockenlauf: true });
    const b = (e) => sc.evalIn(`zielBeschreibungEintrag(zuPlanEintrag(${JSON.stringify(e)}))`);
    check('S8) eigener Name in Anführungszeichen', b(plan([sceneT('s-a')], { name: 'Feierabend' })) === '"Feierabend"', b(plan([sceneT('s-a')], { name: 'Feierabend' })));
    check('S8) zwei Ziele: "… + 1 weiteres"', b(plan([sceneT('s-a'), devT('Küchenfenster', 5)])) === 'Szene "s-a" + 1 weiteres', b(plan([sceneT('s-a'), devT('Küchenfenster', 5)])));
    check('S8) drei Ziele: "… + 2 weitere"', b(plan([sceneT('s-a'), devT('Küchenfenster', 5), sceneT('s-b')])) === 'Szene "s-a" + 2 weitere');
    check('S8) ein Ziel: wie bisher', b(plan([sceneT('s-a')])) === 'Szene "s-a"');
}

// ── S9: Minutentakt Ende zu Ende ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 100 });
    const targets = [sceneT('s-a'), sceneT('s-r'), devT('Küchenfenster', 20)];
    let gelaufen = false;
    for (let versuch = 0; versuch < 2 && !gelaufen; versuch++) {
        const jetzt = new Date();
        const hhmm = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
        sc.reload({
            plan: [plan(targets, { id: `p-s9-${versuch}`, trigger: { kind: 'time', time: hhmm, offset: 0, earliest: null, latest: null } })],
            einstellungen: { master: true, pausedTodayDate: null, holidayMode: 'normal' },
        });
        sc.evalIn('minuetlicherTakt()');
        await sleep(50);
        gelaufen = sc.running() > 0 || sc.evalIn('status.letzte30.length') > 0;
        if (gelaufen) await sc.idle();
    }
    const l = sc.status().letzte30[0];
    const keys = l ? l.ziele.map((z) => z.key) : [];
    check('S9) Minutentakt: Eintrag mit drei Zielen läuft, Auslöser beginnt mit "Plan <id> →"', !!l && /^Plan p-s9-\d →/.test(l.auslöser), JSON.stringify(l));
    check(
        'S9) Minutentakt: alle Ziele sind enthalten',
        ['Wohnz_gross', 'Wohnz_klein', 'Raffstore_(Garten)', 'Küchenfenster'].every((k) => keys.includes(k)) && keys.length === 4,
        JSON.stringify(keys),
    );
    check('S9) Minutentakt: nichts auf tahoma.1.*', sc.tahomaWrites().length === 0);
}

// ── S10: Abbruch trifft den ganzen Lauf ──
{
    const sc = await start({ trockenlauf: true, fahrzeitMs: 700 });
    const p = sc.fahreEintrag(plan([sceneT('s-a'), sceneT('s-b')]));
    await until(() => sc.running() === 1, 1000, 'run');
    await sleep(150);
    const fremd = JSON.parse(sc.evalIn(`JSON.stringify(laeufeAbbrechen('s-r').length)`));
    check('S10) Abbruch einer Szene, die nicht im Lauf steckt, trifft ihn nicht', fremd === 0 && sc.running() === 1);
    sc.extern(BEFEHL, JSON.stringify({ abort: 's-b' }));
    await p;
    await sc.idle();
    const st = sc.status();
    const l = st.letzte30.find((e) => /^Plan p1 →/.test(e.auslöser));
    check(
        'S10) Abbruch über die zweite Szene trifft den ganzen Plan-Lauf (abgebrochen:true, alle Ziele "abgebrochen")',
        !!l && l.abgebrochen === true && l.ziele.every((z) => z.position.ergebnis === 'abgebrochen'),
        JSON.stringify(l),
    );
    check('S10) der Abbruch steht mit 1 Lauf in letzte30', st.letzte30.some((e) => /^Abbruch → Szene "s-b"$/.test(e.auslöser) && e.laeufe === 1), JSON.stringify(st.letzte30.map((e) => [e.auslöser, e.laeufe])));
}

// ── S11: Gleichlauf App und Skript ──
{
    const sc = await start({ trockenlauf: true });
    const faelle = [
        plan([sceneT('s-a'), sceneT('s-b'), devT('Raffstore_(Garten)', 30)]),
        plan([devT('Wohnz_gross', 10), sceneT('s-a')]),
        plan([sceneT('s-a'), devT('Wohnz_gross', 10)]),
        plan([sceneT('s-a'), sceneT('s-b')]),
        plan([sceneT('s-b'), sceneT('s-a')]),
        plan([sceneT('s-aq'), sceneT('s-b')]),
        plan([sceneT('s-b'), sceneT('s-aq')]),
        plan([sceneT('s-a'), sceneT('s-r')], { quiet: true }),
        plan([sceneT('gibt-es-nicht'), devT('Wohnz_gross', 0)]),
        plan([devT('Wohnz_gross', 10), devT('Wohnz_gross', 20), sceneT('s-r')]),
    ];
    let gleich = true;
    let detail = '';
    for (const f of faelle) {
        const ts = resolveTargets(f, SK_SCENES).map(norm);
        const sk = sc.zieleSkript(f).map(norm);
        try {
            assert.deepStrictEqual(sk, ts);
        } catch {
            gleich = false;
            detail += `${JSON.stringify(f.targets)}: ${JSON.stringify(sk)} vs ${JSON.stringify(ts)}; `;
        }
    }
    check('S11) Gleichlauf: TS-resolveTargets und Skript-zieleAusEintrag liefern je Schlüssel dasselbe', gleich, detail);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
