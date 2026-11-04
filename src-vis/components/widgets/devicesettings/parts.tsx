import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

/** Symbolquadrat 30x30, wie im Rollladen-Tab. */
export function Ico({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
    return (
        <span className="ds-ico" style={{ background: color }} aria-hidden="true">
            <Icon size={18} />
        </span>
    );
}

export function Group({ children }: { children: ReactNode }) {
    return <div className="ds-group">{children}</div>;
}

/** Zeile der Übersicht: Symbol, Name, Wert, Pfeil. */
export function NavRow({
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
            className={`ds-row ds-row--nav${selected ? ' is-selected' : ''}`}
            aria-current={selected ? 'true' : undefined}
            onClick={onClick}
        >
            <Ico icon={icon} color={iconColor} />
            <span className="ds-main">
                <span className="ds-name">{label}</span>
            </span>
            {value ? <span className="ds-val">{value}</span> : null}
            <ChevronRight size={18} className="ds-chev" />
        </button>
    );
}

/** Auswahlliste, z. B. Automatisch / Hell / Dunkel. */
export function PickList<K extends string>({
    label,
    options,
    value,
    onPick,
    inert,
}: {
    label: string;
    options: { key: K; label: string }[];
    value: K;
    onPick: (key: K) => void;
    inert: boolean;
}) {
    return (
        <Group>
            <div role="group" aria-label={label}>
                {options.map((o) => {
                    const active = value === o.key;
                    return (
                        <button
                            key={o.key}
                            type="button"
                            data-pref={o.key}
                            aria-pressed={active}
                            disabled={inert}
                            className="ds-row ds-row--pick"
                            onClick={() => onPick(o.key)}
                        >
                            <span className="ds-main">
                                <span className="ds-name">{o.label}</span>
                            </span>
                            {active ? <Check size={18} className="ds-check" /> : null}
                        </button>
                    );
                })}
            </div>
        </Group>
    );
}

export function Footnote({ desc, hint }: { desc: string; hint?: string | null }) {
    return (
        <p className="ds-foot">
            {desc}
            {hint ? <> {hint}</> : null}
        </p>
    );
}

/** Kopf der Unterseite: Zurück links (nur schmal), Titel mittig. */
export function SubHeader({ title, onBack, backLabel }: { title: string; onBack?: () => void; backLabel: string }) {
    return (
        <div className="ds-subhead">
            {onBack ? (
                <button type="button" className="ds-back" data-ds-back onClick={onBack}>
                    <ChevronLeft size={22} />
                    <span>{backLabel}</span>
                </button>
            ) : (
                <span />
            )}
            <span className="ds-subtitle">{title}</span>
            <span />
        </div>
    );
}
