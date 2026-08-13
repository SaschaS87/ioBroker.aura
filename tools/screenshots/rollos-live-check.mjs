// Prueft den ausgerollten Rollos-Tab gegen die echten Werte auf dem Pi.
// Kein Mock: laedt die Live-App, oeffnet den Tab und liest jede Zeile aus.
// Aufruf: node tools/screenshots/rollos-live-check.mjs

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AURA_LIVE || 'http://192.168.1.200:8095';
const OUT = path.resolve(__dirname, '../../scratchpad-screenshots');

// Rohwerte vom Pi (core:ClosureState, 100 = zu). Bei invertPosition entspricht
// der Rohwert direkt dem geschlossenen Anteil - also dem, was die Zeile zeigt.
const ERWARTET = {
    'Wohnzimmer groß': 0,
    'Wohnzimmer klein': 0,
    'Esszimmer Raffstore Nachbar': 0,
    'Esszimmer Raffstore Garten': 100,
    Küche: 88,
    'Gäste-WC': 81,
    Speisekammer: 100,
    'Elternzimmer links': 0,
    'Elternzimmer rechts': 100,
    Ankleide: 100,
    'Bad Fenster': 100,
    'Bad Dachfenster': 100,
    'Kinderzimmer 1': 0,
    'Kinderzimmer 2': 100,
    Treppenaufgang: 100,
};

function erwarteterText(closed) {
    if (closed <= 3) return 'Offen';
    if (closed >= 97) return 'Geschlossen';
    return `${closed} % zu`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);

// Zum Rollos-Tab
const tab = page.locator('text=Rollos').first();
if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(2500);
} else {
    console.error('FEHLER: Tab "Rollos" nicht in der Leiste gefunden');
}

const rows = await page.locator('.shutter-row').count();
console.log(`Zeilen im Tab: ${rows}`);

const ist = await page.$$eval('.shutter-row', (els) =>
    els.map((el) => ({
        label: el.querySelector('.row-label')?.textContent?.trim() ?? '',
        status: el.querySelector('.row-status')?.textContent?.trim() ?? '',
    })),
);

let ok = 0;
const abweichungen = [];
for (const [label, closed] of Object.entries(ERWARTET)) {
    const treffer = ist.find((r) => r.label === label);
    if (!treffer) {
        abweichungen.push(`${label}: ZEILE FEHLT`);
        continue;
    }
    const soll = erwarteterText(closed);
    // Raffstore haengen " · <Winkel>°" an - nur der vordere Teil wird geprueft
    const vorne = treffer.status.split(' · ')[0];
    if (vorne === soll) {
        ok++;
        console.log(`  OK   ${label.padEnd(30)} raw ${String(closed).padStart(3)} -> "${treffer.status}"`);
    } else {
        abweichungen.push(`${label}: erwartet "${soll}", angezeigt "${treffer.status}"`);
        console.log(`  FEHL ${label.padEnd(30)} raw ${String(closed).padStart(3)} -> "${treffer.status}" (erwartet "${soll}")`);
    }
}

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: path.join(OUT, 'rollos-LIVE-pi.png') });

// Popup am Raffstore: zeigt es dieselbe Zaehlrichtung wie die Zeile?
await page.locator('.shutter-row', { hasText: 'Esszimmer Raffstore Garten' }).first().click();
await page.waitForTimeout(1200);
const sheetVal = await page.locator('.block-value').first().textContent().catch(() => null);
const sheetSub = await page.locator('.sheet-subtitle').first().textContent().catch(() => null);
console.log(`\nPopup "Esszimmer Raffstore Garten": Wert = "${sheetVal?.trim()}" | Untertitel = "${sheetSub?.trim()}"`);
await page.screenshot({ path: path.join(OUT, 'rollos-LIVE-popup.png') });

console.log(`\n${ok} von ${Object.keys(ERWARTET).length} Zeilen stimmen.`);
if (abweichungen.length) {
    console.log('ABWEICHUNGEN:');
    abweichungen.forEach((a) => console.log('  - ' + a));
}

await browser.close();
process.exit(abweichungen.length ? 1 : 0);
