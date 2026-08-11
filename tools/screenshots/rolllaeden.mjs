import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.AURA_BASE || 'http://localhost:5173';
const OUTPUT_DIR = path.resolve(__dirname, '../../scratchpad-screenshots');

// Fixture laden
const fixtureData = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/rolllaeden-rooms.json'), 'utf8'));

// Alle DPs die wir mocken müssen
function buildMockData() {
  const dps = {};

  // Alle Position DPs (gemischte Werte)
  const positions = {
    'Wohnz_gross': 100,
    'Wohnz_klein': 85,
    'Raffstore_(Nachbar)': 100,
    'Raffstore_(Garten)': 100,
    'Eltern_links': 100,
    'Eltern_rechts': 100,
    'Küchenfenster': 84,
    'Bad': 100,
    'Bad_Dachfenster': 100,
    'Gäste_WC': 0,
    'SPK': 85,
    'Kinderzimmer': 0,
    'Kinderzimmer_2': 0,
    'Ankleide': 100,
    'Flur_DG': 100,
  };

  fixtureData.forEach(room => {
    room.devices.forEach(dev => {
      // Position DP
      dps[dev.posDp] = {
        val: positions[dev.key] || 50,
        ack: true,
        ts: Date.now(),
      };

      // Activity DP (nur wenn vorhanden)
      if (dev.activityDp) {
        dps[dev.activityDp] = {
          val: false,
          ack: true,
          ts: Date.now(),
        };
      }

      // Slat DP (nur wenn vorhanden)
      if (dev.slatDp) {
        dps[dev.slatDp] = {
          val: 0,
          ack: true,
          ts: Date.now(),
        };
      }
    });
  });

  // Connection DP
  dps['tahoma.1.info.connection'] = {
    val: true,
    ack: true,
    ts: Date.now(),
  };

  return dps;
}

async function takeScreenshots() {
  const browser = await chromium.launch();
  const contexts = [];

  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Viewport & Theme Kombinationen
    const viewports = [
      { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
      { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    ];

    const themes = ['dark', 'light'];
    const scenarios = [
      { name: 'S1-normal', mockFn: (dps) => dps },
      { name: 'S2-unknown', mockFn: (dps) => {
        dps['tahoma.1.devices.Ankleide.states.core:ClosureState'] = { val: 40, ack: false, ts: Date.now() };
        return dps;
      } },
      { name: 'S3-moving', mockFn: (dps) => {
        dps['tahoma.1.devices.Wohnz_gross.states.core:MovingState'] = { val: true, ack: true, ts: Date.now() };
        return dps;
      } },
      { name: 'S4-disconnected', mockFn: (dps) => {
        dps['tahoma.1.info.connection'] = { val: false, ack: true, ts: Date.now() };
        return dps;
      } },
      { name: 'S5-filter-SW', mockFn: (dps) => dps, filter: 'SW' },
      { name: 'S6-sheet-shutter', mockFn: (dps) => dps, sheet: 'Wohnz_gross' },
      { name: 'S7-sheet-raffstore', mockFn: (dps) => dps, sheet: 'Raffstore_(Garten)' },
      { name: 'S8-sheet-closed', mockFn: (dps) => dps, sheetClosed: true },
    ];

    for (const viewport of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor,
        });
        contexts.push(context);

        const page = await context.newPage();

        // Gehe zur Seite
        console.log(`Loading ${BASE}/?shot=1#/ for ${viewport.name} ${theme}...`);
        await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });

        // Theme setzen
        if (theme === 'light') {
          await page.evaluate(() => {
            document.documentElement.style.colorScheme = 'light';
            localStorage.setItem('aura-theme', 'light');
          });
        } else {
          await page.evaluate(() => {
            document.documentElement.style.colorScheme = 'dark';
            localStorage.setItem('aura-theme', 'dark');
          });
        }

        // Warte auf ready
        await page.waitForFunction(() => window.__auraShot?.ready === true, { timeout: 5000 }).catch(() => {
          console.warn('Timeout waiting for __auraShot.ready');
        });

        // Widget-Konfiguration setzen (nur einmal pro Viewport/Theme)
        const widgetConfig = {
          id: 'shutterrooms_demo',
          type: 'shutterrooms',
          title: 'Rollläden Demo',
          datapoint: 'demo',
          gridPos: { x: 0, y: 0, w: 42, h: 40 },
          options: {
            fillTab: true,
            transparent: true,
            showTitle: false,
            headerTitle: 'Rollläden',
            statusText: 'lokal · tahoma.1',
            connectionDp: 'tahoma.1.info.connection',
            showFooter: true,
            footerNote: 'Direkte Steuerung über die TaHoma-Box im Heimnetz',
            facades: ['Alle', 'SO', 'SW', 'NW', 'NO'],
            posQuick: [0, 25, 50, 75, 100],
            slatQuick: [[0, 'Waagerecht'], [50, 'Halb'], [90, 'Geschlossen']],
            rooms: fixtureData,
          },
        };

        await page.evaluate((cfg) => {
          if (window.__auraShot?.showWidgets) {
            window.__auraShot.showWidgets([cfg]);
          }
        }, widgetConfig);

        await page.waitForTimeout(1000);

        // Dialog schließen (Harness-Artefakt)
        try {
          const verstanden = await page.locator('text=Verstanden').first();
          if (await verstanden.isVisible()) {
            await verstanden.click();
            await page.waitForTimeout(300);
          }
        } catch (e) {
          // ignore if button not found
        }

        // Screenshots für alle Szenarien
        for (const scenario of scenarios) {
          const baseMockData = buildMockData();
          const mockData = scenario.mockFn(baseMockData);

          // Mock DPs setzen
          await page.evaluate((dps) => {
            if (window.__auraShot?.mock) {
              window.__auraShot.mock(dps);
            }
          }, mockData);

          await page.waitForTimeout(200);

          // Filter zurücksetzen (auf "Alle") falls nötig
          if (scenario.sheet || scenario.sheetClosed) {
            const alleChip = await page.locator('.facade-chip', { hasText: 'Alle' });
            if (await alleChip.isVisible()) {
              await alleChip.click();
              await page.waitForTimeout(300);
            }
          }

          // Falls Filter gewünscht: auf Chip klicken
          if (scenario.filter) {
            const chips = await page.locator('.facade-chip');
            const count = await chips.count();
            for (let i = 0; i < count; i++) {
              const text = await chips.nth(i).textContent();
              if (text?.trim() === scenario.filter) {
                await chips.nth(i).click();
                await page.waitForTimeout(400);
                break;
              }
            }
          }

          // Falls Sheet gewünscht: auf Kachel klicken
          if (scenario.sheet) {
            const tiles = await page.locator('.shutter-tile');
            const count = await tiles.count();
            let found = false;
            for (let i = 0; i < count; i++) {
              const label = await tiles.nth(i).locator('.tile-label').textContent();
              if (label?.includes(scenario.sheet)) {
                await tiles.nth(i).click();
                await page.waitForTimeout(700);
                found = true;
                break;
              }
            }
            if (!found) {
              console.warn(`Could not find tile with label containing '${scenario.sheet}'`);
            }
          }

          // Falls Sheet geschlossen werden soll: Backdrop klicken
          if (scenario.sheetClosed) {
            const backdrop = await page.locator('.shutter-sheet-backdrop');
            if (await backdrop.isVisible()) {
              await backdrop.click({ position: { x: 50, y: 50 } });
              await page.waitForTimeout(600);
            }
          }

          const filename = `${scenario.name}_${viewport.name}_${theme}.png`;
          const filepath = path.join(OUTPUT_DIR, filename);

          console.log(`Capturing ${filename}...`);
          await page.screenshot({ path: filepath, fullPage: false });
        }

        await page.close();
      }
    }

    console.log(`\nAll screenshots saved to: ${OUTPUT_DIR}`);
    console.log(`Expected ${scenarios.length * viewports.length * themes.length} files`);
  } finally {
    for (const ctx of contexts) {
      await ctx.close();
    }
    await browser.close();
  }
}

takeScreenshots().catch(console.error);
