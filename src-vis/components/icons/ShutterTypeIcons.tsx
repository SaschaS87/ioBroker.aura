import React, { useId } from 'react';
import './ShutterTypeIcons.css';

interface IconProps {
    size?: number;
    className?: string;
    /** Geschlossener Anteil in Prozent (0 = offen, 100 = zu). `null` = unbekannt. */
    closedFrac?: number | null;
    /** Faehrt gerade – der Behang pulsiert dann ruhig, ohne Farbwechsel. */
    isMoving?: boolean;
}

/**
 * Die drei Typ-Symbole des Rolllaeden-Tabs.
 *
 * **Zeichensprache:** Umriss, `stroke-width 2`, keine Fuellung, runde Enden –
 * so wie alle uebrigen Icons in Aura (Lucide im Code, Tabler aus der
 * Widget-Konfiguration). Ein frueherer Entwurf zeigte den Stand als getoente
 * Flaeche und fiel dadurch sichtbar aus dem Rest der App heraus.
 *
 * **Der Behang faehrt von oben herunter.** Seine Unterkante wandert von der
 * MITTE der Rahmenoberkante bis zur MITTE der Rahmenunterkante. Nur so
 * verschwindet sie bei 0 % und bei 100 % im Rahmenstrich, statt daneben als
 * Balken stehen zu bleiben. Die Lamellenstriche haengen in festem Abstand
 * darueber, fahren mit nach unten und loesen sich stetig aus der Oberkante –
 * kein Mindestabstand, kein Aufpoppen. Was noch im Kasten steckt, schneidet
 * der Beschnitt weg.
 *
 * Fenster und Raffstore unterscheiden sich durch die **Neigung**: der
 * Raffstore kann seine Lamellen kippen, der Rollladen nicht.
 */

/** Weg der Behang-Unterkante, je Silhouette (24er-Raster). */
const BOX = { oben: 4, unten: 19 }; // Fenster und Raffstore
const ROOF = { oben: 5, unten: 19 }; // Dachfenster

/** So viele Lamellen zeigt der geschlossene Rollladen. */
const LAMELLEN = 4;

/** Neigung der Raffstore-Lamellen, in Rastereinheiten je Halbbreite. */
const KIPP = 1;

/** Waagerechter Strich im Rechteckfenster, wahlweise gekippt. */
function strichRechteck(y: number, kipp: number, key: number): React.ReactNode {
    return <path key={key} d={`M6.2 ${(y + kipp).toFixed(2)} L17.8 ${(y - kipp).toFixed(2)}`} />;
}

/** Derselbe Strich im Trapez – die Breite folgt der Dachschraege. */
function strichTrapez(y: number, kipp: number, key: number): React.ReactNode {
    const t = (19 - y) / 14;
    const x1 = 4.6 + t * 2.8 + 0.9;
    const x2 = 19.4 - t * 2.8 - 0.9;
    return (
        <path key={key} d={`M${x1.toFixed(2)} ${(y + kipp).toFixed(2)} L${x2.toFixed(2)} ${(y - kipp).toFixed(2)}`} />
    );
}

interface ShapeProps extends IconProps {
    outline: React.ReactNode;
    /** Beschnitt bis zur AUSSENkante des Rahmenstrichs. */
    clip: React.ReactNode;
    oben: number;
    unten: number;
    kipp?: number;
    strich: (y: number, kipp: number, key: number) => React.ReactNode;
}

const Silhouette: React.FC<ShapeProps> = ({
    size = 18,
    className = '',
    closedFrac = null,
    isMoving = false,
    outline,
    clip,
    oben,
    unten,
    kipp = 0,
    strich,
}) => {
    // Mehrere Symbole liegen gleichzeitig im Dokument. Gleiche IDs wuerden
    // dazu fuehren, dass alle denselben Beschnitt benutzen – derselbe
    // Fallstrick, der ShutterViz schon einmal erwischt hat.
    const uid = useId().replace(/:/g, '');
    const clipId = `tic-${uid}`;

    const known = closedFrac !== null && closedFrac !== undefined;
    const c = known ? Math.max(0, Math.min(100, closedFrac as number)) : 0;

    const voll = unten - oben;
    const hoehe = voll / LAMELLEN;
    const y = oben + (c / 100) * voll; // Unterkante des Behangs

    const striche: React.ReactNode[] = [];
    if (known && c > 0) {
        for (let i = 0; i < LAMELLEN; i++) {
            const sy = y - i * hoehe;
            // Was noch im Kasten steckt, wird nicht gezeichnet. Alles andere
            // schon – auch wenn es erst zur Haelfte heraussteht.
            if (sy < oben) continue;
            striche.push(strich(sy, kipp, i));
        }
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shutter-type-icon${isMoving ? ' ti-moving' : ''}${className ? ` ${className}` : ''}`}
            opacity={known ? undefined : 0.45}
            aria-hidden="true"
        >
            {striche.length > 0 && (
                <>
                    <defs>
                        <clipPath id={clipId}>{clip}</clipPath>
                    </defs>
                    <g className="ti-behang" clipPath={`url(#${clipId})`}>
                        {striche}
                    </g>
                </>
            )}
            {outline}
        </svg>
    );
};

const rahmen = <rect x="4" y="4" width="16" height="15" rx="1" />;
const rahmenClip = <rect x="3" y="3" width="18" height="17" />;

/** Fenster: aufrechtes Rechteck, der Behang faellt waagerecht. */
export const WindowIcon: React.FC<IconProps> = (p) => (
    <Silhouette {...p} outline={rahmen} clip={rahmenClip} oben={BOX.oben} unten={BOX.unten} strich={strichRechteck} />
);

/** Raffstore: gleiche Silhouette, aber die Lamellen stehen schraeg. Das ist
 *  genau der Unterschied zum Rollladen und bei 18 px gut zu erkennen. */
export const RaffstoreIcon: React.FC<IconProps> = (p) => (
    <Silhouette
        {...p}
        outline={rahmen}
        clip={rahmenClip}
        oben={BOX.oben}
        unten={BOX.unten}
        kipp={KIPP}
        strich={strichRechteck}
    />
);

/** Dachfenster: die Schraege traegt allein. Bei 18 px kommt ohnehin fast nur
 *  die Aussenform an. */
export const RoofWindowIcon: React.FC<IconProps> = (p) => (
    <Silhouette
        {...p}
        outline={<path d="M4.6 19 L7.4 5 H16.6 L19.4 19 Z" strokeLinejoin="miter" />}
        clip={<path d="M3.6 20 L6.4 4 H17.6 L20.4 20 Z" />}
        oben={ROOF.oben}
        unten={ROOF.unten}
        strich={strichTrapez}
    />
);
