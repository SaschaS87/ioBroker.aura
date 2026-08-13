// Beweist, dass die Anzeige LIVE nachlaeuft (Abo), nicht nur beim Laden abruft.
// Getestet wird ueber core:MovingState - ein reiner Melde-Datenpunkt, der
// KEINE Fahrt ausloest. Es bewegt sich also nichts im Haus.
// Aufruf: node tools/screenshots/rollos-abo-check.mjs

import { chromium } from 'playwright';
import { execSync } from 'child_process';

const BASE = process.env.AURA_LIVE || 'http://192.168.1.200:8095';
const PI = 'pi@192.168.1.200';
const DP = 'tahoma.1.devices.Gäste_WC.states.core:MovingState';

const setDp = (val) => {
    execSync(`ssh ${PI} "iobroker state set '${DP}' ${val} true"`, { stdio: 'pipe' });
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.locator('text=Rollos').first().click();
    await page.waitForTimeout(2500);

    const zeile = page.locator('.shutter-row', { hasText: 'Gäste-WC' }).first();
    const punkte = () => zeile.locator('.row-pulse').count();

    const vorher = await punkte();
    console.log(`Ausgangslage: ${vorher} gelber Punkt in der Zeile "Gäste-WC" (erwartet 0)`);

    console.log(`Setze ${DP} = true ...`);
    setDp('true');
    await page.waitForTimeout(4000);
    const waehrend = await punkte();
    console.log(`Nach dem Setzen: ${waehrend} gelber Punkt (erwartet 1)`);

    console.log('Setze zurueck auf false ...');
    setDp('false');
    await page.waitForTimeout(4000);
    const nachher = await punkte();
    console.log(`Nach dem Zuruecksetzen: ${nachher} gelber Punkt (erwartet 0)`);

    const bestanden = vorher === 0 && waehrend === 1 && nachher === 0;
    console.log(`\n${bestanden ? 'BESTANDEN' : 'FEHLGESCHLAGEN'}: Die Anzeige folgt einer Wertaenderung ${bestanden ? '' : 'NICHT '}von selbst.`);
    process.exitCode = bestanden ? 0 : 1;
} finally {
    // Sicherheitsnetz: Ausgangswert in jedem Fall wiederherstellen
    try {
        setDp('false');
        console.log('Ausgangswert wiederhergestellt (MovingState = false).');
    } catch (e) {
        console.error('WARNUNG: Zuruecksetzen fehlgeschlagen:', e.message);
    }
    await browser.close();
}
