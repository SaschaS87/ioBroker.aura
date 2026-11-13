/**
 * UI-Facelift, Heizung (nur Dev-Vorschau): Zeitraum-Wahl über einem Diagramm in zwei Zeilen, wie im
 * Wohnklima-Pop-up (Sascha, 13.11.2026: einzeilig überlagern sich die Knöpfe am iPhone).
 *   Zeile 1: Segment-Schalter Tag / 7 Tage / Monat über die volle Breite
 *   Zeile 2: zurück, Datum (öffnet die Auswahl), vor, Heute
 * Gleiche Angaben wie ChartPeriodNav, das bei „Ist" und „Alt" unverändert weiterläuft.
 */
import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChartDatePicker } from '../ChartDatePicker';
import { PERIOD_LABELS, offsetForDate, periodLabel, periodWindow, type PeriodMode } from '../../../utils/chartPeriod';

export function HeizungPeriodNav({
    mode,
    offset,
    onMode,
    onOffset,
}: {
    mode: PeriodMode;
    offset: number;
    onMode: (m: PeriodMode) => void;
    onOffset: (o: number) => void;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const win = periodWindow(mode, offset);
    const unit = mode === 'month' ? 'Monat' : mode === 'week' ? 'Woche' : 'Tag';
    const one = unit === 'Woche' ? 'Eine' : 'Einen';
    return (
        <div className="hz-pnav">
            <div className="hz-seg" role="tablist" aria-label="Zeitraum">
                {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={mode === m}
                        className="hz-seg-btn"
                        data-on={mode === m || undefined}
                        onClick={() => onMode(m)}
                    >
                        {PERIOD_LABELS[m]}
                    </button>
                ))}
            </div>
            <div className="hz-nav">
                <button type="button" className="hz-nav-arrow" aria-label={`${one} ${unit} zurück`} onClick={() => onOffset(offset - 1)}>
                    <ChevronLeft size={20} />
                </button>
                <button type="button" className="hz-nav-date" title="Zeitpunkt wählen" onClick={() => setPickerOpen(true)}>
                    <CalendarDays size={14} className="hz-nav-date-ico" />
                    <span className="hz-nav-date-label">{periodLabel(mode, win)}</span>
                    <ChevronDown size={13} className="hz-nav-date-ico" />
                </button>
                <button
                    type="button"
                    className="hz-nav-arrow"
                    aria-label={`${one} ${unit} vor`}
                    disabled={offset >= 0}
                    onClick={() => onOffset(offset < 0 ? offset + 1 : offset)}
                >
                    <ChevronRight size={20} />
                </button>
                <button type="button" className="hz-nav-today" disabled={offset === 0} onClick={() => onOffset(0)}>
                    Heute
                </button>
            </div>
            {pickerOpen && (
                <ChartDatePicker
                    mode={mode}
                    initialDate={new Date(win.start)}
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
