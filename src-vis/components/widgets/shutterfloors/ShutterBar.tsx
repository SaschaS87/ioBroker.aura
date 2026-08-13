import React from 'react';
import './ShutterBar.css';

interface ShutterBarProps {
    closedFrac: number | null;
}

/**
 * Schmaler waagerechter Balken zur Darstellung der Rollladen-Position.
 *
 * - closedFrac ist ein Wert 0–100 (geschlossener Anteil in Prozent)
 * - null bedeutet unbekannter Zustand (wird mit schraffiertem Muster angezeigt)
 */
export const ShutterBar: React.FC<ShutterBarProps> = ({ closedFrac }) => {
    return (
        <div className="shutter-bar">
            {closedFrac === null ? (
                <div className="shutter-bar-unknown" aria-label="Position unbekannt" />
            ) : (
                <div className="shutter-bar-fill" style={{ width: `${closedFrac}%` }} />
            )}
        </div>
    );
};
