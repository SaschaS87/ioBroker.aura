import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIoBroker, getStateFromCache } from '../../../hooks/useIoBroker';
import { SEVERITY_COLOR } from '../../../utils/statusOverview';
import { useT } from '../../../i18n';
import type { ioBrokerState } from '../../../types';
import {
    radioDpsFromPosDp,
    radioLevel,
    isRadioOffline,
    RADIO_COLOR,
    clockTime,
    type RadioLevel,
} from '../shuttershared/tahomaRadio';
import { formatAgeShort } from './DataSourceHealthBox';

// ── Signal-strength box (Feature 16, 02.09.2026) — collapsible card fuer die
// TaHoma-Funk-States aller Antriebe. Baumuster 1:1 von DataSourceHealthBox
// (Rahmen, Kopfzeile mit Punkt, aufgeklappter Bereich) uebernommen, aber
// eigene Zeilenlogik: Balken statt Alter, "unveraendert seit" statt
// "aktualisiert vor" (Befund 3, siehe Feature-Doku - ein unveraenderter Wert
// wird vom Adapter gar nicht neu geschrieben, "aktualisiert" waere falsch).
// Inline-Styles wie im Vorbild, keine eigene CSS-Datei - haelt die Box aus
// dem customCSS in aura.0.config.app-config heraus.

export interface SignalStrengthDeviceDef {
    key: string;
    label: string;
    posDp: string;
}

interface SignalStrengthBoxProps {
    devices: SignalStrengthDeviceDef[];
    updateDp?: string;
}

// "gut"/"normal"/"schwach" fuer die Urteils-Spalte - kuerzer als die
// "Funk gut"-Formulierung der Sheet-Fusszeile (shuttersheet.radio.*), die
// dort das Wort "Funk" braucht, weil sie ausserhalb einer Signalstaerke-Box
// steht. Hier steht "Signalstärke" schon im Titel drueber.
const JUDGEMENT_LABEL: Record<'good' | 'normal' | 'low', string> = {
    good: 'gut',
    normal: 'normal',
    low: 'schwach',
};

function judgementColor(level: RadioLevel): string {
    if (!level) return 'var(--text-secondary)';
    return RADIO_COLOR[level] ?? 'var(--text-secondary)';
}

function clampPct(n: number): number {
    return Math.min(100, Math.max(0, n));
}

// Union aller Funk-Datenpunkte fuer die uebergebenen Geraete, dedupliziert.
function allRadioDpIds(devices: SignalStrengthDeviceDef[]): string[] {
    const set = new Set<string>();
    for (const d of devices) {
        const dps = radioDpsFromPosDp(d.posDp);
        if (!dps) continue;
        set.add(dps.statusDp);
        set.add(dps.rssiDp);
        set.add(dps.discreteDp);
    }
    return Array.from(set);
}

export function SignalStrengthBox({ devices, updateDp }: SignalStrengthBoxProps) {
    const { subscribe, getState, setState } = useIoBroker();
    const t = useT();

    const dpIds = useMemo(() => allRadioDpIds(devices), [devices]);

    // Vorbefuellung aus dem Socket-Cache gegen Flackern (1:1 DataSourceHealthBox).
    const [states, setStates] = useState<Record<string, ioBrokerState | null>>(() => {
        const init: Record<string, ioBrokerState | null> = {};
        for (const id of dpIds) {
            const cached = getStateFromCache(id);
            if (cached) init[id] = cached;
        }
        return init;
    });
    const [loaded, setLoaded] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const id of dpIds) {
            if (getStateFromCache(id)) init[id] = true;
        }
        return init;
    });
    const [expanded, setExpanded] = useState(false);
    const [remeasuring, setRemeasuring] = useState(false);
    const remeasureTimeoutRef = useRef<number | null>(null);

    // Risiko: ~45 dauerhafte Abos, auch zugeklappt - noetig, weil die Kopfzeile
    // ("schwächste 62") ohne Aufklappen stimmen muss. Siehe Feature-Doku.
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

    useEffect(() => {
        return () => {
            if (remeasureTimeoutRef.current !== null) window.clearTimeout(remeasureTimeoutRef.current);
        };
    }, []);

    const rows = useMemo(() => {
        return devices
            .map((d) => {
                const dps = radioDpsFromPosDp(d.posDp);
                if (!dps) return null;
                const statusVal = states[dps.statusDp]?.val;
                const offline = isRadioOffline(statusVal);
                const level = radioLevel(states[dps.discreteDp]?.val);
                const rssiVal = states[dps.rssiDp]?.val;
                const rssi = typeof rssiVal === 'number' ? rssiVal : null;
                // Ausfall: seit wann (lc des StatusState). Normalfall: wann
                // zuletzt geaendert (lc des RSSILevelState, Fallback ts).
                const sinceTs = states[dps.statusDp]?.lc ?? 0;
                const unchangedTs = states[dps.rssiDp]?.lc ?? states[dps.rssiDp]?.ts ?? 0;
                return { key: d.key, label: d.label, offline, level, rssi, sinceTs, unchangedTs };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);
    }, [devices, states]);

    // Sortierung: erst alle offline, dann nach rssi aufsteigend, Geraete ohne
    // Zahl zuletzt.
    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            if (a.offline !== b.offline) return a.offline ? -1 : 1;
            if (a.rssi === null && b.rssi === null) return 0;
            if (a.rssi === null) return 1;
            if (b.rssi === null) return -1;
            return a.rssi - b.rssi;
        });
    }, [rows]);

    // Zuletzt durchgezaehlt: groesstes ts ueber alle core:StatusState (laut
    // Befund 2 ohnehin gleich - das Maximum ist die robuste Wahl).
    const lastCountTs = useMemo(() => {
        let max = 0;
        for (const d of devices) {
            const dps = radioDpsFromPosDp(d.posDp);
            if (!dps) continue;
            const ts = states[dps.statusDp]?.ts ?? 0;
            if (ts > max) max = ts;
        }
        return max;
    }, [devices, states]);

    if (devices.length === 0) return null;

    const anyAnswered = dpIds.some((id) => loaded[id]);
    const offlineDevices = rows.filter((r) => r.offline);
    const hasOffline = offlineDevices.length > 0;
    const hasLow = rows.some((r) => !r.offline && r.level === 'low');
    const validRssi = rows.filter((r) => !r.offline && r.rssi !== null).map((r) => r.rssi as number);
    const weakestRssi = validRssi.length > 0 ? Math.min(...validRssi) : null;

    // Grau, solange noch kein Datenpunkt geantwortet hat - kein Fehlalarm
    // beim Laden, wie im Vorbild DataSourceHealthBox.
    const dotColor = !anyAnswered
        ? 'var(--text-secondary)'
        : hasOffline
          ? SEVERITY_COLOR.crit
          : hasLow
            ? 'var(--accent-yellow)'
            : SEVERITY_COLOR.ok;

    const headerSuffix = hasOffline
        ? t('signalbox.offlineCount', { count: offlineDevices.length })
        : weakestRssi !== null
          ? t('signalbox.weakest', { value: weakestRssi })
          : null;
    const headerText = headerSuffix ? `${t('signalbox.title')} · ${headerSuffix}` : t('signalbox.title');

    const handleRemeasure = () => {
        if (!updateDp || remeasuring) return;
        setState(updateDp, true);
        setRemeasuring(true);
        remeasureTimeoutRef.current = window.setTimeout(() => setRemeasuring(false), 20_000);
    };

    return (
        <div
            style={{
                background: 'var(--widget-bg)',
                border: '1px solid var(--widget-border)',
                borderRadius: 'var(--widget-radius)',
                overflow: 'hidden',
            }}
        >
            <button
                onClick={() => setExpanded((e) => !e)}
                className="flex items-center"
                style={{
                    width: '100%',
                    gap: 8,
                    padding: '9px 12px',
                    background: hasOffline
                        ? `color-mix(in srgb, ${SEVERITY_COLOR.crit} 12%, transparent)`
                        : 'transparent',
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
                        background: dotColor,
                        flexShrink: 0,
                    }}
                />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {headerText}
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
                    {sortedRows.map((r) => (
                        <div
                            key={r.key}
                            className="flex items-center"
                            style={{ gap: 8, padding: '6px 0', fontSize: 12 }}
                        >
                            {/* Name-Spalte: flex: 1 gibt ihr den Rest, minWidth: 0 hebt
                                Flexboxens Default-Mindestbreite (auto = eigene Wortbreite)
                                auf - erst dadurch darf sie unter ihren Inhalt schrumpfen und
                                abschneiden statt die Zeile zu sprengen. Korrektur 03.09.2026:
                                vorher gab es dafuer keinen Platz, ein einzelnes langes Wort
                                ohne Leerstelle ("Speisekammer") drueckte sich seinen Raum,
                                wodurch Balken/Zahl/Urteil in jeder Zeile an anderer Stelle
                                standen - der Bug, den Sascha am Screenshot gezeigt hat. */}
                            <span
                                title={r.label}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {r.label}
                            </span>
                            {r.offline ? (
                                <>
                                    <span style={{ color: 'var(--accent-red)', flexShrink: 0 }}>
                                        {t('signalbox.offlineRow')}
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}>
                                        {t('shuttersheet.radio.since', { time: clockTime(r.sinceTs) })}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span
                                        style={{
                                            width: 44,
                                            height: 4,
                                            borderRadius: 2,
                                            background: 'var(--widget-border)',
                                            overflow: 'hidden',
                                            display: 'inline-block',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: 'block',
                                                height: '100%',
                                                width: `${clampPct(r.rssi ?? 0)}%`,
                                                background: judgementColor(r.level),
                                            }}
                                        />
                                    </span>
                                    {/* Zahl/Urteil/Zeit: alle drei jetzt mit flexShrink: 0 (fehlte
                                        vorher bei Zahl und Urteil) - ohne das schrumpften sie
                                        unterschiedlich stark je nachdem, wie viel Platz die
                                        Namens-Spalte in genau dieser Zeile beanspruchte. */}
                                    <span
                                        style={{
                                            width: 22,
                                            flexShrink: 0,
                                            textAlign: 'right',
                                            fontVariantNumeric: 'tabular-nums',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {r.rssi !== null ? r.rssi : '–'}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            color: judgementColor(r.level),
                                            width: 46,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {r.level ? JUDGEMENT_LABEL[r.level] : ''}
                                    </span>
                                    <span
                                        title={t('signalbox.unchangedSince', { age: formatAgeShort(r.unchangedTs) })}
                                        style={{
                                            // Nur noch der Alterswert, ohne "unveraendert seit"
                                            // (Korrektur 03.09.2026): der volle Satz braucht 143px
                                            // im laengsten Fall ("gerade eben") - zusammen mit den
                                            // anderen vier Spalten blieb dafuer auf dem iPhone (334px
                                            // Zeilenbreite) schlicht kein Platz fuer die Namens-Spalte
                                            // mehr. Der volle Satz steht weiter als title-Tooltip zur
                                            // Verfuegung. Breite 66px deckt den laengsten Fall
                                            // ("gerade eben", 62px) mit etwas Luft.
                                            width: 66,
                                            flexShrink: 0,
                                            textAlign: 'right',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            fontSize: 11,
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {formatAgeShort(r.unchangedTs)}
                                    </span>
                                </>
                            )}
                        </div>
                    ))}

                    {/* Neu-messen-Knopf neben statt ueber den zwei Textzeilen - spart
                        eine Zeile Hoehe (Saschas Wunsch vom 02.09.2026). */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {updateDp && (
                            <button
                                onClick={handleRemeasure}
                                disabled={remeasuring}
                                className="inline-flex items-center"
                                style={{
                                    flexShrink: 0,
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: remeasuring ? 'var(--text-secondary)' : 'var(--accent, #06b6d4)',
                                    border: 'none',
                                    borderRadius: 6,
                                    cursor: remeasuring ? 'default' : 'pointer',
                                }}
                            >
                                {remeasuring ? t('signalbox.remeasuring') : t('signalbox.remeasure')}
                            </button>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {lastCountTs > 0 && <div>{t('signalbox.lastCount', { time: clockTime(lastCountTs) })}</div>}
                            <div>{t('signalbox.hint')}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
