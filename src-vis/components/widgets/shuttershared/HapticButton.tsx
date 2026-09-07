import React from 'react';
import { tapFeedback } from './haptics';
import './HapticButton.css';

interface HapticButtonProps {
    onPress: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
    label: string;
    children: React.ReactNode;
    /** true = Klick nicht an die Kachel darunter weiterreichen (oeffnet sonst das Sheet). */
    stopPropagation?: boolean;
}

/**
 * Taste, die auf dem iPhone spuerbar quittiert.
 *
 * Der Trick: Statt eines <button> traegt die Taste einen unsichtbaren Schalter
 * in Apples eigener Bauform (<input type="checkbox" switch>), der die ganze
 * Flaeche abdeckt. Der Finger trifft also in Wahrheit den Schalter – und weil
 * das eine *echte* Beruehrung ist, gibt iOS ab Version 18 ein System-Tippen
 * aus. Genau daran scheiterte der fruehere Versuch: Dort wurde ein versteckter
 * Schalter nur programmatisch umgelegt, was iOS nicht quittiert.
 *
 * Am 12.08.2026 von Sascha auf dem Geraet bestaetigt (Testseite, Weg B).
 *
 * Warum kein <button> aussenrum: Ein interaktives Element im anderen ist
 * ungueltiges HTML, und der Klick auf den Schalter wuerde die Taste nicht
 * zuverlaessig ausloesen. Der Schalter IST die Taste.
 *
 * Tastatur: Der Schalter ist fokussierbar, die Leertaste legt ihn um – das
 * loest dasselbe onChange aus wie der Finger.
 */
export const HapticButton: React.FC<HapticButtonProps> = ({
    onPress,
    disabled = false,
    className = '',
    title,
    label,
    children,
    stopPropagation = false,
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (stopPropagation) {
            e.stopPropagation();
        }
        if (disabled) return;
        // Android/Chrome zusaetzlich; auf iOS hat die Beruehrung des Schalters
        // die Haptik bereits selbst ausgeloest.
        tapFeedback();
        onPress();
    };

    return (
        <span
            className={`haptic-btn ${className} ${disabled ? 'is-disabled' : ''}`}
            title={title}
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
            <span aria-hidden="true">{children}</span>
            <input
                type="checkbox"
                // Safaris eigenes Attribut – andere Browser ignorieren es und
                // zeigen eine gewoehnliche (hier unsichtbare) Checkbox.
                {...{ switch: '' }}
                className="haptic-btn-switch"
                aria-label={label}
                disabled={disabled}
                onChange={handleChange}
            />
        </span>
    );
};
