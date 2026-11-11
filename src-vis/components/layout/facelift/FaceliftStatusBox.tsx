/**
 * Status-Bausteine des Facelifts (Datenquellen, Signalstärke). Aussehen: facelift-blocks.css.
 *
 *   'page'  Block auf der Unterseite „Status": grauer Titel, Karte mit dem Inhalt, Begleittext darunter
 *   'row'   Rückfall ohne Unterseite: Zeile, die in der Karte aufklappt
 */
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type StatusAppearance = 'box' | 'row' | 'page';
export type StatusLevel = 'ok' | 'warn' | 'crit' | 'loading';

export function FaceliftStatusBox({
    appearance,
    level,
    title,
    sub,
    foot,
    expanded,
    onToggle,
    children,
}: {
    appearance: 'row' | 'page';
    level: StatusLevel;
    title: string;
    sub?: string | null;
    /** nur 'page': Begleittext unter der Karte */
    foot?: ReactNode;
    expanded: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    if (appearance === 'page') {
        return (
            <section className="aura-fl-section aura-fl-statusbox aura-fl-statusbox--page">
                <div className="aura-fl-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                    {sub && (
                        <span className="aura-fl-statusbit" data-level={level}>
                            <span className="aura-fl-statusbox-dot" />
                            <span className="aura-fl-statusbit-text">{sub}</span>
                        </span>
                    )}
                </div>
                <div className="aura-fl-card">
                    <div className="aura-fl-statusbox-body">{children}</div>
                </div>
                {foot && <p className="aura-fl-foot">{foot}</p>}
            </section>
        );
    }
    return (
        <div className="aura-fl-statusbox" data-level={level} data-open={expanded || undefined}>
            <button
                type="button"
                className="aura-fl-row aura-fl-row--nav aura-fl-statusbox-head"
                onClick={onToggle}
                aria-expanded={expanded}
            >
                <span className="aura-fl-row-icon aura-fl-statusbox-lead">
                    <span className="aura-fl-statusbox-dot" />
                </span>
                <span className="aura-fl-row-main aura-fl-statusbox-main">
                    <span className="aura-fl-row-title aura-fl-statusbox-title">{title}</span>
                    {sub && <span className="aura-fl-row-sub aura-fl-statusbox-sub">{sub}</span>}
                </span>
                <ChevronDown size={18} className={`aura-fl-chev aura-fl-statusbox-chev${expanded ? ' is-open' : ''}`} />
            </button>
            {expanded && <div className="aura-fl-statusbox-body">{children}</div>}
        </div>
    );
}
