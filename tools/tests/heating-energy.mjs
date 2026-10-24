// Verifies the pure calculation of the heating "Energie" box (src-vis/utils/heatingEnergy.ts).
//
//   node tools/tests/heating-energy.mjs
//
// No dev server needed: the module is pure (no React, no socket), bundled with esbuild.
// The timezone is pinned BEFORE the first Date is made - 25.10.2026 is a 25-hour day.
process.env.TZ = 'Europe/Berlin';

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-heating-energy-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/heatingEnergy.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const E = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });
const { localDays, dayKey, hourOf, dailyFromCounter, hourlyIncrements, buildEnergy, lifetimeTable } = E;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const near = (a, b, eps = 0.001) => typeof a === 'number' && Math.abs(a - b) <= eps;

const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime(); // 24.10.2026 12:00 local
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m, 0).getTime();
const days = localDays(NOW);
const idx = (d) => days.findIndex((x) => x.key === `2026-10-${String(d).padStart(2, '0')}`);

// A counter rising from 0 to `peak` in steps below 2 kWh, from 06:00 in 20-minute steps.
const ramp = (d, peak) => {
    const n = Math.ceil(peak / 2) + 1;
    return Array.from({ length: n + 1 }, (_, i) => [at(d, 6, i * 20), (peak * i) / n]);
};

// -- window -------------------------------------------------------------------------------------
check('window - 30 days, last is today', days.length === 30 && days[29].key === '2026-10-24', days[0].key);

// -- (a) reset at 23:54 with a remainder of 0.4 ------------------------------------------------------
{
    const pts = [
        [at(22, 10), 1.0],
        [at(22, 12), 3.0],
        [at(22, 23, 54), 4.567],
        [at(22, 23, 55), 0.4],
        [at(23, 0, 5), 0.4],
        [at(23, 0, 10), 0.4],
    ];
    const daily = dailyFromCounter(pts, days);
    check('(a) day value is the maximum, not the last point', near(daily[idx(22)], 4.567), String(daily[idx(22)]));
    const wm = [
        [at(22, 10), 2],
        [at(22, 12), 4],
        [at(22, 23, 54), 15.132],
        [at(22, 23, 55), 0.3],
        [at(23, 0, 10), 0.3],
    ];
    const r = buildEnergy({ pHeizen: pts, pWw: [], wmHeizen: wm, wmWw: [] }, NOW);
    const d22 = r.days[idx(22)];
    const d23 = r.days[idx(23)];
    check('(a) 22.10. is a heating day with the maximum', d22.heatDay && near(d22.hs, 4.567) && near(d22.hw, 15.132));
    check('(a) the remainder does not count on the following day', !d23.heatDay && d23.hs === 0 && d23.hw === 0);
}

// -- (b) day without points ---------------------------------------------------------------------
{
    const daily = dailyFromCounter([[at(21, 10), 5]], days);
    check(
        '(b) day without points is 0 (no carry-over)',
        daily[idx(22)] === 0 && daily[idx(23)] === 0 && near(daily[idx(21)], 5),
    );
}

// -- (c) single repeated point -> no heating day ------------------------------------------------------
{
    const p = [
        [at(17, 7, 18), 0.818],
        [at(17, 7, 20), 0.818],
    ];
    const w = [
        [at(17, 7, 18), 0.418],
        [at(17, 7, 20), 0.418],
    ];
    const r = buildEnergy({ pHeizen: p, pWw: [], wmHeizen: w, wmWw: [] }, NOW);
    const d = r.days[idx(17)];
    check('(c) repeated point is no heating day, hs = hw = 0', !d.heatDay && d.hs === 0 && d.hw === 0);
}

// -- (d) only electricity rises ----------------------------------------------------------------------
{
    const w = [
        [at(20, 7), 3],
        [at(20, 9), 3],
        [at(20, 11), 3],
    ];
    const r = buildEnergy({ pHeizen: ramp(20, 4), pWw: [], wmHeizen: w, wmWw: [] }, NOW);
    const d = r.days[idx(20)];
    check('(d) electricity rises, heat does not -> no heating day', !d.heatDay && d.hs === 0 && d.hw === 0);
}

// -- (d2) hot water: only heat rises -> ws = ww = 0 ----------------------------------------------------
{
    const p = [
        [at(20, 7), 2],
        [at(20, 9), 2],
    ];
    const r1 = buildEnergy({ pHeizen: [], pWw: p, wmHeizen: [], wmWw: ramp(20, 4) }, NOW);
    const d1 = r1.days[idx(20)];
    check('(d2) only heat rises -> hot water ws = ww = 0', d1.ws === 0 && d1.ww === 0);
    const r2 = buildEnergy({ pHeizen: [], pWw: ramp(20, 4), wmHeizen: [], wmWw: ramp(20, 9) }, NOW);
    const d2 = r2.days[idx(20)];
    const sumRow = (r) => r.hourly[idx(20)].reduce((a, b) => a + b, 0);
    check('(d2) only heat rises -> heatmap row is 0', sumRow(r1) === 0);
    const r3 = buildEnergy({ pHeizen: [], pWw: ramp(20, 4), wmHeizen: [], wmWw: p }, NOW);
    check(
        '(d2) only electricity rises -> hot water 0 and heatmap row is 0',
        r3.days[idx(20)].ws === 0 && sumRow(r3) === 0,
    );
    check('(d2) both rise -> hot water counts', near(d2.ws, 4) && near(d2.ww, 9));
}

// -- (d3) read glitch in the middle of the day is not a reset -----------------------------------------
{
    const pts = [
        [at(23, 17, 0), 5.0],
        [at(23, 17, 10), 5.886],
        [at(23, 17, 17), 5.006], // glitch: 85 % of the previous value
        [at(23, 17, 20), 6.006],
        [at(23, 18, 0), 7.0],
    ];
    const g = hourlyIncrements(pts, days);
    const sum = g[idx(23)].reduce((a, b) => a + b, 0);
    check('(d3) glitch is skipped: increments add up to max - start (2.0)', near(sum, 2.0), String(sum));
    const real = [
        [at(23, 10), 3.0],
        [at(23, 12), 4.0],
        [at(23, 23, 54), 4.5],
        [at(23, 23, 55), 0.3],
        [at(23, 23, 58), 0.9],
    ];
    const g2 = hourlyIncrements(real, days);
    const s2 = g2[idx(23)].reduce((a, b) => a + b, 0);
    check('(d3) real reset (below 50 %) still ends counting', near(s2, 1.5), String(s2));
}

// -- (e) 25-hour day on 25.10.2026 -------------------------------------------------------------------
{
    const n2 = new Date(2026, 9, 26, 12, 0, 0).getTime();
    const ld = localDays(n2);
    const i25 = ld.findIndex((x) => x.key === '2026-10-25');
    const i26 = ld.findIndex((x) => x.key === '2026-10-26');
    const t2230 = Date.UTC(2026, 9, 25, 22, 30); // 23:30 CET on 25.10.
    check('(e) 23:30 CET belongs to 25.10.', dayKey(t2230) === '2026-10-25');
    check(
        '(e) 26.10. starts at 23:00 UTC',
        ld[i26].start === Date.UTC(2026, 9, 25, 23, 0),
        new Date(ld[i26].start).toISOString(),
    );
    check('(e) 25.10. is 25 hours long', ld[i25].end - ld[i25].start === 25 * 3600_000);
    const first02 = Date.UTC(2026, 9, 25, 0, 10); // 02:10 CEST
    const second02 = Date.UTC(2026, 9, 25, 1, 40); // 02:40 CET
    check('(e) both hours 02 are hour 2', hourOf(first02) === 2 && hourOf(second02) === 2);
    const pts = [
        [Date.UTC(2026, 9, 24, 22, 30), 0.5], // 00:30 CEST
        [first02, 1.0],
        [second02, 1.5],
        [t2230, 2.0],
    ];
    const grid = hourlyIncrements(pts, ld);
    check(
        '(e) both increments at 02 o-clock land in cell 2',
        near(grid[i25][2], 1.0) && grid[i25][0] === 0 && near(grid[i25][23], 0.5),
        JSON.stringify(grid[i25].slice(0, 4)),
    );
}

// -- (f) increment of 3 kWh or more is discarded in the heatmap ---------------------------------------
{
    const pts = [
        [at(21, 8), 1.0],
        [at(21, 9), 4.5], // +3.5 -> discarded
        [at(21, 10), 5.5], // +1.0 -> counts
    ];
    const g = hourlyIncrements(pts, days);
    check(
        '(f) +3.5 kWh discarded, +1.0 kept',
        g[idx(21)][9] === 0 && near(g[idx(21)][10], 1.0),
        JSON.stringify(g[idx(21)].slice(8, 11)),
    );
}

// -- (g) lifetime table with today's real meter readings ----------------------------------------------
{
    const t = lifetimeTable({ pHeizen: 17.331, pWw: 11.922, wmHeizen: 51.256, wmWw: 21.709 });
    check(
        '(g) lifetime AZ 2.96 / 1.82 / 2.49',
        near(t.azHeizen, 2.96, 0.005) && near(t.azWw, 1.82, 0.005) && near(t.azGesamt, 2.49, 0.005),
        `${t.azHeizen?.toFixed(3)} / ${t.azWw?.toFixed(3)} / ${t.azGesamt?.toFixed(3)}`,
    );
}

// -- (h) 30-day heating COP from the sketch values ------------------------------------------------------
{
    const pH = [...ramp(21, 6.054), ...ramp(22, 4.567), ...ramp(24, 2.397)];
    const wH = [...ramp(21, 18.261), ...ramp(22, 15.132), ...ramp(24, 6.199)];
    const r = buildEnergy({ pHeizen: pH, pWw: [], wmHeizen: wH, wmWw: [] }, NOW);
    check('(h) heating COP over 30 days = 3.04', near(r.totals.azHeizen, 3.04, 0.005), String(r.totals.azHeizen));
    check(
        '(h) three heating days, today is partial',
        r.totals.heatDays === 3 && r.days[29].partial && r.days[29].heatDay,
    );
    check(
        '(h) no warm water -> WW share 0 %, heating COP = total COP',
        near(r.totals.wwAnteil, 0) && near(r.totals.azGesamt, 3.04, 0.005),
    );
    const sumCells = r.hourly[idx(21)].reduce((a, b) => a + b, 0);
    check('(h) heatmap day sum is close to the day value', Math.abs(sumCells - 6.054) <= 1, String(sumCells));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
