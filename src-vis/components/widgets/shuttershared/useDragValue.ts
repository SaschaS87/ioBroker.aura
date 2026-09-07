import { useRef, useCallback, useState } from 'react';
import { tapFeedback } from './haptics';

export const SNAP_POS = [0, 25, 50, 75, 100];
export const SNAP_SLAT = [0, 50, 90];
export const SNAP_RANGE = 4;
export const DRAG_THRESHOLD = 6;
export const KNOB_PAD = 17;

interface DragValueOptions {
    get: () => number | null;
    set: (value: number) => void;
    snapPoints: number[];
    spanPx: number;
}

interface DragValueHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

interface UseDragValueReturn {
    handlers: DragValueHandlers;
    isDragging: boolean;
}

/**
 * Snap a raw value to the nearest snap point within SNAP_RANGE
 */
function snap(rawValue: number, snapPoints: number[]): number {
    for (const point of snapPoints) {
        if (Math.abs(rawValue - point) <= SNAP_RANGE) {
            return point;
        }
    }
    return rawValue;
}

export function useDragValue({
    get,
    set,
    snapPoints,
    spanPx,
}: DragValueOptions): UseDragValueReturn {
    const [isDraggingState, setIsDraggingState] = useState(false);

    const dragStateRef = useRef({
        isDragging: false,
        startY: 0,
        startValue: 0,
        lastSnapMark: null as number | null,
    });

    const clamp = useCallback((value: number): number => {
        return Math.max(0, Math.min(100, value));
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);

        const startValue = get() ?? 0;
        dragStateRef.current = {
            isDragging: false,
            startY: e.clientY,
            startValue: startValue,
            lastSnapMark: null,
        };
        setIsDraggingState(false);

        e.preventDefault();
    }, [get]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const state = dragStateRef.current;
        const distance = Math.abs(e.clientY - state.startY);

        // Below threshold: do nothing
        if (distance < DRAG_THRESHOLD) {
            return;
        }

        // Crossed threshold
        if (!state.isDragging) {
            state.isDragging = true;
            setIsDraggingState(true);
            tapFeedback();
        }

        // Calculate raw value (relative)
        const rawValue = clamp(
            state.startValue + ((e.clientY - state.startY) / spanPx) * 100
        );

        // Apply snapping
        const snappedValue = snap(rawValue, snapPoints);

        // Trigger feedback on snap point change
        if (snappedValue !== rawValue && snappedValue !== state.lastSnapMark) {
            tapFeedback();
            state.lastSnapMark = snappedValue;
        } else if (snappedValue === rawValue) {
            state.lastSnapMark = null;
        }

        // Update the draft value in real time (not setState to ioBroker, just local React state)
        set(snappedValue);
    }, [clamp, spanPx, snapPoints, set]);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        const state = dragStateRef.current;
        if (state.isDragging) {
            // Final snap on release
            const rawValue = clamp(
                state.startValue + ((e.clientY - state.startY) / spanPx) * 100
            );
            const snappedValue = snap(rawValue, snapPoints);
            set(snappedValue);
        }
        state.isDragging = false;
        setIsDraggingState(false);
    }, [clamp, spanPx, snapPoints, set]);

    const onPointerCancel = useCallback((e: React.PointerEvent) => {
        const state = dragStateRef.current;
        if (state.isDragging) {
            // Snap on cancel (same as on pointer up)
            const rawValue = clamp(
                state.startValue + ((e.clientY - state.startY) / spanPx) * 100
            );
            const snappedValue = snap(rawValue, snapPoints);
            set(snappedValue);
        }
        state.isDragging = false;
        setIsDraggingState(false);
    }, [clamp, spanPx, snapPoints, set]);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        const currentValue = get() ?? 50;
        let newValue = currentValue;

        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            newValue = clamp(currentValue + 5);
            e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            newValue = clamp(currentValue - 5);
            e.preventDefault();
        } else if (e.key === 'Home') {
            newValue = 0;
            e.preventDefault();
        } else if (e.key === 'End') {
            newValue = 100;
            e.preventDefault();
        }

        if (newValue !== currentValue) {
            const snappedValue = snap(newValue, snapPoints);
            set(snappedValue);
        }
    }, [get, set, clamp, snapPoints]);

    return {
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onKeyDown,
        },
        isDragging: isDraggingState,
    };
}
