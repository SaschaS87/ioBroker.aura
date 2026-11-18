'use strict';

/**
 * Guards the single source for how bottom sheets are set off from the page (index.css, .aura-scrim).
 *
 * Regression (10.11.2026): five sheets each had their own dim strength (40/45 %), fade time
 * (220-280 ms) and shadow. Decision since then: no dim layer at all, one shared shadow plus a light
 * edge line in dark mode. A sheet with private values would look different from the others again.
 *
 * Invariants, checked statically:
 *   1. Every element whose className contains "backdrop" also carries "aura-scrim".
 *   2. No CSS rule for a "...backdrop" selector sets its own background or animation.
 *   3. CLOSE_MS in useSheetDismiss.ts equals --aura-scrim-ms in index.css.
 *   4. The shared rule itself stays transparent (no dim layer sneaks back in).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src-vis');

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}
const files = walk(root);
const rel = (p) => path.relative(path.join(root, '..'), p).replace(/\\/g, '/');

// 1. className with "backdrop" must include aura-scrim
for (const f of files.filter((p) => p.endsWith('.tsx'))) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
    let m;
    while ((m = re.exec(src))) {
        const cls = m[1] ?? m[2];
        if (/(^|[\s-])backdrop(\s|$)/.test(cls) || /-backdrop\b/.test(cls)) {
            assert.ok(
                /\baura-scrim\b/.test(cls),
                `${rel(f)}: className "${cls}" dims the page but lacks "aura-scrim" (see index.css)`,
            );
        }
    }
}

// 2. no private background/animation on backdrop selectors
for (const f of files.filter((p) => p.endsWith('.css'))) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        const selector = m[1].trim();
        if (!/-backdrop\b/.test(selector) || /^@/.test(selector)) continue;
        for (const decl of m[2].split(';')) {
            const prop = decl.split(':')[0].trim();
            const value = decl.slice(decl.indexOf(':') + 1).trim();
            if ((prop === 'background' || prop === 'background-color') && value !== 'transparent') {
                assert.fail(`${rel(f)}: "${selector}" sets its own ${prop}. Use .aura-scrim (index.css).`);
            }
            if (prop === 'animation' && value !== 'none') {
                assert.fail(`${rel(f)}: "${selector}" sets its own animation. Use .aura-scrim (index.css).`);
            }
        }
    }
}

// 3. close duration matches
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'components', 'widgets', 'useSheetDismiss.ts'), 'utf8');
const cssMs = /--aura-scrim-ms:\s*(\d+)ms/.exec(css);
const hookMs = /const CLOSE_MS = (\d+);/.exec(hook);
assert.ok(cssMs && hookMs, 'scrim duration not found in index.css / useSheetDismiss.ts');
assert.strictEqual(cssMs[1], hookMs[1], '--aura-scrim-ms (index.css) and CLOSE_MS (useSheetDismiss.ts) differ');

// 4. shared rule is transparent
assert.ok(/\.aura-scrim\s*\{\s*background:\s*transparent;\s*\}/.test(css), '.aura-scrim must stay transparent');

console.log('scrim.test.js: ok');
