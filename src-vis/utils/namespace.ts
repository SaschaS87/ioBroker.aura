/**
 * Runtime ioBroker instance namespace ("aura.0", "aura.1", ...).
 *
 * Injected by the adapter's HTTP server into index.html as
 * `window.__AURA_NAMESPACE__` (see serveStatic in main.js). The fallback to
 * 'aura.0' is only relevant in dev (Vite) where the HTML is not pre-processed
 * by the adapter — in that mode dev-proxy still talks to the primary instance.
 */
declare global {
    interface Window {
        __AURA_NAMESPACE__?: string;
    }
}

// Dev only: the adapter never pre-processes index.html here, so nothing is
// injected and the preview would always land on the production instance.
// VITE_AURA_NAMESPACE (set in .env.local, not checked in) points it at a second
// instance instead — see "Umsetzung - Zweite Aura-Instanz (Weg C)".
// Production is untouched: import.meta.env.DEV folds to false at build time,
// leaving the injected value and the 'aura.0' fallback exactly as before.
// Written as two whole expressions rather than one with an extra `||` link, so
// the production branch is literally the line that stood here before — the
// build output stays byte-for-byte identical, which is easy to verify.
export const NS: string = import.meta.env.DEV
    ? (typeof window !== 'undefined' && window.__AURA_NAMESPACE__) || import.meta.env.VITE_AURA_NAMESPACE || 'aura.0'
    : (typeof window !== 'undefined' && window.__AURA_NAMESPACE__) || 'aura.0';
