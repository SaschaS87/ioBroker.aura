import { useEffect, useRef, useState } from 'react';

/**
 * Shared dismiss behaviour for the bottom sheets (room climate, shutter):
 * swipe the head down to close, tap the backdrop, or press Escape.
 *
 * The sheet stays mounted until the slide-out has run, so the caller must
 * spread `sheetStyle`/`backdropStyle` and let `onClose` do the unmounting.
 */

/** Drag distance (px) past which releasing dismisses the sheet. */
const CLOSE_DISTANCE = 90;
/** Downward flick speed (px/ms) that dismisses regardless of distance. */
const CLOSE_VELOCITY = 0.5;
/** Must match the transform transition below so onClose fires after the slide-out. */
const CLOSE_MS = 220;

export function useSheetDismiss(onClose: () => void) {
    const [dragY, setDragY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [closing, setClosing] = useState(false);
    // startY anchors the drag; prev feeds the release velocity (flick detection).
    const drag = useRef({ startY: 0, prevY: 0, prevT: 0, velocity: 0 });
    const closeTimer = useRef<number | null>(null);

    const startClose = () => {
        if (closing) return;
        setClosing(true);
        setDragging(false);
        closeTimer.current = window.setTimeout(() => {
            onClose();
        }, CLOSE_MS);
    };

    useEffect(() => {
        return () => {
            if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') startClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onClose, closing]);

    const dragHandlers = {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            if (closing) return;
            const now = performance.now();
            drag.current = { startY: e.clientY, prevY: e.clientY, prevT: now, velocity: 0 };
            setDragging(true);
            // Capture keeps the move/up events coming even if the finger leaves
            // the head. Losing capture is harmless — never let it abort the drag.
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                /* pointer already released or capture unsupported */
            }
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragging) return;
            const now = performance.now();
            const dt = now - drag.current.prevT;
            if (dt > 0) drag.current.velocity = (e.clientY - drag.current.prevY) / dt;
            drag.current.prevY = e.clientY;
            drag.current.prevT = now;
            // Downward only — pulling up must not lift the sheet off the bottom edge.
            setDragY(Math.max(0, e.clientY - drag.current.startY));
        },
        onPointerUp: () => {
            if (!dragging) return;
            setDragging(false);
            if (dragY > CLOSE_DISTANCE || drag.current.velocity > CLOSE_VELOCITY) startClose();
            else setDragY(0);
        },
        onPointerCancel: () => {
            if (!dragging) return;
            setDragging(false);
            setDragY(0);
        },
    };

    // While dragging or sliding out the inline transform must win over the CSS
    // entry animation — a running animation would otherwise keep overriding it.
    const moved = dragging || closing || dragY > 0;
    const sheetStyle: React.CSSProperties = moved
        ? {
              transform: closing ? 'translateY(100%)' : `translateY(${dragY}px)`,
              transition: dragging ? 'none' : `transform ${CLOSE_MS}ms ease-out`,
              animation: 'none',
          }
        : {};

    const backdropStyle: React.CSSProperties | undefined = closing
        ? { opacity: 0, transition: `opacity ${CLOSE_MS}ms ease-out` }
        : undefined;

    const onBackdropClick = (e: React.MouseEvent) => {
        // Close only if the backdrop itself was hit, not the sheet on top of it.
        if (e.target === e.currentTarget) startClose();
    };

    return { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose };
}
