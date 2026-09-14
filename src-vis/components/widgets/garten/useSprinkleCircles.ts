/**
 * Kreis-Erkennung fuer das Garten-Widget.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *   1. Primaerquelle — die Adapter-Konfiguration
 *      (`system.adapter.<instance>`, `native.events[]` mit `enabled` und
 *      `sprinkleName`). Nur diese Quelle kennt das `enabled`-Flag eines
 *      Kreises.
 *   2. Rueckfallquelle — die angelegten Kanaele unter
 *      `<instance>.sprinkle.*`. Greift, wenn die Instanz nicht lesbar ist
 *      (Rechte) oder eine fremde Adapterversion kein `native.events` fuehrt.
 *
 * Liefern beide nichts, bleibt `source: 'none'` — das Widget zeigt dann
 * "Keine Bewaesserungskreise gefunden" statt einer erfundenen Liste.
 *
 * MESSUNG in der Dev-Vorschau (localhost:5173 gegen aura.1, 10.09.2026), ueber
 * denselben Socket, den die App benutzt:
 *   - Weg 1, 'getObject system.adapter.sprinklecontrol.0': Objekt geliefert,
 *     7 Eintraege in native.events, davon 4 mit enabled === true
 *     (Rasen_Terasse, Rasen_Oben, Rasen_Küche, Rasen_Test1). Nach
 *     hiddenCircles bleiben die drei echten Kreise uebrig.
 *     => Es gilt `source: 'config'`.
 *   - Weg 2, 'getObjectList sprinklecontrol.0.sprinkle.*': KEINE Antwort,
 *     zweimal gemessen (8 s und 20 s ohne Callback). Der Rueckfall greift in
 *     dieser Umgebung also nicht. Zum Vergleich beantwortet derselbe Socket
 *     'getObjectView system/channel' auf denselben Bereich in 62 ms mit 14
 *     Zeilen — ein Wechsel auf getObjectViewDirect waere der belegbar
 *     funktionierende Rueckfall, steht aber so nicht im Plan und ist deshalb
 *     als offener Punkt notiert.
 * Damit der stumme Weg 2 die Anzeige nicht dauerhaft auf "Kreise werden
 * gesucht ..." stehen laesst, bricht LIST_TIMEOUT_MS ihn ab.
 */
import { useEffect, useMemo, useState } from 'react';
import { getObjectDirect, getObjectListDirect, useIoBroker } from '../../../hooks/useIoBroker';
import type { GartenCircleDef } from '../../../types';

export type CircleSource = 'config' | 'objects' | 'none';

export interface SprinkleCirclesResult {
    /** Sichtbare Kreise (ohne die in `hiddenCircles` gelisteten). */
    circles: GartenCircleDef[];
    /** Alle erkannten Kreise — Grundlage der Ein-/Ausblenden-Liste. */
    allCircles: GartenCircleDef[];
    source: CircleSource;
    loading: boolean;
}

/** Wie lange auf die Rueckfallquelle gewartet wird, bevor sie als stumm gilt
 *  (gemessen: sie antwortet in der Vorschau gar nicht, siehe Kopf). */
const LIST_TIMEOUT_MS = 5000;

/** Ein Eintrag aus `native.events` des sprinklecontrol-Adapters. */
interface SprinkleEvent {
    enabled?: boolean;
    sprinkleName?: string;
}

/** 'Rasen_Küche' -> 'Küche'. Nur der Anzeigename, die ID bleibt unberuehrt. */
function defaultLabel(sprinkleName: string): string {
    return sprinkleName.replace(/^Rasen_/, '') || sprinkleName;
}

export function useSprinkleCircles(
    instance: string,
    hiddenCircles: string[],
    circleLabels: Record<string, string>,
): SprinkleCirclesResult {
    const { connected } = useIoBroker();
    const [names, setNames] = useState<string[]>([]);
    const [source, setSource] = useState<CircleSource>('none');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!instance || !connected) return;
        let cancelled = false;
        setLoading(true);

        void (async () => {
            // 1. Adapter-Konfiguration
            // getObjectDirect liefert die schlanke Objektform des Hooks, die kein
            // native-Feld kennt — hier lokal aufweiten statt die gemeinsame
            // Schnittstelle anzufassen.
            const inst = (await getObjectDirect(`system.adapter.${instance}`)) as {
                native?: { events?: unknown };
            } | null;
            const events = inst?.native?.events;
            if (Array.isArray(events)) {
                const fromConfig = (events as SprinkleEvent[])
                    .filter((e) => e && e.enabled === true)
                    .map((e) => String(e.sprinkleName ?? '').trim())
                    .filter(Boolean);
                if (fromConfig.length > 0) {
                    if (!cancelled) {
                        setNames([...new Set(fromConfig)]);
                        setSource('config');
                        setLoading(false);
                    }
                    return;
                }
            }

            // 2. Angelegte Kanaele \u2014 mit Zeitschranke, weil der Aufruf in der
            // Vorschau nachweislich ohne Antwort bleibt (siehe Kopf).
            const prefix = `${instance}.sprinkle.`;
            const list = await Promise.race([
                getObjectListDirect(prefix, `${prefix}\u9999`),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), LIST_TIMEOUT_MS)),
            ]);
            const fromObjects = new Set<string>();
            for (const row of list?.rows ?? []) {
                const id = String(row?.id ?? '');
                if (!id.startsWith(prefix)) continue;
                const seg = id.slice(prefix.length).split('.')[0];
                if (seg) fromObjects.add(seg);
            }
            if (cancelled) return;
            setNames([...fromObjects]);
            setSource(fromObjects.size > 0 ? 'objects' : 'none');
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, [instance, connected]);

    const allCircles = useMemo<GartenCircleDef[]>(
        () =>
            names.map((sprinkleName) => ({
                sprinkleName,
                label: circleLabels[sprinkleName] || defaultLabel(sprinkleName),
            })),
        [names, circleLabels],
    );

    const circles = useMemo<GartenCircleDef[]>(
        () => allCircles.filter((c) => !hiddenCircles.includes(c.sprinkleName)),
        [allCircles, hiddenCircles],
    );

    return { circles, allCircles, source, loading };
}
