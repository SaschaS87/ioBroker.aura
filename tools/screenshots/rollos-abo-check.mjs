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
    // Tab heisst in der Konfiguration "Rollläden" (Slug bleibt "rollos") -
    // Textsuche "Rollos" traf hier nicht mehr, unabhaengig vom Puls-Icon-Fix.
    await page.locator('text=Rollläden').first().click();
    await page.waitForTimeout(2500);

    // Der gelbe Punkt (.row-pulse) wurde am 25.08.2026 (Commit f8caad3a)
    // bewusst entfernt. Seit 31.08.2026 zeigt stattdessen das Typ-Icon
    // selbst die Fahrt: Klasse .ti-moving auf dem <svg> (ShutterTypeIcons.tsx/
    // .css), unabhaengig vom aktuellen Oeffnungsgrad.
    const zeile = page.locator('.shutter-row', { hasText: 'Gäste-WC' }).first();
    const pulsiert = () => zeile.locator('.ti-moving').count();

    const vorher = await pulsiert();
    console.log(`Ausgangslage: ${vorher} pulsierendes Icon in der Zeile "Gäste-WC" (erwartet 0)`);

    console.log(`Setze ${DP} = true ...`);
    setDp('true');
    await page.waitForTimeout(4000);
    const waehrend = await pulsiert();
    console.log(`Nach dem Setzen: ${waehrend} pulsierendes Icon (erwartet 1)`);

    console.log('Setze zurueck auf false ...');
    setDp('false');
    await page.waitForTimeout(4000);
    const nachher = await pulsiert();
    console.log(`Nach dem Zuruecksetzen: ${nachher} pulsierendes Icon (erwartet 0)`);

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
