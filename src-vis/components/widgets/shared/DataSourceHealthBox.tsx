import { useState, useMemo, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDashboardMobile } from '../../../contexts/DashboardMobileContext';
import { useIoBroker, sendToDirect, getStateFromCache } from '../../../hooks/useIoBroker';
import { SEVERITY_COLOR } from '../../../utils/statusOverview';
import { NS } from '../../../utils/namespace';
import { localTime } from '../../../utils/formatTime';
import type { ioBrokerState } from '../../../types';

// ── Data-source health box (Variante D) — collapsible status card. Header
// always shows a dot + short status ("alles aktuell" / "N Problem(e)"),
// even collapsed. Health is computed client-side by comparing each watched
// datapoint's own `ts` (last write — NOT `lc`/last-change, since a value
// that happens to stay constant for hours must not read as "stale") against
// a configured max age, so no backend detection script is required.
//
// Extracted from WeatherForecastStripWidget.tsx (Rollläden-Umbau, 01.09.2026)
// so shutterfloors can reuse the same box instead of a
// widget-specific footer pill. Extended with `requireTrueDps`: some sources
// aren't detectable via freshness of their last write at all — e.g.
// tahoma.1.info.connection keeps its last value (often still `true`) after
// the adapter has stopped writing, so an age-only check would have missed
// the outage from 30.08.2026 (see ShutterFloorsWidget.tsx conn-banner
// comment). When set, ALL listed datapoints must be `true` for the source to
// count as healthy; otherwise the existing age-based check applies.
export interface HealthSourceDef {
    id: string;
    label: string;
    watchDp: string; // datapoint whose ts (last write) is checked for freshness
    maxAgeMin: number; // flagged unhealthy once older than this (ignored once requireTrueDps is set and non-empty)
    // Bare "adapter.instance" (e.g. "netatmo-crawler.0") — restarted via the existing
    // aura.0 'restartAdapter' backend command (main.js onMessage), the same
    // enable→disable→enable toggle AdapterStatusWidget already uses.
    restartAdapterId?: string;
    // Extra read-only info lines shown under this source's row when expanded
    // (e.g. Open-Meteo's model-run provenance, migrated from the old standalone
    // footer). Each dp's value is treated as an ISO timestamp and formatted via
    // localTime(), joined with " · ".
    detailDps?: { label: string; dp: string }[];
    // Datapoints that must ALL be `true` for this source to count as healthy —
    // used when freshness alone can't detect an outage (see comment above).
    requireTrueDps?: string[];
}

// Union of every datapoint id a set of sources needs to watch — each source's
// own watchDp plus all of its detailDps and requireTrueDps, deduplicated (a dp
// can appear in more than one of these, e.g. Open-Meteo's watchDp IS one of
// its own detailDps).
function allWatchedDpIds(sources: HealthSourceDef[]): string[] {
    const set = new Set<string>();
    for (const s of sources) {
        set.add(s.watchDp);
        for (const d of s.detailDps ?? []) set.add(d.dp);
        for (const dp of s.requireTrueDps ?? []) set.add(dp);
    }
    return Array.from(set);
}

// Short "vor X"/"seit X" fragment (not a full sentence — formatLastChange's
// i18n strings don't fit this compact row layout).
export function formatAgeShort(ts: number): string {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return `${min} Min.`;
    const h = Math.round(min / 60);
    if (h < 48) return `${h} Std.`;
    const d = Math.round(h / 24);
    return `${d} Tage`;
}

type RestartPhase = 'restarting' | 'waiting' | 'done';

export function DataSourceHealthBox({ sources }: { sources: HealthSourceDef[] }) {
    const isMobile = useDashboardMobile();
    const { subscribe, getState } = useIoBroker();
    // Pre-fill from the socket cache (same pattern as useDatapoint.ts) so a source
    // already known from an earlier subscription renders immediately instead of
    // flashing "unhealthy" for the split second before getState() resolves.
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>(() => {
        const init: Record<string, ioBrokerState | null> = {};
        for (const id of allWatchedDpIds(sources)) {
            const cached = getStateFromCache(id);
            if (cached) init[id] = cached;
        }
        return init;
    });
    // Tracks whether each source's FIRST real answer (cache hit, getState, or a
    // live subscribe push) has arrived yet, for EVERY datapoint it depends on
    // (watchDp + requireTrueDps) — until all of them have answered at least
    // once, the row must not count toward problemCount (ts===0 / missing
    // requireTrueDps value before loading means "not fetched yet", not
    // "stale"/"false"; avoids a brief "Problem" flash before the first reply).
    const [loaded, setLoaded] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const id of allWatchedDpIds(sources)) {
            if (getStateFromCache(id)) init[id] = true;
        }
        return init;
    });
    const [expanded, setExpanded] = useState(false);
    const [restartPhase, setRestartPhase] = useState<Record<string, RestartPhase>>({});
    const [restartError, setRestartError] = useState<Record<string, string>>({});

    // Re-render every 30s so "vor/seit X" keeps advancing even without new events.
    const [, setTick] = useState(0);
    useEffect(() => {
        const iv = window.setInterval(() => setTick((x) => x + 1), 30_000);
        return () => window.clearInterval(iv);
    }, []);

    const dpIds = allWatchedDpIds(sources);
    const sourceKey = dpIds.join(',');
    useEffect(() => {
        if (!dpIds.length) {
            setStates({});
            setLoaded({});
            return;
        }
        dpIds.forEach((id) =>
            getState(id).then((st) => {
                setStates((prev) => ({ ...prev, [id]: st }));
                setLoaded((prev) => ({ ...prev, [id]: true }));
            }),
        );
        const unsubs = dpIds.map((id) =>
            subscribe(id, (st) => {
                setStates((prev) => ({ ...prev, [id]: st }));
                setLoaded((prev) => ({ ...prev, [id]: true }));
            }),
        );
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceKey]);

    const rows = useMemo(
        () =>
            sources.map((s) => {
                const ts = states[s.watchDp]?.ts ?? 0;
                const requireTrueDps = s.requireTrueDps ?? [];
                let healthy: boolean;
                let isLoaded: boolean;
                if (requireTrueDps.length > 0) {
                    healthy = requireTrueDps.every((dp) => states[dp]?.val === true);
                    isLoaded = requireTrueDps.every((dp) => loaded[dp] ?? false) && (loaded[s.watchDp] ?? false);
                } else {
                    healthy = ts > 0 && Date.now() - ts <= s.maxAgeMin * 60_000;
                    isLoaded = loaded[s.watchDp] ?? false;
                }
                return { ...s, ts, healthy, isLoaded };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sources, states, loaded],
    );

    // Clear a finished restart sequence once the source is healthy again.
    useEffect(() => {
        for (const r of rows) {
            if (restartPhase[r.id] === 'waiting' && r.healthy) {
                setRestartPhase((prev) => ({ ...prev, [r.id]: 'done' }));
                window.setTimeout(() => {
                    setRestartPhase((prev) => {
                        const next = { ...prev };
                        delete next[r.id];
                        return next;
                    });
                }, 4000);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows]);

    if (sources.length === 0) return null;

    const problemCount = rows.filter((r) => r.isLoaded && !r.healthy).length;
    const hasProblem = problemCount > 0;

    const triggerRestart = async (r: (typeof rows)[number]) => {
        if (!r.restartAdapterId) return;
        setRestartError((prev) => {
            const next = { ...prev };
            delete next[r.id];
            return next;
        });
        setRestartPhase((prev) => ({ ...prev, [r.id]: 'restarting' }));
        const result = await sendToDirect(NS, 'restartAdapter', { id: r.restartAdapterId });
        const res = result as { ok?: boolean; error?: string } | null;
        if (!res?.ok) {
            setRestartError((prev) => ({ ...prev, [r.id]: res?.error || 'Neustart fehlgeschlagen' }));
            setRestartPhase((prev) => {
                const next = { ...prev };
                delete next[r.id];
                return next;
            });
            return;
        }
        setRestartPhase((prev) => ({ ...prev, [r.id]: 'waiting' }));
        // Safety timeout: stop waiting after 2 min even if it never recovers.
        window.setTimeout(() => {
            setRestartPhase((prev) => {
                if (prev[r.id] !== 'waiting') return prev;
                const next = { ...prev };
                delete next[r.id];
                return next;
            });
        }, 120_000);
    };

    return (
        <div
            style={{
                background: 'var(--widget-bg)',
                border: '1px solid var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
                overflow: 'hidden',
                // Als direktes Flex-Kind (z.B. im Rollläden-Tab, .shutter-floors-widget
                // ist flex-column mit fester Kartenhoehe) bekommt ein Element mit
                // overflow:hidden per Spezifikation eine automatische Mindesthoehe von
                // 0 - die Box durfte sich also bis auf wenige Pixel zusammenquetschen
                // lassen, wenn der Etageninhalt mehr Platz brauchte als die Karte hoch
                // war (auf grossen Bildschirmen, mit genug sichtbaren Geraeten, sichtbar
                // als duenner Strich statt der Kopfzeile). Von Sascha am 03.09.2026
                // gemeldet. flexShrink: 0 haelt die Box auf ihrer Inhaltshoehe, genau
                // wie es der SignalStrengthBox-Wrapper (overflow: visible) schon von
                // selbst tut - die Seite scrollt dann einfach etwas weiter, statt die
                // Kopfzeile zu verschlucken.
                flexShrink: 0,
            }}
        >
            <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center"
                style={{
                    width: '100%',
                    gap: 8,
                    padding: '9px 12px',
                    background: hasProblem ? `color-mix(in srgb, ${SEVERITY_COLOR.crit} 12%, transparent)` : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: hasProblem ? SEVERITY_COLOR.crit : SEVERITY_COLOR.ok,
                        flexShrink: 0,
                    }}
                />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Datenquellen · {hasProblem ? `${problemCount} ${problemCount === 1 ? 'Problem' : 'Probleme'}` : 'alles aktuell'}
                </span>
                <ChevronDown
                    size={14}
                    style={{
                        color: 'var(--text-secondary)',
                        transform: expanded ? 'rotate(180deg)' : undefined,
                        transition: 'transform 0.2s',
                    }}
                />
            </button>
            {expanded && (
                <div style={{ padding: '2px 12px 12px', borderTop: '1px solid var(--widget-border)' }}>
                    {rows.map((r) => (
                        <div key={r.id}>
                            <div className="flex items-center" style={{ gap: 8, padding: '6px 0', fontSize: 12 }}>
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: !r.isLoaded
                                            ? 'var(--text-secondary)'
                                            : r.healthy
                                              ? SEVERITY_COLOR.ok
                                              : SEVERITY_COLOR.crit,
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{r.label}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                                    {!r.isLoaded
                                        ? 'wird geprüft…'
                                        : r.ts > 0
                                          ? `${r.healthy ? 'vor' : 'seit'} ${formatAgeShort(r.ts)}`
                                          : 'keine Daten'}
                                </span>
                            </div>
                            {r.detailDps && r.detailDps.length > 0 && (
                                <div
                                    style={{
                                        padding: '0 0 6px 14px',
                                        marginLeft: 3,
                                        borderLeft: '2px solid var(--widget-border)',
                                        fontSize: 10.5,
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {(() => {
                                        const parts = r.detailDps!.map((d) => {
                                            const v = states[d.dp]?.val;
                                            return `${d.label} ${localTime(typeof v === 'string' ? v : null)} Uhr`;
                                        });
                                        if (!isMobile) return parts.join(' · ');
                                        return parts
                                            .reduce<string[]>((lines, text, i) => {
                                                if (i % 2 === 0) lines.push(text);
                                                else lines[lines.length - 1] += ` · ${text}`;
                                                return lines;
                                            }, [])
                                            .map((line, i) => <div key={i}>{line}</div>);
                                    })()}
                                </div>
                            )}
                        </div>
                    ))}
                    {rows
                        .filter((r) => r.isLoaded && !r.healthy && r.restartAdapterId)
                        .map((r) => {
                            const phase = restartPhase[r.id];
                            const label =
                                phase === 'restarting'
                                    ? 'wird neu gestartet…'
                                    : phase === 'waiting'
                                      ? 'warte auf frische Daten…'
                                      : phase === 'done'
                                        ? '✓ erledigt'
                                        : `${r.label} neu starten`;
                            return (
                                <div key={r.id}>
                                    <button
                                        onClick={() => triggerRestart(r)}
                                        disabled={!!phase}
                                        className="inline-flex items-center"
                                        style={{
                                            marginTop: 6,
                                            padding: '6px 12px',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: '#fff',
                                            background: phase ? 'var(--text-secondary)' : 'var(--accent, #06b6d4)',
                                            border: 'none',
                                            borderRadius: 6,
                                            cursor: phase ? 'default' : 'pointer',
                                        }}
                                    >
                                        {label}
                                    </button>
                                    {restartError[r.id] && (
                                        <div style={{ marginTop: 4, fontSize: 11, color: SEVERITY_COLOR.crit }}>
                                            {restartError[r.id]}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
