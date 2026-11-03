/**
 * Reihe B (Runde 41–65, 02.11.2026): Symbol-Saetze fuer Fenster, Dachfenster
 * und Raffstore, nur Dev-Vorschau. Gezeichnet im 24er-Raster wie Lucide
 * (Strich 2, runde Enden), weiss auf dem farbigen Quadrat der Zeile –
 * dasselbe Quadrat wie bei Zeitplan und Szenen. Die Farbe je Art bleibt.
 * Sascha hat 52, 53 und 55 behalten, die uebrigen sind raus. Nur 52 zeigt
 * den Stand, 53 und 55 sind ruhig.
 */
import { useId, type ReactNode } from 'react';
import type { ShutterFloorDeviceDef } from '../types';

type Kind = ShutterFloorDeviceDef['kind'];
export interface IconState {
    closed: number | null;
    busy: boolean;
    slat: number | null;
}
interface SetDef {
    key: string;
    name: string;
    desc: string;
    draw: (kind: Kind, s: IconState, uid: string) => ReactNode;
}

const clamp = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(100, v)));

function Svg({
    size,
    children,
    busy,
    dim,
    sw = 2,
}: {
    size: number;
    children: ReactNode;
    busy?: boolean;
    dim?: boolean;
    sw?: number;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`pb-svg${busy ? ' is-busy' : ''}`}
            opacity={dim ? 0.55 : undefined}
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

/** Gekippte Lamelle von x1 bis x2 um die Hoehe y. */
const slatLine = (y: number, tilt: number, x1 = 5, x2 = 19) =>
    `M${x1} ${(y + tilt).toFixed(2)} L${x2} ${(y - tilt).toFixed(2)}`;

// Behang als Streifen von oben, auf `h` (0..1) beschnitten.
function Curtain({
    x,
    y,
    w,
    h,
    frac,
    uid,
    tilt = 0,
}: {
    x: number;
    y: number;
    w: number;
    h: number;
    frac: number;
    uid: string;
    tilt?: number;
}) {
    if (frac <= 0) return null;
    const bars: ReactNode[] = [];
    for (let yy = y + 1.6; yy < y + h + 2; yy += 3) {
        bars.push(<path key={yy} d={slatLine(yy, tilt, x + 1.6, x + w - 1.6)} strokeWidth={2} />);
    }
    return (
        <>
            <defs>
                <clipPath id={`pbc-${uid}`}>
                    <rect x={x} y={y} width={w} height={h * frac} />
                </clipPath>
            </defs>
            <g clipPath={`url(#pbc-${uid})`} className="pb-curtain">
                {bars}
            </g>
        </>
    );
}

// ── 52 Behang-Fuellung (zeigt Stand) ───────────────────────────────────
function draw52(kind: Kind, s: IconState, uid: string) {
    const f = clamp(s.closed) / 100;
    const dashed = s.closed === null ? '2 2.6' : undefined;
    if (kind === 'dachfenster')
        return (
            <>
                <path d="M3 9.5 12 3l9 6.5" />
                <Curtain x={6.5} y={11.5} w={11} h={9.5} frac={f} uid={uid} />
                <rect x="6.5" y="11.5" width="11" height="9.5" rx="1.5" strokeDasharray={dashed} />
            </>
        );
    return (
        <>
            <Curtain x={4.5} y={3} w={15} h={18} frac={f} uid={uid} tilt={kind === 'raffstore' ? 0.9 : 0} />
            <rect x="4.5" y="3" width="15" height="18" rx="2" strokeDasharray={dashed} />
        </>
    );
}

// ── 53 Gefuellt ────────────────────────────────────────────────────────
function draw53(kind: Kind) {
    if (kind === 'dachfenster')
        return (
            <>
                <path d="M2.8 10 12 3.2l9.2 6.8" strokeWidth={2.6} />
                <path
                    fill="currentColor"
                    stroke="none"
                    fillRule="evenodd"
                    d="M7.6 11.6h8.8a1.8 1.8 0 0 1 1.8 1.8v6a1.8 1.8 0 0 1-1.8 1.8H7.6a1.8 1.8 0 0 1-1.8-1.8v-6a1.8 1.8 0 0 1 1.8-1.8ZM7.6 13.3h3.5v2.6H7.6ZM12.9 13.3h3.5v2.6h-3.5ZM7.6 17.5h3.5v2.1H7.6ZM12.9 17.5h3.5v2.1h-3.5Z"
                />
            </>
        );
    if (kind === 'raffstore')
        return (
            <>
                <rect x="3" y="2.6" width="18" height="3.6" rx="1.2" fill="currentColor" stroke="none" />
                {[9.6, 13.4, 17.2, 21].map((y) => (
                    <path key={y} d={slatLine(y, 1.1, 4.6, 19.4)} strokeWidth={2.6} />
                ))}
            </>
        );
    return (
        <path
            fill="currentColor"
            stroke="none"
            fillRule="evenodd"
            d="M6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3ZM6.1 5.1h4.9v5.9H6.1ZM13 5.1h4.9v5.9H13ZM6.1 13h4.9v5.9H6.1ZM13 13h4.9v5.9H13Z"
        />
    );
}

// ── 55 Perspektive ─────────────────────────────────────────────────────
function draw55(kind: Kind) {
    if (kind === 'dachfenster')
        return (
            <>
                <path d="M8.6 4H21l-5.6 16H3Z" />
                <path d="M14.8 4 9.2 20M5.8 12h12.4" />
            </>
        );
    if (kind === 'raffstore')
        return (
            <>
                <path d="M3 3.5h18" strokeWidth={2.2} />
                {[8, 12, 16, 20].map((y) => (
                    <path key={y} d={slatLine(y, 1.2, 3.5, 16)} />
                ))}
                <path d="M19.5 3.5v13" strokeWidth={1.4} />
                <circle cx="19.5" cy="18.6" r="1.6" fill="currentColor" stroke="none" />
            </>
        );
    return (
        <>
            <rect x="4" y="3" width="16" height="18" rx="1.6" />
            <path d="M12 3v18M9.4 10.8v2.6M14.6 10.8v2.6" />
        </>
    );
}

export const ICON_SETS: SetDef[] = [
    {
        key: '52',
        name: 'Behang-Füllung',
        desc: 'Nur der Rahmen, der Behang füllt ihn von oben so weit, wie der Rollladen zu ist. Beim Raffstore schräg. Gestrichelt = unbekannt.',
        draw: draw52,
    },
    {
        key: '53',
        name: 'Gefüllt',
        desc: 'Volle, kräftige Flächen wie die Symbole in den iPhone-Einstellungen. Ruhig, ohne Stand.',
        draw: (k) => draw53(k),
    },
    {
        key: '55',
        name: 'Perspektive',
        desc: 'Fenster zweiflügelig mit Griffen, Dachfenster schräg wie ein Velux, Raffstore mit Zugschnur und Griff.',
        draw: (k) => draw55(k),
    },
];

export function KindIcon({ set, kind, s, size = 18 }: { set: string; kind: Kind; s: IconState; size?: number }) {
    const uid = useId().replace(/:/g, '');
    const def = ICON_SETS.find((x) => x.key === set);
    if (!def) return null;
    return (
        <Svg size={size} busy={s.busy}>
            {def.draw(kind, s, uid)}
        </Svg>
    );
}
