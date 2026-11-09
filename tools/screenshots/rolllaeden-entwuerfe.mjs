// Feature 30 - Bilder der Rolllaeden-Unterseiten (Zeitplan und Szenen im iOS-Stil), hell und dunkel.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/rolllaeden-entwuerfe.mjs <zielordner> [base]
//
// Invented sample data (/?shot=1&rolllaeden=1), 390x844 at 2x, screen captures (no fullPage).
// Names: rolllaeden-<hell|dunkel>-<nr>-<ebene>.png
/* global window, document, getComputedStyle */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) {
    console.error('usage: node tools/screenshots/rolllaeden-entwuerfe.mjs <zielordner> [base]');
    process.exit(2);
}
const BASE = process.argv[3] ?? process.env.AURA_BASE ?? 'http://localhost:5173';
mkdirSync(out, { recursive: true });
const NOISE = /socket|WebSocket|ERR_|Failed to load resource/i;
const ACTIVE = '.ios-stack-track > .ios-stack-page:not([inert])';
const files = [];
let errorCount = 0;

const settle = async (page) => {
    await page.waitForTimeout(450);
    await page.waitForFunction(() => document.querySelectorAll('.ios-stack.is-moving').length === 0);
};
const jsClick = async (page, sel, text) => {
    const ok = await page.evaluate(
        ([s, t]) => {
            const els = [...document.querySelectorAll(s)];
            const el = t ? els.find((e) => (e.textContent || '').trim().startsWith(t)) : els[0];
            if (!el) {
                return false;
            }
            el.click();
            return true;
        },
        [`${ACTIVE} ${sel}`, text],
    );
    if (!ok) {
        throw new Error(`not found: ${sel} ${text ?? ''}`);
    }
    await settle(page);
};
const scrollTo = (page, y) =>
    page.evaluate((v) => {
        const t = document.querySelector('.ios-stack-track');
        let sc = document.scrollingElement;
        for (let p = t ? t.parentElement : null; p; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
                sc = p;
                break;
            }
        }
        sc.scrollTop = v;
    }, y);

async function run(browser, mode) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        timezoneId: 'Europe/Berlin',
        locale: 'de-DE',
    });
    const page = await ctx.newPage();
    page.on('pageerror', () => errorCount++);
    page.on('console', (m) => {
        if (m.type() === 'error' && !NOISE.test(m.text())) {
            errorCount++;
        }
    });
    await page.goto(`${BASE}/?shot=1&rolllaeden=1`, { waitUntil: 'load' });
    await page.waitForSelector('.ios-stack', { timeout: 30000 });
    await page.evaluate((m) => window.__auraShot.setDeviceThemeMode(m), mode === 'hell' ? 'light' : 'dark');
    const gotIt = page.getByRole('button', { name: 'Verstanden' });
    if (await gotIt.count()) {
        await gotIt.first().click();
    }
    await page.waitForTimeout(700);
    const shot = async (nr, name) => {
        const f = `rolllaeden-${mode}-${nr}-${name}.png`;
        await page.screenshot({ path: join(out, f) });
        files.push(f);
    };
    await shot('1', 'liste');
    await page.locator(`${ACTIVE} .sf-row--nav`, { hasText: 'Zeitplan' }).first().click();
    await settle(page);
    await scrollTo(page, 0);
    await shot('2', 'zeitplan');
    await jsClick(page, '.ios-bar-right button', 'Einstellungen');
    await shot('3', 'zeitplan-einstellungen');
    await jsClick(page, 'button.ios-back');
    await jsClick(page, '.pw-tl-item');
    await shot('4', 'zeitplan-zeitpunkt');
    await jsClick(page, 'button.ios-back');
    await jsClick(page, 'button.ios-back');
    await page.locator(`${ACTIVE} .sf-row--nav`, { hasText: 'Szenen' }).first().click();
    await settle(page);
    await scrollTo(page, 0);
    await shot('5', 'szenen');
    await jsClick(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
    await shot('6', 'szenen-bearbeiten');
    await jsClick(page, '.pw-row--tap:not(.pw-row--add)');
    await scrollTo(page, 0);
    await shot('7', 'szene');
    await scrollTo(page, 420);
    await page.waitForTimeout(300);
    await shot('7b', 'szene-gescrollt');
    await scrollTo(page, 0);
    await jsClick(page, '.rpp-row--tap[role="button"] .rpp-row-main');
    await scrollTo(page, 0);
    await shot('8', 'szene-zeitpunkt');
    await ctx.close();
}

const browser = await chromium.launch();
try {
    for (const mode of ['hell', 'dunkel']) {
        await run(browser, mode);
    }
} finally {
    await browser.close();
}
console.log(files.join('\n'));
console.log(`\n${files.length} files in ${out}, console/page errors: ${errorCount}`);
process.exit(errorCount ? 1 : 0);
