import React, { useId } from 'react';
import './ShutterViz.css';

interface ShutterVizProps {
    closedFrac: number | null;
    isMoving: boolean;
    isUnknown: boolean;
    /** Fahrtrichtung, solange ein Auftrag läuft – die Lamellen wandern mit. */
    direction?: 'up' | 'down' | null;
    size?: 'small' | 'large' | 'control'; // 'small' für Kachel (34×44), 'large' (88×112), 'control' für Bedienung
    widthPx?: number; // nur für size === 'control'
    heightPx?: number; // nur für size === 'control'
    snapMarks?: number[]; // Rastmarken in % (z.B. [0, 25, 50, 75, 100])
    isDragging?: boolean; // wird gezogen
}

/**
 * Das gezeichnete Fenster, Entwurf „V2 – feiner Rahmen“ (von Sascha am
 * 31.08.2026 aus sieben Varianten gewaehlt). Zwei Dinge sind dabei anders
 * geworden als vorher:
 *
 * 1. **Es wird in echten Bildpunkten gezeichnet, nicht mehr gedehnt.**
 *    Frueher lag ein Raster von 100 x 140 zugrunde, das mit
 *    `preserveAspectRatio="none"` auf 170 x 280 gezogen wurde. Der 2 Einheiten
 *    dicke Rahmen kam dadurch mit rund 3,4 Bildpunkten in der Breite und 4 in
 *    der Hoehe heraus – ungleich dick und schwerer als beabsichtigt. Genau das
 *    hat Sascha als „bullig“ gemeldet.
 *
 * 2. **Die Lamellen sind eine SKALA, keine Deko.** LAMELLEN Stueck teilen den
 *    Fahrweg, bei 20 entspricht eine also 5 %. Die Behangkante liegt damit bei
 *    45, 50, 55 % genau auf einer Fuge – man kann die Stellung ablesen statt
 *    schaetzen, und beim Ziehen rastet das Auge mit.
 *
 *    **Fallstrick:** Das Muster muss an der FENSTEROBERKANTE haengen
 *    (`pattern y = PAD`), nicht am Nullpunkt der Zeichnung. Sonst liegt es um
 *    `PAD + Linienabstand` daneben und die Ausrichtung ist reiner Zufall.
 */

/** Innenabstand zwischen Rahmen und Behang, in Bildpunkten. */
const PAD = 2;
/** Eine Lamelle = 100/LAMELLEN Prozent Fahrweg. */
const LAMELLEN = 20;
/** Unter dieser Periode verschmelzen die Fugen zu Grau – dann lieber Flaeche. */
const MIN_PERIODE = 4;

/** Feste Bildpunktmasse der beiden nicht frei skalierbaren Groessen. */
const MASSE: Record<'small' | 'large', [number, number]> = {
    small: [34, 44],
    large: [88, 112],
};

export const ShutterViz: React.FC<ShutterVizProps> = ({
    closedFrac,
    isMoving,
    isUnknown,
    direction = null,
    size = 'small',
    widthPx,
    heightPx,
    snapMarks,
    isDragging,
}) => {
    // Jede Instanz braucht eigene IDs: mehrere <pattern id="slats"> im selben
    // Dokument sind ungueltig, alle Fenster zeigen dann das erste Muster und
    // eine Animation an einer Kachel wuerde auf alle anderen durchschlagen.
    const uid = useId().replace(/:/g, '');
    const patternId = `slats-${uid}`;
    const clipId = `fill-${uid}`;

    const [w, h] = size === 'control' ? [widthPx ?? 170, heightPx ?? 280] : MASSE[size as 'small' | 'large'];

    // Farbe sagt nur eines: faehrt oder faehrt nicht. Im Stillstand bleibt das
    // Fenster grau - egal ob offen, halb oder ganz zu; wie weit es zu ist, sagt
    // schon die Kante des Behangs. Bernstein ist der Fahrt vorbehalten.
    const borderColor = isMoving ? 'var(--accent-yellow)' : 'var(--text-secondary)';

    const sizeClass = size === 'large' ? 'viz-large' : size === 'control' ? 'viz-control' : 'viz-small';
    const opacityClass = isUnknown ? 'viz-unknown' : '';
    const movingClass = isMoving ? 'viz-moving' : '';
    const dragClass = isDragging ? 'viz-dragging' : '';
    const dirClass = isMoving && direction ? `viz-dir-${direction}` : '';

    const innen = h - 2 * PAD;
    const periode = innen / LAMELLEN;
    const zeigeLamellen = periode >= MIN_PERIODE;

    // Hoehe der geschlossenen Flaeche in Bildpunkten.
    const fillHeight = closedFrac !== null ? (closedFrac / 100) * innen : 0;

    const inlineStyles = {
        ...(size === 'control' && widthPx && heightPx ? { '--viz-w': `${widthPx}px`, '--viz-h': `${heightPx}px` } : {}),
        '--viz-p': periode,
    } as React.CSSProperties;

    return (
        <div
            className={`shutter-viz ${sizeClass} ${opacityClass} ${movingClass} ${dragClass} ${dirClass}`}
            style={inlineStyles}
        >
            <svg viewBox={`0 0 ${w} ${h}`}>
                <defs>
                    {/* Lamellen-Muster. Der Anker bei y = PAD ist das Entscheidende:
                        nur so trifft die Behangkante bei jedem Fuenferschritt genau
                        auf eine Fuge.

                        Fallstrick (von Sascha am 01.09.2026 gemeldet, Foto-Vergleich
                        50%/55%): Die Fugenlinie MARKIERT die Prozentgrenze - sie darf
                        also nicht GENAU auf ihr liegen. Bei "0.5" (Periodenanfang plus
                        0.5 fuer eine scharfe Linie) landete sie hauchduenn HINTER der
                        Beschnittkante (clipPath), die exakt an der Grenze endet. Bei
                        jedem glatten Fuenferwert - also bei praktisch jeder Position,
                        die man wirklich einstellt - wurde die Linie dadurch komplett
                        weggeschnitten. Sichtbar blieb dann nur die naechsthoehere
                        Fuge, eine Lamelle (5 Prozentpunkte) zu frueh: 55 % zeigte sich
                        wie 50 %, 50 % wie 45 %. Jetzt sitzt sie am Periodenende minus
                        0.5 - knapp VOR der Grenze, sicher innerhalb des Zuschnitts,
                        genauso scharf gerendert. */}
                    {zeigeLamellen && (
                        <pattern id={patternId} x="0" y={PAD} width={w} height={periode} patternUnits="userSpaceOnUse">
                            <line
                                x1="0"
                                y1={periode - 0.5}
                                x2={w}
                                y2={periode - 0.5}
                                stroke="currentColor"
                                strokeWidth="1"
                                opacity="0.5"
                            />
                        </pattern>
                    )}
                    {/* Die Kante des Behangs schneidet das wandernde Muster ab, damit
                        bei Bewegung die Lamellen laufen, die Kante aber steht. */}
                    <clipPath id={clipId}>
                        {/* Hoehe per style, nicht als Attribut: nur so greift die
                            CSS-Transition, die die Kante gleiten statt springen laesst. */}
                        <rect
                            x={PAD}
                            y={PAD}
                            width={w - 2 * PAD}
                            style={{ height: fillHeight }}
                            className="viz-fill-clip"
                        />
                    </clipPath>
                </defs>

                {/* Rahmen */}
                <rect
                    x="0.75"
                    y="0.75"
                    width={w - 1.5}
                    height={h - 1.5}
                    rx="5"
                    fill="var(--blind-bg, var(--app-bg))"
                    stroke={borderColor}
                    strokeWidth="1.5"
                    className="viz-frame"
                />

                {/* Behang. Ueberhang oben/unten, damit beim Wandern keine Luecke aufblitzt. */}
                {closedFrac !== null && closedFrac > 0 && (
                    <g clipPath={`url(#${clipId})`}>
                        {zeigeLamellen ? (
                            <rect
                                x="0"
                                y={-periode}
                                width={w}
                                height={h + 2 * periode}
                                fill={`url(#${patternId})`}
                                className="viz-slats"
                            />
                        ) : (
                            // Bei der kleinen Kachel waere die Periode unter zwei
                            // Bildpunkten – die Fugen wuerden ohnehin zu Grau
                            // verschmelzen. Dann lieber eine ruhige Flaeche.
                            <rect
                                x={PAD}
                                y={PAD}
                                width={w - 2 * PAD}
                                height={innen}
                                fill="currentColor"
                                opacity="0.3"
                                className="viz-slats"
                            />
                        )}
                    </g>
                )}

                {/* Rastmarken am rechten Fensterinnenrand. Sie rechnen mit DERSELBEN
                    Geometrie wie der Behang – sonst laegen sie bis zu einem
                    Bildpunkt neben der Kante, die sie markieren sollen. */}
                {snapMarks &&
                    snapMarks.map((p) => {
                        // 0 und 100 nicht zeichnen
                        if (p === 0 || p === 100) return null;
                        const y = PAD + (p / 100) * innen;
                        return (
                            <line
                                key={p}
                                x1={w - 12}
                                x2={w - 4}
                                y1={y}
                                y2={y}
                                stroke="currentColor"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                            />
                        );
                    })}

                {/* Unbekannt: Strich statt Füllung */}
                {isUnknown && (
                    <text
                        x={w / 2}
                        y={h / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.round(h / 4.4)}
                        fill="var(--text-secondary)"
                        fontWeight="400"
                    >
                        −
                    </text>
                )}
            </svg>
        </div>
    );
};
