import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react';

/** Symbolquadrat 30x30, wie im Rollladen-Tab. */
export function IosIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
    return (
        <span className="ios-ico" style={{ background: color }} aria-hidden="true">
            <Icon size={18} />
        </span>
    );
}

export function IosGroup({ children }: { children: ReactNode }) {
    return <div className="ios-group">{children}</div>;
}

/** Zeile der Übersicht: Symbol, Name, Wert, Pfeil. */
export function IosNavRow({
    icon,
    iconColor,
    label,
    value,
    onClick,
    selected,
}: {
    icon: LucideIcon;
    iconColor: string;
    label: string;
    value?: string;
    onClick: () => void;
    selected?: boolean;
}) {
    return (
        <button
            type="button"
            className={`ios-row ios-row--nav${selected ? ' is-selected' : ''}`}
            aria-current={selected ? 'true' : undefined}
            onClick={onClick}
        >
            <IosIcon icon={icon} color={iconColor} />
            <span className="ios-main">
                <span className="ios-name">{label}</span>
            </span>
            {value ? <span className="ios-val">{value}</span> : null}
            <ChevronRight size={18} className="ios-chev" />
        </button>
    );
}

/** Auswahlzeile (Haken, wenn aktiv). */
export function IosPickRow({
    label,
    active,
    disabled,
    onClick,
    attrs,
}: {
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    attrs?: Record<string, string>;
}) {
    return (
        <button
            type="button"
            {...attrs}
            aria-pressed={active}
            disabled={disabled}
            className="ios-row ios-row--pick"
            onClick={onClick}
        >
            <span className="ios-main">
                <span className="ios-name">{label}</span>
            </span>
            {active ? <Check size={18} className="ios-check" /> : null}
        </button>
    );
}

/** Knopfzeile über die volle Breite, Text mittig, in einer eigenen Gruppe ("Szene löschen" unten im Editor). */
export function IosButtonRow({
    label,
    tone,
    onClick,
}: {
    label: string;
    tone: 'danger' | 'accent';
    onClick: () => void;
}) {
    return (
        <IosGroup>
            <button type="button" className={`ios-row ios-row--btn is-${tone}`} onClick={onClick}>
                {label}
            </button>
        </IosGroup>
    );
}

/** Fußnote unter der Gruppe. */
export function IosFootnote({ desc, hint }: { desc: string; hint?: string | null }) {
    return (
        <p className="ios-foot">
            {desc}
            {hint ? <> {hint}</> : null}
        </p>
    );
}

/** Master-Detail: links die Liste, rechts die Unterseite. */
export function IosSplit({ master, detail }: { master: ReactNode; detail: ReactNode }) {
    return (
        <div className="ios-split">
            {master}
            {detail}
        </div>
    );
}

/** Breite des Elements selbst messen (nicht des Fensters): das Widget kann in einer halben Spalte stehen. */
export function useMinWidth(ref: RefObject<HTMLElement>, minPx: number): boolean {
    const [wide, setWide] = useState(false);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setWide(el.getBoundingClientRect().width >= minPx);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref, minPx]);
    return wide;
}
