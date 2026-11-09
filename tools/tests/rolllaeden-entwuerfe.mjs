// Feature 30 - Zeitplan und Szenen als Unterseiten im iOS-Stil (Phase 2, fester Einbau).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/rolllaeden-entwuerfe.mjs
//
// Runs in the screenshot harness with invented sample data (/?shot=1&rolllaeden=1), 390x640, no Pi.
// The dev server must run WITHOUT a reachable ioBroker (e.g. AURA_IOBROKER_URL=http://127.0.0.1:9):
// otherwise the real Rollladen_Dev data replaces the sample data. Writes are recorded, never sent.
// Without a socket the datapoint hooks never subscribe, so injected states would not reach the page
// after it mounted. The test therefore answers /socket.io/socket.io.js with a small stub library that
// reports "connected" and answers every request empty (no network, no state of its own).
//
// Part 1 (stack): two walks (Zeitplan -> Zeitpunkt -> Einstellungen and Szenen -> Szene -> Zeitpunkt) with
//   scroll position (+-2 px), no empty area under a short page, no jump of the leaving page (<= 1 px),
//   no collision in the header at 352 px widget width, the sticky header, 1280 px, the fine control
//   sheet from below, reduced motion.
// Part 2 (Phase 2): text button "Einstellungen"; back words; "Sichern" grey until a change; confirmation
//   sheet on back; delete at the bottom with confirmation (scene and time point); only "Fahren" starts a
//   scene, "Stopp" in the same place (abort command + stop of each drive); tiles with the round button;
//   tab switch (list when coming back, unsaved draft stays); writes only where allowed.
/* global window, document, requestAnimationFrame, getComputedStyle */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const NOISE = /socket|WebSocket|ERR_|Failed to load resource/i;
const ACTIVE = '.ios-stack-track > .ios-stack-page:not([inert])';
const ROOT = '0_userdata.0.Rollladen_Dev';
const SZENEN = `${ROOT}.Szenen`;
const PLAN = `${ROOT}.Wochenplan`;
const BEFEHL = `${ROOT}.Befehl`;
const STOP_WOHNZ = 'demo.0.rollladen.Wohnz_gross.commands.stop';
const STOP_RAFF = 'demo.0.rollladen.Raffstore_Garten.commands.stop';
const MOVING_WOHNZ = 'demo.0.rollladen.Wohnz_gross.states.core:MovingState';

// Stand-in for the ioBroker socket library: connects at once, answers every request with "nothing".
const SOCKET_STUB = `
window.io = { connect: function () {
    var h = {};
    var s = { connected: false, io: {},
        on: function (e, f) { (h[e] = h[e] || []).push(f); return s; },
        off: function () { return s; }, removeAllListeners: function () { return s; },
        emit: function (e) { var cb = arguments[arguments.length - 1];
            if (typeof cb === 'function') setTimeout(function () { cb(null, e === 'getStates' ? {} : null); }, 0);
            return s; },
        connect: function () { return s; }, disconnect: function () {}, close: function () {} };
    setTimeout(function () { s.connected = true; (h.connect || []).forEach(function (f) { f(); }); }, 30);
    return s; } };
`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const modeTable = [];
const allWrites = [];
const allErrors = [];

// Helpers living in the page
function installHelpers() {
    const scroller = () => {
        const t = document.querySelector('.ios-stack-track');
        for (let p = t ? t.parentElement : null; p; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
                return p;
            }
        }
        return document.scrollingElement;
    };
    const viewTop = (sc) => (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top + sc.clientTop);
    const active = () => document.querySelector('.ios-stack-track > .ios-stack-page:not([inert])');
    window.__f30 = {
        scroller,
        viewTop,
        active,
        state() {
            const sc = scroller();
            const track = document.querySelector('.ios-stack-track');
            const stack = document.querySelector('.ios-stack');
            const a = active();
            const list = track.children[0];
            const t = a.querySelector('.ios-bar > .ios-bar-title');
            const lab = a.querySelector('button.ios-back .ios-back-label');
            const pad = parseFloat(getComputedStyle(sc).paddingTop) || 0;
            return {
                depth: Number(stack.getAttribute('data-depth')),
                scrollTop: sc.scrollTop,
                title: t ? t.textContent : '',
                backLabel: lab ? lab.textContent : '',
                trackH: track.offsetHeight,
                activeH: a.offsetHeight,
                listDisplayed: list.getClientRects().length > 0,
                listInert: list.hasAttribute('inert'),
                listAriaHidden: list.getAttribute('aria-hidden'),
                topVisible: track.getBoundingClientRect().top >= viewTop(sc) + pad - 1,
            };
        },
        collision() {
            const a = active();
            const bar = a.querySelector('.ios-bar');
            const back = bar.querySelector('button.ios-back');
            const right = bar.querySelector('.ios-bar-right');
            const rightLeft =
                right && right.firstElementChild ? right.firstElementChild.getBoundingClientRect().left : Infinity;
            const label = back ? back.querySelector('.ios-back-label') : null;
            const backRight = back
                ? (label ? label : back.querySelector('svg')).getBoundingClientRect().right
                : -Infinity;
            const mode = !back ? 'ohne' : label ? label.textContent : 'nur Pfeil';
            const labelCut = label ? label.scrollWidth > label.clientWidth + 0.5 : false;
            const title = bar.querySelector(':scope > .ios-bar-title');
            const range = document.createRange();
            range.selectNodeContents(title);
            const textW = range.getBoundingClientRect().width;
            const tr = title.getBoundingClientRect();
            const vis = Math.min(textW, tr.width);
            const c = tr.left + tr.width / 2;
            const cut = title.scrollWidth > title.clientWidth + 0.5;
            return {
                ok: c - vis / 2 - backRight >= 4 && rightLeft - (c + vis / 2) >= 4,
                mode,
                cut: cut || labelCut,
            };
        },
        backInfo() {
            const back = active().querySelector('.ios-bar button.ios-back');
            if (!back) return null;
            const label = back.querySelector('.ios-back-label');
            return { label: label ? label.textContent : '', aria: back.getAttribute('aria-label') };
        },
    };
}

async function openFresh(browser, opts = {}) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 640 },
        deviceScaleFactor: 1,
        timezoneId: 'Europe/Berlin',
        locale: 'de-DE',
        ...opts,
    });
    await ctx.route(/socket\.io\/socket\.io\.js/, (route) =>
        route.fulfill({ contentType: 'application/javascript', body: SOCKET_STUB }),
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'error' && !NOISE.test(m.text())) {
            errors.push(`console: ${m.text()}`);
        }
    });
    await page.addInitScript(installHelpers);
    await page.goto(`${BASE}/?shot=1&rolllaeden=1`, { waitUntil: 'load' });
    await page.waitForSelector('.ios-stack', { timeout: 30000 });
    await page.evaluate(() => {
        window.__auraShot.writes(true);
        window.__auraShot.setDeviceThemeMode('light');
    });
    // dev hint about the resolution would cover the lower part of the page and intercept taps
    const gotIt = page.getByRole('button', { name: 'Verstanden' });
    if (await gotIt.count()) {
        await gotIt.first().click();
    }
    await page.waitForTimeout(700);
    return { ctx, page, errors };
}

/** Eigener Kontext je Szenario; sammelt Fehler und alle Schreiboperationen fuer die Schlusspruefung. */
async function scenario(browser, fn, opts = {}) {
    const { ctx, page, errors } = await openFresh(browser, opts.context);
    try {
        await fn(page);
    } finally {
        allWrites.push(...(await page.evaluate(() => window.__auraShot.writes())).map((w) => ({ ...w, stopOk: !!opts.stopOk })));
        allErrors.push(...errors);
        await ctx.close();
    }
}

const settle = async (page) => {
    await page.waitForTimeout(450);
    await page.waitForFunction(() => document.querySelectorAll('.ios-stack.is-moving').length === 0);
};
const st = (page) => page.evaluate(() => window.__f30.state());
// Click through the DOM: Playwright would scroll the element into view and change the scroll position under test.
const jsClick = (page, sel, text) =>
    page.evaluate(
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
const go = async (page, sel, text) => {
    const ok = await jsClick(page, sel, text);
    if (!ok) {
        throw new Error(`not found: ${sel} ${text ?? ''}`);
    }
    await settle(page);
};
const back = (page) => go(page, 'button.ios-back');
const setScroll = (page, v) =>
    page.evaluate((y) => {
        const sc = window.__f30.scroller();
        sc.scrollTop = y;
        return sc.scrollTop;
    }, v);
const scrollTopNow = (page) => page.evaluate(() => window.__f30.scroller().scrollTop);
const writesNow = (page) => page.evaluate(() => window.__auraShot.writes());
const resetWrites = (page) => page.evaluate(() => window.__auraShot.writes(true));
const sheetButtons = (page) =>
    page.evaluate(() => {
        const dlg = document.querySelector('.ios-as[role="dialog"]');
        if (!dlg) {
            return null;
        }
        return [...dlg.querySelectorAll('button')].map((b) => ({
            text: b.textContent.trim(),
            disabled: b.disabled,
            color: getComputedStyle(b).color,
            h: b.getBoundingClientRect().height,
        }));
    });
const sheetClick = async (page, text) => {
    await page.locator('.ios-as[role="dialog"] button', { hasText: text }).click();
    await page.waitForTimeout(350);
};
const isRed = (color) => {
    const m = String(color).match(/[0-9.]+/g) || [];
    return Number(m[0]) > 200 && Number(m[1]) < 120 && Number(m[2]) < 120;
};
const barButton = (page, text) =>
    page.evaluate(
        ([sel, t]) => {
            const b = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === t);
            if (!b) {
                return null;
            }
            const accent = getComputedStyle(document.querySelector(sel.replace('.ios-bar-right button', 'button.ios-back'))).color;
            const cs = getComputedStyle(b);
            return { disabled: b.disabled, color: cs.color, accent, weight: Number(cs.fontWeight), svg: b.querySelectorAll('svg').length };
        },
        [`${ACTIVE} .ios-bar-right button`, text],
    );
const openScenes = (page) => go(page, '.sf-row--nav', 'Szenen');
const openPlan = (page) => go(page, '.sf-row--nav', 'Zeitplan');
const writesTo = (writes, id) => writes.filter((w) => w.id === id);

async function checkCollision(page, label) {
    const c = await page.evaluate(() => window.__f30.collision());
    check(`no collision in the header: ${label}`, c.ok, JSON.stringify(c));
    modeTable.push({ page: label, mode: c.mode, cut: c.cut });
}

async function checkBackText(page, expected, label) {
    const b = await page.evaluate(() => window.__f30.backInfo());
    const ok = !!b && (b.label === expected || b.label === 'Zurück' || (b.label === '' && b.aria === expected));
    check(`back word on ${label} is "${expected}" (or shortened)`, ok, JSON.stringify(b));
}

async function fineControl(page, label) {
    await page.locator('.sf-row--dev .sf-name').first().click();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
        const el = document.querySelector('.sds[role="dialog"]');
        if (!el || el.getClientRects().length === 0) {
            return null;
        }
        return { bottom: el.getBoundingClientRect().bottom, h: window.innerHeight };
    });
    check(
        `${label}: fine control opens as a sheet from below`,
        !!r && Math.abs(r.bottom - r.h) <= 2,
        JSON.stringify(r),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(`${label}: Escape closes the fine control`, (await page.locator('.sds[role="dialog"]').count()) === 0);
}

// ───────────────────────── Part 1: the stack ─────────────────────────

async function walks(page) {
    // ── Gang 1: Zeitplan -> Zeitpunkt -> Einstellungen ──
    const s0 = await setScroll(page, 60);
    await openPlan(page);
    let s = await st(page);
    check('walk 1: Zeitplan opens as sub page', s.title === 'Zeitplan' && s.depth === 1, JSON.stringify(s));
    check('walk 1: sub page starts at the top', s.topVisible);
    check(
        'walk 1: list is not displayed, inert and aria-hidden',
        !s.listDisplayed && s.listInert && s.listAriaHidden === 'true',
    );
    check('walk 1: no empty area under the page', Math.abs(s.trackH - s.activeH) <= 1, `${s.trackH} vs ${s.activeH}`);
    await checkCollision(page, 'Zeitplan');
    await checkBackText(page, 'Rollläden', 'Zeitplan');
    // a) text button "Einstellungen" on the right, no icon, not bold
    const eb = await barButton(page, 'Einstellungen');
    check(
        'a) Zeitplan: right of the header is the text button "Einstellungen" (no svg, not bold)',
        !!eb && eb.svg === 0 && eb.weight <= 500,
        JSON.stringify(eb),
    );
    const s1 = await setScroll(page, 99999);
    await go(page, '.pw-tl-item');
    s = await st(page);
    check('walk 1: Zeitpunkt opens', /^(Zeitpunkt|Neuer)/.test(s.title) && s.topVisible, s.title);
    await checkCollision(page, 'Zeitpunkt');
    await checkBackText(page, 'Zeitplan', 'Zeitpunkt');
    await back(page);
    s = await st(page);
    check(
        'walk 1: back to Zeitplan keeps the scroll position',
        s.title === 'Zeitplan' && Math.abs(s.scrollTop - s1) <= 2,
        `${s.scrollTop} vs ${s1}`,
    );
    await go(page, '.ios-bar-right button', 'Einstellungen');
    s = await st(page);
    check(
        'a) walk 1: a tap on "Einstellungen" opens the page, height follows the page',
        s.title === 'Einstellungen' && Math.abs(s.trackH - s.activeH) <= 1,
        JSON.stringify(s),
    );
    await checkCollision(page, 'Einstellungen');
    await checkBackText(page, 'Zeitplan', 'Einstellungen');
    await back(page);
    s = await st(page);
    check(
        'walk 1: back to Zeitplan again at the old position',
        s.title === 'Zeitplan' && Math.abs(s.scrollTop - s1) <= 2,
        `${s.scrollTop} vs ${s1}`,
    );
    await back(page);
    s = await st(page);
    check(
        'walk 1: back to the list at the old position',
        s.depth === 0 && Math.abs(s.scrollTop - s0) <= 2,
        `${s.scrollTop} vs ${s0}`,
    );

    // ── Gang 2: Szenen -> Szene -> Zeitpunkt ──
    const t0 = await setScroll(page, 60);
    await openScenes(page);
    s = await st(page);
    check(
        'walk 2: Szenen opens, no empty area on the short page',
        s.title === 'Szenen' && Math.abs(s.trackH - s.activeH) <= 1,
        JSON.stringify(s),
    );
    await checkCollision(page, 'Szenen');
    await checkBackText(page, 'Rollläden', 'Szenen');
    await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
    await go(page, '.pw-row--tap:not(.pw-row--add)');
    s = await st(page);
    check('walk 2: first scene opens', s.title === 'Alles runter', s.title);
    await checkCollision(page, 'Szene');
    await checkBackText(page, 'Szenen', 'Szene');

    // sticky header
    await setScroll(page, 300);
    const barTop = await page.evaluate(() => {
        const bar = window.__f30.active().querySelector('.ios-bar');
        const sc = window.__f30.scroller();
        const pad = parseFloat(getComputedStyle(sc).paddingTop) || 0;
        return { top: bar.getBoundingClientRect().top, view: window.__f30.viewTop(sc), pad };
    });
    check('header runs along (sticky)', Math.abs(barTop.top - barTop.view) <= 1, JSON.stringify(barTop));
    await setScroll(page, 0);

    await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Entwurf bleibt');
    await page.locator(`${ACTIVE} .rpp-dev`).first().locator('.rpp-chip', { hasText: /^50$/ }).click();
    await page.evaluate(() => {
        const cap = [...window.__f30.active().querySelectorAll('.rpp-caption-text')].find(
            (e) => e.textContent.trim() === 'Im Wochenplan',
        );
        cap.scrollIntoView({ block: 'center' });
    });
    const s2 = await scrollTopNow(page);
    // jump check: follow the caption of the leaving page while the next page slides in
    await page.evaluate(() => {
        const cap = [...window.__f30.active().querySelectorAll('.rpp-caption-text')].find(
            (e) => e.textContent.trim() === 'Im Wochenplan',
        );
        const bar = window.__f30.active().querySelector('.ios-bar');
        window.__f30.samples = [];
        window.__f30.barSamples = [];
        const loop = () => {
            if (cap.getClientRects().length) {
                window.__f30.samples.push(cap.getBoundingClientRect().top);
            }
            if (bar.getClientRects().length) {
                window.__f30.barSamples.push(bar.getBoundingClientRect().top);
            }
            window.__f30.raf = requestAnimationFrame(loop);
        };
        loop();
    });
    await go(page, '.rpp-row--tap[role="button"] .rpp-row-main');
    const jump = await page.evaluate(() => {
        window.cancelAnimationFrame(window.__f30.raf);
        const a = window.__f30.samples;
        const b = window.__f30.barSamples;
        return {
            n: a.length,
            spread: a.length ? Math.max(...a) - Math.min(...a) : -1,
            barN: b.length,
            barSpread: b.length ? Math.max(...b) - Math.min(...b) : -1,
        };
    });
    s = await st(page);
    check('walk 2: the leaving page does not jump (<= 1 px)', jump.n > 3 && jump.spread <= 1, JSON.stringify(jump));
    check(
        'walk 2: the leaving header stays in place (<= 1 px)',
        jump.barN > 3 && jump.barSpread <= 1,
        JSON.stringify(jump),
    );
    check(
        'walk 2: the scroller did jump to the top for the new page',
        s.scrollTop < s2 - 50,
        `${s.scrollTop} vs ${s2}`,
    );
    check('walk 2: Zeitpunkt opens from the scene', s.title === 'Zeitpunkt bearbeiten', s.title);
    await checkCollision(page, 'Szene-Zeitpunkt');
    await checkBackText(page, 'Alles runter', 'Szene-Zeitpunkt');
    // back: follow the header of the leaving page (Zeitpunkt) while the scene slides in
    await page.evaluate(() => {
        const bar = window.__f30.active().querySelector('.ios-bar');
        window.__f30.backSamples = [];
        const loop = () => {
            if (bar.getClientRects().length) {
                window.__f30.backSamples.push(bar.getBoundingClientRect().top);
            }
            window.__f30.raf2 = requestAnimationFrame(loop);
        };
        loop();
    });
    await back(page);
    const backJump = await page.evaluate(() => {
        window.cancelAnimationFrame(window.__f30.raf2);
        const a = window.__f30.backSamples;
        return { n: a.length, spread: a.length ? Math.max(...a) - Math.min(...a) : -1 };
    });
    check(
        'walk 2: back: the leaving header stays in place (<= 1 px)',
        backJump.n > 3 && backJump.spread <= 1,
        JSON.stringify(backJump),
    );
    s = await st(page);
    const kept = await page.evaluate(() => {
        const a = window.__f30.active();
        const chip = [...a.querySelector('.rpp-dev').querySelectorAll('.rpp-chip')].find(
            (c) => c.textContent.trim() === '50',
        );
        return { name: a.querySelector('#rpp-scene-name').value, chipActive: chip.classList.contains('is-active') };
    });
    check(
        'walk 2: back to the scene keeps the draft (name, chip)',
        s.title === 'Alles runter' && kept.name === 'Entwurf bleibt' && kept.chipActive,
        JSON.stringify(kept),
    );
    check(
        'walk 2: back to the scene keeps the scroll position',
        Math.abs(s.scrollTop - s2) <= 2,
        `${s.scrollTop} vs ${s2}`,
    );
    // the draft is unsaved: back asks first, then "Änderungen verwerfen" leaves
    await go(page, 'button.ios-back').catch(() => {});
    await page.waitForTimeout(300);
    await sheetClick(page, 'Änderungen verwerfen');
    await settle(page);
    const editOn = await page.evaluate(() => {
        const a = window.__f30.active();
        return [...a.querySelectorAll('.ios-bar-text')].some((e) => e.textContent.trim() === 'Fertig');
    });
    check('walk 2: Szenen is still in edit mode', editOn);
    await back(page);
    s = await st(page);
    check(
        'walk 2: back to the list at the old position',
        s.depth === 0 && Math.abs(s.scrollTop - t0) <= 2,
        `${s.scrollTop} vs ${t0}`,
    );

    // fine control sheet from below
    await setScroll(page, 0);
    await fineControl(page, 'list');
}

// ───────────────────────── Part 2: Phase 2 ─────────────────────────

/** Szene "Alles runter" (s-bsp-1, von e-bsp-3 benutzt) im Bearbeiten-Modus oeffnen. */
async function openSceneEditor(page, name = 'Alles runter') {
    await openScenes(page);
    await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
    await go(page, '.pw-row--tap:not(.pw-row--add) .pw-title', name);
    return st(page);
}

async function sceneSave(browser) {
    await scenario(browser, async (page) => {
        await openSceneEditor(page);
        // d) unchanged: Sichern disabled and grey
        let sv = await barButton(page, 'Sichern');
        check(
            'd) scene opens with "Sichern" disabled and grey (not the accent colour)',
            !!sv && sv.disabled && sv.color !== sv.accent,
            JSON.stringify(sv),
        );
        // e) name changed -> blue and tappable; back to the old name -> disabled again
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Alles runter!');
        sv = await barButton(page, 'Sichern');
        check('e) a changed name enables "Sichern" (blue)', !!sv && !sv.disabled && sv.color === sv.accent, JSON.stringify(sv));
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Alles runter');
        sv = await barButton(page, 'Sichern');
        check('e) the old name again: "Sichern" disabled', !!sv && sv.disabled, JSON.stringify(sv));
        // e) chip: Wohnzimmer groß from "zu" to 50 and back
        const chip = (re) => page.locator(`${ACTIVE} .rpp-dev`).first().locator('.rpp-chip', { hasText: re });
        await chip(/^50$/).click();
        sv = await barButton(page, 'Sichern');
        check('e) a changed chip enables "Sichern"', !!sv && !sv.disabled, JSON.stringify(sv));
        await chip(/^zu$/).click();
        sv = await barButton(page, 'Sichern');
        check('e) the old chip again: "Sichern" disabled', !!sv && sv.disabled, JSON.stringify(sv));
        // f) no change: back goes straight, no dialog, depth -1
        const d0 = (await st(page)).depth;
        await back(page);
        const sf = await st(page);
        check(
            'f) no change: back without a dialog, one level up',
            (await page.locator('[role="dialog"].ios-as').count()) === 0 && sf.depth === d0 - 1 && sf.title === 'Szenen',
            JSON.stringify(sf),
        );
    });

    await scenario(browser, async (page) => {
        await openSceneEditor(page);
        const d0 = (await st(page)).depth;
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Neuer Name');
        // g) change + back -> sheet with exactly three entries
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        const b = await sheetButtons(page);
        check(
            'g) back with a change: sheet "Änderungen verwerfen" (red), "Sichern", "Weiter bearbeiten"',
            !!b &&
                b.length === 3 &&
                b[0].text === 'Änderungen verwerfen' &&
                isRed(b[0].color) &&
                b[1].text === 'Sichern' &&
                !b[1].disabled &&
                b[2].text === 'Weiter bearbeiten',
            JSON.stringify(b),
        );
        check('g) sheet: every target is at least 44 px high', !!b && b.every((x) => x.h >= 44), JSON.stringify(b));
        check(
            'g) sheet is a modal dialog',
            (await page.locator('.ios-as[role="dialog"][aria-modal="true"]').count()) === 1,
        );
        // Weiter bearbeiten
        await sheetClick(page, 'Weiter bearbeiten');
        let s = await st(page);
        check(
            'g) "Weiter bearbeiten": sheet closed, name unchanged, same page',
            (await page.locator('.ios-as').count()) === 0 &&
                (await page.locator(`${ACTIVE} #rpp-scene-name`).inputValue()) === 'Neuer Name' &&
                s.depth === d0,
        );
        // Escape = Weiter
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        s = await st(page);
        check(
            'g) Escape acts like "Weiter bearbeiten"',
            (await page.locator('.ios-as').count()) === 0 &&
                (await page.locator(`${ACTIVE} #rpp-scene-name`).inputValue()) === 'Neuer Name' &&
                s.depth === d0,
        );
        // tap beside the sheet = Weiter, too
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        await page.mouse.click(195, 40);
        await page.waitForTimeout(300);
        check('g) a tap beside the sheet closes it without leaving', (await page.locator('.ios-as').count()) === 0 && (await st(page)).depth === d0);
        // Verwerfen
        await resetWrites(page);
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        await sheetClick(page, 'Änderungen verwerfen');
        await settle(page);
        s = await st(page);
        check('g) "Änderungen verwerfen": back on Szenen', s.title === 'Szenen' && s.depth === d0 - 1, JSON.stringify(s));
        check('g) discard writes nothing', (await writesNow(page)).length === 0);
        await go(page, '.pw-row--tap:not(.pw-row--add) .pw-title', 'Alles runter');
        check(
            'g) reopening shows the old name',
            (await page.locator(`${ACTIVE} #rpp-scene-name`).inputValue()) === 'Alles runter',
        );
        // Sichern
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Neuer Name');
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        await sheetClick(page, 'Sichern');
        await page.waitForTimeout(600);
        await settle(page);
        const w = writesTo(await writesNow(page), SZENEN);
        let parsed = [];
        try {
            parsed = JSON.parse(w[0]?.val ?? '[]');
        } catch {
            /* handled by the check */
        }
        check(
            'g) "Sichern": one write on .Szenen with the new name',
            w.length === 1 && parsed.some((x) => x.id === 's-bsp-1' && x.name === 'Neuer Name'),
            JSON.stringify(w),
        );
        s = await st(page);
        check('g) after "Sichern" back on Szenen', s.title === 'Szenen' && s.depth === d0 - 1, JSON.stringify(s));
        // Sichern in the head saves and leaves, too
        await go(page, '.pw-row--tap:not(.pw-row--add) .pw-title', 'Alles runter');
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Kopf sichern');
        await resetWrites(page);
        await go(page, '.ios-bar-right button', 'Sichern');
        await page.waitForTimeout(600);
        check('"Sichern" in the head writes .Szenen once', writesTo(await writesNow(page), SZENEN).length === 1);
    });
}

async function sceneDelete(browser) {
    await scenario(browser, async (page) => {
        await openSceneEditor(page);
        const d0 = (await st(page)).depth;
        // h) no bin at the top, the red row at the bottom over the full group width
        const top = await page.locator(`${ACTIVE} .ios-bar [aria-label*="löschen"]`).count();
        check('h) no bin in the header', top === 0, String(top));
        await page.evaluate(() => window.__f30.scroller().scrollTo(0, 99999));
        const row = await page.evaluate(() => {
            const a = window.__f30.active();
            const btn = [...a.querySelectorAll('.ios-row--btn')].find((b) => b.textContent.trim() === 'Szene löschen');
            if (!btn) {
                return null;
            }
            const grp = btn.closest('.ios-group').getBoundingClientRect();
            const ed = a.querySelector('.rpp-editor').getBoundingClientRect();
            const last = [...a.querySelectorAll('.rpp-editor > *')].pop();
            return {
                gw: grp.width,
                ew: ed.width,
                color: getComputedStyle(btn).color,
                align: getComputedStyle(btn).justifyContent,
                lastIsRow: last === btn.closest('.ios-group'),
            };
        });
        check(
            'h) "Szene löschen" at the very bottom, over the full width, red, text centred',
            !!row && Math.abs(row.gw - row.ew) <= 1 && isRed(row.color) && row.align === 'center' && row.lastIsRow,
            JSON.stringify(row),
        );
        // sheet: Szene löschen (red) + Abbrechen
        await page.locator(`${ACTIVE} .ios-row--btn`, { hasText: 'Szene löschen' }).click();
        await page.waitForTimeout(400);
        const b = await sheetButtons(page);
        check(
            'h) tap opens the sheet "Szene löschen" (red) and "Abbrechen"',
            !!b && b.length === 2 && b[0].text === 'Szene löschen' && isRed(b[0].color) && b[1].text === 'Abbrechen',
            JSON.stringify(b),
        );
        const msg = await page.locator('.ios-as-msg').textContent().catch(() => '');
        check('h) the sheet names the time point that is deleted with the scene', /Zeitpunkt/.test(msg || ''), String(msg));
        await resetWrites(page);
        await sheetClick(page, 'Abbrechen');
        check(
            'h) Abbrechen: no write, scene still open',
            (await writesNow(page)).length === 0 && (await st(page)).depth === d0 && (await page.locator('.ios-as').count()) === 0,
        );
        await page.locator(`${ACTIVE} .ios-row--btn`, { hasText: 'Szene löschen' }).click();
        await page.waitForTimeout(400);
        await sheetClick(page, 'Szene löschen');
        await page.waitForTimeout(800);
        await settle(page);
        const w = await writesNow(page);
        const ws = writesTo(w, SZENEN);
        const wp = writesTo(w, PLAN);
        let scenes = [];
        let plan = [];
        try {
            scenes = JSON.parse(ws[0]?.val ?? '[]');
            plan = JSON.parse(wp[0]?.val ?? '[]');
        } catch {
            /* handled by the check */
        }
        check(
            'h) "Szene löschen": one write on .Szenen without the id, back on Szenen',
            ws.length === 1 && !scenes.some((x) => x.id === 's-bsp-1') && scenes.length === 2 && (await st(page)).title === 'Szenen' && (await st(page)).depth === d0 - 1,
            JSON.stringify(ws),
        );
        check(
            'h) the time point that ran the scene is removed from .Wochenplan with it (as the sheet says)',
            wp.length === 1 && !plan.some((x) => x.id === 'e-bsp-3') && plan.length === 3,
            JSON.stringify(wp),
        );
    });
    // new scene: no delete row
    await scenario(browser, async (page) => {
        await openScenes(page);
        await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        await jsClick(page, '.pw-row--add');
        await settle(page);
        const s = await st(page);
        const rows = await page.locator(`${ACTIVE} .ios-row--btn`).count();
        const sv = await barButton(page, 'Sichern');
        check('h) new scene: no delete row', s.title === 'Neue Szene' && rows === 0, `${s.title} ${rows}`);
        check('d) new scene: "Sichern" disabled (nothing chosen)', !!sv && sv.disabled, JSON.stringify(sv));
    });
}

async function entryEditor(browser) {
    await scenario(browser, async (page) => {
        await openPlan(page);
        await go(page, '.pw-tl-item');
        const d0 = (await st(page)).depth;
        let sv = await barButton(page, 'Sichern');
        check('i) Zeitpunkt opens with "Sichern" disabled and grey', !!sv && sv.disabled && sv.color !== sv.accent, JSON.stringify(sv));
        check('i) no bin in the Zeitpunkt header', (await page.locator(`${ACTIVE} .ios-bar [aria-label*="löschen"]`).count()) === 0);
        const time = page.locator(`${ACTIVE} input[type="time"]`).first();
        const t0 = await time.inputValue();
        await time.fill('08:15');
        sv = await barButton(page, 'Sichern');
        check('i) a changed time enables "Sichern"', !!sv && !sv.disabled, JSON.stringify(sv));
        await time.fill(t0);
        sv = await barButton(page, 'Sichern');
        check('i) the old time again: "Sichern" disabled', !!sv && sv.disabled, JSON.stringify(sv));
        // back without change
        await back(page);
        check('i) no change: back without a dialog', (await page.locator('.ios-as').count()) === 0 && (await st(page)).depth === d0 - 1);
        // change + back -> sheet; discard
        await go(page, '.pw-tl-item');
        await time.fill('08:15');
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        const b = await sheetButtons(page);
        check(
            'i) back with a change: the same three-entry sheet',
            !!b && b.map((x) => x.text).join('|') === 'Änderungen verwerfen|Sichern|Weiter bearbeiten' && isRed(b[0].color),
            JSON.stringify(b),
        );
        await sheetClick(page, 'Änderungen verwerfen');
        await settle(page);
        check('i) discard: back on Zeitplan', (await st(page)).title === 'Zeitplan');
        // change + Sichern -> write on .Wochenplan
        await go(page, '.pw-tl-item');
        await page.locator(`${ACTIVE} input[type="time"]`).first().fill('08:15');
        await resetWrites(page);
        await jsClick(page, 'button.ios-back');
        await page.waitForTimeout(400);
        await sheetClick(page, 'Sichern');
        await page.waitForTimeout(600);
        const w = writesTo(await writesNow(page), PLAN);
        let plan = [];
        try {
            plan = JSON.parse(w[0]?.val ?? '[]');
        } catch {
            /* handled by the check */
        }
        check(
            'i) "Sichern": one write on .Wochenplan with the new time',
            w.length === 1 && plan.some((x) => x.id === 'e-bsp-1' && x.trigger.time === '08:15'),
            JSON.stringify(w),
        );
        // delete
        await settle(page);
        await go(page, '.pw-tl-item');
        await resetWrites(page);
        await page.evaluate(() => window.__f30.scroller().scrollTo(0, 99999));
        await page.locator(`${ACTIVE} .ios-row--btn`, { hasText: 'Zeitpunkt löschen' }).click();
        await page.waitForTimeout(400);
        const d = await sheetButtons(page);
        check(
            'i) "Zeitpunkt löschen" asks first: "Zeitpunkt löschen" (red) and "Abbrechen"',
            !!d && d.length === 2 && d[0].text === 'Zeitpunkt löschen' && isRed(d[0].color) && d[1].text === 'Abbrechen',
            JSON.stringify(d),
        );
        await sheetClick(page, 'Abbrechen');
        check('i) Abbrechen: no write', (await writesNow(page)).length === 0);
        await page.locator(`${ACTIVE} .ios-row--btn`, { hasText: 'Zeitpunkt löschen' }).click();
        await page.waitForTimeout(400);
        await sheetClick(page, 'Zeitpunkt löschen');
        await page.waitForTimeout(600);
        await settle(page);
        const wd = writesTo(await writesNow(page), PLAN);
        let plan2 = [];
        try {
            plan2 = JSON.parse(wd[0]?.val ?? '[]');
        } catch {
            /* handled by the check */
        }
        check(
            'i) "Zeitpunkt löschen": one write on .Wochenplan without the id, back on Zeitplan',
            wd.length === 1 && !plan2.some((x) => x.id === 'e-bsp-1') && plan2.length === 3 && (await st(page)).title === 'Zeitplan',
            JSON.stringify(wd),
        );
    });
    // new time point from the scene: preset is the starting point (Sichern grey), no delete row
    await scenario(browser, async (page) => {
        await openScenes(page);
        await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        await go(page, '.pw-row--tap:not(.pw-row--add) .pw-title', 'Alles runter');
        await go(page, '.rpp-row--add');
        const s = await st(page);
        const sv = await barButton(page, 'Sichern');
        const rows = await page.locator(`${ACTIVE} .ios-row--btn`).count();
        check('i) "Zeit hinzufügen" from the scene: new Zeitpunkt, "Sichern" grey, no delete row', s.title === 'Neuer Zeitpunkt' && !!sv && sv.disabled && rows === 0, `${s.title} ${JSON.stringify(sv)} ${rows}`);
    });
}

/** Rechteck und Beschriftung des Knopfes "<Name> fahren/stoppen" in der Szenenliste bzw. auf der Kachel. */
const runBtn = (page, name) =>
    page.evaluate((n) => {
        const a = window.__f30.active();
        const b = a.querySelector(`button[aria-label="${n} fahren"], button[aria-label="${n} stoppen"]`);
        if (!b) {
            return null;
        }
        const r = b.getBoundingClientRect();
        const vis = [...b.querySelectorAll('.pw-go-lab')].find((l) => getComputedStyle(l).visibility !== 'hidden');
        const circle = b.querySelector('.pw-tile-act');
        const cr = circle ? circle.getBoundingClientRect() : null;
        return {
            aria: b.getAttribute('aria-label'),
            text: vis ? vis.textContent.trim() : circle ? (b.getAttribute('aria-label').endsWith('stoppen') ? 'Stopp' : 'Fahren') : '',
            left: r.left,
            width: r.width,
            height: r.height,
            cx: cr ? cr.left + cr.width / 2 : null,
            cw: cr ? cr.width : null,
        };
    }, name);

async function openKino(page) {
    await openScenes(page);
    // "Weitere" is folded next to the favourites: open it
    await go(page, '.pw-gh--fold');
}

async function runAndStop(browser) {
    // j) normal mode: the row does not start anything, k) only "Fahren" does
    await scenario(browser, async (page) => {
        await openKino(page);
        await resetWrites(page);
        const title = page.locator(`${ACTIVE} .pw-title`, { hasText: 'Kino im Wohnzimmer' });
        await title.click();
        await page.locator(`${ACTIVE} .pw-row`, { hasText: 'Kino im Wohnzimmer' }).click({ position: { x: 60, y: 10 } });
        await page.waitForTimeout(300);
        check(
            'j) tap on title and row of a scene: no write on .Befehl, nothing opens',
            writesTo(await writesNow(page), BEFEHL).length === 0 && (await st(page)).title === 'Szenen',
        );
        const idle = await runBtn(page, 'Kino im Wohnzimmer');
        check('k) the row has a real "Fahren" button (at least 30 px high)', !!idle && idle.text === 'Fahren' && idle.height >= 30, JSON.stringify(idle));
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer fahren"]');
        await page.waitForTimeout(250);
        const w = writesTo(await writesNow(page), BEFEHL);
        check(
            'k) "Fahren": exactly one write, .Befehl = {"sceneId":"s-bsp-3"}',
            w.length === 1 && w[0].val === '{"sceneId":"s-bsp-3"}' && (await writesNow(page)).length === 1,
            JSON.stringify(await writesNow(page)),
        );
        const run1 = await runBtn(page, 'Kino im Wohnzimmer');
        check('l) while the command is unconfirmed the button says "Stopp"', !!run1 && run1.text === 'Stopp', JSON.stringify(run1));
        check(
            'l) "Stopp" has the same width and left edge as "Fahren" (<= 0.5 px)',
            !!idle && !!run1 && Math.abs(idle.width - run1.width) <= 0.5 && Math.abs(idle.left - run1.left) <= 0.5,
            `${JSON.stringify(idle)} ${JSON.stringify(run1)}`,
        );
        // the script confirms: no drive moves -> back to "Fahren"
        await page.evaluate((v) => window.__auraShot.mock({ '0_userdata.0.Rollladen_Dev.Befehl': { val: v, ack: true } }), '{"sceneId":"s-bsp-3"}');
        await page.waitForTimeout(300);
        const conf = await runBtn(page, 'Kino im Wohnzimmer');
        check('l) confirmed and nothing moves: "Fahren" again', !!conf && conf.text === 'Fahren', JSON.stringify(conf));
        // a drive of the scene moves -> "Stopp"
        await page.evaluate((id) => window.__auraShot.mock({ [id]: true }), MOVING_WOHNZ);
        await page.waitForTimeout(300);
        const mov = await runBtn(page, 'Kino im Wohnzimmer');
        check(
            'l) a drive of the scene moves (MovingState): "Stopp" in the same place and width',
            !!mov && mov.text === 'Stopp' && Math.abs(mov.width - idle.width) <= 0.5 && Math.abs(mov.left - idle.left) <= 0.5,
            JSON.stringify(mov),
        );
        // m) Stopp: abort command first, then the stop of each drive of the scene, nothing else
        await resetWrites(page);
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer stoppen"]');
        await page.waitForTimeout(300);
        const ws = await writesNow(page);
        check(
            'm) "Stopp": first {"abort":"s-bsp-3"} on .Befehl, then stop=true for Wohnz_gross and Raffstore_Garten, nothing else',
            ws.length === 3 &&
                ws[0].id === BEFEHL &&
                ws[0].val === '{"abort":"s-bsp-3"}' &&
                ws[1].id === STOP_WOHNZ &&
                ws[1].val === true &&
                ws[2].id === STOP_RAFF &&
                ws[2].val === true,
            JSON.stringify(ws),
        );
        const after = await runBtn(page, 'Kino im Wohnzimmer');
        check('m) after "Stopp" the button says "Fahren" again', !!after && after.text === 'Fahren', JSON.stringify(after));
        await page.evaluate((id) => window.__auraShot.mock({ [id]: false }), MOVING_WOHNZ);
    }, { stopOk: true });

    // m) abort of an unconfirmed command: no "Skript antwortet nicht" afterwards
    await scenario(browser, async (page) => {
        await openKino(page);
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer fahren"]');
        await page.waitForTimeout(1500);
        await resetWrites(page);
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer stoppen"]');
        const ws = await writesNow(page);
        check(
            'm) "Stopp" before the script confirmed: same three writes',
            ws.map((x) => x.id).join('|') === [BEFEHL, STOP_WOHNZ, STOP_RAFF].join('|') && ws[0].val === '{"abort":"s-bsp-3"}',
            JSON.stringify(ws),
        );
        await page.waitForTimeout(6500);
        check('m) 6 s after "Stopp" no "Skript antwortet nicht"', (await page.locator('.rpp-toast').count()) === 0);
        const b = await runBtn(page, 'Kino im Wohnzimmer');
        check('m) and the button still says "Fahren"', !!b && b.text === 'Fahren', JSON.stringify(b));
    }, { stopOk: true });

    // without a stop the unconfirmed run keeps "Stopp" and the hint appears after 5 s
    await scenario(browser, async (page) => {
        await openKino(page);
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer fahren"]');
        await page.waitForTimeout(5600);
        const b = await runBtn(page, 'Kino im Wohnzimmer');
        check(
            'l) after 5 s without an answer: the hint appears, the scene still counts as running ("Stopp")',
            (await page.locator('.rpp-toast', { hasText: 'Skript antwortet nicht' }).count()) === 1 && !!b && b.text === 'Stopp',
            JSON.stringify(b),
        );
    });

    // n) edit mode: the row opens the editor, no Fahren button
    await scenario(browser, async (page) => {
        await openKino(page);
        await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        const vis = await page.locator(`${ACTIVE} button[aria-label$="fahren"], ${ACTIVE} button[aria-label$="stoppen"]`).count();
        await go(page, '.pw-row--tap:not(.pw-row--add) .pw-title', 'Kino im Wohnzimmer');
        const s = await st(page);
        check('n) edit mode: no Fahren button, a tap on the row opens the editor', vis === 0 && s.title === 'Kino im Wohnzimmer', `${vis} ${s.title}`);
    });
}

async function tiles(browser) {
    const ctx = { context: { viewport: { width: 390, height: 640 } } };
    const prefill = async (page) => {
        await page.evaluate(() => localStorage.setItem('aura.shutterfloors.scenes.view', 'kacheln'));
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.ios-stack', { timeout: 30000 });
        await page.evaluate(() => {
            window.__auraShot.writes(true);
            window.__auraShot.setDeviceThemeMode('light');
        });
        await page.waitForTimeout(700);
    };
    await scenario(browser, async (page) => {
        await prefill(page);
        await openKino(page);
        await resetWrites(page);
        const tile = page.locator(`${ACTIVE} .pw-tile`, { hasText: 'Kino im Wohnzimmer' });
        const isButton = await tile.evaluate((e) => e.tagName === 'BUTTON');
        await tile.click({ position: { x: 30, y: 70 } });
        await page.waitForTimeout(300);
        check(
            't) tiles: the tile area is no button, a tap on it writes nothing and opens nothing',
            !isButton && (await writesNow(page)).length === 0 && (await st(page)).title === 'Szenen',
        );
        const idle = await runBtn(page, 'Kino im Wohnzimmer');
        check('t) tiles: the round button is a real button of at least 44 x 44 px', !!idle && idle.width >= 44 && idle.height >= 44 && idle.text === 'Fahren', JSON.stringify(idle));
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer fahren"]');
        await page.waitForTimeout(250);
        const w = await writesNow(page);
        check(
            't) tiles: the round button writes .Befehl = {"sceneId":"s-bsp-3"} (one write)',
            w.length === 1 && w[0].id === BEFEHL && w[0].val === '{"sceneId":"s-bsp-3"}',
            JSON.stringify(w),
        );
        // confirmed, then a drive moves
        await page.evaluate((v) => window.__auraShot.mock({ '0_userdata.0.Rollladen_Dev.Befehl': { val: v, ack: true } }), '{"sceneId":"s-bsp-3"}');
        await page.evaluate((id) => window.__auraShot.mock({ [id]: true }), MOVING_WOHNZ);
        await page.waitForTimeout(400);
        const mov = await runBtn(page, 'Kino im Wohnzimmer');
        check(
            'u) tiles, scene running: "Stopp" on the same button, centre and size unchanged (<= 0.5 px), target >= 44 px',
            !!mov &&
                mov.text === 'Stopp' &&
                Math.abs(mov.cx - idle.cx) <= 0.5 &&
                Math.abs(mov.cw - idle.cw) <= 0.5 &&
                Math.abs(mov.width - idle.width) <= 0.5 &&
                mov.width >= 44 &&
                mov.height >= 44,
            `${JSON.stringify(idle)} ${JSON.stringify(mov)}`,
        );
        await resetWrites(page);
        await jsClick(page, 'button[aria-label="Kino im Wohnzimmer stoppen"]');
        await page.waitForTimeout(300);
        const ws = await writesNow(page);
        check(
            'u) tiles: "Stopp" writes the abort command and the two stops',
            ws.map((x) => x.id).join('|') === [BEFEHL, STOP_WOHNZ, STOP_RAFF].join('|') && ws[0].val === '{"abort":"s-bsp-3"}',
            JSON.stringify(ws),
        );
        const sub = await page.locator(`${ACTIVE} .pw-gf`).textContent();
        check('F) tiles: the footnote speaks of the play button', /Play-Knopf/.test(sub || ''), String(sub));
    }, { stopOk: true, ...ctx });

    await scenario(browser, async (page) => {
        await prefill(page);
        await openKino(page);
        await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        const btns = await page.locator(`${ACTIVE} .pw-tile button, ${ACTIVE} button[aria-label$="fahren"], ${ACTIVE} button[aria-label$="stoppen"]`).count();
        await go(page, '.pw-tile.is-edit', 'Kino im Wohnzimmer');
        const s = await st(page);
        check('v) tiles in edit mode: no Fahren/Stopp button, a tap on the tile opens the editor', btns === 0 && s.title === 'Kino im Wohnzimmer', `${btns} ${s.title}`);
    });
}

async function tabSwitch(browser) {
    const switchTo = async (page, slug) => {
        await page.evaluate((s) => (window.location.hash = `#/view/default/s/home/tab/${s}`), slug);
        await page.waitForTimeout(700);
    };
    // Counts writes to the shared scroll container made by IosStack (recognised by the call stack). The
    // dashboard moves that container for every tab, so a hidden stack must never touch it.
    const spy = (page) =>
        page.evaluate(() => {
            const sc = window.__f30.scroller();
            const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
            window.__f30.stackWrites = 0;
            Object.defineProperty(sc, 'scrollTop', {
                configurable: true,
                get() {
                    return d.get.call(this);
                },
                set(v) {
                    if (/IosStack/.test(new Error().stack)) {
                        window.__f30.stackWrites++;
                    }
                    d.set.call(this, v);
                },
            });
        });
    const stackWrites = (page) => page.evaluate(() => window.__f30.stackWrites);

    await scenario(browser, async (page) => {
        check('o) the sample layout has a second tab', (await page.locator('.aura-section-bar, .aura-tab').count()) >= 1);
        await openPlan(page);
        await spy(page);
        // the spy sees IosStack at work on a normal way back (proof that it measures something)
        await back(page);
        check('o) spy: a normal way back writes the scroll position (IosStack)', (await stackWrites(page)) >= 1);
        await openPlan(page);
        await setScroll(page, 100);
        await page.evaluate(() => (window.__f30.stackWrites = 0));
        await switchTo(page, 'leer');
        check(
            'o) tab switch with Zeitplan open: the hidden stack does not touch the shared scroll position',
            (await stackWrites(page)) === 0,
            String(await stackWrites(page)),
        );
        await setScroll(page, 200);
        await switchTo(page, 'rollos');
        await page.waitForTimeout(300);
        const s = await st(page);
        check(
            'o) back on the Rollläden tab: the list (depth 0, list visible)',
            s.depth === 0 && s.listDisplayed && !s.listInert,
            JSON.stringify(s),
        );
        // and the stack still works afterwards
        await openPlan(page);
        check('o) Zeitplan opens again after the round trip', (await st(page)).title === 'Zeitplan');
        // Szenen in edit mode (also reset)
        await back(page);
        await openScenes(page);
        await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        await switchTo(page, 'leer');
        await switchTo(page, 'rollos');
        await openScenes(page);
        const editOn = await page.evaluate(() => [...window.__f30.active().querySelectorAll('.ios-bar-text')].some((e) => e.textContent.trim() === 'Fertig'));
        check('o) edit mode is reset by the tab switch (a fresh Szenen page)', !editOn);
    });
    await scenario(browser, async (page) => {
        await openSceneEditor(page);
        await page.locator(`${ACTIVE} #rpp-scene-name`).fill('Bleibt erhalten');
        const d0 = (await st(page)).depth;
        await switchTo(page, 'leer');
        await switchTo(page, 'rollos');
        await page.waitForTimeout(300);
        const s = await st(page);
        const name = await page.locator(`${ACTIVE} #rpp-scene-name`).inputValue().catch(() => null);
        const sv = await barButton(page, 'Sichern');
        check(
            'p) tab switch with an unsaved scene: still open, name changed, "Sichern" blue',
            s.depth === d0 && name === 'Bleibt erhalten' && !!sv && !sv.disabled && sv.color === sv.accent,
            JSON.stringify({ s, name, sv }),
        );
    });
}

// ───────────────────────── run ─────────────────────────

const browser = await chromium.launch();
try {
    await scenario(browser, walks);

    // sticky header at desktop width: .aura-scroll has a larger padding there (sm:p-4 = 16 px)
    await scenario(
        browser,
        async (page) => {
            await openScenes(page);
            await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
            await go(page, '.pw-row--tap:not(.pw-row--add)');
            await setScroll(page, 300);
            const r = await page.evaluate(() => {
                const sc = window.__f30.scroller();
                const bar = window.__f30.active().querySelector('.ios-bar');
                return {
                    top: bar.getBoundingClientRect().top,
                    view: window.__f30.viewTop(sc),
                    pad: parseFloat(getComputedStyle(sc).paddingTop),
                };
            });
            check(
                '1280 px: sticky header flush with the scroller top',
                r.pad > 8 && Math.abs(r.top - r.view) <= 1,
                JSON.stringify(r),
            );
        },
        { context: { viewport: { width: 1280, height: 800 } } },
    );

    // reduced motion: no slide, the page is there at once
    await scenario(
        browser,
        async (page) => {
            await openPlan(page);
            await page.waitForTimeout(60);
            const r = await page.evaluate(() => ({
                moving: document.querySelectorAll('.ios-stack.is-moving').length,
                title: window.__f30.state().title,
            }));
            check(
                'reduced motion: no transition, page already there after 60 ms',
                r.moving === 0 && r.title === 'Zeitplan',
                JSON.stringify(r),
            );
        },
        { context: { reducedMotion: 'reduce' } },
    );

    await sceneSave(browser);
    await sceneDelete(browser);
    await entryEditor(browser);
    await runAndStop(browser);
    await tiles(browser);
    await tabSwitch(browser);
} finally {
    await browser.close();
}

// r) writes: only aura.*, Rollladen_Dev.* and, in the stop scenarios, the stop of the sample drives
const bad = allWrites.filter((w) => {
    if (w.id.startsWith('aura.') || w.id.startsWith(`${ROOT}.`)) {
        return false;
    }
    return !(w.stopOk && /^demo\.0\.rollladen\.[A-Za-z_]+\.commands\.stop$/.test(w.id));
});
const live = allWrites.filter((w) => w.id.startsWith('tahoma.') || w.id.startsWith('0_userdata.0.Rollladen.'));
check('r) no write outside aura.*, Rollladen_Dev.* and the stop of the sample drives', bad.length === 0, JSON.stringify(bad));
check('r) not a single write on tahoma.* or the live 0_userdata.0.Rollladen.*', live.length === 0, JSON.stringify(live));
check('s) no console or page errors', allErrors.length === 0, allErrors.join(' | '));

console.log('\nHeader modes at 352 px widget width (back word shown, "..." = something truncated):');
console.log('page            | back button | truncated');
for (const r of modeTable) {
    console.log(`${r.page.padEnd(15)} | ${String(r.mode).padEnd(11)} | ${r.cut ? 'yes' : 'no'}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
