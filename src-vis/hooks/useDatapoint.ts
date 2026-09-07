import { useState, useEffect, useMemo } from 'react';
import { useIoBroker, getStateFromCache, isStateFresh } from './useIoBroker';
import type { ioBrokerState } from '../types';
import { splitDpRef, resolveDpValue } from '../utils/dpRef';

/**
 * Hook für einen einzelnen ioBroker-Datenpunkt.
 * Abonniert Änderungen und liefert den aktuellen Wert sowie eine Setter-Funktion.
 *
 * Der Datenpunkt darf einen JSON-Pfad-Suffix tragen (z. B. `…battery#soc`),
 * dann wird der verschachtelte Wert aus einem Objekt-/JSON-State extrahiert.
 * Das Abonnement läuft immer gegen die bare State-ID.
 */
export function useDatapoint(ref: string) {
    const { subscribe, setState, getState, connected } = useIoBroker();
    // Split once: the base ID drives the socket, the path drives value extraction.
    const { id, path } = useMemo(() => splitDpRef(ref), [ref]);
    // Initialize from prefetch cache so widgets render with real values immediately (no null-flash).
    const [state, setDatapointState] = useState<ioBrokerState | null>(() => (id ? getStateFromCache(id) : null));

    useEffect(() => {
        // The ref can CHANGE while mounted (e.g. widgets with a built-in source
        // switcher). An empty ref must clear the previous datapoint's value
        // instead of keeping it on screen.
        if (!id) {
            setDatapointState(null);
            return;
        }
        if (!connected) return;

        // Adopt whatever the cache holds now: it may have been filled AFTER this
        // component mounted (the load-time prefetch resolves independently), in which
        // case the initializer above saw nothing and the fetch below is skipped as
        // redundant — leaving the widget on its placeholder with a perfectly good
        // value sitting in the cache.
        // Always adopt the cached value rather than keeping an existing local one: the
        // ref can change while mounted, and then the local value belongs to the PREVIOUS
        // datapoint — it stayed on screen until the new one happened to push a change.
        // Safe because `cacheState` is written on every live push, so for one and the
        // same id the cache is never older than the local value.
        const cached = getStateFromCache(id);
        if (cached) setDatapointState(cached);

        // Skip the socket round-trip only when the cached value is backed by a live
        // subscription (another mounted consumer of the same DP). A cached value with
        // no subscription behind it may be arbitrarily old — it stopped being updated
        // the moment the last subscriber went away, which is what left popups showing
        // the value from their previous open. Checked BEFORE subscribing below, since
        // subscribing is what marks the ID as maintained.
        let cancelled = false;
        if (!isStateFresh(id)) {
            getState(id).then((initialState) => {
                // Guard against out-of-order responses when the id changes
                // quickly: a slow answer for an old id must not overwrite the
                // current one.
                if (initialState && !cancelled) setDatapointState(initialState);
            });
        }

        // Live-Updates abonnieren
        const unsubscribe = subscribe(id, (newState) => {
            setDatapointState(newState);
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [id, connected, subscribe, getState]);

    const setValue = (val: boolean | number | string) => {
        // Writes always target the bare state ID; nested JSON sub-paths are read-only.
        setState(id, val);
    };

    // Keep the public contract a primitive (boolean | number | string | null) so all
    // existing widgets keep rendering `value` directly. A JSON path that resolves to an
    // object/array is shown as compact JSON rather than breaking React.
    const value = useMemo<ioBrokerState['val']>(() => {
        const resolved = resolveDpValue(state?.val, path);
        if (resolved === null || resolved === undefined) return null;
        const t = typeof resolved;
        if (t === 'boolean' || t === 'number' || t === 'string') return resolved as boolean | number | string;
        try {
            return JSON.stringify(resolved);
        } catch {
            return null;
        }
    }, [state, path]);

    return {
        state,
        value,
        setValue,
    };
}
