// Abnahme-Screenshots fuer den Tab "Rollos" (Widget-Typ shutterfloors).
// Vorbild: rolllaeden.mjs. Erste Fassung fuer die Optik-Abnahme von Baustein 1
// (Icons, Zeile, Balken, Etagenkopf) - Popup und Sammelbefehle folgen spaeter.
//
// Aufruf: node tools/screenshots/rollos.mjs   (Dev-Server auf 5173 muss laufen)

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.AURA_BASE || 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../../scratchpad-screenshots');

const floors = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/rollos-floors.json'), 'utf8'));

// Gemischte Zustaende, damit die Abnahme alle Faelle zeigt:
// ganz offen, Zwischenwerte, ganz zu - und Ankleide bewusst unbestaetigt.
const POS = {
    Wohnz_gross: 0, Wohnz_klein: 40, 'Raffstore_(Nachbar)': 60, 'Raffstore_(Garten)': 100,
    'Küchenfenster': 84, 'Gäste_WC': 0, SPK: 85, Eltern_links: 100, Eltern_rechts: 100,
    Ankleide: 40, Bad: 0, Bad_Dachfenster: 30, Kinderzimmer: 0, Kinderzimmer_2: 55, Flur_DG: 100,
};
const SLAT = { 'Raffstore_(Nachbar)': 45, 'Raffstore_(Garten)': 90 };
const UNCONFIRMED = new Set(['Ankleide']);

function buildMockData() {
    const dps = {};
    floors.forEach((floor) => {
        floor.devices.forEach((dev) => {
            dps[dev.posDp] = { val: POS[dev.key] ?? 50, ack: !UNCONFIRMED.has(dev.key), ts: Date.now() };
            if (dev.activityDp) dps[dev.activityDp] = { val: false, ack: true, ts: Date.now() };
            if (dev.slatDp) dps[dev.slatDp] = { val: SLAT[dev.key] ?? 0, ack: true, ts: Date.now() };
        });
    });
    dps['tahoma.1.info.connection'] = { val: true, ack: true, ts: Date.now() };
    dps['system.adapter.tahoma.1.alive'] = { val: true, ack: true, ts: Date.now() };
    return dps;
}

function widget(headVariant = 'a') {
    return {
        id: 'shutterfloors_demo',
        type: 'shutterfloors',
        title: 'Rollos',
        datapoint: 'demo',
        gridPos: { x: 0, y: 0, w: 42, h: 40 },
        options: { fillTab: true, transparent: true, showTitle: false, floors, headVariant },
    };
}

// Abnahme-Szenarien. sheet = Geraet, dessen Zeile angeklickt wird;
// moving = Geraete, die als "faehrt gerade" gemeldet werden (gelber Punkt).
const VIEWS = [
    { name: 'kopf-A-schlicht', width: 390, height: 844, scale: 2, theme: 'dark', head: 'a' },
    { name: 'kopf-B-typografisch', width: 390, height: 844, scale: 2, theme: 'dark', head: 'b' },
    { name: 'kopf-C-akzent', width: 390, height: 844, scale: 2, theme: 'dark', head: 'c' },
    { name: 'fahrt-gelber-punkt', width: 390, height: 844, scale: 2, theme: 'dark', head: 'a',
      moving: ['Wohnz_klein', 'Küchenfenster'] },
    { name: 'popup-fenster', width: 390, height: 844, scale: 2, theme: 'dark', head: 'a',
      sheet: 'Wohnzimmer klein' },
    { name: 'popup-raffstore', width: 390, height: 844, scale: 2, theme: 'dark', head: 'a',
      sheet: 'Esszimmer Raffstore Nachbar' },
    { name: 'desktop', width: 1440, height: 900, scale: 1, theme: 'dark', head: 'a' },
];

async function run() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const written = [];

    try {
        for (const view of VIEWS) {
            const context = await browser.newContext({
                viewport: { width: view.width, height: view.height },
                deviceScaleFactor: view.scale,
            });
            // Theme VOR dem ersten Laden setzen - nachtraeglich gesetzt greift es
            // nicht, die App liest den Wert einmal beim Start.
            await context.addInitScript((theme) => {
                try {
                    localStorage.setItem('aura-theme', theme);
                    localStorage.setItem('theme', theme);
                } catch { /* egal */ }
            }, view.theme);

            const page = await context.newPage();

            await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => window.__auraShot?.ready === true, { timeout: 10000 });

            await page.evaluate((theme) => {
                document.documentElement.style.colorScheme = theme;
                document.documentElement.setAttribute('data-theme', theme);
                window.__auraShot.setTheme?.(theme);
            }, view.theme);
            await page.waitForTimeout(200);

            const mock = buildMockData();
            (view.moving || []).forEach((key) => {
                const dp = `tahoma.1.devices.${key}.states.core:MovingState`;
                if (mock[dp]) mock[dp] = { val: true, ack: true, ts: Date.now() };
            });

            await page.evaluate((dps) => window.__auraShot.mock(dps), mock);
            await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), widget(view.head));
            await page.waitForTimeout(900);

            // Harness-Dialog wegklicken, falls vorhanden
            try {
                const ok = page.locator('text=Verstanden').first();
                if (await ok.isVisible({ timeout: 500 })) {
                    await ok.click();
                    await page.waitForTimeout(200);
                }
            } catch { /* nicht vorhanden - egal */ }

            const rows = await page.locator('.shutter-row').count();
            if (rows !== 15) console.warn(`WARNUNG ${view.name}: ${rows} Zeilen statt 15`);

            // Popup oeffnen: auf den Namen klicken, nicht auf die Knoepfe
            if (view.sheet) {
                await page.locator('.shutter-row', { hasText: view.sheet }).first().click();
                await page.waitForTimeout(600);
                const sheetVisible = await page.locator('.shutter-sheet').isVisible().catch(() => false);
                if (!sheetVisible) console.warn(`WARNUNG ${view.name}: Popup nicht sichtbar`);
            }

            if (view.moving) {
                const dots = await page.locator('.row-pulse').count();
                console.log(`  gelbe Punkte sichtbar: ${dots} (erwartet ${view.moving.length})`);
            }

            const file = path.join(OUTPUT_DIR, `rollos-${view.name}.png`);
            await page.screenshot({ path: file, fullPage: false });
            written.push({ file, rows });
            console.log(`${view.name}: ${rows} Zeilen -> ${file}`);

            await context.close();
        }
    } finally {
        await browser.close();
    }

    console.log(`\n${written.length} Bilder in ${OUTPUT_DIR}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
