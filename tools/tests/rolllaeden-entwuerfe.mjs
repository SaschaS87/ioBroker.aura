// Feature 30, Runde 1 - Entwuerfe A bis C fuer Zeitplan und Szenen als Unterseiten (Dev-Vorschau).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/rolllaeden-entwuerfe.mjs
//
// In Phase 2 auf den festen Einbau umstellen (die Weiche [data-f30-choice] faellt dann weg).
//
// Runs in the screenshot harness with invented sample data (/?shot=1&rolllaeden=1), 390x640, no Pi.
// For each draft A, B, C: two walks through the stack (Zeitplan -> Zeitpunkt -> Einstellungen and
// Szenen -> Szene -> Zeitpunkt) with scroll position (+-2 px), no empty area under a short page,
// no jump of the leaving page (<= 1 px), no collision in the header at 352 px widget width,
// the sticky header only in B, and the fine control sheet from below. Plus the today's path
// (bottom sheet), reduced motion, no console errors and no writes outside aura.*.
/* global window, document, requestAnimationFrame, getComputedStyle */
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const NOISE = /socket|WebSocket|ERR_|Failed to load resource/i;
const ACTIVE = '.ios-stack-track > .ios-stack-page:not([inert])';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const modeTable = [];

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
            const t = a.querySelector('.ios-bar > .ios-bar-title, .ios-large-title');
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
            if (bar.classList.contains('ios-bar--large')) {
                return { ok: backRight <= rightLeft - 4, mode, cut: labelCut, large: true };
            }
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
                large: false,
            };
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
    await page.waitForSelector('[data-f30-choice]', { timeout: 30000 });
    await page.evaluate(() => {
        window.__auraShot.writes(true);
        window.__auraShot.setDeviceThemeMode('light');
    });
    await page.waitForTimeout(700);
    return { ctx, page, errors };
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

async function checkCollision(page, draft, label) {
    const c = await page.evaluate(() => window.__f30.collision());
    check(`${draft}) no collision in the header: ${label}`, c.ok, JSON.stringify(c));
    modeTable.push({ draft, page: label, mode: c.mode, cut: c.cut });
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

async function draftRun(browser, draft, errorsAll) {
    const { ctx, page, errors } = await openFresh(browser);
    try {
        await page.click(`[data-f30-choice="${draft}"]`);
        await page.waitForTimeout(300);
        const D = `${draft})`;

        // ── Gang 1: Zeitplan -> Zeitpunkt -> Einstellungen ──
        const s0 = await setScroll(page, 60);
        await page.locator(`${ACTIVE} .sf-row--nav`, { hasText: 'Zeitplan' }).first().click();
        await settle(page);
        let s = await st(page);
        check(`${D} walk 1: Zeitplan opens as sub page`, s.title === 'Zeitplan' && s.depth === 1, JSON.stringify(s));
        check(`${D} walk 1: sub page starts at the top`, s.topVisible);
        check(
            `${D} walk 1: list is not displayed, inert and aria-hidden`,
            !s.listDisplayed && s.listInert && s.listAriaHidden === 'true',
        );
        check(
            `${D} walk 1: no empty area under the page`,
            Math.abs(s.trackH - s.activeH) <= 1,
            `${s.trackH} vs ${s.activeH}`,
        );
        await checkCollision(page, draft, 'Zeitplan');
        const s1 = await setScroll(page, 99999);
        await go(page, '.pw-tl-item');
        s = await st(page);
        check(`${D} walk 1: Zeitpunkt opens`, /^(Zeitpunkt|Neuer)/.test(s.title) && s.topVisible, s.title);
        await checkCollision(page, draft, 'Zeitpunkt');
        await back(page);
        s = await st(page);
        check(
            `${D} walk 1: back to Zeitplan keeps the scroll position`,
            s.title === 'Zeitplan' && Math.abs(s.scrollTop - s1) <= 2,
            `${s.scrollTop} vs ${s1}`,
        );
        await go(page, '.ios-bar [aria-label="Einstellungen"]');
        s = await st(page);
        check(
            `${D} walk 1: Einstellungen opens, height follows the page`,
            s.title === 'Einstellungen' && Math.abs(s.trackH - s.activeH) <= 1,
            JSON.stringify(s),
        );
        await checkCollision(page, draft, 'Einstellungen');
        await back(page);
        s = await st(page);
        check(
            `${D} walk 1: back to Zeitplan again at the old position`,
            s.title === 'Zeitplan' && Math.abs(s.scrollTop - s1) <= 2,
            `${s.scrollTop} vs ${s1}`,
        );
        await back(page);
        s = await st(page);
        check(
            `${D} walk 1: back to the list at the old position`,
            s.depth === 0 && Math.abs(s.scrollTop - s0) <= 2,
            `${s.scrollTop} vs ${s0}`,
        );

        // ── Gang 2: Szenen -> Szene -> Zeitpunkt ──
        const t0 = await setScroll(page, 60);
        await page.locator(`${ACTIVE} .sf-row--nav`, { hasText: 'Szenen' }).first().click();
        await settle(page);
        s = await st(page);
        check(
            `${D} walk 2: Szenen opens, no empty area on the short page`,
            s.title === 'Szenen' && Math.abs(s.trackH - s.activeH) <= 1,
            JSON.stringify(s),
        );
        await checkCollision(page, draft, 'Szenen');
        if (draft === 'B') {
            await go(page, '.ios-bar .ios-bar-text', 'Bearbeiten');
        } else {
            await go(page, '.ios-bar [aria-label="Szenen bearbeiten"]');
        }
        await go(page, '.pw-row--tap:not(.pw-row--add)');
        s = await st(page);
        check(`${D} walk 2: first scene opens`, s.title === 'Alles runter', s.title);
        await checkCollision(page, draft, 'Szene');

        // sticky header: only in B
        await setScroll(page, 300);
        const barTop = await page.evaluate(() => {
            const bar = window.__f30.active().querySelector('.ios-bar');
            const sc = window.__f30.scroller();
            // sticky top:0 sits at the content edge of the scroller, i.e. below its padding (.aura-scroll: 8 px)
            const pad = parseFloat(getComputedStyle(sc).paddingTop) || 0;
            return { top: bar.getBoundingClientRect().top, view: window.__f30.viewTop(sc) + pad, pad };
        });
        if (draft === 'B') {
            check(`${D} header runs along (sticky)`, Math.abs(barTop.top - barTop.view) <= 1, JSON.stringify(barTop));
        } else {
            check(`${D} header scrolls away with the page`, barTop.top < barTop.view - 100, JSON.stringify(barTop));
        }
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
            window.__f30.samples = [];
            const loop = () => {
                if (cap.getClientRects().length) {
                    window.__f30.samples.push(cap.getBoundingClientRect().top);
                }
                window.__f30.raf = requestAnimationFrame(loop);
            };
            loop();
        });
        await go(page, '.rpp-row--tap[role="button"] .rpp-row-main');
        const jump = await page.evaluate(() => {
            window.cancelAnimationFrame(window.__f30.raf);
            const a = window.__f30.samples;
            return { n: a.length, spread: a.length ? Math.max(...a) - Math.min(...a) : -1 };
        });
        s = await st(page);
        check(
            `${D} walk 2: the leaving page does not jump (<= 1 px)`,
            jump.n > 3 && jump.spread <= 1,
            JSON.stringify(jump),
        );
        check(
            `${D} walk 2: the scroller did jump to the top for the new page`,
            s.scrollTop < s2 - 50,
            `${s.scrollTop} vs ${s2}`,
        );
        check(`${D} walk 2: Zeitpunkt opens from the scene`, s.title === 'Zeitpunkt bearbeiten', s.title);
        await checkCollision(page, draft, 'Szene-Zeitpunkt');
        await back(page);
        s = await st(page);
        const kept = await page.evaluate(() => {
            const a = window.__f30.active();
            const chip = [...a.querySelector('.rpp-dev').querySelectorAll('.rpp-chip')].find(
                (c) => c.textContent.trim() === '50',
            );
            return { name: a.querySelector('#rpp-scene-name').value, chipActive: chip.classList.contains('is-active') };
        });
        check(
            `${D} walk 2: back to the scene keeps the draft (name, chip)`,
            s.title === 'Alles runter' && kept.name === 'Entwurf bleibt' && kept.chipActive,
            JSON.stringify(kept),
        );
        check(
            `${D} walk 2: back to the scene keeps the scroll position`,
            Math.abs(s.scrollTop - s2) <= 2,
            `${s.scrollTop} vs ${s2}`,
        );
        await back(page);
        const editOn = await page.evaluate(() => {
            const a = window.__f30.active();
            if (a.querySelector('[aria-label="Fertig"]')) {
                return true;
            }
            return [...a.querySelectorAll('.ios-bar-text')].some((e) => e.textContent.trim() === 'Fertig');
        });
        check(`${D} walk 2: Szenen is still in edit mode`, editOn);
        await back(page);
        s = await st(page);
        check(
            `${D} walk 2: back to the list at the old position`,
            s.depth === 0 && Math.abs(s.scrollTop - t0) <= 2,
            `${s.scrollTop} vs ${t0}`,
        );

        // fine control sheet from below
        await setScroll(page, 0);
        await fineControl(page, `${D} list`);
    } finally {
        errorsAll.push(...errors);
        await ctx.close();
    }
}

const browser = await chromium.launch();
const allErrors = [];
let writesOutside = [];
try {
    for (const d of ['A', 'B', 'C']) {
        await draftRun(browser, d, allErrors);
    }

    // today's path: bottom sheet
    {
        const { ctx, page, errors } = await openFresh(browser);
        await page.click('[data-f30-choice="IST"]');
        await page.waitForTimeout(300);
        await page.locator('.sf-row--nav', { hasText: 'Zeitplan' }).first().click();
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
            const el = document.querySelector('.rpp-sheet[role="dialog"]');
            if (!el || el.getClientRects().length === 0) {
                return null;
            }
            return { bottom: el.getBoundingClientRect().bottom, h: window.innerHeight };
        });
        check('Ist) Zeitplan still opens as a bottom sheet', !!r && Math.abs(r.bottom - r.h) <= 2, JSON.stringify(r));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        check('Ist) Escape closes the sheet', (await page.locator('.rpp-sheet[role="dialog"]').count()) === 0);
        await fineControl(page, 'Ist');
        writesOutside = (await page.evaluate(() => window.__auraShot.writes())).filter(
            (w) => !w.id.startsWith('aura.'),
        );
        allErrors.push(...errors);
        await ctx.close();
    }

    // reduced motion: no slide, the page is there at once
    {
        const { ctx, page, errors } = await openFresh(browser, { reducedMotion: 'reduce' });
        await page.click('[data-f30-choice="A"]');
        await page.waitForTimeout(300);
        await page.locator(`${ACTIVE} .sf-row--nav`, { hasText: 'Zeitplan' }).first().click();
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
        allErrors.push(...errors);
        await ctx.close();
    }
} finally {
    await browser.close();
}

check('no writes outside aura.*', writesOutside.length === 0, JSON.stringify(writesOutside));
check('no console or page errors', allErrors.length === 0, allErrors.join(' | '));

console.log('\nHeader modes at 352 px widget width (back word shown, "..." = something truncated):');
console.log('draft | page            | back button | truncated');
for (const r of modeTable) {
    console.log(`${r.draft.padEnd(5)} | ${r.page.padEnd(15)} | ${String(r.mode).padEnd(11)} | ${r.cut ? 'yes' : 'no'}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
