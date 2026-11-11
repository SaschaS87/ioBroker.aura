/**
 * Status-Zeile der Facelift-Entwürfe (Datenquellen, Signalstärke): Punkt in der Zustandsfarbe, Titel,
 * Kurztext. Je nach Entwurf klappt sie in der Karte auf (Winkel nach unten), führt auf eine Unterseite
 * (Winkel nach rechts, `onOpen`) oder steht dort offen als Kopf über dem Inhalt (`appearance="page"`).
 * Aussehen: facelift-blocks.css, Klassen `aura-fl-statusbox…`.
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type StatusAppearance = 'box' | 'row' | 'page';
export type StatusLevel = 'ok' | 'warn' | 'crit' | 'loading';

export function FaceliftStatusBox({
    appearance,
    level,
    title,
    sub,
    expanded,
    onToggle,
    onOpen,
    children,
}: {
    appearance: 'row' | 'page';
    level: StatusLevel;
    title: string;
    sub?: string | null;
    expanded: boolean;
    onToggle: () => void;
    /** gesetzt: Zeile führt auf eine Unterseite statt aufzuklappen */
    onOpen?: () => void;
    children: ReactNode;
}) {
    const head = (
        <>
            <span className="aura-fl-row-icon aura-fl-statusbox-lead">
                <span className="aura-fl-statusbox-dot" />
            </span>
            <span className="aura-fl-row-main aura-fl-statusbox-main">
                <span className="aura-fl-row-title aura-fl-statusbox-title">{title}</span>
                {sub && <span className="aura-fl-row-sub aura-fl-statusbox-sub">{sub}</span>}
            </span>
        </>
    );
    if (appearance === 'page') {
        return (
            <div className="aura-fl-statusbox aura-fl-statusbox--page" data-level={level}>
                <div className="aura-fl-row aura-fl-statusbox-head">{head}</div>
                <div className="aura-fl-statusbox-body">{children}</div>
            </div>
        );
    }
    const open = !onOpen && expanded;
    return (
        <div className="aura-fl-statusbox" data-level={level} data-open={open || undefined}>
            <button
                type="button"
                className="aura-fl-row aura-fl-row--nav aura-fl-statusbox-head"
                onClick={onOpen ?? onToggle}
                aria-expanded={onOpen ? undefined : expanded}
            >
                {head}
                {onOpen ? (
                    <ChevronRight size={18} className="aura-fl-chev aura-fl-statusbox-chev" />
                ) : (
                    <ChevronDown
                        size={18}
                        className={`aura-fl-chev aura-fl-statusbox-chev${expanded ? ' is-open' : ''}`}
                    />
                )}
            </button>
            {open && <div className="aura-fl-statusbox-body">{children}</div>}
        </div>
    );
}
