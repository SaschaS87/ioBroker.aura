/**
 * Favoriten der Rollladen-Liste (Runde 201+, 02.11.2026), nur Dev-Vorschau.
 *
 * Ein Datenpunkt fuer das ganze Haus: JSON-Liste mit den Schluesseln der
 * Antriebe, z. B. ["Küchenfenster","SPK"]. Gilt fuer alle Geraete gleich,
 * nicht je Handy – die Familie soll dieselbe kurze Liste sehen.
 *
 * Die Vorschau schreibt IMMER unter Rollladen_Dev (devWriteGuard laesst nur
 * diesen Praefix durch). Beim Einbau in die echte App wandert der Datenpunkt
 * nach 0_userdata.0.Rollladen.Favoriten und muss dort zuerst angelegt werden.
 *
 * Zwischen Tipp und Rueckmeldung des Servers gilt der lokale Stand, damit der
 * Stern sofort umspringt.
 */
import { useCallback, useMemo, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { getStateDirect, setStateDirect } from '../../../../hooks/useIoBroker';

export const FAV_DP = '0_userdata.0.Rollladen_Dev.Favoriten';

export interface Favorites {
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

export function useFavorites(): Favorites {
    const { value } = useDatapoint(FAV_DP);
    const server = useMemo(() => parse(value), [value]);
    // Lokaler Stand bis zur naechsten Server-Meldung; die Rueckmeldung
    // ersetzt ihn (value aendert sich → serverRaw !== local.raw).
    const [local, setLocal] = useState<{ raw: unknown; keys: string[] } | null>(null);
    const keys = local && local.raw === value ? local.keys : server;

    const toggle = useCallback(
        (key: string) => {
            const base = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
            setLocal({ raw: value, keys: base });
            // Frisch lesen und nur diesen einen Schluessel aendern – nie den
            // Bildschirmstand blind zurueckschreiben (wie useRollPlanData).
            void getStateDirect(FAV_DP).then((s) => {
                const fresh = parse(s?.val);
                const add = base.includes(key);
                const next = add ? (fresh.includes(key) ? fresh : [...fresh, key]) : fresh.filter((k) => k !== key);
                setStateDirect(FAV_DP, JSON.stringify(next));
            });
        },
        [keys, value],
    );

    const has = useCallback((key: string) => keys.includes(key), [keys]);
    return { has, toggle };
}
