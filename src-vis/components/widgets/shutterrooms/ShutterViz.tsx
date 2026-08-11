import React from 'react';
import './ShutterViz.css';

interface ShutterVizProps {
    closedFrac: number | null;
    isMoving: boolean;
    isUnknown: boolean;
    size?: 'small' | 'large'; // 'small' für Kachel (34×44), 'large' für Sheet (88×112)
}

export const ShutterViz: React.FC<ShutterVizProps> = ({ closedFrac, isMoving, isUnknown, size = 'small' }) => {
    const isClosed = closedFrac !== null && closedFrac > 0;

    let borderColor = 'var(--text-secondary)';
    if (isMoving) {
        borderColor = 'var(--accent-yellow)';
    } else if (isClosed) {
        borderColor = 'var(--accent)';
    }

    const sizeClass = size === 'large' ? 'viz-large' : 'viz-small';
    const opacityClass = isUnknown ? 'viz-unknown' : '';

    return (
        <div className={`shutter-viz ${sizeClass} ${opacityClass}`}>
            <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">
                <defs>
                    {/* Lamellen-Muster */}
                    <pattern id="slats" x="0" y="0" width="100" height="8" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="6" x2="100" y2="6" stroke="currentColor" strokeWidth="2" opacity="0.35" />
                    </pattern>
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
                />

                {/* Füllung mit Lamellen-Muster (von oben = geschlossen) */}
                {closedFrac !== null && closedFrac > 0 && (
                    <rect x="4" y="4" width="92" height={(closedFrac / 100) * 132} fill="url(#slats)" />
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

                {/* Pulsierender Punkt bei Bewegung */}
                {isMoving && <circle cx="50" cy="70" r="4" fill="var(--accent-yellow)" className="viz-pulse" />}
            </svg>
        </div>
    );
};
