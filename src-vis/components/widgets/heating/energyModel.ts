/**
 * Datenmodell der Klappbox „Energie" im Heizung-Tab. Holt die vier Tageszaehler (Strom/Waerme, Heizen/Warmwasser)
 * ROH aus InfluxDB fuer die letzten 30 lokalen Kalendertage und rechnet sie ueber utils/heatingEnergy.ts.
 *
 * Roh (historyStepMs 0 -> aggregate 'none'), NICHT gebuendelt: Influx fuellt gebuendelte Abfragen mit
 * fill(previous), ein Tag ohne Eintrag bekaeme den Wert des Vortags (siehe sensorCheckModel.ts). Auch nicht
 * 'delta': die Zaehler springen um ~23:54 zurueck und die Rechnung braucht die Rohpunkte je Stunde.
 *
 * Die Gesamtzaehler (Summen in MWh, Laufzeiten in h, Verdichterstarts) sind nur Momentanwerte.
 */
import { useEffect, useMemo } from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useMultiSeriesData, type EChartSeriesConfig } from '../../../hooks/useMultiSeriesData';
import {
    buildEnergy,
    dayKey,
    energyWindow,
    lifetimeTable,
    type DayEnergy,
    type EnergyTotals,
    type LifetimeTable,
    type RawPoint,
} from '../../../utils/heatingEnergy';

/** Obergrenze Rohpunkte je Reihe. Gemessen am 24.10.2026: 377 (Heizen) bzw. ~2 800 (Warmwasser) in 31 Tagen. */
export const ENERGY_MAX_COUNT = 20000;

export interface EnergyDps {
    pHeizungTagDp: string;
    pWwTagDp: string;
    wmHeizenTagDp: string;
    wmWwTagDp: string;
    pHeizungDp: string;
    pWwDp: string;
    wmHeizenDp: string;
    wmWwDp: string;
    wmNeHeizenDp: string;
    wmNeWwDp: string;
    lzVerdHeizenDp: string;
    lzVerdWwDp: string;
    lzNeHeizenDp: string;
    lzNeWwDp: string;
    verdStartsDp: string;
}

/** Momentanwerte der Gesamtzaehler (null = nicht verfuegbar). */
export interface EnergyLifetime {
    pHeizen: number | null;
    pWw: number | null;
    wmHeizen: number | null;
    wmWw: number | null;
    wmNeHeizen: number | null;
    wmNeWw: number | null;
    lzVerdHeizen: number | null;
    lzVerdWw: number | null;
    lzNeHeizen: number | null;
    lzNeWw: number | null;
    verdStarts: number | null;
    table: LifetimeTable;
}

export interface EnergyModel {
    start: number;
    end: number;
    days: DayEnergy[];
    /** [Tag][Stunde] in kWh. */
    hourly: number[][];
    totals: EnergyTotals;
    lifetime: EnergyLifetime;
    loading: boolean;
    hasData: boolean;
}

declare global {
    interface Window {
        __auraEnergy?: {
            days: DayEnergy[];
            hourly: number[][];
            totals: EnergyTotals;
            counts: Record<string, { n: number; first: number | null; last: number | null }>;
        };
    }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function useEnergyData(historyInstance: string, dps: EnergyDps): EnergyModel {
    const { subscribe, getState, connected } = useIoBroker();
    // Fenster je lokalem Tag festhalten: sonst waere es bei jedem Render ein neues Objekt (und ein neuer Abruf).
    const today = dayKey(Date.now());
    const win = useMemo(() => energyWindow(Date.now()), [today]); // eslint-disable-line react-hooks/exhaustive-deps

    const series: EChartSeriesConfig[] = useMemo(() => {
        const mk = (id: string, dp: string): EChartSeriesConfig => ({
            id,
            name: id,
            datapointId: dp,
            chartType: 'line',
            historyInstance,
            aggregate: 'none',
            historyStepMs: 0,
            historyMaxCount: ENERGY_MAX_COUNT,
            historyStart: win.start,
            historyEnd: win.end,
        });
        return [
            mk('pHeizen', dps.pHeizungTagDp),
            mk('pWw', dps.pWwTagDp),
            mk('wmHeizen', dps.wmHeizenTagDp),
            mk('wmWw', dps.wmWwTagDp),
        ].filter((s) => s.datapointId);
    }, [historyInstance, win, dps.pHeizungTagDp, dps.pWwTagDp, dps.wmHeizenTagDp, dps.wmWwTagDp]);

    const dataMap = useMultiSeriesData(series, connected, subscribe, getState);

    const calc = useMemo(() => {
        const get = (id: string): RawPoint[] => dataMap.get(id)?.data ?? [];
        return buildEnergy(
            { pHeizen: get('pHeizen'), pWw: get('pWw'), wmHeizen: get('wmHeizen'), wmWw: get('wmWw') },
            Date.now(),
        );
    }, [dataMap]);

    const pHeizen = num(useDatapoint(dps.pHeizungDp).value);
    const pWw = num(useDatapoint(dps.pWwDp).value);
    const wmHeizen = num(useDatapoint(dps.wmHeizenDp).value);
    const wmWw = num(useDatapoint(dps.wmWwDp).value);
    const wmNeHeizen = num(useDatapoint(dps.wmNeHeizenDp).value);
    const wmNeWw = num(useDatapoint(dps.wmNeWwDp).value);
    const lzVerdHeizen = num(useDatapoint(dps.lzVerdHeizenDp).value);
    const lzVerdWw = num(useDatapoint(dps.lzVerdWwDp).value);
    const lzNeHeizen = num(useDatapoint(dps.lzNeHeizenDp).value);
    const lzNeWw = num(useDatapoint(dps.lzNeWwDp).value);
    const verdStarts = num(useDatapoint(dps.verdStartsDp).value);

    const model = useMemo((): EnergyModel => {
        const loading = series.some((s) => dataMap.get(s.id)?.loading);
        const hasData = series.some((s) => (dataMap.get(s.id)?.data.length ?? 0) > 0);
        return {
            start: win.start,
            end: win.end,
            days: calc.days,
            hourly: calc.hourly,
            totals: calc.totals,
            lifetime: {
                pHeizen,
                pWw,
                wmHeizen,
                wmWw,
                wmNeHeizen,
                wmNeWw,
                lzVerdHeizen,
                lzVerdWw,
                lzNeHeizen,
                lzNeWw,
                verdStarts,
                table: lifetimeTable({ pHeizen, pWw, wmHeizen, wmWw }),
            },
            loading,
            hasData,
        };
    }, [
        calc,
        win,
        series,
        dataMap,
        pHeizen,
        pWw,
        wmHeizen,
        wmWw,
        wmNeHeizen,
        wmNeWw,
        lzVerdHeizen,
        lzVerdWw,
        lzNeHeizen,
        lzNeWw,
        verdStarts,
    ]);

    // Nur Dev: Tageswerte, Heatmap und Punktzahlen je Reihe fuer die Gegenpruefung gegen InfluxDB.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const counts: NonNullable<Window['__auraEnergy']>['counts'] = {};
        for (const s of series) {
            const d = dataMap.get(s.id)?.data ?? [];
            counts[s.datapointId] = {
                n: d.length,
                first: d.length ? d[0][0] : null,
                last: d.length ? d[d.length - 1][0] : null,
            };
        }
        window.__auraEnergy = { days: model.days, hourly: model.hourly, totals: model.totals, counts };
    }, [model, series, dataMap]);

    return model;
}
