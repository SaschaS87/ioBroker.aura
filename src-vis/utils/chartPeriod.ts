/**
 * Shared time-range model for the dashboard charts (heating, room climate,
 * daily rain) so they all navigate identically: three views — Tag / 7 Tage /
 * Monat — paged by a single `offset` in that unit, with a wheel date-jump.
 *
 *   • day   — one calendar day        (offset steps by 1 day)
 *   • week  — 7 days ending today      (offset steps by 7 days)
 *   • month — one calendar month       (offset steps by 1 calendar month)
 */

export type PeriodMode = 'day' | 'week' | 'month';

export const PERIOD_LABELS: Record<PeriodMode, string> = { day: 'Tag', week: '7 Tage', month: 'Monat' };

export interface PeriodWindow {
    start: number;
    end: number;
}

export function startOfDay(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}

export function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

/** Absolute [start,end) window in ms for the given view and offset (0 = current). */
export function periodWindow(mode: PeriodMode, offset: number): PeriodWindow {
    const today0 = startOfDay(new Date());
    if (mode === 'day') {
        const s = addDays(today0, offset);
        return { start: s.getTime(), end: addDays(s, 1).getTime() };
    }
    if (mode === 'week') {
        const lastStart = addDays(today0, offset * 7);
        return { start: addDays(lastStart, -6).getTime(), end: addDays(lastStart, 1).getTime() };
    }
    const first = new Date(today0.getFullYear(), today0.getMonth() + offset, 1);
    const next = new Date(today0.getFullYear(), today0.getMonth() + offset + 1, 1);
    return { start: first.getTime(), end: next.getTime() };
}

/** Offset that lands the given view on the chosen date. Future dates clamp to the present (0). */
export function offsetForDate(mode: PeriodMode, y: number, m: number, d: number): number {
    const today0 = startOfDay(new Date());
    let off: number;
    if (mode === 'month') {
        off = (y - today0.getFullYear()) * 12 + (m - today0.getMonth());
    } else {
        const chosen = new Date(y, m, d);
        chosen.setHours(0, 0, 0, 0);
        const dd = Math.round((chosen.getTime() - today0.getTime()) / 86_400_000);
        off = mode === 'week' ? Math.floor((dd + 6) / 7) : dd;
    }
    return off > 0 ? 0 : off;
}

/** Human label for the pager: "Do 23.07.2026" / "17.07. – 23.07." / "Juli 2026". */
export function periodLabel(mode: PeriodMode, w: PeriodWindow): string {
    if (mode === 'day') {
        return new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (mode === 'month') {
        return new Date(w.start).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }
    const f = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return `${f(w.start)} – ${f(w.end - 86_400_000)}`;
}
