/**
 * Gemeinsame Bausteine der Rolllaeden-Planer-Kachel (Produktion, Feature 23):
 * Glyphen, Beschriftung, Umschalter, Wochentage, Toast. Kachel und Fenster
 * liegen in PlanWindows.tsx, die Editoren
 * in editors.tsx.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Flame, House, Moon, Sun, Sunrise, Sunset, Tv } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { RaffstoreIcon, RoofWindowIcon, WindowIcon } from '../../../icons/ShutterTypeIcons';
import { daysText, WD_LETTER, WEEKDAYS, type PlanDevice, type PlanModel, type SceneIcon } from './planModel';

// ── Kleinteile ─────────────────────────────────────────────────────────

export const SCENE_ICONS: Record<SceneIcon, typeof Sun> = {
    sunrise: Sunrise,
    sun: Sun,
    sunset: Sunset,
    moon: Moon,
    home: House,
    heat: Flame,
    tv: Tv,
};

export function SceneGlyph({ icon, size = 18 }: { icon: SceneIcon; size?: number }) {
    const I = SCENE_ICONS[icon] ?? Sun;
    return <I size={size} strokeWidth={2} />;
}

export function DeviceGlyph({ kind, closed, size = 18 }: { kind: PlanDevice['kind']; closed: number | null; size?: number }) {
    const I = kind === 'dachfenster' ? RoofWindowIcon : kind === 'raffstore' ? RaffstoreIcon : WindowIcon;
    return <I size={size} closedFrac={closed} />;
}

export function Caption({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="rpp-caption">
            <span className="rpp-caption-text">{children}</span>
            <span className="rpp-caption-line" />
            {right}
        </div>
    );
}

export function Seg<T extends string>({
    value,
    options,
    onChange,
    size = 'md',
}: {
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
}) {
    return (
        <div className={`rpp-seg rpp-seg--${size}`} role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`rpp-seg-btn${value === o.value ? ' is-active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            className={`rpp-toggle${on ? ' is-on' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!on);
            }}
        >
            <span className="rpp-toggle-knob" />
        </button>
    );
}

export function DayLetters({ days, dim }: { days: boolean[]; dim?: boolean }) {
    return (
        <span className={`rpp-days${dim ? ' is-dim' : ''}`} aria-label={daysText(days)}>
            {WEEKDAYS.map((d) => (
                <span key={d} className={`rpp-day${days[d] ? ' is-on' : ''}`}>
                    {WD_LETTER[d]}
                </span>
            ))}
        </span>
    );
}

export function Toast({ model }: { model: PlanModel }) {
    const adminPortalTarget = usePortalTarget();
    if (!model.toast) return null;
    const target = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget ?? document.body;
    return createPortal(<div className="rpp-toast">{model.toast}</div>, target);
}

export function closedWord(v: number): string {
    if (v <= 0) return 'offen';
    if (v >= 100) return 'zu';
    return `${v} % zu`;
}
