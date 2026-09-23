/**
 * Gemeinsame Bausteine der Garten2-Design-Entwuerfe (nur Dev-Vorschau).
 * Alle Flaechen nutzen die Aura-Widget-Tokens (--widget-bg, --widget-border,
 * --widget-radius) — dieselben wie Heizung, Wohnklima und Rolllaeden.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Play, Plus, Square } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { useSheetDismiss } from '../../useSheetDismiss';
import { clampMinutes, MAX_MINUTES, MIN_MINUTES } from '../../garten/gartenConstants';
import type { TimerWeekday } from '../../../../types';
import { WEEKDAY_LETTER, WEEKDAY_ORDER, WEEKDAY_SHORT, type G2Circle, type G2Model } from './previewModel';

export function Caption({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="g2p-caption">
            <span className="g2p-caption-text">{children}</span>
            <span className="g2p-caption-line" />
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
    value: T | 'unknown';
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
}) {
    return (
        <div className={`g2p-seg g2p-seg--${size}`} role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`g2p-seg-btn${value === o.value ? ' is-active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export const MODE_OPTIONS = [
    { value: 'evaporation' as const, label: 'Verdunstung' },
    { value: 'schedule' as const, label: 'Zeitplan' },
];

export function Stepper({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
    return (
        <div className="g2p-stepper">
            <button
                type="button"
                className="g2p-stepper-btn"
                onClick={() => onChange(clampMinutes(minutes - 1))}
                disabled={minutes <= MIN_MINUTES}
                aria-label="Eine Minute weniger"
            >
                <Minus size={14} />
            </button>
            <span className="g2p-stepper-val">
                {minutes}
                <span className="g2p-stepper-unit"> min</span>
            </span>
            <button
                type="button"
                className="g2p-stepper-btn"
                onClick={() => onChange(clampMinutes(minutes + 1))}
                disabled={minutes >= MAX_MINUTES}
                aria-label="Eine Minute mehr"
            >
                <Plus size={14} />
            </button>
        </div>
    );
}

/** Wochentage als kleine Buchstaben — aktive in Akzentfarbe, keine Kaestchen. */
export function DayLetters({ days, variant = 'letters' }: { days: Set<TimerWeekday>; variant?: 'letters' | 'short' }) {
    return (
        <span className="g2p-days" aria-label="Aktive Wochentage">
            {WEEKDAY_ORDER.map((d) => (
                <span key={d} className={`g2p-day${days.has(d) ? ' is-on' : ''}`}>
                    {variant === 'letters' ? WEEKDAY_LETTER[d] : WEEKDAY_SHORT[d]}
                </span>
            ))}
        </span>
    );
}

/** "Mo · Mi · Fr" */
export function daysText(days: Set<TimerWeekday>): string {
    const list = WEEKDAY_ORDER.filter((d) => days.has(d)).map((d) => WEEKDAY_SHORT[d]);
    if (list.length === 7) return 'täglich';
    return list.length ? list.join(' · ') : 'keine Tage';
}

export function modeText(c: G2Circle): string {
    if (c.mode === 'evaporation') return 'Verdunstung';
    if (c.mode === 'schedule') return 'Zeitplan';
    return 'Modus unbekannt';
}

export function ProgressBar({ fraction }: { fraction: number }) {
    return (
        <div className="g2p-bar">
            <div className="g2p-bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} />
        </div>
    );
}

export function RoundBtn({
    kind,
    onClick,
    disabled,
    label,
}: {
    kind: 'play' | 'stop';
    onClick: () => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
            className={`g2p-round g2p-round--${kind}`}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            disabled={disabled}
            aria-label={label}
            title={label}
        >
            {kind === 'play' ? <Play size={15} /> : <Square size={13} />}
        </button>
    );
}

/** Handbetrieb in einer Zeile: Dauer + Gießen bzw. Stoppen. */
export function ManualRow({ circle, model, compact }: { circle: G2Circle; model: G2Model; compact?: boolean }) {
    const [minutes, setMinutes] = useState(10);
    const isRunning = model.running?.name === circle.name;
    const otherRunning = model.running !== null && !isRunning;
    if (isRunning) {
        return (
            <div className="g2p-manual">
                <button type="button" className="g2p-btn g2p-btn--danger" onClick={model.stop}>
                    <Square size={13} /> Stoppen
                </button>
            </div>
        );
    }
    return (
        <div className="g2p-manual">
            <Stepper minutes={minutes} onChange={setMinutes} />
            <button
                type="button"
                className={`g2p-btn g2p-btn--primary${compact ? ' g2p-btn--compact' : ''}`}
                onClick={() => model.start(circle.name, minutes)}
                disabled={otherRunning}
            >
                <Play size={13} /> {otherRunning ? 'Wartet' : 'Gießen'}
            </button>
        </div>
    );
}

/** Bottom-Sheet im Stil von Raumklima/Rollladen (Wischen, Backdrop, Escape). */
export function PreviewSheet({
    title,
    subtitle,
    onClose,
    children,
}: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick } = useSheetDismiss(onClose);
    return createPortal(
        <div className="g2p-sheet-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div className="g2p-sheet" style={sheetStyle} role="dialog" aria-modal="true">
                <div className="g2p-sheet-drag" {...dragHandlers}>
                    <div className="g2p-sheet-grip" />
                    <div className="g2p-sheet-head">
                        <div className="g2p-sheet-title">{title}</div>
                        {subtitle && <div className="g2p-sheet-sub">{subtitle}</div>}
                    </div>
                </div>
                <div className="g2p-sheet-body">{children}</div>
            </div>
        </div>,
        portalTarget ?? document.body,
    );
}

/** Inhalt des Kreis-Sheets (Varianten B und E). */
export function CircleSheetBody({ circle, model }: { circle: G2Circle; model: G2Model }) {
    return (
        <>
            <div className="g2p-sheet-section">
                <div className="g2p-label">Betriebsart</div>
                <Seg
                    value={circle.mode}
                    options={MODE_OPTIONS}
                    onChange={(m) => model.setMode(circle.name, m)}
                />
                <div className="g2p-hint">
                    {circle.mode === 'evaporation'
                        ? 'Gießt automatisch, sobald die Restfeuchte unter den Schaltpunkt fällt.'
                        : 'Gießt zu festen Zeiten. Termine ändern im Tab Garten.'}
                </div>
            </div>
            {circle.mode === 'schedule' && (
                <div className="g2p-sheet-section">
                    <div className="g2p-label">Wochenplan{circle.plan.time ? ` · ${circle.plan.time} Uhr` : ''}</div>
                    <DayLetters days={circle.plan.days} variant="short" />
                </div>
            )}
            <div className="g2p-sheet-section">
                <div className="g2p-label">Jetzt gießen</div>
                <ManualRow circle={circle} model={model} />
            </div>
        </>
    );
}
