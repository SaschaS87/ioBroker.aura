// Feature 28 - Hell/Dunkel pro Gerät.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/device-theme-mode.mjs
//
// Order of the mode a device shows: local choice (localStorage 'aura-device-theme')
// -> datapoint mode -> system setting -> saved design. This test covers:
//   a) Automatisch follows the emulated system setting and switches live
//   b) a click on "Hell" wins over a dark system, survives a reload, is stored
//   c) the first paint (boot splash, then app) is already in the stored mode
//   d) switching never writes config.themeMode.frontend or config.theme
//   e) the area "einstellungen" shows up in the section menu and is reachable
//   f) the old header sun/moon button is gone
// plus a table test for the pure rule resolveActiveMode.
//
// a), b), d), e), f) run in the screenshot harness (?shot=1, nothing is written to
// ioBroker; `setDeviceThemeMode()` switches the per-device mode on, because screenshot
// mode otherwise yields no mode at all). c) runs without the harness and fully
// offline (backend requests aborted), because the harness would repaint the saved
// design after the first frame.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const DEVICE_KEY = 'aura-device-theme';

// Pure rule: mirrors resolveActiveMode in utils/themeModeCache.ts (no React, no
// stores). Kept here as a table so a change of the order has to touch the test too.
function resolveActiveMode(pref, dpMode, systemDark, screenshot, harness = false) {
    if (screenshot && !harness) return null;
    if (pref !== 'auto') return pref;
    if (dpMode) return dpMode;
    return systemDark ? 'dark' : 'light';
}

// Layout with two areas, the second one is "einstellungen"
const tab = (id, widgets) => ({ id, name: 'Dashboard', slug: 'dashboard', widgets });
const LAYOUT = {
    id: 'l-dev',
    name: 'Home',
    slug: 'default',
    // Docked section bar on top: the area list the user navigates with
    settings: { layoutDrawerEnabled: true, layoutDrawerPlacement: 'top' },
    activeSectionId: 'sec-home',
    sections: [
        {
            id: 'sec-home',
            name: 'Home',
            slug: 'home',
            activeTabId: 'tab-home',
            tabs: [tab('tab-home', [])],
        },
        {
            id: 'sec-set',
            name: 'Einstellungen',
            slug: 'einstellungen',
            activeTabId: 'tab-set',
            tabs: [
                tab('tab-set', [
                    {
                        id: 'w-device',
                        type: 'devicesettings',
                        title: 'Geräte-Einstellungen',
                        datapoint: '',
                        layout: 'default',
                        gridPos: { x: 0, y: 0, w: 21, h: 6 },
                        options: {},
                    },
                ]),
            ],
        },
    ],
};

const browser = await chromium.launch();
const pageErrors = [];

async function boot(page, hash) {
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(
        ({ layout, hash }) => {
            window.__auraShot.writes(true);
            window.__auraShot.seed({ layouts: [layout] });
            window.__auraShot.setDeviceThemeMode(); // stored choice, in memory only
            window.location.hash = hash;
        },
        { layout: LAYOUT, hash },
    );
    await page.waitForTimeout(1200);
}

const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), DEVICE_KEY);

try {
    // table test
    const T = [
        // pref, dp, sysDark, expected
        ['dark', 'light', false, 'dark'],
        ['light', 'dark', true, 'light'],
        ['auto', 'dark', false, 'dark'],
        ['auto', 'light', true, 'light'],
        ['auto', null, true, 'dark'],
        ['auto', null, false, 'light'],
        ['dark', null, false, 'dark'],
        ['light', null, true, 'light'],
    ];
    const tableOk = T.every(([pref, dp, sys, want]) => resolveActiveMode(pref, dp, sys, false) === want);
    check('resolveActiveMode: all combinations', tableOk);
    check(
        'resolveActiveMode: screenshot mode yields null unless the harness opts in',
        resolveActiveMode('dark', 'dark', true, true) === null &&
            resolveActiveMode('dark', null, true, true, true) === 'dark',
    );

    // a) Automatisch follows the system setting, live
    {
        const ctx = await browser.newContext({
            viewport: { width: 375, height: 812 },
            colorScheme: 'dark',
            ignoreHTTPSErrors: true,
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await boot(page, '#/view/default/s/einstellungen');
        check('a) auto + dark system -> html.dark', (await isDark(page)) === true);
        await page.emulateMedia({ colorScheme: 'light' });
        await page.waitForTimeout(300);
        check('a) switching the system to light needs no reload', (await isDark(page)) === false);
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.waitForTimeout(300);
        check('a) and back to dark', (await isDark(page)) === true);

        // b) click "Hell" under a dark system
        await page.locator('[data-testid="device-settings"] button[data-pref="light"]').click();
        await page.waitForTimeout(300);
        check('b) click on Hell -> light although the system is dark', (await isDark(page)) === false);
        check(
            'b) button reports aria-pressed',
            (await page.locator('button[data-pref="light"]').getAttribute('aria-pressed')) === 'true',
        );
        check("b) localStorage['aura-device-theme'] === 'light'", (await stored(page)) === 'light');
        const box = await page.locator('button[data-pref="light"]').boundingBox();
        check('b) tap target is at least 44 px high', !!box && box.height >= 44, JSON.stringify(box));

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
        await page.evaluate(
            ({ layout }) => {
                window.__auraShot.seed({ layouts: [layout] });
                window.__auraShot.setDeviceThemeMode();
            },
            { layout: LAYOUT },
        );
        await page.waitForTimeout(500);
        check('b) after a reload the choice is still light (system dark)', (await isDark(page)) === false);
        check('b) stored value survives the reload', (await stored(page)) === 'light');

        // back to Dunkel and Automatisch through the UI
        await page.evaluate(() => (window.location.hash = '#/view/default/s/einstellungen'));
        await page.waitForTimeout(400);
        await page.locator('button[data-pref="dark"]').click();
        await page.waitForTimeout(200);
        check('b) Dunkel -> html.dark', (await isDark(page)) === true && (await stored(page)) === 'dark');
        await page.locator('button[data-pref="auto"]').click();
        await page.waitForTimeout(200);
        check('b) Automatisch removes the stored choice', (await stored(page)) === null);

        // d) no datapoint write
        const writes = await page.evaluate(() => window.__auraShot.writes());
        const bad = writes.filter((w) => /config\.themeMode\.frontend|config\.theme$/.test(JSON.stringify(w)));
        check('d) no write to config.themeMode.frontend or config.theme', bad.length === 0, JSON.stringify(bad));

        // f) header button is gone
        const headerBtn = await page.evaluate(
            () =>
                document.querySelectorAll(
                    'header button[title="Hell-Modus"], header button[title="Dunkel-Modus"], header .lucide-sun, header .lucide-moon',
                ).length,
        );
        check('f) no sun/moon button in the header', headerBtn === 0, String(headerBtn));
        await ctx.close();
    }

    // e) area in the section menu, navigation
    {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => pageErrors.push(e.message));
        await boot(page, '#/view/default/s/home');
        const entry = page.locator('.aura-section-bar').getByText('Einstellungen', { exact: true }).first();
        const listed = (await entry.count()) > 0;
        check('e) "Einstellungen" is listed in the section menu', listed);
        if (listed) await entry.click().catch(() => {});
        await page.waitForTimeout(500);
        let hash = await page.evaluate(() => window.location.hash);
        check('e) clicking the entry navigates to /s/einstellungen', /\/s\/einstellungen/.test(hash), hash);
        await page.evaluate(() => (window.location.hash = '#/view/default/s/einstellungen'));
        await page.waitForTimeout(500);
        hash = await page.evaluate(() => window.location.hash);
        check('e) #/view/default/s/einstellungen', /\/view\/default\/s\/einstellungen/.test(hash), hash);
        check(
            'e) the widget renders in that area',
            (await page.locator('[data-testid="device-settings"]').count()) === 1,
        );
        await ctx.close();
    }

    // c) first paint with the stored choice (no harness, offline)
    {
        const SAMPLER = `
window.__themeSamples = [];
const lum = (c) => { const m = String(c).match(/[0-9.]+/g); if (!m || m.length < 3) return null;
  const [r, g, b] = m.slice(0, 3).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const opaque = (el) => { if (!el) return null; const c = getComputedStyle(el).backgroundColor;
  const m = String(c).match(/[0-9.]+/g); if (!m || (m.length > 3 && Number(m[3]) === 0)) return null; return c; };
const tick = () => {
  const boot = document.getElementById('aura-boot');
  const bootUp = boot && !boot.classList.contains('hidden');
  const visible = bootUp ? opaque(boot)
    : opaque(document.querySelector('[data-aura-app="frontend"]')) || opaque(document.body) || opaque(document.documentElement);
  const l = visible ? lum(visible) : null;
  if (l != null) window.__themeSamples.push({ lum: l, boot: !!bootUp });
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);`;
        const ctx = await browser.newContext({
            viewport: { width: 375, height: 812 },
            colorScheme: 'light', // system light, stored choice dark
            ignoreHTTPSErrors: true,
        });
        await ctx.route('**/*', (route) => {
            const url = route.request().url();
            const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
            return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => pageErrors.push(e.message));
        const dash = JSON.stringify({
            state: { layouts: [LAYOUT], activeLayoutId: LAYOUT.id, editMode: false },
            version: 0,
        });
        const theme = JSON.stringify({
            state: { themeId: 'light', customVars: {}, browserDarkThemeId: 'dark', browserLightThemeId: 'light' },
            version: 0,
        });
        await page.addInitScript(
            ([d, t]) => {
                localStorage.setItem('aura-dashboard', d);
                localStorage.setItem('aura-theme', t);
                localStorage.setItem('aura-device-theme', 'dark');
                localStorage.removeItem('aura-theme-mode');
                // Colours ThemeProvider wrote on an earlier visit, one pair per mode.
                localStorage.setItem('aura-boot-colors-dark', 'rgb(17, 24, 39)|rgb(156, 163, 175)');
                localStorage.setItem('aura-boot-colors-light', 'rgb(249, 250, 251)|rgb(107, 114, 128)');
            },
            [dash, theme],
        );
        await page.addInitScript(SAMPLER);
        await page.goto(`${BASE}/#/view/default/s/einstellungen`, { waitUntil: 'load' });
        await page.waitForTimeout(3500);
        const samples = await page.evaluate(() => window.__themeSamples);
        const wrong = samples.filter((s) => s.lum >= 0.5);
        check(
            'c) stored Dunkel + light system: every painted frame (splash and app) is dark',
            samples.length > 0 && wrong.length === 0,
            `${wrong.length}/${samples.length} bright frames`,
        );
        await ctx.close();
    }

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
