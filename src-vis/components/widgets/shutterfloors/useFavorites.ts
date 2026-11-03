/**
 * Favoriten der Rollladen-Liste (Feature 27, Regel 203, Einbau 03.11.2026).
 *
 * Ein Datenpunkt fuers ganze Haus: JSON-Liste mit den Schluesseln der
 * Antriebe, z. B. ["Küchenfenster","SPK"]. Gilt fuer alle Geraete gleich,
 * nicht je Handy – die Familie soll dieselbe kurze Liste sehen.
 *
 * Die App legt den Datenpunkt NICHT an. Er heisst `<Planer-Wurzel>.Favoriten`
 * (im Dev-Build also unter Rollladen_Dev, auf dem Pi unter Rollladen) und
 * muss einmal von Hand angelegt werden (Typ Zeichenkette). Solange er fehlt,
 * ist `available` false: die Liste zeigt alle Antriebe, kein Stern im
 * Feinregler, es wird nichts geschrieben und nichts gemeldet.
 *
 * Zwischen Tipp und Rueckmeldung des Servers gilt der lokale Stand, damit der
 * Stern sofort umspringt.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { getObjectDirect, getStateDirect, setStateDirect, useIoBroker } from '../../../hooks/useIoBroker';

export interface Favorites {
    /** Gibt es den Datenpunkt? Ohne ihn gibt es keine Favoriten. */
    available: boolean;
    has: (key: string) => boolean;
    toggle: (key: string) => void;
}

function parse(raw: unknown): string[] {
    if (typeof raw !== 'string' || raw === '') return [];
    try {
        const v: unknown = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export function useFavorites(dp: string): Favorites {
    const { connected } = useIoBroker();
    const { value } = useDatapoint(dp);

    // Existenzpruefung: erst wenn verbunden, ohne Zwischenspeicher, damit ein
    // spaeter angelegter Datenpunkt nach dem Neuladen sofort gilt.
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        if (!connected) return;
        let alive = true;
        getObjectDirect(dp, { skipCache: true })
            .then((obj) => {
                if (alive) setAvailable(!!obj);
            })
            .catch(() => {
                if (alive) setAvailable(false);
            });
        return () => {
            alive = false;
        };
    }, [dp, connected]);

    const server = useMemo(() => parse(value), [value]);
    // Lokaler Stand bis zur naechsten Server-Meldung; die Rueckmeldung
    // ersetzt ihn (value aendert sich → serverRaw !== local.raw).
    const [local, setLocal] = useState<{ raw: unknown; keys: string[] } | null>(null);
    const keys = local && local.raw === value ? local.keys : server;

    const toggle = useCallback(
        (key: string) => {
            if (!available) return;
            const base = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
            setLocal({ raw: value, keys: base });
            // Frisch lesen und nur diesen einen Schluessel aendern – nie den
            // Bildschirmstand blind zurueckschreiben (wie useRollPlanData).
            void getStateDirect(dp).then((s) => {
                const fresh = parse(s?.val);
                const add = base.includes(key);
                const next = add ? (fresh.includes(key) ? fresh : [...fresh, key]) : fresh.filter((k) => k !== key);
                setStateDirect(dp, JSON.stringify(next));
            });
        },
        [available, dp, keys, value],
    );

    const has = useCallback((key: string) => available && keys.includes(key), [available, keys]);
    return { available, has, toggle };
}
