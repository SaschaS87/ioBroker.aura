/**
 * UI-Facelift (Entwurf): durchscheinender Kopf mit großem Titel darunter. Scrollt der Inhalt unter den
 * Kopf, wandert der Titel klein in die Kopfzeile und die Kopfzeile wird niedriger. Unten schwebt die
 * Glas-Leiste. Der Inhalt scrollt unter beiden hindurch.
 *
 * Alle Farben kommen aus Theme-Variablen mit Rückfallkette (--fl-* → --nav-* → --app-*), damit
 * sie sich später im Backend je Theme anpassen lassen. Jedes Element trägt eine eigene Klasse
 * `aura-fl-…` (siehe facelift.css).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { flTrace } from '../../../devtools/scrollTrace';
import { Icon } from '@iconify/react';
import { Wrench } from 'lucide-react';
import type { WidgetProps } from '../../../types';
import { IosFootnote, IosGroup, IosNavBar, IosNavRow } from '../../common/ios';
import { DeviceSettingsWidget } from '../../widgets/DeviceSettingsWidget';
import type { Tab } from '../../../store/dashboardStore';
import { FACELIFT_KEY, useFaceliftPreviewStore } from '../../../themes/faceliftPreview';
import {
    FaceliftVariantContext,
    parseChoice,
    type FaceliftChoice,
    type FaceliftVariant,
} from './faceliftVariant';
import { WOHNKLIMA_DRAFTS, useWohnklimaDraftStore } from '../../widgets/wohnklima/wohnklimaDraft';
import { HEIZUNG_DRAFTS, HZ_PICK, useHeizungDraftStore } from '../../widgets/heating/heizungDraft';
import { GARTEN_DRAFTS, useGartenDraftStore } from '../../widgets/garten2/gartenDraft';
import './facelift.css';
import './facelift-blocks.css';

const KEY = FACELIFT_KEY;
export type { FaceliftChoice } from './faceliftVariant';
/** Dauer des Herein- und Hinausfahrens der Einstellungsseite; muss zu .aura-fl-page in facelift.css passen */
const PAGE_MS = 420;

/** Wahl des Entwurfs-Umschalters, nur in der Dev-Vorschau. */
export function useFaceliftChoice(): [FaceliftChoice, (c: FaceliftChoice) => void] {
    const [choice, setChoice] = useState<FaceliftChoice>(() => {
        try {
            return parseChoice(localStorage.getItem(KEY));
        } catch {
            return 'NEU';
        }
    });
    const set = (c: FaceliftChoice) => {
        setChoice(c);
        // Farben der Vorschau mit umschalten (iOS-Themes nur bei „Neu")
        useFaceliftPreviewStore.getState().setNeu(c !== 'IST');
        try {
            localStorage.setItem(KEY, c);
        } catch {
            /* privater Modus */
        }
    };
    return [choice, set];
}

/**
 * Gelber Entwurfs-Umschalter – existiert nur in der Dev-Vorschau, nie im Pi-Build. Ein kleiner Kreis
 * (verdeckt die Pfeiltasten der Seite nicht); ein Tipp wechselt zwischen „Ist" und „Neu".
 */
export function FaceliftSwitch({
    choice,
    onChange,
    tabSlug,
}: {
    choice: FaceliftChoice;
    onChange: (c: FaceliftChoice) => void;
    /** Aktive Seite: Auf Wohnklima stehen bei „Neu" zusätzlich die Entwürfe der Seite (Entwurfsphase). */
    tabSlug?: string | null;
}) {
    const wkDraft = useWohnklimaDraftStore((s) => s.draft);
    const setWkDraft = useWohnklimaDraftStore((s) => s.setDraft);
    const showWk = tabSlug === 'wohnklima' && choice !== 'IST';
    const hzDraft = useHeizungDraftStore((s) => s.draft);
    const setHzDraft = useHeizungDraftStore((s) => s.setDraft);
    // Heizung entschieden (14.11.2026): Buchstaben abgeschaltet, mit HZ_PICK wieder sichtbar
    const showHz = HZ_PICK && tabSlug === 'heizung' && choice !== 'IST';
    // Garten, Entwurfsphase: Buchstaben nur auf dem Garten-Tab
    const gfDraft = useGartenDraftStore((s) => s.draft);
    const setGfDraft = useGartenDraftStore((s) => s.setDraft);
    const showGf = tabSlug === 'garten' && choice !== 'IST';
    return (
        <div className="aura-fl-switch" title="Entwurfs-Umschalter, nur lokal">
            <button
                type="button"
                data-on
                aria-label="Zwischen Ist und Neu wechseln"
                onClick={() => onChange(choice === 'IST' ? 'NEU' : 'IST')}
            >
                {choice === 'IST' ? 'Ist' : 'Neu'}
            </button>
            {showWk && (
                <span className="aura-fl-switch-drafts" role="group" aria-label="Entwürfe der Wohnklima-Seite">
                    {WOHNKLIMA_DRAFTS.map((d) => (
                        <button
                            key={d.key}
                            type="button"
                            className="aura-fl-switch-draft"
                            data-sel={d.key === wkDraft || undefined}
                            aria-pressed={d.key === wkDraft}
                            title={d.name}
                            onClick={() => setWkDraft(d.key)}
                        >
                            {d.label}
                        </button>
                    ))}
                </span>
            )}
            {showGf && (
                <span className="aura-fl-switch-drafts" role="group" aria-label="Entwürfe der Garten-Seite">
                    {GARTEN_DRAFTS.map((d) => (
                        <button
                            key={d.key}
                            type="button"
                            className="aura-fl-switch-draft"
                            data-sel={d.key === gfDraft || undefined}
                            aria-pressed={d.key === gfDraft}
                            title={d.name}
                            onClick={() => setGfDraft(d.key)}
                        >
                            {d.label}
                        </button>
                    ))}
                </span>
            )}
            {showHz && (
                <span className="aura-fl-switch-drafts" role="group" aria-label="Entwürfe der Heizungs-Seite">
                    {HEIZUNG_DRAFTS.map((d) => (
                        <button
                            key={d.key}
                            type="button"
                            className="aura-fl-switch-draft"
                            data-sel={d.key === hzDraft || undefined}
                            aria-pressed={d.key === hzDraft}
                            title={d.name}
                            onClick={() => setHzDraft(d.key)}
                        >
                            {d.label}
                        </button>
                    ))}
                </span>
            )}
        </div>
    );
}

/** Rückfall-Symbole, solange im Backend am Tab noch keines hinterlegt ist. */
const FALLBACK_ICONS: Record<string, string> = {
    rollos: 'lucide:blinds',
    wohnklima: 'lucide:thermometer',
    heizung: 'lucide:flame',
    garten: 'lucide:sprout',
    wetter: 'lucide:cloud-sun',
};

/**
 * Bühne: füllt den Platz unter der Statusleiste. Kopf und Leiste liegen darüber, der Scroll-Container
 * des Dashboards (.aura-scroll-touch) bekommt per CSS oben und unten Luft. Die Scrollposition wird
 * ohne React-Render als Attribut gesetzt; der große Titel hängt im Scroll-Container und scrollt selbst mit.
 */
export function FaceliftStage({
    enabled,
    title,
    appTitle,
    left,
    right,
    tabs,
    activeTabId,
    onTabClick,
    settingsOpen,
    onSettingsClose,
    adminHref,
    variant,
    children,
}: {
    enabled: boolean;
    /** Gewählter Entwurf (nur Dev-Vorschau); steht als data-fl-variant am <body>, damit er auch Pop-ups erreicht. */
    variant?: FaceliftVariant | null;
    title: string;
    appTitle: string;
    left?: ReactNode;
    right?: ReactNode;
    tabs: Tab[];
    activeTabId: string | null | undefined;
    onTabClick: (tab: Tab) => void;
    /** Einstellungsseite der App (Hell/Dunkel …) liegt als Unterseite über dem Inhalt. */
    settingsOpen?: boolean;
    onSettingsClose?: () => void;
    /** Weg in den Admin-Bereich, als Zeile auf der Einstellungsseite. */
    adminHref?: string;
    children: ReactNode;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    // Scroll-Container des Dashboards: Der große Titel wird dort hineingehängt und scrollt dadurch mit dem
    // Inhalt selbst mit. Früher lag er außerhalb und wurde per Skript nachgeführt; beim Zurückfedern nach
    // dem Überziehen (iOS) kam das Skript nicht Bild für Bild hinterher, der Titel ruckelte.
    const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
    // Scrollposition je Tab. Auf dem Handy teilen sich alle Tabs einen Scroll-Container, nur der Inhalt
    // wechselt; ohne das stand der neue Tab an der Stelle des alten (Sascha, 18.11.2026). Wie in iOS behält
    // jeder Tab seine eigene Lage, ein noch nicht besuchter Tab beginnt oben.
    const tabPos = useRef(new Map<string, number>());
    const tabRef = useRef(activeTabId ?? '');
    const restoring = useRef(false);

    useEffect(() => {
        const stage = stageRef.current;
        if (!enabled || !stage) return;
        let lastY = 0;
        const apply = (raw: number, max: number, fresh = false) => {
            // Gummiband von iOS: Über das Seitenende hinaus gezogen meldet scrollTop mehr als das Maximum
            // (am Anfang weniger als 0) und federt danach zurück. Dieses Zurückfedern sah für die Leiste wie
            // Hochscrollen aus, sie wurde wieder groß (Messung am iPhone 18.11.2026: Seitenende 61 px,
            // Ausrollen bis 127 px, zurück auf 61 px). Deshalb nur die Lage innerhalb der Seite auswerten.
            const y = Math.min(Math.max(raw, 0), Math.max(max, 0));
            stage.toggleAttribute('data-scrolled', y > 4);
            stage.toggleAttribute('data-collapsed', y > 34);
            // Tabwechsel: Jeder Tab behält seine Scrollposition. Die neue Seite ist kein Scrollen; Leiste groß,
            // Vergleichswert auf die neue Lage. Vorher stand lastY auf 0, eine gemerkte Lage von 61 px galt als
            // Runterscrollen und die Leiste wurde klein (Messung am iPhone 18.11.2026).
            if (fresh) {
                if (import.meta.env.DEV && stage.hasAttribute('data-min')) flTrace('bar-big', { y, fresh: true });
                stage.removeAttribute('data-min');
                lastY = y;
                return;
            }
            // Leiste wie in iOS: beim Runterscrollen klein, beim Hochscrollen wieder groß
            const wasMin = import.meta.env.DEV && stage.hasAttribute('data-min');
            if (y <= 4 || y < lastY - 6) stage.removeAttribute('data-min');
            else if (y > 40 && y > lastY + 6) stage.setAttribute('data-min', '');
            if (import.meta.env.DEV && wasMin !== stage.hasAttribute('data-min'))
                flTrace(wasMin ? 'bar-big' : 'bar-min', { y: Math.round(y), lastY: Math.round(lastY) });
            if (Math.abs(y - lastY) > 6) lastY = y;
        };
        // Einrasten wie der große Titel in iOS: Bleibt die Seite so stehen, dass die Überschrift halb unter
        // dem Kopf steckt, fährt sie von selbst ganz heraus oder ganz darunter. Die Rastposition ergibt sich
        // aus den Maßen im CSS (Kopf groß + Titel - Kopf klein), damit beide nicht auseinanderlaufen.
        const px = (name: string) => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || 0;
        let touching = false;
        let idle: number | undefined;
        let snapEl: HTMLElement | null = null;
        const snap = () => {
            const sc = snapEl;
            if (import.meta.env.DEV)
                flTrace('snap?', { y: sc ? Math.round(sc.scrollTop) : null, touching, sub: stage.hasAttribute('data-sub') });
            if (!sc || touching || !sc.isConnected || stage.hasAttribute('data-sub')) return;
            const rest = px('--fl-bar-h') + px('--fl-large-h') - px('--fl-bar-min');
            const y = sc.scrollTop;
            if (rest <= 0 || y <= 0 || y >= rest) return;
            // Seite nur ein kleines Stück scrollbar: Ohne Ausgleich gäbe es unten keine Rastposition, die
            // Überschrift bliebe halb verdeckt stehen. Ein Abstandhalter am Seitenende verlängert sie so weit,
            // dass der Titel ganz unter den Kopf passt.
            const spacer = sc.querySelector<HTMLElement>(':scope > .aura-fl-snap-spacer');
            if (spacer) {
                const natural = sc.scrollHeight - sc.clientHeight - spacer.offsetHeight;
                spacer.style.height = natural > 0 && natural < rest ? `${Math.ceil(rest - natural)}px` : '0px';
            }
            const max = sc.scrollHeight - sc.clientHeight;
            const to = y < rest / 2 || max < rest ? 0 : rest;
            const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (import.meta.env.DEV)
                flTrace('snap!', { y: Math.round(y), to, rest: Math.round(rest), max, spacer: spacer?.style.height });
            sc.scrollTo({ top: to, behavior: calm ? 'auto' : 'smooth' });
        };
        const arm = () => {
            window.clearTimeout(idle);
            idle = window.setTimeout(snap, 110);
        };
        const onScroll = (e: Event) => {
            const el = e.target as HTMLElement;
            if (!el?.classList?.contains('aura-scroll-touch')) return;
            if (import.meta.env.DEV)
                flTrace('scroll', {
                    y: Math.round(el.scrollTop * 10) / 10,
                    max: el.scrollHeight - el.clientHeight,
                    min: stage.hasAttribute('data-min') ? 1 : 0,
                });
            if (!restoring.current) tabPos.current.set(tabRef.current, el.scrollTop);
            apply(el.scrollTop, el.scrollHeight - el.clientHeight, el !== snapEl);
            snapEl = el;
            arm();
        };
        const onTouchStart = () => {
            if (import.meta.env.DEV) flTrace('touchstart');
            touching = true;
            window.clearTimeout(idle);
        };
        const onTouchEnd = (e: TouchEvent) => {
            touching = e.touches.length > 0;
            if (import.meta.env.DEV) flTrace(e.type, { left: e.touches.length });
            if (!touching) arm();
        };
        stage.addEventListener('scroll', onScroll, true);
        stage.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
        stage.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
        stage.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
        // Tabwechsel: neuer Scroll-Container, Stand neu einlesen
        const raf = requestAnimationFrame(() => {
            const sc = Array.from(stage.querySelectorAll<HTMLElement>('.aura-scroll-touch')).find(
                (el) => el.getClientRects().length > 0,
            );
            if (sc) snapEl = sc;
            apply(sc?.scrollTop ?? 0, sc ? sc.scrollHeight - sc.clientHeight : 0, true);
        });
        return () => {
            stage.removeEventListener('scroll', onScroll, true);
            stage.removeEventListener('touchstart', onTouchStart, true);
            stage.removeEventListener('touchend', onTouchEnd, true);
            stage.removeEventListener('touchcancel', onTouchEnd, true);
            window.clearTimeout(idle);
            cancelAnimationFrame(raf);
        };
    }, [activeTabId, enabled]);

    // Tabwechsel: gemerkte Lage des neuen Tabs herstellen, bevor gemalt wird. Der Inhalt kann noch nachladen
    // (Widgets, Daten); solange die Seite zu kurz ist, wird einige Bilder lang nachgezogen, bis der Finger
    // die Seite berührt.
    useLayoutEffect(() => {
        const stage = stageRef.current;
        const id = activeTabId ?? '';
        tabRef.current = id;
        if (!enabled || !stage) return;
        const sc = Array.from(stage.querySelectorAll<HTMLElement>('.aura-scroll-touch')).find(
            (el) => el.getClientRects().length > 0,
        );
        if (!sc) return;
        const want = tabPos.current.get(id) ?? 0;
        restoring.current = true;
        sc.scrollTop = want;
        let raf = 0;
        let frames = 0;
        const stop = () => {
            restoring.current = false;
            cancelAnimationFrame(raf);
            sc.removeEventListener('touchstart', stop, true);
        };
        const pull = () => {
            if (Math.abs(sc.scrollTop - want) > 1) sc.scrollTop = want;
            if (Math.abs(sc.scrollTop - want) <= 1 || ++frames > 40) {
                stop();
                tabPos.current.set(id, sc.scrollTop);
                return;
            }
            raf = requestAnimationFrame(pull);
        };
        sc.addEventListener('touchstart', stop, { passive: true, capture: true });
        raf = requestAnimationFrame(pull);
        if (import.meta.env.DEV) flTrace('tab', { id, want, now: Math.round(sc.scrollTop) });
        return stop;
    }, [activeTabId, enabled]);

    // Unterseite offen (iOS-Stapel eine Ebene tiefer oder Einstellungsseite): Dann ist der Kopf der
    // Unterseite der einzige Kopf, großer Titel und App-Kopf treten zurück, die Leiste bleibt klein.
    useEffect(() => {
        const stage = stageRef.current;
        if (!enabled || !stage) return;
        const update = () => {
            const pushed = Array.from(stage.querySelectorAll('.ios-stack.is-pushed')).some(
                (el) => el.getClientRects().length > 0,
            );
            stage.toggleAttribute('data-sub', !!settingsOpen || pushed);
            const sc = Array.from(stage.querySelectorAll<HTMLElement>('.aura-scroll-touch')).find(
                (el) => el.getClientRects().length > 0,
            );
            setScrollEl((prev) => (sc && sc !== prev ? sc : prev && !prev.isConnected ? (sc ?? null) : prev));
        };
        update();
        const raf = requestAnimationFrame(update);
        const mo = new MutationObserver(update);
        mo.observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        return () => {
            mo.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [activeTabId, enabled, settingsOpen]);

    // Einstellungsseite: bleibt beim Schließen noch so lange stehen, bis sie nach rechts hinausgefahren ist
    // (gleiche Dauer wie das Hereinfahren, PAGE_MS = Animation .aura-fl-page in facelift.css).
    const [page, setPage] = useState<'closed' | 'open' | 'closing'>('closed');
    useEffect(() => {
        setPage((p) => (settingsOpen ? 'open' : p === 'open' ? 'closing' : p));
    }, [settingsOpen]);
    useEffect(() => {
        if (page !== 'closing') return;
        const t = window.setTimeout(() => setPage('closed'), PAGE_MS);
        return () => window.clearTimeout(t);
    }, [page]);

    useLayoutEffect(() => {
        if (!enabled || !variant) return;
        document.body.setAttribute('data-fl-variant', variant);
        return () => document.body.removeAttribute('data-fl-variant');
    }, [enabled, variant]);

    if (!enabled) return <div className="flex-1 min-h-0 flex flex-col">{children}</div>;

    const visibleTabs = tabs.filter((t) => !t.disabled && !t.hidden);

    return (
        <FaceliftVariantContext.Provider value={variant ?? null}>
            <div ref={stageRef} className="aura-fl-stage">
                <header className="aura-fl-header aura-header" aria-label={appTitle}>
                    <div className="aura-fl-header-left">
                        <span className="aura-fl-logo">{left}</span>
                        <span className="aura-fl-title-compact">{title}</span>
                    </div>
                    <div className="aura-fl-header-right">{right}</div>
                </header>
                {scrollEl &&
                    createPortal(
                        <>
                            <h1 className="aura-fl-title-large" aria-hidden="true">
                                {title}
                            </h1>
                            <div className="aura-fl-snap-spacer" aria-hidden="true" />
                        </>,
                        scrollEl,
                    )}

                {children}

                {page !== 'closed' && (
                    <div
                        className="aura-fl-page aura-fl-settings"
                        role="dialog"
                        aria-label="Einstellungen"
                        data-closing={page === 'closing' || undefined}
                    >
                        <div className="aura-fl-page-scroll">
                            <div className="ios-root aura-fl-page-inner">
                                <IosNavBar
                                    sticky
                                    className="aura-fl-page-bar"
                                    title="Einstellungen"
                                    onBack={onSettingsClose}
                                    backLabel={title}
                                    backFallback="Zurück"
                                />
                                <DeviceSettingsWidget {...({ editMode: false } as WidgetProps)} />
                                {adminHref && (
                                    <div className="ios-page aura-fl-settings-admin">
                                        <IosGroup>
                                            <IosNavRow
                                                icon={Wrench}
                                                iconColor="#8e8e93"
                                                label="Admin-Bereich"
                                                onClick={() => {
                                                    window.location.hash = adminHref;
                                                }}
                                            />
                                        </IosGroup>
                                        <IosFootnote desc="Dashboard bearbeiten, Themes und Farben anpassen." />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {visibleTabs.length > 1 && (
                    <nav
                        className="aura-fl-tabbar aura-tabs"
                        aria-label="Bereiche"
                        data-icons-only={visibleTabs.length > 5 || undefined}
                    >
                        {visibleTabs.map((tab) => {
                            const active = tab.id === activeTabId;
                            const icon = tab.icon ?? FALLBACK_ICONS[tab.slug] ?? 'lucide:circle';
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`aura-fl-tab${active ? ' aura-fl-tab--active' : ''}`}
                                    aria-current={active ? 'page' : undefined}
                                    aria-label={tab.name}
                                    title={tab.name}
                                    onClick={() => {
                                        onSettingsClose?.();
                                        onTabClick(tab);
                                    }}
                                >
                                    <Icon icon={icon} className="aura-fl-tab-icon" width={22} height={22} />
                                    {!tab.hideLabel && <span className="aura-fl-tab-label">{tab.name}</span>}
                                </button>
                            );
                        })}
                    </nav>
                )}
            </div>
        </FaceliftVariantContext.Provider>
    );
}
