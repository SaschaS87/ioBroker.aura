import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type RefObject,
} from 'react';
import { ChevronLeft } from 'lucide-react';
import { getScrollParent } from './IosStack';

export type BackMode = 'full' | 'short' | 'icon';
export interface FitInput {
    bar: number;
    title: number;
    right: number;
    backFull: number;
    backShort: number;
    backIcon: number;
    gap: number;
}
export interface FitResult {
    mode: BackMode;
    left: number;
    right: number;
}

/** Wie iOS: Titel möglichst über der ganzen Zeile mittig. Passt das nicht, erst das Zurück-Wort kürzen
 *  (Ersatzwort, dann nur Pfeil), dann rückt der Titel aus der Mitte, zuletzt „…". Spalten überlappen nie. */
export function fitNavBar(i: FitInput): FitResult {
    const order: [BackMode, number][] = [
        ['full', i.backFull],
        ['short', i.backShort],
        ['icon', i.backIcon],
    ];
    for (const [mode, back] of order) {
        const side = Math.max(back, i.right);
        if (i.title <= i.bar - 2 * side - 2 * i.gap) return { mode, left: side, right: side };
    }
    for (const [mode, back] of order) {
        if (i.title <= i.bar - back - i.right - 2 * i.gap) return { mode, left: back, right: i.right };
    }
    return { mode: 'icon', left: i.backIcon, right: i.right };
}

export interface IosNavBarProps {
    title: string;
    backLabel?: string; // Wort neben dem Pfeil
    backFallback?: string; // nur fit: Ersatzwort, wenn backLabel nicht passt
    onBack?: () => void;
    backAttrs?: Record<string, string>; // z. B. { 'data-ds-back': '' }
    right?: ReactNode;
    rightRef?: (el: HTMLElement | null) => void; // Ziel für Portale (Speichern/Löschen der Editoren)
    variant?: 'inline' | 'large';
    status?: ReactNode; // nur large
    fit?: boolean; // nur inline, Standard true; false = Raster wie Feature 29
    sticky?: boolean;
    className?: string;
}

export function IosNavBar(p: IosNavBarProps) {
    if (p.variant === 'large') return <LargeBar {...p} />;
    if (p.fit === false) return <PlainBar {...p} />;
    return <FitBar {...p} />;
}

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/** sticky: `top: 0` haftet an der Inhaltskante des Scroll-Containers, also unter seinem Innenabstand oben
 *  (.aura-scroll: 8 px mobil, 16 px Desktop), darüber schaute ein Streifen Inhalt heraus. Deshalb
 *  top = minus Innenabstand oben, gemessen und bei Größenänderung neu. */
function useStickyTop(ref: RefObject<HTMLElement>, on: boolean): CSSProperties | undefined {
    const [pad, setPad] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!on || !el) return;
        const sc = getScrollParent(el);
        const isDoc = sc === document.scrollingElement || sc === document.documentElement || sc === document.body;
        const measure = () => setPad(isDoc ? 0 : parseFloat(getComputedStyle(sc).paddingTop) || 0);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(sc);
        return () => ro.disconnect();
    }, [ref, on]);
    return on ? ({ '--ios-sticky-top': `${-pad}px` } as CSSProperties) : undefined;
}

function PlainBar({ title, backLabel, onBack, backAttrs, right, rightRef, sticky, className }: IosNavBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const stickyStyle = useStickyTop(barRef, !!sticky);
    return (
        <div ref={barRef} className={cls('ios-bar', sticky && 'is-sticky', className)} style={stickyStyle}>
            {onBack ? (
                <button type="button" className="ios-back" {...backAttrs} onClick={onBack}>
                    <ChevronLeft size={22} />
                    <span className="ios-back-label">{backLabel}</span>
                </button>
            ) : (
                <span />
            )}
            <span className="ios-bar-title">{title}</span>
            {right || rightRef ? (
                <span className="ios-bar-right" ref={rightRef}>
                    {right}
                </span>
            ) : (
                <span />
            )}
        </div>
    );
}

function FitBar({
    title,
    backLabel,
    backFallback,
    onBack,
    backAttrs,
    right,
    rightRef,
    sticky,
    className,
}: IosNavBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const rightEl = useRef<HTMLElement | null>(null);
    const mFull = useRef<HTMLSpanElement>(null);
    const mShort = useRef<HTMLSpanElement>(null);
    const mIcon = useRef<HTMLSpanElement>(null);
    const mTitle = useRef<HTMLSpanElement>(null);
    const [fit, setFit] = useState<FitResult>({ mode: 'full', left: 44, right: 44 });
    const hasBack = !!onBack;
    const stickyStyle = useStickyTop(barRef, !!sticky);

    const setRight = useCallback(
        (el: HTMLElement | null) => {
            rightEl.current = el;
            rightRef?.(el);
        },
        [rightRef],
    );

    useLayoutEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const w = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().width : 0);
        const measure = () => {
            if (bar.clientWidth === 0) return; // Seite verdeckt
            const cs = getComputedStyle(bar);
            const inner = bar.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
            const backFull = hasBack ? w(mFull.current) : 0;
            const next = fitNavBar({
                bar: inner,
                title: w(mTitle.current),
                right: w(rightEl.current),
                backFull,
                backShort: hasBack ? (backFallback ? w(mShort.current) : backFull) : 0,
                backIcon: hasBack ? w(mIcon.current) : 0,
                gap: 8,
            });
            setFit((prev) =>
                prev.mode === next.mode &&
                Math.abs(prev.left - next.left) < 0.5 &&
                Math.abs(prev.right - next.right) < 0.5
                    ? prev
                    : next,
            );
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        [bar, rightEl.current, mFull.current, mShort.current, mIcon.current, mTitle.current].forEach((el) => {
            if (el) ro.observe(el);
        });
        return () => ro.disconnect();
    }, [title, backLabel, backFallback, hasBack]);

    const label = fit.mode === 'full' ? backLabel : fit.mode === 'short' ? (backFallback ?? backLabel) : '';
    const style = { '--ios-bar-l': `${fit.left}px`, '--ios-bar-r': `${fit.right}px` } as CSSProperties;
    return (
        <div
            ref={barRef}
            className={cls('ios-bar', 'is-fit', sticky && 'is-sticky', className)}
            style={{ ...style, ...stickyStyle }}
        >
            {onBack ? (
                <button
                    type="button"
                    className="ios-back"
                    {...backAttrs}
                    aria-label={label ? undefined : backLabel || 'Zurück'}
                    onClick={onBack}
                >
                    <ChevronLeft size={22} />
                    {label ? <span className="ios-back-label">{label}</span> : null}
                </button>
            ) : (
                <span />
            )}
            <span className="ios-bar-title">{title}</span>
            <span className="ios-bar-right" ref={setRight}>
                {right}
            </span>
            <span className="ios-bar-measure" aria-hidden="true">
                <span className="ios-back" ref={mFull}>
                    <ChevronLeft size={22} />
                    <span className="ios-back-label">{backLabel}</span>
                </span>
                <span className="ios-back" ref={mShort}>
                    <ChevronLeft size={22} />
                    <span className="ios-back-label">{backFallback ?? backLabel}</span>
                </span>
                <span className="ios-back" ref={mIcon}>
                    <ChevronLeft size={22} />
                </span>
                <span className="ios-bar-title" ref={mTitle}>
                    {title}
                </span>
            </span>
        </div>
    );
}

function LargeBar({ title, status, backLabel, onBack, backAttrs, right, rightRef, className }: IosNavBarProps) {
    return (
        <div className={cls('ios-bar', 'ios-bar--large', className)}>
            <div className="ios-bar-row">
                {onBack ? (
                    <button
                        type="button"
                        className="ios-back"
                        {...backAttrs}
                        aria-label={backLabel ? undefined : 'Zurück'}
                        onClick={onBack}
                    >
                        <ChevronLeft size={22} />
                        {backLabel ? <span className="ios-back-label">{backLabel}</span> : null}
                    </button>
                ) : (
                    <span />
                )}
                <span className="ios-bar-right" ref={rightRef}>
                    {right}
                </span>
            </div>
            <h2 className="ios-large-title">{title}</h2>
            {status ? <p className="ios-large-status">{status}</p> : null}
        </div>
    );
}
