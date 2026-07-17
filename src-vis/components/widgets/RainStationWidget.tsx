import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudRain } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { formatNum } from '../../utils/formatValue';
import { formatLastChange } from '../../utils/formatLastChange';
import { useT } from '../../i18n';

export interface RainStationDef {
    name?: string;
    todayDp?: string;
    lastHourDp?: string;
    yesterdayDp?: string;
    currentDp?: string;
}

/**
 * Rain station card with a built-in station switcher: chevrons (vertically
 * centered over the upper block) and dots inside the card page through the
 * configured stations. Big numbers: today's sum (accent) and last hour;
 * yesterday + current rate as a small footer line. The last-change time of the
 * active station's current-rate datapoint sits right of the dots — it follows
 * the switcher, which the generic frame overlay (static datapoint) cannot.
 */
export function RainStationWidget({ config, editMode }: WidgetProps) {
    const t = useT();
    const o = config.options ?? {};
    const stations = (o.stations as RainStationDef[] | undefined) ?? [];
    const subtitle = (o.subtitle as string) ?? 'Netatmo-Station';
    const decimals = (o.decimals as number) ?? 1;

    const [idx, setIdx] = useState(0);
    const n = stations.length;
    const safeIdx = n > 0 ? Math.min(idx, n - 1) : 0;
    const st = stations[safeIdx] ?? {};

    const { value: vToday } = useDatapoint(st.todayDp ?? '');
    const { value: vHour } = useDatapoint(st.lastHourDp ?? '');
    const { value: vYesterday } = useDatapoint(st.yesterdayDp ?? '');
    const { state: currentState, value: vCurrent } = useDatapoint(st.currentDp ?? '');

    const lastChangedTs = currentState ? (currentState.lc > 0 ? currentState.lc : currentState.ts) : 0;
    const [, setTick] = useState(0);
    useEffect(() => {
        if (lastChangedTs === 0) return;
        const iv = window.setInterval(() => setTick((x) => x + 1), 30_000);
        return () => window.clearInterval(iv);
    }, [lastChangedTs]);

    // While ALL four values are still unloaded (initial fetches queued behind
    // the charts' history requests right after app start), show a loading
    // ellipsis instead of a misleading dash; real gaps keep the dash.
    const initialLoading =
        typeof vToday !== 'number' &&
        typeof vHour !== 'number' &&
        typeof vYesterday !== 'number' &&
        typeof vCurrent !== 'number';
    const num = (v: unknown) => (typeof v === 'number' ? formatNum(v, decimals) : initialLoading ? '…' : '–');
    const step = (d: number) => {
        if (n < 2) return;
        setIdx((i) => (Math.min(i, n - 1) + d + n) % n);
    };

    if (n === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center h-full gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <CloudRain size={24} strokeWidth={1.5} />
                <span className="text-xs">{editMode ? 'Stationen im Editor konfigurieren' : 'Keine Stationen konfiguriert'}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full justify-center" data-widget-interactive>
            {/* Upper block: chevrons vertically centered from card top to separator */}
            <div className="flex items-center gap-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        step(-1);
                    }}
                    className="shrink-0 focus:outline-none hover:opacity-70 transition-opacity"
                    style={{ background: 'transparent', opacity: n < 2 ? 0.3 : 1 }}
                    title="Vorherige Station"
                >
                    <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <div className="flex-1 min-w-0 text-center">
                    <div className="text-[15px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {st.name || `Station ${safeIdx + 1}`}
                    </div>
                    {subtitle && (
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {subtitle}
                        </div>
                    )}
                    <div className="flex justify-center gap-9 mt-2.5">
                        <div className="text-center">
                            <div className="text-2xl font-bold leading-none" style={{ color: 'var(--accent)' }}>
                                {num(vToday)}
                            </div>
                            <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                mm heute
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
                                {num(vHour)}
                            </div>
                            <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                mm letzte Std.
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        step(1);
                    }}
                    className="shrink-0 focus:outline-none hover:opacity-70 transition-opacity"
                    style={{ background: 'transparent', opacity: n < 2 ? 0.3 : 1 }}
                    title="Nächste Station"
                >
                    <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />
                </button>
            </div>

            {/* Footer line: yesterday + current rate */}
            <div
                className="text-center text-[11px] mt-2.5 pt-2"
                style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--app-border)' }}
            >
                Gestern {num(vYesterday)} mm · Aktuell {num(vCurrent)} mm
            </div>

            {/* Dots inside the card; last-change of the active station on the right */}
            <div className="relative flex items-center justify-center gap-1.5 mt-2" style={{ minHeight: 10 }}>
                {stations.map((_, i) => (
                    <button
                        key={i}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIdx(i);
                        }}
                        className="rounded-full focus:outline-none"
                        style={{
                            width: 6,
                            height: 6,
                            padding: 0,
                            border: 'none',
                            background: i === safeIdx ? 'var(--accent)' : 'var(--app-border)',
                        }}
                        title={stations[i].name || `Station ${i + 1}`}
                    />
                ))}
                {lastChangedTs > 0 && (
                    <span
                        className="absolute right-0 text-[9px] opacity-50 leading-none"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {formatLastChange(
                            t as (k: string, v?: Record<string, string | number>) => string,
                            lastChangedTs,
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}
