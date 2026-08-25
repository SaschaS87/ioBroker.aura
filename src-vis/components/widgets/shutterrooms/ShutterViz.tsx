import React, { useId } from 'react';
import './ShutterViz.css';

interface ShutterVizProps {
    closedFrac: number | null;
    isMoving: boolean;
    isUnknown: boolean;
    /** Fahrtrichtung, solange ein Auftrag läuft – die Lamellen wandern mit. */
    direction?: 'up' | 'down' | null;
    size?: 'small' | 'large' | 'control'; // 'small' für Kachel (34×44), 'large' für Sheet (88×112), 'control' für Bedienung
    widthPx?: number; // nur für size === 'control'
    heightPx?: number; // nur für size === 'control'
    snapMarks?: number[]; // Rastmarken in % (z.B. [0, 25, 50, 75, 100])
    isDragging?: boolean; // wird gezogen
}

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

    // Farbe sagt nur eines: faehrt oder faehrt nicht. Im Stillstand bleibt das
    // Fenster grau - egal ob offen, halb oder ganz zu; wie weit es zu ist, sagt
    // schon die Kante des Behangs. Bernstein ist der Fahrt vorbehalten.
    const borderColor = isMoving ? 'var(--accent-yellow)' : 'var(--text-secondary)';

    const sizeClass = size === 'large' ? 'viz-large' : size === 'control' ? 'viz-control' : 'viz-small';
    const opacityClass = isUnknown ? 'viz-unknown' : '';
    const movingClass = isMoving ? 'viz-moving' : '';
    const dragClass = isDragging ? 'viz-dragging' : '';
    const dirClass = isMoving && direction ? `viz-dir-${direction}` : '';

    // Hoehe der geschlossenen Flaeche im 100×140-Raster (Innenmass 132).
    const fillHeight = closedFrac !== null ? (closedFrac / 100) * 132 : 0;

    const inlineStyles = size === 'control' && widthPx && heightPx
        ? ({ '--viz-w': `${widthPx}px`, '--viz-h': `${heightPx}px` } as React.CSSProperties)
        : {};

    return (
        <div className={`shutter-viz ${sizeClass} ${opacityClass} ${movingClass} ${dragClass} ${dirClass}`} style={inlineStyles}>
            <svg viewBox="0 0 100 140" preserveAspectRatio={size === 'control' ? 'none' : 'xMidYMid slice'}>
                <defs>
                    {/* Lamellen-Muster */}
                    <pattern id={patternId} x="0" y="0" width="100" height="8" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="6" x2="100" y2="6" stroke="currentColor" strokeWidth="2" opacity="0.35" />
                    </pattern>
                    {/* Die Kante des Behangs schneidet das wandernde Muster ab, damit
                        bei Bewegung die Lamellen laufen, die Kante aber steht. */}
                    <clipPath id={clipId}>
                        {/* Hoehe per style, nicht als Attribut: nur so greift die
                            CSS-Transition, die die Kante gleiten statt springen laesst. */}
                        <rect x="4" y="4" width="92" style={{ height: fillHeight }} className="viz-fill-clip" />
                    </clipPath>
                </defs>

                {/* Rahmen */}
                <rect
                    x="2"
                    y="2"
                    width="96"
                    height="136"
                    fill="var(--blind-bg, var(--app-bg))"
                    stroke={borderColor}
                    strokeWidth="2"
                    rx="2"
                    className="viz-frame"
                />

                {/* Behang: Muster laeuft ueber die volle Hoehe, sichtbar nur bis zur Kante.
                    Ueberhang oben/unten, damit beim Wandern keine Luecke aufblitzt. */}
                {closedFrac !== null && closedFrac > 0 && (
                    <g clipPath={`url(#${clipId})`}>
                        <rect
                            x="4"
                            y="-8"
                            width="92"
                            height="148"
                            fill={`url(#${patternId})`}
                            className="viz-slats"
                        />
                    </g>
                )}

                {/* Rastmarken am rechten Fensterinnenrand */}
                {snapMarks && snapMarks.map((p) => {
                    // 0 und 100 nicht zeichnen
                    if (p === 0 || p === 100) return null;
                    const y = 4 + (p / 100) * 132;
                    return (
                        <line
                            key={p}
                            x1="86"
                            x2="96"
                            y1={y}
                            y2={y}
                            stroke="#ffffff"
                            strokeOpacity="0.4"
                            strokeWidth="2"
                        />
                    );
                })}

                {/* Unbekannt: Strich statt Füllung */}
                {isUnknown && (
                    <text
                        x="50"
                        y="75"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="32"
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
