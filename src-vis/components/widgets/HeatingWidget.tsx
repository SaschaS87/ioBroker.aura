import { useState, useEffect } from 'react';
import { Flame, Droplet, Power, RefreshCw, Snowflake, Zap, type LucideIcon } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { formatNum } from '../../utils/formatValue';
import type { WidgetProps } from '../../types';

/**
 * Heating widget for Sascha's STIEBEL ELTRON LWZ 304 Trend heat pump.
 *
 * Layout (agreed mockup "V2"): the widget frame is a neutral container holding
 *   1. a header row (Heizung / outside temp),
 *   2. a coloured STATUS card — the "switch" — that turns green (heating) /
 *      blue (hot water) / neutral (idle); shows "compressor on since X min" and
 *      the three process icons (pump / defrost / booster),
 *   3. a SEPARATE 2x2 tile row below it (flow/return, spread, volume, COP).
 * The tiles are NOT inside the coloured status card.
 *
 * Datapoints come from config.options but fall back to the real LWZ / stiebel
 * ids below, so the widget works immediately. A later editor config panel will
 * write the very same option keys (picker-with-defaults) — no rework here.
 */

const DEFAULT_DP = {
    heizenDp: 'javascript.0.LWZ.HEIZEN',
    warmwasserDp: 'javascript.0.LWZ.WARMWASSERAUFBEREITUNG',
    verdichterDp: 'javascript.0.LWZ.VERDICHTER',
    pumpeDp: 'javascript.0.LWZ.HEIZKREISPUMPE',
    abtauenDp: 'javascript.0.LWZ.ABTAUEN_VERDAMPFER',
    heizstabDp: 'javascript.0.LWZ.ELEKTRISCHE_NACHERWÄRMUNG',
    aussenDp: 'stiebel-isg.0.Info.ANLAGE.HEIZEN.AUSSENTEMPERATUR',
    vorlaufDp: 'stiebel-isg.0.Info.ANLAGE.HEIZEN.VORLAUFTEMP',
    ruecklaufDp: 'stiebel-isg.0.Info.ANLAGE.HEIZEN.RÜCKLAUFTEMP',
    spreizungDp: 'javascript.0.LWZ.SPREIZUNG',
    volumenstromDp: 'stiebel-isg.0.Info.ANLAGE.HEIZEN.VOLUMENSTROM',
    wmHeizenDp: 'stiebel-isg.0.Info.WÄRMEPUMPE.WÄRMEMENGE.WM_HEIZEN_SUMME',
    wmWwDp: 'stiebel-isg.0.Info.WÄRMEPUMPE.WÄRMEMENGE.WM_WW_SUMME',
    pHeizungDp: 'stiebel-isg.0.Info.WÄRMEPUMPE.LEISTUNGSAUFNAHME.P_HEIZUNG_SUMME',
    pWwDp: 'stiebel-isg.0.Info.WÄRMEPUMPE.LEISTUNGSAUFNAHME.P_WW_SUMME',
} as const;
type DpKey = keyof typeof DEFAULT_DP;

// Colour of the STATUS card only (not the whole widget). Low-opacity fills read
// in both light and dark themes; idle is a quiet neutral card (no green/blue).
const MODE_STYLE = {
    heat: {
        color: '#4a9e2f',
        bg: 'color-mix(in srgb, #4a9e2f 18%, var(--widget-bg))',
        border: 'color-mix(in srgb, #4a9e2f 45%, var(--widget-border))',
    },
    water: {
        color: '#2f7fd6',
        bg: 'color-mix(in srgb, #2f7fd6 18%, var(--widget-bg))',
        border: 'color-mix(in srgb, #2f7fd6 45%, var(--widget-border))',
    },
    // Idle uses the exact standard widget card look (opaque --widget-bg).
    idle: { color: 'var(--text-secondary)', bg: 'var(--widget-bg)', border: 'var(--widget-border)' },
} as const;

const asBool = (v: unknown) => v === true || v === 1 || v === 'true';
const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function StatusChip({ Icon, label, on, onColor }: { Icon: LucideIcon; label: string; on: boolean; onColor: string }) {
    return (
        <span
            className="inline-flex items-center gap-1.5"
            style={{ fontSize: 12, color: on ? onColor : 'var(--text-secondary)', opacity: on ? 1 : 0.72, fontWeight: on ? 500 : 400 }}
        >
            <Icon size={15} />
            {label}
        </span>
    );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{ background: 'var(--widget-bg)', border: '1px solid var(--widget-border)', borderRadius: 'var(--widget-radius)', padding: '9px 11px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: color || 'var(--text-primary)', marginTop: 2 }}>{value}</div>
        </div>
    );
}

export function HeatingWidget({ config }: WidgetProps) {
    const o = config.options ?? {};
    const dp = (k: DpKey) => (o[k] as string) || DEFAULT_DP[k];

    const { value: heizenVal } = useDatapoint(dp('heizenDp'));
    const { value: warmwasserVal } = useDatapoint(dp('warmwasserDp'));
    const { value: verdichterVal, state: verdichterState } = useDatapoint(dp('verdichterDp'));
    const { value: pumpeVal } = useDatapoint(dp('pumpeDp'));
    const { value: abtauenVal } = useDatapoint(dp('abtauenDp'));
    const { value: heizstabVal } = useDatapoint(dp('heizstabDp'));
    const { value: aussenVal } = useDatapoint(dp('aussenDp'));
    const { value: vorlaufVal } = useDatapoint(dp('vorlaufDp'));
    const { value: ruecklaufVal } = useDatapoint(dp('ruecklaufDp'));
    const { value: spreizungVal } = useDatapoint(dp('spreizungDp'));
    const { value: volumenstromVal } = useDatapoint(dp('volumenstromDp'));

    const heizen = asBool(heizenVal);
    const warmwasser = asBool(warmwasserVal);
    const verdichter = asBool(verdichterVal);

    // Re-render every 30 s so "seit X min" keeps counting up.
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((x) => x + 1), 30000);
        return () => clearInterval(id);
    }, []);

    // Hot-water preparation has priority over heating in the LWZ.
    const mode: keyof typeof MODE_STYLE = warmwasser ? 'water' : heizen ? 'heat' : 'idle';
    const style = MODE_STYLE[mode];
    const ModeIcon = mode === 'water' ? Droplet : mode === 'heat' ? Flame : Power;
    const modeLabel =
        mode === 'water'
            ? 'Bereitet Warmwasser'
            : mode === 'heat'
              ? 'Heizt · Fußboden'
              : verdichter
                ? 'Wärmepumpe läuft'
                : 'Bereit';

    const sinceText = (() => {
        if (!verdichter) return 'Verdichter aus';
        const lc = verdichterState?.lc;
        if (!lc) return 'Verdichter ein';
        const mins = Math.max(0, Math.round((Date.now() - lc) / 60000));
        if (mins < 60) return `Verdichter ein · seit ${mins} min`;
        return `Verdichter ein · seit ${Math.floor(mins / 60)} h ${mins % 60} min`;
    })();

    const aussen = asNum(aussenVal);
    const vorlauf = asNum(vorlaufVal);
    const ruecklauf = asNum(ruecklaufVal);
    const spreizung = asNum(spreizungVal);
    const volumenstrom = asNum(volumenstromVal);

    const chipOn = mode === 'idle' ? '#4a9e2f' : style.color;

    const vlrl = vorlauf !== null && ruecklauf !== null ? `${formatNum(vorlauf, 1)} / ${formatNum(ruecklauf, 1)} °C` : '–';

    return (
        // No outer frame (frame set transparent) and no frame padding: the inner
        // status card + tiles span the FULL column width, each its own card.
        // No own padding → the first card's top edge sits exactly at the grid
        // top, matching the framed widgets (e.g. rainstation) on other tabs.
        <div className="flex flex-col h-full" data-widget-interactive>
            {/* Status card ("switch") — only THIS colours by mode; centered */}
            <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 'var(--widget-radius)', padding: '14px 12px', textAlign: 'center' }}>
                <div
                    className="inline-flex items-center justify-center gap-2"
                    style={{ fontSize: 19, fontWeight: 500, color: style.color, lineHeight: 1.2 }}
                >
                    <ModeIcon size={22} />
                    {modeLabel}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{sinceText}</div>
                <div className="flex items-center justify-center" style={{ gap: 18, marginTop: 11 }}>
                    <StatusChip Icon={RefreshCw} label="Pumpe" on={asBool(pumpeVal)} onColor={chipOn} />
                    <StatusChip Icon={Snowflake} label="Abtauen" on={asBool(abtauenVal)} onColor={chipOn} />
                    <StatusChip Icon={Zap} label="Heizstab" on={asBool(heizstabVal)} onColor={chipOn} />
                </div>
            </div>

            {/* Key figures — SEPARATE 2x2 tiles below the status card */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <Tile label="Vorlauf / Rücklauf" value={vlrl} />
                <Tile label="Spreizung" value={spreizung !== null ? `${formatNum(spreizung, 1)} K` : '–'} color="#2f7fd6" />
                <Tile label="Volumenstrom" value={volumenstrom !== null ? `${formatNum(volumenstrom, 0)} l/min` : '–'} />
                <Tile label="Außentemperatur" value={aussen !== null ? `${formatNum(aussen, 1)} °C` : '–'} />
            </div>
        </div>
    );
}
