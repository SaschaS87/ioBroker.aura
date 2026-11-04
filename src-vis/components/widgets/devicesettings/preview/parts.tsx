import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, SunMoon } from 'lucide-react';
import type { DeviceThemeModel } from './previewModel';

/** Symbolquadrat 30x30, wie im Rollladen-Tab. */
export function Ico() {
    return (
        <span className="ds-pv-ico" aria-hidden="true">
            <SunMoon size={18} />
        </span>
    );
}

export function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`ds-pv-group ${className}`}>{children}</div>;
}

/** Zeile der Übersicht: Symbol, Name, Wert, Pfeil. */
export function NavRow({
    label,
    value,
    onClick,
    selected,
    inert,
    chevron = true,
    chevronNode,
}: {
    label: string;
    value?: string;
    onClick?: () => void;
    selected?: boolean;
    inert?: boolean;
    chevron?: boolean;
    chevronNode?: ReactNode;
}) {
    return (
        <button
            type="button"
            className={`ds-pv-row ds-pv-row--nav${selected ? ' is-selected' : ''}`}
            onClick={onClick}
            disabled={inert}
        >
            <Ico />
            <span className="ds-pv-main">
                <span className="ds-pv-name">{label}</span>
            </span>
            {value ? <span className="ds-pv-val">{value}</span> : null}
            {chevronNode ?? (chevron ? <ChevronRight size={18} className="ds-pv-chev" /> : null)}
        </button>
    );
}

/** Beispielzeile, nur zum Eindruck von "mehrere Einstellungen". Ohne Funktion. */
export function ExampleRow({ selected }: { selected?: boolean }) {
    return (
        <div className={`ds-pv-row ds-pv-row--example${selected ? ' is-selected' : ''}`} aria-hidden="true">
            <span className="ds-pv-ico ds-pv-ico--grey" />
            <span className="ds-pv-main">
                <span className="ds-pv-name">Beispiel: Startbereich</span>
            </span>
            <ChevronRight size={18} className="ds-pv-chev" />
        </div>
    );
}

/** Auswahlliste Automatisch / Hell / Dunkel. */
export function PrefList({ model, inert, indent }: { model: DeviceThemeModel; inert: boolean; indent?: boolean }) {
    return (
        <Group className={indent ? 'ds-pv-group--flat' : ''}>
            <div role="group" aria-label={model.title}>
                {model.options.map((o) => {
                    const active = model.pref === o.key;
                    return (
                        <button
                            key={o.key}
                            type="button"
                            data-pref={o.key}
                            aria-pressed={active}
                            disabled={inert}
                            className={`ds-pv-row ds-pv-row--pick${indent ? ' is-indent' : ''}`}
                            onClick={() => model.setPref(o.key)}
                        >
                            <span className="ds-pv-main">
                                <span className="ds-pv-name">{o.label}</span>
                            </span>
                            {active ? <Check size={18} className="ds-pv-check" /> : null}
                        </button>
                    );
                })}
            </div>
        </Group>
    );
}

export function Footnote({ model }: { model: DeviceThemeModel }) {
    return (
        <p className="ds-pv-foot">
            {model.desc}
            {model.hint ? <> {model.hint}</> : null}
        </p>
    );
}

/** Kopf der Unterseite: Zurück links, Titel mittig. */
export function SubHeader({ title, onBack, backLabel }: { title: string; onBack?: () => void; backLabel: string }) {
    return (
        <div className="ds-pv-subhead">
            {onBack ? (
                <button type="button" className="ds-pv-back" onClick={onBack}>
                    <ChevronLeft size={22} />
                    <span>{backLabel}</span>
                </button>
            ) : (
                <span className="ds-pv-back-spacer" />
            )}
            <span className="ds-pv-subtitle">{title}</span>
            <span className="ds-pv-back-spacer" />
        </div>
    );
}
