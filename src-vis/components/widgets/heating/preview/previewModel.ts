/**
 * Gemeinsames Datenmodell der Entwuerfe A–C des „Aussenfuehler-Checks"
 * (nur Dev-Vorschau). Holt die fuenf Verlaufsreihen aus InfluxDB und legt sie
 * auf ein gemeinsames Abschnittsraster (siehe utils/sensorCheck.ts).
 *
 * Reihen: Aussenfuehler der Waermepumpe, Netatmo-Station 1–3, Sonnensensor
 * vorne (Lux). Abweichung = Fuehler minus Mittel der Stationen, die im
 * Abschnitt einen Wert haben.
 */
import { useEffect, useMemo } from 'react';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../../../hooks/useMultiSeriesData';
import { periodWindow, type PeriodMode } from '../../../../utils/chartPeriod';
import {
    deviation,
    meanOfAvailable,
    sectionCount,
    stepForMode,
    toGrid,
    type Grid,
    type Pt,
} from '../../../../utils/sensorCheck';

export interface SensorCheckDps {
    fuehlerDp: string;
    netatmo1Dp: string;
    netatmo2Dp: string;
    netatmo3Dp: string;
    luxDp: string;
}

/**
 * Haltegrenzen: wie lange der letzte Wert noch gilt, wenn kein neuer Punkt kommt.
 * Gemessen am 07.10.2026 in InfluxDB (alle Reihen schreiben nur bei Aenderung):
 *  - Fuehler:  typisch 1 min, groesster Abstand 23 min      -> 30 min
 *  - Netatmo:  typisch 5 min, groesster Abstand 70 min      -> 75 min
 *              (die Luecke 12.–20.10. dauert 200 h und wird nie ueberbrueckt)
 *  - Lux:      schreibt nur bei Aenderung; ueber Nacht bleibt der Sensor auf 50 Lux
 *              und liefert keine Punkte (laengste Pause im Okt. 13,4 h, im Winter
 *              ~16 h) -> 18 h. Mit 12 h ergaebe sich vor jedem Sonnenaufgang eine
 *              Luecke in der Flaeche.
 */
export const HOLD_MS = {
    fuehler: 30 * 60_000,
    netatmo: 75 * 60_000,
    lux: 18 * 3_600_000,
} as const;

export interface SensorCheckModel {
    start: number;
    end: number;
    stepMs: number;
    count: number;
    fuehler: Grid;
    stationen: [Grid, Grid, Grid];
    mittel: Grid;
    /** Anzahl Stationen mit Wert je Abschnitt. */
    n: number[];
    abweichung: Grid;
    /** Helligkeit in Lux (Anzeige in klx = Wert / 1000). */
    lux: Grid;
    loading: boolean;
    hasData: boolean;
}

declare global {
    interface Window {
        __auraSensorCheck?: {
            start: number;
            stepMs: number;
            fuehler: Grid;
            stationen: Grid[];
            mittel: Grid;
            abweichung: Grid;
            lux: Grid;
            n: number[];
        };
    }
}

export function useSensorCheckData(
    mode: PeriodMode,
    offset: number,
    historyInstance: string,
    dps: SensorCheckDps,
): SensorCheckModel {
    const { subscribe, getState, connected } = useIoBroker();
    const win = useMemo(() => periodWindow(mode, offset), [mode, offset]);
    const stepMs = stepForMode(mode);

    const series: EChartSeriesConfig[] = useMemo(() => {
        // Das Fenster beginnt eine Haltegrenze frueher, damit der letzte Wert VOR
        // Mitternacht (der Adapter schreibt Unveraendertes nicht) noch ankommt.
        const mk = (id: string, dp: string, hold: number, raw: boolean): EChartSeriesConfig => ({
            id,
            name: id,
            datapointId: dp,
            chartType: 'line',
            historyInstance,
            aggregate: 'average',
            // Rohpunkte (kein Bucket-Mittel): raw=true. Der Influx-Adapter fuellt gebuendelte
            // Abfragen mit fill(previous) — eine Luecke im Fenster (Netatmo 12.–20.10.) wuerde
            // dort mit dem alten Wert zugezogen. Rohpunkte bleiben ehrlich.
            ...(raw ? { historyStepMs: 0, historyMaxCount: 12000 } : { historyStepMs: stepMs, historyMaxCount: 2000 }),
            historyStart: win.start - hold,
            historyEnd: win.end,
        });
        // Fuehler: Tag und 7 Tage roh (~870 Punkte/Tag, ~6 100 pro Woche), Monat gebuendelt
        // (roh waeren ~27 000). Bekannte Grenze: gebuendelt fuellt der Adapter Fuehler-Ausfaelle
        // im Monat mit dem letzten Wert zu (aktuell kein Ausfall).
        // Netatmo und Helligkeit: immer roh (Netatmo ~210, Lux 81-181 Punkte/Tag): wegen der
        // Netatmo-Luecke s. o.; bei Lux haette fill(previous) sonst das Mittel des letzten
        // Abschnitts (z. B. 73 statt 50 lx) die ganze Nacht weitergetragen.
        const list: EChartSeriesConfig[] = [];
        if (dps.fuehlerDp) list.push(mk('fuehler', dps.fuehlerDp, HOLD_MS.fuehler, mode !== 'month'));
        if (dps.netatmo1Dp) list.push(mk('st1', dps.netatmo1Dp, HOLD_MS.netatmo, true));
        if (dps.netatmo2Dp) list.push(mk('st2', dps.netatmo2Dp, HOLD_MS.netatmo, true));
        if (dps.netatmo3Dp) list.push(mk('st3', dps.netatmo3Dp, HOLD_MS.netatmo, true));
        // Helligkeit roh; toGrid mittelt die Punkte je Abschnitt (nie 'last': Spitzen gingen verloren).
        if (dps.luxDp) list.push(mk('lux', dps.luxDp, HOLD_MS.lux, true));
        return list;
    }, [mode, win, stepMs, historyInstance, dps.fuehlerDp, dps.netatmo1Dp, dps.netatmo2Dp, dps.netatmo3Dp, dps.luxDp]);

    const dataMap = useMultiSeriesData(series, connected, subscribe, getState);

    const model = useMemo((): SensorCheckModel => {
        const get = (id: string): Pt[] => dataMap.get(id)?.data ?? [];
        const now = Date.now();
        const grid = (id: string, hold: number) => toGrid(get(id), win.start, win.end, stepMs, hold, now);
        const fuehler = grid('fuehler', HOLD_MS.fuehler);
        const s1 = grid('st1', HOLD_MS.netatmo);
        const s2 = grid('st2', HOLD_MS.netatmo);
        const s3 = grid('st3', HOLD_MS.netatmo);
        const lux = grid('lux', HOLD_MS.lux);
        const { mean, n } = meanOfAvailable([s1, s2, s3]);
        const abw = deviation(fuehler, mean);
        const count = sectionCount(win.start, win.end, stepMs);
        const loading = series.some((s) => dataMap.get(s.id)?.loading);
        const hasData = series.some((s) => (dataMap.get(s.id)?.data.length ?? 0) > 0);
        return {
            start: win.start,
            end: win.end,
            stepMs,
            count,
            fuehler,
            stationen: [s1, s2, s3],
            mittel: mean,
            n,
            abweichung: abw,
            lux,
            loading,
            hasData,
        };
    }, [dataMap, win, stepMs, series]);

    // Nur Dev: Rasterwerte fuer die Gegenpruefung gegen InfluxDB.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        window.__auraSensorCheck = {
            start: model.start,
            stepMs: model.stepMs,
            fuehler: model.fuehler,
            stationen: model.stationen,
            mittel: model.mittel,
            abweichung: model.abweichung,
            lux: model.lux,
            n: model.n,
        };
    }, [model]);

    return model;
}
