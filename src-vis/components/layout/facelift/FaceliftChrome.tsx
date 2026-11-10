/**
 * UI-Facelift (Entwurf): durchscheinender Kopf, dessen großer Titel in der Kopfzeile sitzt und beim
 * Scrollen klein wird, und schwebende Glas-Leiste unten. Der Inhalt scrollt unter beiden hindurch.
 *
 * Alle Farben kommen aus Theme-Variablen mit Rückfallkette (--fl-* → --nav-* → --app-*), damit
 * sie sich später im Backend je Theme anpassen lassen. Jedes Element trägt eine eigene Klasse
 * `aura-fl-…` (siehe facelift.css).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { Wrench } from 'lucide-react';
import type { WidgetProps } from '../../../types';
import { IosFootnote, IosGroup, IosNavBar, IosNavRow } from '../../common/ios';
import { DeviceSettingsWidget } from '../../widgets/DeviceSettingsWidget';
import type { Tab } from '../../../store/dashboardStore';
import './facelift.css';

const KEY = 'aura.facelift.preview';
export type FaceliftChoice = 'IST' | 'NEU';

/** Wahl des Entwurfs-Umschalters, nur in der Dev-Vorschau. */
export function useFaceliftChoice(): [FaceliftChoice, (c: FaceliftChoice) => void] {
    const [choice, setChoice] = useState<FaceliftChoice>(() => {
        try {
            return localStorage.getItem(KEY) === 'IST' ? 'IST' : 'NEU';
        } catch {
            return 'NEU';
        }
    });
    const set = (c: FaceliftChoice) => {
        setChoice(c);
        try {
            localStorage.setItem(KEY, c);
        } catch {
            /* privater Modus */
        }
    };
    return [choice, set];
}

/** Gelber Umschalter „Ist / Neu" – existiert nur in der Dev-Vorschau, nie im Pi-Build. */
export function FaceliftSwitch({ choice, onChange }: { choice: FaceliftChoice; onChange: (c: FaceliftChoice) => void }) {
    return (
        <div className="aura-fl-switch" title="Entwurfs-Umschalter, nur lokal">
            {(['IST', 'NEU'] as const).map((c) => (
                <button key={c} type="button" data-on={choice === c || undefined} onClick={() => onChange(c)}>
                    {c === 'IST' ? 'Ist' : 'Neu'}
                </button>
            ))}
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
 * ohne React-Render direkt als CSS-Variable gesetzt.
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
    children,
}: {
    enabled: boolean;
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

    useEffect(() => {
        const stage = stageRef.current;
        if (!enabled || !stage) return;
        let lastY = 0;
        const apply = (y: number) => {
            stage.style.setProperty('--fl-scroll', `${Math.max(-80, Math.min(y, 200))}px`);
            stage.toggleAttribute('data-scrolled', y > 4);
            // Leiste wie in iOS: beim Runterscrollen klein, beim Hochscrollen wieder groß
            if (y <= 4 || y < lastY - 6) stage.removeAttribute('data-min');
            else if (y > 40 && y > lastY + 6) stage.setAttribute('data-min', '');
            if (Math.abs(y - lastY) > 6) lastY = y;
        };
        const onScroll = (e: Event) => {
            const el = e.target as HTMLElement;
            if (el?.classList?.contains('aura-scroll-touch')) apply(el.scrollTop);
        };
        stage.addEventListener('scroll', onScroll, true);
        // Tabwechsel: neuer Scroll-Container, Stand neu einlesen
        const raf = requestAnimationFrame(() => {
            const sc = stage.querySelector<HTMLElement>('.aura-scroll-touch');
            apply(sc?.scrollTop ?? 0);
        });
        return () => {
            stage.removeEventListener('scroll', onScroll, true);
            cancelAnimationFrame(raf);
        };
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

    if (!enabled) return <div className="flex-1 min-h-0 flex flex-col">{children}</div>;

    const visibleTabs = tabs.filter((t) => !t.disabled && !t.hidden);

    return (
        <div ref={stageRef} className="aura-fl-stage">
            <header className="aura-fl-header aura-header" aria-label={appTitle}>
                <div className="aura-fl-header-left">
                    {left}
                    <h1 className="aura-fl-title">{title}</h1>
                </div>
                <div className="aura-fl-header-right">{right}</div>
            </header>

            {children}

            {settingsOpen && (
                <div className="aura-fl-page aura-fl-settings" role="dialog" aria-label="Einstellungen">
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
    );
}
