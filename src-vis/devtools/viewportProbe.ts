// ─────────────────────────────────────────────────────────────────────────────
// DEV-only Messfenster für die iPhone-Homescreen-App
// ─────────────────────────────────────────────────────────────────────────────
// Zeigt live, wo iOS das Fenster und die Seite hinlegt. Gebaut für den Fehler
// „Kopfzeile nach dem Drehen weg" (05.11.2026): quer und wieder hoch gedreht,
// danach liegt die Kopfzeile dauerhaft über dem Bildschirmrand.
//
// Wird nur im Dev-Server geladen (main.tsx, import.meta.env.DEV) und nur, wenn
// die Seite als Homescreen-App läuft oder ?probe=1 in der Adresse steht. Der
// Produktions-Build enthält diese Datei nicht.
//
// Liest außerdem window.__auraTopFix aus index.html: Jeder Eingriff der
// Korrektur steht dort mit Vorher/Nachher-Werten. Über den Knopf „Korrektur"
// lässt sie sich für einen Testlauf abschalten, damit der Fehler sichtbar
// bleibt, und „Seite auf 0" setzt die Verschiebung einmal von Hand zurück.

interface TopFixEntry {
    reason: string;
    at: string;
    before: Record<string, number | string>;
    after: Record<string, number | string> | null;
}
interface TopFix {
    enabled: boolean;
    checks: number;
    resets: number;
    log: TopFixEntry[];
    check?: (reason: string) => void;
}

const topFix = (): TopFix | undefined => (window as unknown as { __auraTopFix?: TopFix }).__auraTopFix;

function safeAreaProbe(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
        'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
    document.body.appendChild(el);
    return el;
}

function px(v: number): string {
    return String(Math.round(v));
}

function rectTop(selector: string): string {
    const el = document.querySelector(selector);
    if (!el) return '–';
    const r = el.getBoundingClientRect();
    return `${px(r.top)}..${px(r.bottom)}`;
}

function fmt(m: Record<string, number | string> | null): string {
    if (!m) return '…';
    return `y=${m.scrollY} x=${m.scrollX} body=${m.bodyTop} vv=${m.vvTop} win=${m.win}`;
}

function mount(): void {
    const sa = safeAreaProbe();

    const panel = document.createElement('div');
    panel.setAttribute('data-aura-probe', '');
    panel.style.cssText =
        'position:fixed;left:32px;right:32px;bottom:calc(12px + env(safe-area-inset-bottom));' +
        'z-index:2147483000;background:rgba(10,10,10,0.88);color:#e5e7eb;border:1px solid #facc15;' +
        'border-radius:10px;padding:8px 10px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'white-space:pre-wrap;word-break:break-all;max-height:45vh;overflow:auto;';

    const text = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';

    const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText =
            'font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #facc15;' +
            'background:transparent;color:#facc15;';
        b.addEventListener('click', onClick);
        return b;
    };

    let collapsed = false;
    const btnFix = mkBtn('', () => {
        const f = topFix();
        if (f) f.enabled = !f.enabled;
        render();
    });
    const btnReset = mkBtn('Seite auf 0', () => {
        window.scrollTo(0, 0);
        const se = document.scrollingElement ?? document.documentElement;
        se.scrollTop = 0;
        document.body.scrollTop = 0;
        render();
    });
    const btnFold = mkBtn('Einklappen', () => {
        collapsed = !collapsed;
        render();
    });
    bar.append(btnFix, btnReset, btnFold);
    panel.append(text, bar);
    document.body.appendChild(panel);

    function render(): void {
        const f = topFix();
        btnFix.textContent = f ? `Korrektur: ${f.enabled ? 'an' : 'aus'}` : 'Korrektur: fehlt';
        btnFix.disabled = !f;
        btnReset.style.display = collapsed ? 'none' : '';
        btnFold.textContent = collapsed ? 'Messwerte' : 'Einklappen';
        if (collapsed) {
            text.textContent = `Aura-Messfenster · Eingriffe ${f?.resets ?? 0}`;
            return;
        }

        const vv = window.visualViewport;
        const se = document.scrollingElement ?? document.documentElement;
        const cs = getComputedStyle(sa);
        const orient =
            (window.innerWidth > window.innerHeight ? 'quer' : 'hoch') +
            (screen.orientation ? ` (${screen.orientation.type})` : '');
        const standalone =
            (navigator as unknown as { standalone?: boolean }).standalone === true ||
            matchMedia('(display-mode: standalone)').matches;

        const lines = [
            `Aura-Messfenster (nur Dev)  ${new Date().toLocaleTimeString()}`,
            `Lage ${orient}  standalone=${standalone ? 'ja' : 'nein'}`,
            `Fenster ${window.innerWidth}x${window.innerHeight}  Screen ${screen.width}x${screen.height}`,
            `Seite verschoben: scrollY=${px(window.scrollY)} scrollX=${px(window.scrollX)}`,
            `  scrollingElement.top=${px(se.scrollTop)} body.top=${px(document.body.scrollTop)}`,
            vv
                ? `visualViewport: top=${px(vv.offsetTop)} h=${px(vv.height)} scale=${vv.scale.toFixed(2)}`
                : 'visualViewport: –',
            `Safe-Area T=${px(parseFloat(cs.paddingTop))} B=${px(parseFloat(cs.paddingBottom))} ` +
                `L=${px(parseFloat(cs.paddingLeft))} R=${px(parseFloat(cs.paddingRight))}`,
            `html ${rectTop('html')}  body ${rectTop('body')}`,
            `Kopfzeile ${rectTop('.aura-header')}  Streifen ${rectTop('#aura-topedge')}`,
            f
                ? `Korrektur ${f.enabled ? 'an' : 'aus'}: Pruefungen ${f.checks}, Eingriffe ${f.resets}`
                : 'Korrektur: nicht aktiv (kein iOS-Homescreen)',
        ];
        for (const e of f?.log.slice(0, 4) ?? []) {
            lines.push(`  ${e.at} ${e.reason}`, `    vorher  ${fmt(e.before)}`, `    nachher ${fmt(e.after)}`);
        }
        text.textContent = lines.join('\n');
    }

    render();
    setInterval(render, 300);
}

if (document.body) mount();
else document.addEventListener('DOMContentLoaded', mount, { once: true });

export {};
