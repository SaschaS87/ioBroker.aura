import React, { useRef, useEffect } from 'react';
import { useDragValue, KNOB_PAD, SNAP_SLAT } from './useDragValue';
import { tapFeedback } from './haptics';
import './SlatSlider.css';

interface SlatSliderProps {
    value: number;
    onChange: (value: number) => void;
    spanPx: number; // Höhe der Ziehfläche in px
    disabled?: boolean;
    onDraggingChange?: (isDragging: boolean) => void;
}

export const SlatSlider: React.FC<SlatSliderProps> = ({
    value,
    onChange,
    spanPx,
    disabled = false,
    onDraggingChange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { handlers, isDragging } = useDragValue({
        get: () => value,
        set: onChange,
        snapPoints: SNAP_SLAT,
        spanPx,
    });

    // Dragging-State nach außen melden
    useEffect(() => {
        onDraggingChange?.(isDragging);
    }, [isDragging, onDraggingChange]);

    // SVG-Maße
    const w = 44;
    const h = 280;
    const schieneY = KNOB_PAD;
    const schieneLaenge = h - 2 * KNOB_PAD;

    // Griffposition (0–100 Punkte auf die Schiene abbilden)
    const griffY = KNOB_PAD + (value / 100) * schieneLaenge;

    // Füllung: von Schienenbeginn bis zur aktuellen Griffposition
    const fillHeight = Math.max(0, griffY - KNOB_PAD);

    // Tastatursteuerung
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        const step = 5;
        let newValue = value;

        if (e.key === 'ArrowUp') {
            newValue = Math.max(0, value - step);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            newValue = Math.min(100, value + step);
            e.preventDefault();
        } else if (e.key === 'Home') {
            newValue = 0;
            e.preventDefault();
        } else if (e.key === 'End') {
            newValue = 100;
            e.preventDefault();
        }

        if (newValue !== value) {
            tapFeedback();
            onChange(newValue);
        }
    };

    return (
        <div
            ref={containerRef}
            className="slat-slider"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            tabIndex={disabled ? -1 : 0}
            {...handlers}
            onKeyDown={handleKeyDown}
        >
            <svg
                viewBox={`0 0 ${w} ${h}`}
                width={w}
                height={h}
                className={isDragging ? 'dragging' : ''}
            >
                {/* Schiene */}
                <rect
                    x={w / 2 - 5}
                    y={schieneY}
                    width={10}
                    height={schieneLaenge}
                    rx={5}
                    fill="var(--app-border)"
                />

                {/* Füllung */}
                <rect
                    x={w / 2 - 5}
                    y={schieneY}
                    width={10}
                    height={fillHeight}
                    rx={5}
                    fill="var(--accent)"
                />

                {/* Rastmarken 0, 50, 90 rechts neben der Schiene */}
                {[0, 50, 90].map((p) => {
                    const markY = KNOB_PAD + (p / 100) * schieneLaenge;
                    return (
                        <line
                            key={p}
                            x1={w / 2 + 7}
                            x2={w / 2 + 13}
                            y1={markY}
                            y2={markY}
                            stroke="white"
                            strokeOpacity="0.4"
                            strokeWidth="2"
                        />
                    );
                })}

                {/* Griff */}
                <circle
                    cx={w / 2}
                    cy={griffY}
                    r={14}
                    fill="var(--accent)"
                    stroke="white"
                    strokeWidth={3}
                />
            </svg>
        </div>
    );
};
