/**
 * Symbol je Art (Fenster, Dachfenster, Raffstore) fuer die Zeile
 * (Feature 27, Fassung 52 „Behang-Fuellung", Saschas Wahl 03.11.2026).
 * Gezeichnet im 24er-Raster wie Lucide (Strich 2, runde Enden), weiss auf dem
 * farbigen Quadrat der Zeile. Zeigt den Stand: Nur der Rahmen, der Behang
 * fuellt ihn von oben so weit, wie der Rollladen zu ist. Beim Raffstore
 * schraeg. Gestrichelt = unbekannt.
 */
import { useId, type ReactNode } from 'react';
import type { ShutterFloorDeviceDef } from './types';

type Kind = ShutterFloorDeviceDef['kind'];

const clamp = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(100, v)));

function Svg({ size, children, busy, sw = 2 }: { size: number; children: ReactNode; busy?: boolean; sw?: number }) {
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
            className={`sf-kind-svg${busy ? ' is-busy' : ''}`}
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
                <clipPath id={`sfc-${uid}`}>
                    <rect x={x} y={y} width={w} height={h * frac} />
                </clipPath>
            </defs>
            <g clipPath={`url(#sfc-${uid})`} className="sf-kind-curtain">
                {bars}
            </g>
        </>
    );
}

function draw52(kind: Kind, closed: number | null, uid: string) {
    const f = clamp(closed) / 100;
    const dashed = closed === null ? '2 2.6' : undefined;
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

export function ShutterKindIcon({
    kind,
    closed,
    busy,
    size = 18,
}: {
    kind: Kind;
    closed: number | null;
    busy: boolean;
    size?: number;
}) {
    const uid = useId().replace(/:/g, '');
    return (
        <Svg size={size} busy={busy}>
            {draw52(kind, closed, uid)}
        </Svg>
    );
}
