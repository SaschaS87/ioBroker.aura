import React, { useId } from 'react';
import './ShutterViz.css';

interface ShutterVizProps {
    closedFrac: number | null;
    isMoving: boolean;
    isUnknown: boolean;
    /** Fahrtrichtung, solange ein Auftrag läuft – die Lamellen wandern mit. */
    direction?: 'up' | 'down' | null;
    size?: 'small' | 'large'; // 'small' für Kachel (34×44), 'large' für Sheet (88×112)
}

export const ShutterViz: React.FC<ShutterVizProps> = ({
    closedFrac,
    isMoving,
    isUnknown,
    direction = null,
    size = 'small',
}) => {
    // Jede Instanz braucht eigene IDs: mehrere <pattern id="slats"> im selben
    // Dokument sind ungueltig, alle Fenster zeigen dann das erste Muster und
    // eine Animation an einer Kachel wuerde auf alle anderen durchschlagen.
    const uid = useId().replace(/:/g, '');
    const patternId = `slats-${uid}`;
    const clipId = `fill-${uid}`;

    const isClosed = closedFrac !== null && closedFrac > 0;

    let borderColor = 'var(--text-secondary)';
    if (isMoving) {
        borderColor = 'var(--accent-yellow)';
    } else if (isClosed) {
        borderColor = 'var(--accent)';
    }

    const sizeClass = size === 'large' ? 'viz-large' : 'viz-small';
    const opacityClass = isUnknown ? 'viz-unknown' : '';
    const movingClass = isMoving ? 'viz-moving' : '';
    const dirClass = isMoving && direction ? `viz-dir-${direction}` : '';

    // Hoehe der geschlossenen Flaeche im 100×140-Raster (Innenmass 132).
    const fillHeight = closedFrac !== null ? (closedFrac / 100) * 132 : 0;

    return (
        <div className={`shutter-viz ${sizeClass} ${opacityClass} ${movingClass} ${dirClass}`}>
            <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
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
