// Hoehen-Abnahme fuer die Funkzeile im ShutterSheet (Feature 16, 02.09.2026).
// Kopie von rollos.mjs (nicht veraendert) - reduziert auf die eine Frage, die
// Schritt 22 des Loop-Auftrags stellt: Springt das Sheet in der Hoehe, wenn
// die Funkzeile vom Normalfall in den Ausfall wechselt?
//
// Getestetes Geraet: Kinderzimmer (posDp endet auf .states.core:ClosureState,
// siehe fixtures/rollos-floors.json). Normalfall und Ausfall nutzen dieselben
// ts/lc-Werte fuer core:StatusState - nur `val` unterscheidet sich, wie im
// Loop-Auftrag Schritt 22 vorgegeben ("alles andere gleich lassen").
//
// Aufruf: node tools/screenshots/rollos-funk-check.mjs   (Dev-Server auf 5173 muss laufen)
// Ausgabeordner ueberschreibbar per AURA_SHOT_OUT (Default: scratchpad-screenshots/
// im Repo, gitignored - wie rollos.mjs).

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.AURA_BASE || 'http://localhost:5173';
const OUTPUT_DIR = process.env.AURA_SHOT_OUT
    ? path.resolve(process.env.AURA_SHOT_OUT)
    : path.resolve(__dirname, '../../scratchpad-screenshots');

const floors = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/rollos-floors.json'), 'utf8'));

// Gleiche Basis-Positionen wie rollos.mjs, damit die Liste dahinter normal
// aussieht - fuer die Hoehenfrage zaehlt nur das Sheet von Kinderzimmer.
const POS = {
    Wohnz_gross: 0, Wohnz_klein: 40, 'Raffstore_(Nachbar)': 60, 'Raffstore_(Garten)': 100,
    'Küchenfenster': 84, 'Gäste_WC': 0, SPK: 85, Eltern_links: 100, Eltern_rechts: 100,
    Ankleide: 40, Bad: 0, Bad_Dachfenster: 30, Kinderzimmer: 0, Kinderzimmer_2: 55, Flur_DG: 100,
};
const SLAT = { 'Raffstore_(Nachbar)': 45, 'Raffstore_(Garten)': 90 };

const DEVICE_KEY = 'Kinderzimmer';
const DEVICE_LABEL = 'Kinderzimmer 1'; // Klicktext, siehe fixtures/rollos-floors.json
const STATUS_DP = `tahoma.1.devices.${DEVICE_KEY}.states.core:StatusState`;
const RSSI_DP = `tahoma.1.devices.${DEVICE_KEY}.states.core:RSSILevelState`;
const DISCRETE_DP = `tahoma.1.devices.${DEVICE_KEY}.states.core:DiscreteRSSILevelState`;

// Zwei feste Zeitpunkte - dieselben in beiden Szenarien, nur `val` von
// StatusState unterscheidet sich (Loop-Auftrag Schritt 22).
const T = Date.now() - 5 * 60_000; // ts: zuletzt geschrieben/durchgezaehlt vor 5 Min.
const T0 = Date.now() - 45 * 60_000; // lc: letzte Aenderung vor 45 Min.

function buildBaseMock() {
    const dps = {};
    floors.forEach((floor) => {
        floor.devices.forEach((dev) => {
            dps[dev.posDp] = { val: POS[dev.key] ?? 50, ack: true, ts: Date.now() };
            if (dev.activityDp) dps[dev.activityDp] = { val: false, ack: true, ts: Date.now() };
            if (dev.slatDp) dps[dev.slatDp] = { val: SLAT[dev.key] ?? 0, ack: true, ts: Date.now() };
        });
    });
    dps['tahoma.1.info.connection'] = { val: true, ack: true, ts: Date.now() };
    dps['system.adapter.tahoma.1.alive'] = { val: true, ack: true, ts: Date.now() };
    return dps;
}

// scenario: 'normal' | 'ausfall'
function radioMock(scenario) {
    return {
        [STATUS_DP]: { val: scenario === 'ausfall' ? 'unavailable' : 'available', ts: T, lc: T0 },
        [RSSI_DP]: { val: 68, ts: T, lc: T0 },
        [DISCRETE_DP]: { val: 'good', ts: T, lc: T0 },
    };
}

function widget() {
    return {
        id: 'shutterfloors_funk_demo',
        type: 'shutterfloors',
        title: 'Rollos',
        datapoint: 'demo',
        gridPos: { x: 0, y: 0, w: 42, h: 40 },
        options: { fillTab: true, transparent: true, showTitle: false, floors, headVariant: 'a', showSignalBox: false },
    };
}

// 375x812 (z. B. iPhone X/11/12 mini) und 375x667 (z. B. iPhone SE/8) -
// genau die zwei Groessen aus dem Loop-Auftrag.
const VIEWPORTS = [
    { name: '375x812', width: 375, height: 812 },
    { name: '375x667', width: 375, height: 667 },
];

async function measureSheetHeight(page, scenario) {
    const context = page.context();
    await page.evaluate((dps) => window.__auraShot.mock(dps), buildBaseMock());
    await page.evaluate((dps) => window.__auraShot.mock(dps), radioMock(scenario));
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), widget());
    await page.waitForTimeout(500);

    await page.locator('.shutter-row', { hasText: DEVICE_LABEL }).first().click();
    await page.waitForTimeout(500);

    const sheetVisible = await page.locator('.shutter-sheet').isVisible().catch(() => false);
    if (!sheetVisible) {
        console.warn(`WARNUNG ${scenario}: Sheet nicht sichtbar`);
        return null;
    }

    const height = await page.locator('.shutter-sheet').evaluate((el) => el.getBoundingClientRect().height);
    void context;
    return height;
}

async function run() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const results = [];

    try {
        for (const vp of VIEWPORTS) {
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                deviceScaleFactor: 2,
            });
            await context.addInitScript(() => {
                try {
                    localStorage.setItem('aura-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                } catch { /* egal */ }
            });

            const page = await context.newPage();
            await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => window.__auraShot?.ready === true, { timeout: 10000 });
            await page.evaluate(() => {
                document.documentElement.style.colorScheme = 'dark';
                document.documentElement.setAttribute('data-theme', 'dark');
                window.__auraShot.setTheme?.('dark');
            });
            await page.waitForTimeout(200);

            for (const scenario of ['normal', 'ausfall']) {
                const height = await measureSheetHeight(page, scenario);
                const file = path.join(OUTPUT_DIR, `funk-sheet-${vp.name}-${scenario}.png`);
                await page.screenshot({ path: file, fullPage: false });
                results.push({ viewport: vp.name, scenario, height, file });
                console.log(`${vp.name} / ${scenario}: Hoehe ${height} px -> ${file}`);

                // Sheet wieder schliessen (Escape), bevor der naechste Fall startet.
                await page.keyboard.press('Escape');
                await page.waitForTimeout(400);
            }

            await context.close();
        }
    } finally {
        await browser.close();
    }

    console.log('\nVergleich:');
    let allEqual = true;
    for (const vp of VIEWPORTS) {
        const normal = results.find((r) => r.viewport === vp.name && r.scenario === 'normal');
        const ausfall = results.find((r) => r.viewport === vp.name && r.scenario === 'ausfall');
        const diff = normal && ausfall && normal.height !== null && ausfall.height !== null
            ? Math.abs(normal.height - ausfall.height)
            : null;
        if (diff === null || diff > 0) allEqual = false;
        console.log(`  ${vp.name}: normal=${normal?.height} px, ausfall=${ausfall?.height} px, diff=${diff} px`);
    }
    console.log(allEqual ? '\nOK: Hoehe identisch in beiden Szenarien und Viewports.' : '\nABWEICHUNG: Hoehe unterscheidet sich!');
    console.log(`\n${results.length} Bilder in ${OUTPUT_DIR}`);

    if (!allEqual) process.exitCode = 1;
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
