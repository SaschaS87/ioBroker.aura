/**
 * iOS-Baustein (Feature 30): Navigations-Stapel. Seiten liegen in einem Rasterfeld übereinander,
 * die sichtbare schiebt von rechts herein (280 ms ease), verdeckte sind inert und aria-hidden.
 * sizing 'tallest': alle eingehängten Seiten bestimmen die Höhe (Geräte-Einstellungen, Optik wie Feature 29).
 * sizing 'current': nur die sichtbare Seite (beim Schieben zusätzlich die abgehende), verdeckte display:none.
 * manageScroll: Scrollstelle je Ebene im echten Scroll-Container (.aura-scroll aus Dashboard.tsx, sonst
 * Dokument); Unterseite beginnt oben, Zurück stellt die vorige Stelle her; die abgehende Seite wird
 * senkrecht ausgeglichen, damit beim Schieben nichts springt.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface IosStackPage {
    key: string;
    node: ReactNode;
}
export interface IosStackProps {
    pages: IosStackPage[];
    depth: number;
    sizing?: 'tallest' | 'current';
    manageScroll?: boolean;
    bleed?: number;
    inset?: number;
    className?: string;
}
/** Muss zu ios.css (.ios-stack.is-moving) passen. */
export const IOS_PUSH_MS = 280;
type Anim = { from: number; to: number; phase: 'prepare' | 'run'; shift: number; leaving?: IosStackPage };

// React 18 kennt das HTML-Attribut inert noch nicht in den Typen
export const inertAttr = (on: boolean): Record<string, string> => (on ? { inert: '' } : {});

export function getScrollParent(el: HTMLElement): HTMLElement {
    for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return p;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
function viewTop(sc: HTMLElement): number {
    const doc = sc === document.scrollingElement || sc === document.documentElement || sc === document.body;
    return doc ? 0 : sc.getBoundingClientRect().top + sc.clientTop;
}

export function IosStack({
    pages,
    depth,
    sizing = 'current',
    manageScroll = true,
    bleed = 0,
    inset = 0,
    className = '',
}: IosStackProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const pageEls = useRef<(HTMLDivElement | null)[]>([]);
    const prevPages = useRef(pages);
    const scrollMemo = useRef<number[]>([]);
    const [shown, setShown] = useState(depth);
    const [anim, setAnim] = useState<Anim | null>(null);

    // Tiefe geändert: Übergang vorbereiten, bewusst während des Renderns (React-Muster „Zustand an
    // geänderte Props anpassen"), damit eine zurückgenommene Seite nicht ausgehängt wird.
    if (depth !== shown) {
        const from = shown;
        const leaving = depth < from && !pages[from] ? prevPages.current[from] : undefined;
        setShown(depth);
        setAnim({ from, to: depth, phase: 'prepare', shift: 0, leaving });
    }

    useLayoutEffect(() => {
        prevPages.current = pages;
    });

    useLayoutEffect(() => {
        if (!anim || anim.phase !== 'prepare') return;
        const track = trackRef.current;
        let shift = 0;
        if (manageScroll && track) {
            const sc = getScrollParent(track);
            const before = sc.scrollTop;
            if (anim.to > anim.from) {
                scrollMemo.current[anim.from] = before;
                const pad = parseFloat(getComputedStyle(sc).paddingTop) || 0;
                const delta = track.getBoundingClientRect().top - viewTop(sc) - pad;
                if (delta < 0) sc.scrollTop = before + delta;
            } else {
                const saved = scrollMemo.current[anim.to];
                if (saved !== undefined) sc.scrollTop = saved;
                scrollMemo.current.length = Math.min(scrollMemo.current.length, anim.to + 1);
            }
            shift = sc.scrollTop - before;
        }
        const reduce =
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            setAnim(null);
            return;
        }
        track?.getBoundingClientRect(); // Startlage festschreiben, sonst startet kein Übergang
        setAnim({ ...anim, phase: 'run', shift });
    }, [anim, manageScroll]);

    useEffect(() => {
        if (!anim || anim.phase !== 'run') return;
        const current = anim;
        const el = pageEls.current[anim.to];
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            setAnim((a) => (a === current ? null : a));
        };
        const onEnd = (e: TransitionEvent) => {
            if (e.target === el && e.propertyName === 'transform') finish();
        };
        el?.addEventListener('transitionend', onEnd);
        const timer = window.setTimeout(finish, IOS_PUSH_MS + 120);
        return () => {
            el?.removeEventListener('transitionend', onEnd);
            window.clearTimeout(timer);
        };
    }, [anim]);

    const list: (IosStackPage | undefined)[] = pages.slice();
    if (anim?.leaving && !list[anim.from]) list[anim.from] = anim.leaving;
    const active = anim ? anim.to : depth;
    const style = { '--ios-bleed': `${bleed}px`, '--ios-inset': `${inset}px` } as CSSProperties;
    return (
        <div
            className={`ios-stack ios-stack--${sizing}${depth > 0 ? ' is-pushed' : ''}${anim?.phase === 'run' ? ' is-moving' : ''}${className ? ` ${className}` : ''}`}
            data-depth={depth}
            style={style}
        >
            <div ref={trackRef} className="ios-stack-track">
                {list.map((p, i) => {
                    if (!p) return null;
                    const moving = !!anim && (i === anim.from || i === anim.to);
                    let pos = i < active ? 'left' : i > active ? 'right' : 'center';
                    if (anim && anim.phase === 'prepare' && moving)
                        pos = i === anim.from ? 'center' : anim.to > anim.from ? 'right' : 'left';
                    const visible = i === active || moving;
                    const shift = anim && i === anim.from ? anim.shift : 0;
                    return (
                        <div
                            key={p.key}
                            ref={(el) => {
                                pageEls.current[i] = el;
                            }}
                            className={`ios-stack-page is-${pos}${visible ? '' : ' is-hidden'}`}
                            aria-hidden={i !== active}
                            {...inertAttr(i !== active)}
                        >
                            <div
                                className="ios-stack-shift"
                                style={shift ? { transform: `translateY(${shift}px)` } : undefined}
                            >
                                {p.node}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
