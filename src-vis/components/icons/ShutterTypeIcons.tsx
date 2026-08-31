import React, { useId } from 'react';
import './ShutterTypeIcons.css';

interface IconProps {
    size?: number;
    className?: string;
    /** Geschlossener Anteil in Prozent (0 = offen, 100 = zu). `null` = unbekannt. */
    closedFrac?: number | null;
    /** Faehrt gerade – die Behangflaeche pulsiert dann ruhig, ohne Farbwechsel. */
    isMoving?: boolean;
}

/**
 * Die drei Typ-Symbole des Rolllaeden-Tabs, Entwurf „A8 – feiner Rahmen“
 * (von Sascha am 31.08.2026 aus zehn Zeichenweisen gewaehlt).
 *
 * Zwei Dinge unterscheiden sie von den Vorgaengern:
 *
 * 1. **Duenner.** Rahmenstrich 1,0 statt 2,0. Der Hausstandard im Frontend ist
 *    1,5 (38 Icons), die alten Typ-Symbole standen als einzige auf 2 und wirkten
 *    dadurch klobig. Gezeigt wird ausserdem FLAECHE statt Linien – eine getoente
 *    Flaeche traegt bei 18 px deutlich weniger auf als ein Strich.
 *
 * 2. **Sie zeigen den Stand.** Der Behang faellt von oben so weit herunter, wie
 *    der Rollladen zu ist. Die Form sagt, WAS es ist (Fenster: senkrechte
 *    Sprosse, Raffstore: Lamellenfugen, Dachfenster: schraege Silhouette), die
 *    Fuellung sagt, WIE WEIT.
 */

/** Innenmasse der Behangflaeche je Silhouette, im 24er-Raster. */
const BOX = { top: 4.8, h: 14.4 }; // Fenster und Raffstore
const ROOF = { top: 5.7, h: 12.6 }; // Dachfenster

/** Deckkraft der Behangflaeche in Ruhe. */
const FILL = 0.38;

/**
 * So viele Lamellen zeigt der geschlossene Raffstore, und zwar ALLE GLEICH HOCH.
 * Frueher lag hier ein fester Fugenabstand – 14,4 Rastereinheiten sind aber kein
 * glattes Vielfaches davon, also blieb die unterste Lamelle ein halber Stummel
 * (Saschas „dreieinhalb Lamellen“ vom 31.08.2026). Aus der Anzahl gerechnet
 * geht die Teilung auf.
 */
const LAMELLEN = 4;
const FUGE_BREITE = 1.2;

/** Sehr weit gerundet: bei 18 px waere ein Streifen von 3 % ohnehin unsichtbar. */
function runde(c: number): number {
    return c < 4 ? 0 : c > 96 ? 100 : c;
}

interface ShapeProps extends IconProps {
    outline: React.ReactNode;
    clip: React.ReactNode;
    top: number;
    h: number;
    /** Lamellenfugen ausschneiden – nur der Raffstore hat sie. */
    fugen?: boolean;
    /** Zusaetzliche Linien ueber dem Behang, z. B. die Fenstersprosse. */
    extra?: React.ReactNode;
}

const Silhouette: React.FC<ShapeProps> = ({
    size = 18,
    className = '',
    closedFrac = null,
    isMoving = false,
    outline,
    clip,
    top,
    h,
    fugen = false,
    extra = null,
}) => {
    // Mehrere Symbole liegen gleichzeitig im Dokument. Gleiche IDs wuerden
    // dazu fuehren, dass alle dasselbe Muster zeigen – derselbe Fallstrick,
    // der ShutterViz schon einmal erwischt hat.
    const uid = useId().replace(/:/g, '');
    const clipId = `tic-${uid}`;
    const cutId = `tif-${uid}`;
    const maskId = `tim-${uid}`;

    const known = closedFrac !== null && closedFrac !== undefined;
    const c = known ? runde(closedFrac as number) : 0;
    const fillH = (c / 100) * h;

    // Fugen so setzen, dass gleich hohe Lamellen entstehen.
    const band = (h - (LAMELLEN - 1) * FUGE_BREITE) / LAMELLEN;
    const cuts: React.ReactNode[] = [];
    if (fugen) {
        for (let k = 1; k < LAMELLEN; k++) {
            const fy = top + k * band + (k - 0.5) * FUGE_BREITE;
            cuts.push(<rect key={k} x="0" y={fy - FUGE_BREITE / 2} width="24" height={FUGE_BREITE} fill="#000" />);
        }
    }

    let behang = (
        <g clipPath={`url(#${cutId})`}>
            <rect className="ti-fill" x="0" y={top} width="24" height={h} fill="currentColor" opacity={FILL} />
        </g>
    );
    if (fugen) behang = <g mask={`url(#${maskId})`}>{behang}</g>;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={`shutter-type-icon${isMoving ? ' ti-moving' : ''}${className ? ` ${className}` : ''}`}
            opacity={known ? undefined : 0.45}
            aria-hidden="true"
        >
            <defs>
                <clipPath id={clipId}>{clip}</clipPath>
                <clipPath id={cutId}>
                    <rect x="0" y={top} width="24" height={fillH} />
                </clipPath>
                {fugen && (
                    <mask id={maskId}>
                        <rect x="0" y="0" width="24" height="24" fill="#fff" />
                        {cuts}
                    </mask>
                )}
            </defs>
            <g clipPath={`url(#${clipId})`}>{known && c > 0 ? behang : null}</g>
            {outline}
            {extra}
        </svg>
    );
};

const rahmen = <rect x="3.5" y="4" width="17" height="16" fill="none" stroke="currentColor" strokeWidth={1} />;
const rahmenClip = <rect x="4.3" y="4.8" width="15.4" height="14.4" />;

/** Fenster: aufrechtes Rechteck mit senkrechter Sprosse. Die Sprosse steht quer
 *  zur waagerechten Behangkante und stoert sie deshalb nicht. */
export const WindowIcon: React.FC<IconProps> = (p) => (
    <Silhouette
        {...p}
        outline={rahmen}
        clip={rahmenClip}
        top={BOX.top}
        h={BOX.h}
        extra={<line x1="12" y1="4.4" x2="12" y2="19.6" stroke="currentColor" strokeWidth={0.8} opacity={0.55} />}
    />
);

/** Raffstore: gleiche Silhouette wie das Fenster, aber ohne Sprosse – dafuer
 *  mit Fugen im Behang. Das ist bei 18 px das belastbarste Unterscheidungs-
 *  merkmal, weil es auf die Flaeche wirkt und nicht auf duenne Linien. */
export const RaffstoreIcon: React.FC<IconProps> = (p) => (
    <Silhouette {...p} outline={rahmen} clip={rahmenClip} top={BOX.top} h={BOX.h} fugen />
);

/** Dachfenster: die Schraege traegt allein. Bei 18 px kommt ohnehin fast nur
 *  die Aussenform an, feine Sprossen verschwinden. */
export const RoofWindowIcon: React.FC<IconProps> = (p) => (
    <Silhouette
        {...p}
        outline={
            <path
                d="M4 19 L7 5 H17 L20 19 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeLinejoin="miter"
            />
        }
        clip={<path d="M4.85 18.3 L7.55 5.7 H16.45 L19.15 18.3 Z" />}
        top={ROOF.top}
        h={ROOF.h}
    />
);
