'use strict';

// Warms up the socket.io backend (web.0) with ONE request after it (re)started.
//
// Measured 25.10.2026 on the Pi: a freshly started web.0 (8.0.0) stalls for
// 20–70 s when its very first client fires hundreds of subscribe/getState/
// getObject at once (what the app does on start). A single request answered
// beforehand makes the same burst complete in ~2 s. So aura sends that single
// request itself, before any app reconnects.
//
// Speaks engine.io v3 / socket.io v2 directly over Node's built-in WebSocket
// (Node >= 22), so no extra dependency is needed. That is the protocol of the
// socket.io 2.5.0 client web.0 serves to the app. web.0 joins the default
// namespace on its own (it sends "40"), so the client must not send "40":
// under EIO=4 that opened a second namespace connection that never logged a
// disconnect (seen 25.10.2026).

/**
 * One connection attempt: connect, getState(stateId), wait for the ack, close.
 *
 * @param {object} o           options
 * @param {string} o.url        ws://host:port
 * @param {string} o.stateId    state to read
 * @param {number} o.timeoutMs  give up after this long
 * @returns {Promise<void>}
 */
function warmOnce({ url, stateId, timeoutMs }) {
    return new Promise((resolve, reject) => {
        let ws;
        let settled = false;
        let emitted = false;
        const finish = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            try {
                ws.close();
            } catch {
                /* ignore */
            }
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        };
        const timer = setTimeout(() => finish(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
        try {
            ws = new WebSocket(`${url}/socket.io/?EIO=3&transport=websocket`);
        } catch (e) {
            finish(e);
            return;
        }
        ws.onmessage = (m) => {
            const d = String(m.data);
            if (d.startsWith('40') && !emitted) {
                // namespace joined → send the single request
                emitted = true;
                ws.send(`421${JSON.stringify(['getState', stateId])}`);
            } else if (d.startsWith('431')) {
                finish();
            } else if (d.startsWith('44')) {
                finish(new Error(`connect refused: ${d.slice(2, 200)}`));
            }
        };
        ws.onerror = (e) => finish(new Error(e?.message || 'websocket error'));
        ws.onclose = () => finish(new Error('closed before answer'));
    });
}

/**
 * Retries warmOnce until the backend answers. Needed because the adapter's
 * `alive` flag turns true ~0.5 s before the socket.io server listens.
 *
 * @param {object} o                   options
 * @param {string} o.host              backend host
 * @param {number} o.port              backend port
 * @param {string} [o.stateId]         state to read
 * @param {number} [o.maxWaitMs]        total budget
 * @param {number} [o.retryDelayMs]     pause between failed attempts
 * @param {number} [o.attemptTimeoutMs] per attempt
 * @param {() => boolean} [o.isCancelled] stops retrying when true
 * @returns {Promise<{ms: number, attempts: number}>} time until the answer and number of attempts
 */
async function warmUpSocketBackend({
    host,
    port,
    stateId = 'system.config',
    maxWaitMs = 60000,
    retryDelayMs = 250,
    attemptTimeoutMs = 20000,
    isCancelled = () => false,
}) {
    if (typeof WebSocket === 'undefined') {
        throw new Error('no built-in WebSocket (Node < 22)');
    }
    const hostPart = host && host.includes(':') ? `[${host}]` : host;
    const url = `ws://${hostPart}:${port}`;
    const t0 = Date.now();
    let attempts = 0;
    let lastErr;
    while (Date.now() - t0 < maxWaitMs) {
        if (isCancelled()) {
            throw new Error('cancelled');
        }
        attempts++;
        try {
            await warmOnce({ url, stateId, timeoutMs: attemptTimeoutMs });
            return { ms: Date.now() - t0, attempts };
        } catch (e) {
            lastErr = e;
        }
        await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    throw new Error(`gave up after ${attempts} attempts: ${lastErr ? lastErr.message : 'timeout'}`);
}

module.exports = { warmUpSocketBackend };
