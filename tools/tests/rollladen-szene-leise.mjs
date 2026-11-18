// Szenen-Ziele mit "leise" (Rollläden-Planer): Parser, Entwurf <-> Szene, Anzeigetext, Hinweis im Zeitpunkt-Editor.
//
//   node tools/tests/rollladen-szene-leise.mjs     (npm run test:szene-leise)
//
// Ohne Dev-Server: planModel.ts und editorDirty.ts sind reine Funktionen und werden mit esbuild gebündelt.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-szene-leise-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { parseScenes, sceneQuietKeys, sceneTargetText } from './src-vis/components/widgets/shutterfloors/planner/planModel.ts';" +
            "export { sceneDraftOf, sameSceneDraft, sceneTargetsToList, sceneFromDraft } from './src-vis/components/widgets/shutterfloors/planner/editorDirty.ts';",
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
const { parseScenes, sceneQuietKeys, sceneTargetText, sceneDraftOf, sameSceneDraft, sceneTargetsToList, sceneFromDraft } = m;

const results = [];
const check = (name, fn) => {
    try {
        fn();
        results.push({ name, ok: true });
        console.log(`  ok   ${name}`);
    } catch (e) {
        results.push({ name, ok: false });
        console.log(`  FAIL ${name} - ${e.message}`);
    }
};

const stub = { deviceOf: (key) => ({ hasSlat: key.startsWith('Raff') }) };
const parse = (arr) => parseScenes(JSON.stringify(arr)).value;
const sc = (targets, id = 's1') => ({ id, name: 'Test', icon: 'sun', targets });

// (1) Parser
check('1) Parser behält quiet:true', () => {
    const [s] = parse([sc([{ key: 'a', closed: 100, quiet: true }])]);
    assert.equal(s.targets[0].quiet, true);
});
check('1) Parser verwirft false, "true" und 1', () => {
    for (const bad of [false, 'true', 1, null]) {
        const [s] = parse([sc([{ key: 'a', closed: 100, quiet: bad }])]);
        assert.ok(!('quiet' in s.targets[0]), String(bad));
    }
});

// (2) altes JSON unverändert
check('2) altes JSON ohne quiet: parse -> stringify byte-gleich, kein "quiet"', () => {
    const raw = JSON.stringify([
        { id: 's1', name: 'Alt', icon: 'sun', targets: [{ key: 'a', closed: 50 }, { key: 'Raff1', closed: 100, slat: 90 }], favorite: true },
    ]);
    const out = JSON.stringify(parseScenes(raw).value);
    assert.equal(out, raw);
    assert.ok(!out.includes('quiet'));
});

// (3) Entwurf <-> Liste
const ohne = sc([{ key: 'a', closed: 0 }, { key: 'Raff1', closed: 100, slat: 90 }, { key: 'b', closed: 37 }], 's-ohne');
const mit = { ...sc([{ key: 'a', closed: 100, quiet: true }, { key: 'Raff1', closed: 50, slat: 0 }, { key: 'b', closed: 78, quiet: true }], 's-mit'), favorite: true };
for (const [label, s] of [['ohne quiet', { ...ohne, favorite: false }], ['mit quiet', mit]]) {
    check(`3) ${label}: Liste byte-gleich und Szene deepStrictEqual`, () => {
        const draft = sceneDraftOf(s, stub);
        assert.equal(JSON.stringify(sceneTargetsToList(draft.targets)), JSON.stringify(s.targets));
        assert.deepStrictEqual(sceneFromDraft(s.id, draft), s);
        assert.ok(s.targets.filter((t) => t.key.startsWith('Raff')).every((t) => typeof t.slat === 'number'));
    });
}
check('3) kein Schlüssel mit undefined in der Liste', () => {
    const list = sceneTargetsToList({ a: { closed: 5, slat: undefined } });
    assert.deepStrictEqual(Object.keys(list[0]), ['key', 'closed']);
});

// (4) sameSceneDraft
check('4) sameSceneDraft erkennt quiet-Abweichung', () => {
    const a = sceneDraftOf(ohne, stub);
    const b = sceneDraftOf({ ...ohne, targets: ohne.targets.map((t, i) => (i === 0 ? { ...t, quiet: true } : t)) }, stub);
    assert.equal(sameSceneDraft(a, a), true);
    assert.equal(sameSceneDraft(a, b), false);
});

// (5) Anzeigetext
check('5) sceneTargetText: alle Fälle', () => {
    const plain = { hasSlat: false, hasSlow: false };
    const slow = { hasSlat: false, hasSlow: true };
    const raff = { hasSlat: true, hasSlow: false };
    assert.equal(sceneTargetText(undefined, plain), 'fährt nicht mit');
    assert.equal(sceneTargetText({ closed: 0 }, plain), 'offen');
    assert.equal(sceneTargetText({ closed: 100 }, plain), 'zu');
    assert.equal(sceneTargetText({ closed: 78 }, plain), '78 % zu');
    assert.equal(sceneTargetText({ closed: 78, quiet: true }, plain), '78 % zu');
    assert.equal(sceneTargetText({ closed: 78, quiet: true }, slow), '78 % zu · leise');
    assert.equal(sceneTargetText({ closed: 100, quiet: true }, slow), 'zu · leise');
    assert.equal(sceneTargetText({ closed: 78 }, slow), '78 % zu');
    assert.equal(sceneTargetText({ closed: 0, slat: 50 }, raff), 'offen · Lamelle 50°');
    assert.equal(sceneTargetText({ closed: 100, slat: 90 }, raff), '100 % zu · Lamelle 90°');
    assert.equal(sceneTargetText({ closed: 40 }, raff), '40 % zu · Lamelle 0°');
});

// (6) sceneQuietKeys
check('6) sceneQuietKeys', () => {
    assert.deepStrictEqual(sceneQuietKeys({ kind: 'scene', sceneId: 's-mit' }, [ohne, mit]), ['a', 'b']);
    assert.deepStrictEqual(sceneQuietKeys({ kind: 'scene', sceneId: 's-ohne' }, [ohne, mit]), []);
    assert.deepStrictEqual(sceneQuietKeys({ kind: 'scene', sceneId: 'gibt-es-nicht' }, [ohne, mit]), []);
    assert.deepStrictEqual(sceneQuietKeys({ kind: 'device', key: 'a', closed: 0 }, [ohne, mit]), []);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
