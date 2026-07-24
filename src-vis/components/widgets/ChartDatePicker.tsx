import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import type { PeriodMode } from '../../utils/chartPeriod';

/**
 * Quick-jump wheel picker shared by the dashboard charts, shown as a separate
 * centered popup (portal) when the pager's date field is tapped. Three scroll
 * wheels — Tag / Monat / Jahr — jump straight to a period far in the past
 * (e.g. into the last heating season) instead of stepping with the arrows.
 *
 * Adapts to the active view: in "Monat" the day wheel is hidden. "Springen"
 * hands the chosen y/m/d back; the caller turns it into the right offset via
 * offsetForDate(). "Heute" jumps to the current period.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function daysInMonth(y: number, m: number): number {
    return new Date(y, m + 1, 0).getDate();
}

interface WheelItem {
    label: string;
    value: number;
}

const ITEM_H = 36;
const VISIBLE = 5;
const PAD = (ITEM_H * (VISIBLE - 1)) / 2;
const WHEEL_H = ITEM_H * VISIBLE;

function Wheel({
    items,
    value,
    onChange,
    ariaLabel,
}: {
    items: WheelItem[];
    value: number;
    onChange: (v: number) => void;
    ariaLabel: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const settle = useRef<number | undefined>(undefined);
    const idx = Math.max(0, items.findIndex((it) => it.value === value));

    // Re-centre when the value changes from outside (e.g. day clamped by a
    // shorter month). During user scrolling value tracks the scroll, so the
    // guard keeps this from fighting the finger.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const target = idx * ITEM_H;
        if (Math.abs(el.scrollTop - target) > ITEM_H / 2) el.scrollTo({ top: target, behavior: 'smooth' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx]);

    const onScroll = () => {
        const el = ref.current;
        if (!el) return;
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(() => {
            const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
            if (items[i] && items[i].value !== value) onChange(items[i].value);
        }, 90);
    };

    return (
        <div style={{ position: 'relative', height: WHEEL_H, flex: 1 }}>
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: PAD,
                    height: ITEM_H,
                    borderTop: '1px solid var(--app-border)',
                    borderBottom: '1px solid var(--app-border)',
                    pointerEvents: 'none',
                }}
            />
            <div
                ref={ref}
                role="listbox"
                aria-label={ariaLabel}
                onScroll={onScroll}
                className="aura-no-scrollbar"
                style={{
                    height: WHEEL_H,
                    overflowY: 'auto',
                    scrollSnapType: 'y mandatory',
                    WebkitMaskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)',
                    maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)',
                }}
            >
                <div style={{ height: PAD }} />
                {items.map((it) => {
                    const sel = it.value === value;
                    return (
                        <div
                            key={it.value}
                            onClick={() => onChange(it.value)}
                            style={{
                                height: ITEM_H,
                                lineHeight: `${ITEM_H}px`,
                                textAlign: 'center',
                                scrollSnapAlign: 'center',
                                fontSize: 16,
                                cursor: 'pointer',
                                color: sel ? 'var(--accent)' : 'var(--text-secondary)',
                                fontWeight: sel ? 600 : 400,
                            }}
                        >
                            {it.label}
                        </div>
                    );
                })}
                <div style={{ height: PAD }} />
            </div>
        </div>
    );
}

export interface ChartDatePickerProps {
    mode: PeriodMode;
    initialDate: Date;
    /** Earliest selectable year (defaults to 3 years back). */
    minYear?: number;
    onApply: (y: number, m: number, d: number) => void;
    onClose: () => void;
}

export function ChartDatePicker({ mode, initialDate, minYear, onApply, onClose }: ChartDatePickerProps) {
    const portalTarget = usePortalTarget();
    const [y, setY] = useState(initialDate.getFullYear());
    const [m, setM] = useState(initialDate.getMonth());
    const [d, setD] = useState(initialDate.getDate());

    const maxD = daysInMonth(y, m);
    useEffect(() => {
        if (d > maxD) setD(maxD);
    }, [maxD, d]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    const nowYear = new Date().getFullYear();
    const firstYear = minYear ?? nowYear - 3;
    const years: WheelItem[] = [];
    for (let yy = firstYear; yy <= nowYear; yy++) years.push({ label: String(yy), value: yy });
    const monthItems = MONTHS_SHORT.map((l, i) => ({ label: l, value: i }));
    const dayItems = Array.from({ length: maxD }, (_, i) => ({ label: String(i + 1), value: i + 1 }));

    const lblStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 4 };
    const showDay = mode !== 'month';

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 320,
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    borderRadius: 14,
                    padding: 16,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Zeitpunkt wählen</span>
                    <button onClick={onClose} aria-label="Schließen" style={{ color: 'var(--text-secondary)', background: 'transparent' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    {showDay && (
                        <div style={{ flex: 1 }}>
                            <div style={lblStyle}>Tag</div>
                            <Wheel items={dayItems} value={d} onChange={setD} ariaLabel="Tag" />
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <div style={lblStyle}>Monat</div>
                        <Wheel items={monthItems} value={m} onChange={setM} ariaLabel="Monat" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={lblStyle}>Jahr</div>
                        <Wheel items={years} value={y} onChange={setY} ariaLabel="Jahr" />
                    </div>
                </div>

                <div style={{ marginTop: 14 }}>
                    <button
                        onClick={() => onApply(y, m, d)}
                        style={{ width: '100%', padding: 9, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500 }}
                    >
                        Bestätigen
                    </button>
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
