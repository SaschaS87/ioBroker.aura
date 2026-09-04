import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChartDatePicker } from './ChartDatePicker';
import { PERIOD_LABELS, periodWindow, periodLabel, offsetForDate, type PeriodMode } from '../../utils/chartPeriod';

/**
 * Shared chart navigation row used by every dashboard chart so they behave
 * identically: view chips (Tag / 7 Tage / Monat) on the left, then the date
 * field (opens the wheel date-jump popup) and the prev / Heute / next arrows on
 * the right. Controlled — the widget owns { mode, offset }.
 */
export function ChartPeriodNav({
    mode,
    offset,
    onMode,
    onOffset,
    minYear,
}: {
    mode: PeriodMode;
    offset: number;
    onMode: (m: PeriodMode) => void;
    onOffset: (o: number) => void;
    minYear?: number;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const win = periodWindow(mode, offset);
    const label = periodLabel(mode, win);

    const btnCls = 'shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium hover:opacity-80 transition-opacity';
    const st = (active: boolean) => ({
        background: active ? 'var(--accent)' : 'var(--app-border)',
        color: active ? '#fff' : 'var(--text-secondary)',
    });
    const unit = mode === 'month' ? 'Monat' : mode === 'week' ? 'Woche' : 'Tag';

    return (
        <div className="shrink-0 flex items-center justify-between gap-2 min-w-0">
            <div className="flex gap-1 min-w-0 overflow-x-auto aura-no-scrollbar">
                {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((m) => (
                    <button
                        key={m}
                        className={btnCls}
                        style={st(mode === m)}
                        onClick={(e) => {
                            e.stopPropagation();
                            onMode(m);
                        }}
                    >
                        {PERIOD_LABELS[m]}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button
                    className="shrink-0 inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded whitespace-nowrap hover:opacity-80"
                    style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                    title="Zeitpunkt wählen"
                    onClick={(e) => {
                        e.stopPropagation();
                        setPickerOpen(true);
                    }}
                >
                    <CalendarDays size={11} />
                    <span className="text-[10px] font-medium">{label}</span>
                    <ChevronDown size={10} style={{ opacity: 0.6 }} />
                </button>
                <button
                    className={btnCls}
                    style={st(false)}
                    title={`Ein${unit === 'Woche' ? 'e' : 'en'} ${unit} zurück`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOffset(offset - 1);
                    }}
                >
                    <ChevronLeft size={12} />
                </button>
                <button
                    className={btnCls}
                    style={st(offset === 0)}
                    title="Zum aktuellen Zeitraum"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOffset(0);
                    }}
                >
                    Heute
                </button>
                <button
                    className={`${btnCls} disabled:opacity-40`}
                    style={st(false)}
                    title={`Ein${unit === 'Woche' ? 'e' : 'en'} ${unit} vor`}
                    disabled={offset >= 0}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOffset(offset < 0 ? offset + 1 : offset);
                    }}
                >
                    <ChevronRight size={12} />
                </button>
            </div>
            {pickerOpen && (
                <ChartDatePicker
                    mode={mode}
                    initialDate={new Date(win.start)}
                    minYear={minYear}
                    onApply={(y, m, d) => {
                        onOffset(offsetForDate(mode, y, m, d));
                        setPickerOpen(false);
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    );
}
