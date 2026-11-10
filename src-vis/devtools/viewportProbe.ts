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

// Zwei Test-Schalter für die Frage „Braucht die Homescreen-App die Zusatzhöhe
// unten noch?" (05.11.2026). Beide wirken nur über Klassen an <html>:
//   aura-probe-ext     erzwingt die alte Höhe 100dvh + safe-area-inset-bottom
//   aura-probe-magenta färbt html/body knallig – alles, was die App nicht
//                      bedeckt, leuchtet dann pink (Diagnose-Weg vom Juli)
function installTestStyles(): void {
    const st = document.createElement('style');
    st.textContent =
        'html.aura-probe-ext:has(.aura-page), html.aura-probe-ext:has(.aura-page) body {' +
        'height: calc(100dvh + env(safe-area-inset-bottom)) !important;' +
        'min-height: calc(100dvh + env(safe-area-inset-bottom)) !important; }' +
        'html.aura-probe-magenta, html.aura-probe-magenta body { background: #ff00ff !important; }' +
        // Flächen färben: jede Zone der Oberfläche in eigener Farbe (Legende im Messfenster)
        'html.aura-probe-zones body::before, html.aura-probe-zones body::after {' +
        'content:"";position:fixed;left:0;right:0;z-index:2147482000;pointer-events:none; }' +
        'html.aura-probe-zones body::before { top:0;height:env(safe-area-inset-top);background:rgba(255,0,0,.45); }' +
        'html.aura-probe-zones body::after { bottom:0;height:env(safe-area-inset-bottom);background:rgba(255,0,0,.45); }' +
        'html.aura-probe-zones .aura-page { background: #ffe600 !important; }' +
        'html.aura-probe-zones .aura-fl-header, html.aura-probe-zones .aura-header { background: rgba(0,120,255,.5) !important; }' +
        'html.aura-probe-zones .ios-bar { background: rgba(255,140,0,.6) !important; }' +
        'html.aura-probe-zones .aura-scroll-touch { background: rgba(0,200,90,.35) !important; }' +
        'html.aura-probe-zones .aura-fl-page { background: rgba(0,200,200,.9) !important; }' +
        'html.aura-probe-zones .aura-fl-tabbar { background: rgba(170,0,255,.55) !important; }' +
        'html.aura-probe-zones .aura-widget { outline: 1px dashed rgba(0,0,0,.6); outline-offset: -1px; }';
    document.head.appendChild(st);
}

function mount(): void {
    installTestStyles();
    const sa = safeAreaProbe();
    const root = document.documentElement;

    const panel = document.createElement('div');
    panel.setAttribute('data-aura-probe', '');
    // Offen: Kasten am rechten Rand. Eingeklappt: nur ein gelber Punkt am rechten Rand.
    const OPEN_CSS =
        'position:fixed;right:calc(6px + env(safe-area-inset-right));top:calc(56px + env(safe-area-inset-top));' +
        'width:min(330px, calc(100vw - 12px));box-sizing:border-box;' +
        'z-index:2147483000;background:rgba(10,10,10,0.88);color:#e5e7eb;border:1px solid #facc15;' +
        'border-radius:10px;padding:8px 10px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'white-space:pre-wrap;word-break:break-all;max-height:60vh;overflow:auto;';
    const FOLDED_CSS =
        'position:fixed;right:calc(3px + env(safe-area-inset-right));top:calc(42% + 62px);' +
        'z-index:2147483000;width:22px;height:22px;border-radius:50%;overflow:hidden;opacity:.85;' +
        'background:rgba(10,10,10,0.75);border:1.5px dashed #facc15;padding:0;';
    const FOLD_KEY = 'aura.probe.folded';
    const ZONES_KEY = 'aura.probe.zones';
    const recall = (key: string, fallback: boolean): boolean => {
        try {
            const v = localStorage.getItem(key);
            return v === null ? fallback : v === '1';
        } catch {
            return fallback;
        }
    };
    const remember = (key: string, on: boolean): void => {
        try {
            localStorage.setItem(key, on ? '1' : '0');
        } catch {
            /* privater Modus */
        }
    };
    if (recall(ZONES_KEY, false)) root.classList.add('aura-probe-zones');

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

    let collapsed = recall(FOLD_KEY, true);
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
    const btnExt = mkBtn('', () => {
        root.classList.toggle('aura-probe-ext');
        render();
    });
    const btnMagenta = mkBtn('', () => {
        root.classList.toggle('aura-probe-magenta');
        render();
    });
    const btnZones = mkBtn('', () => {
        remember(ZONES_KEY, root.classList.toggle('aura-probe-zones'));
        render();
    });
    const btnFold = mkBtn('Einklappen', () => {
        collapsed = !collapsed;
        remember(FOLD_KEY, collapsed);
        render();
    });
    bar.append(btnFix, btnReset, btnExt, btnMagenta, btnZones, btnFold);
    panel.append(text, bar);
    document.body.appendChild(panel);

    function render(): void {
        const f = topFix();
        btnFix.textContent = f ? `Korrektur: ${f.enabled ? 'an' : 'aus'}` : 'Korrektur: fehlt';
        btnFix.disabled = !f;
        btnExt.textContent = `Verlängerung: ${root.classList.contains('aura-probe-ext') ? 'an (alt)' : 'aus (neu)'}`;
        btnMagenta.textContent = `Rand färben: ${root.classList.contains('aura-probe-magenta') ? 'an' : 'aus'}`;
        const zones = root.classList.contains('aura-probe-zones');
        btnZones.textContent = `Flächen färben: ${zones ? 'an' : 'aus'}`;
        for (const b of [btnFix, btnReset, btnExt, btnMagenta, btnZones]) b.style.display = collapsed ? 'none' : '';
        panel.style.cssText = collapsed ? FOLDED_CSS : OPEN_CSS;
        bar.style.marginTop = collapsed ? '0' : '6px';
        text.style.display = collapsed ? 'none' : '';
        btnFold.textContent = collapsed ? 'M' : 'Einklappen';
        btnFold.title = collapsed ? 'Aura-Messfenster öffnen (nur Dev)' : '';
        btnFold.style.cssText = collapsed
            ? 'font:600 10px/1 ui-monospace,Menlo,monospace;width:100%;height:19px;padding:0;border:none;' +
              'background:transparent;color:#facc15;'
            : 'font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #facc15;' +
              'background:transparent;color:#facc15;';
        if (collapsed) return;

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
            `Seitenhoehe ${px(root.getBoundingClientRect().height)}  Fenster ${window.innerHeight}  ` +
                `Ueberhang ${px(root.getBoundingClientRect().height - window.innerHeight)}`,
            `Kopfzeile ${rectTop('.aura-header')}  Streifen ${rectTop('#aura-topedge')}`,
            f
                ? `Korrektur ${f.enabled ? 'an' : 'aus'}: Pruefungen ${f.checks}, Eingriffe ${f.resets}`
                : 'Korrektur: nicht aktiv (kein iOS-Homescreen)',
        ];
        if (zones) {
            lines.push(
                'Farben: rot Notch/Home-Balken · blau Kopf · orange Kopf Unterseite',
                '  grün Scrollbereich · gelb Seitengrund · türkis Einstellungsseite · lila Leiste',
            );
        }
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
