// ─────────────────────────────────────────────────────────────────────────────
// DEV-only Ereignisprotokoll für Glas-Leiste und Einrasten des großen Titels
// ─────────────────────────────────────────────────────────────────────────────
// Gebaut für den Fehler „Inhalt springt nach schnellem Wischen zurück, die
// Leiste wird wieder groß" (17.11.2026, iPhone-Homescreen-App). Am PC lässt
// sich das Ausrollen von iOS nicht nachstellen, deshalb schreibt die App am
// iPhone jedes Scroll-, Touch- und Einrast-Ereignis mit Zeitstempel mit und
// schickt es gesammelt an den Dev-Server (vite.config.ts, /api/dev/scrolltrace).
// Dort landet es in `.vite-scrolltrace.log` im Projektordner.
//
// Alle Aufrufe stehen hinter `import.meta.env.DEV`; der Produktions-Build
// enthält diese Datei nicht.

interface TraceEvent {
    t: number;
    k: string;
    [key: string]: unknown;
}

let buf: TraceEvent[] = [];
let timer: number | undefined;
const t0 = Math.round(performance.now());

function flush(): void {
    if (!buf.length) return;
    const events = buf;
    buf = [];
    const standalone =
        (navigator as unknown as { standalone?: boolean }).standalone === true ||
        matchMedia('(display-mode: standalone)').matches;
    void fetch('/api/dev/scrolltrace', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ at: new Date().toISOString(), t0, standalone, ua: navigator.userAgent, events }),
    }).catch(() => undefined);
}

/** Ein Ereignis merken; 1,5 s nach dem letzten Ereignis geht der Block an den Dev-Server. */
export function flTrace(k: string, data: Record<string, unknown> = {}): void {
    if (!import.meta.env.DEV) return;
    buf.push({ t: Math.round(performance.now()) - t0, k, ...data });
    if (buf.length > 4000) buf.splice(0, buf.length - 4000);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 1500);
}
