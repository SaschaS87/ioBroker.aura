import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Meldet, ob das Element gerade gar nicht gezeichnet wird (kein Kasten). Das ist der Fall, wenn der
 * Dashboard-Tab verlassen wurde: Dashboard.tsx hängt besuchte Tabs nicht aus, sondern versteckt sie mit
 * display:none. Ein ResizeObserver meldet den Wechsel in beide Richtungen.
 */
export function useTabHidden(ref: RefObject<HTMLElement>): boolean {
    const [hidden, setHidden] = useState(false);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setHidden(el.getClientRects().length === 0);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return hidden;
}
