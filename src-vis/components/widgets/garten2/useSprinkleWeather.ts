/**
 * Wetter- und Verdunstungsdaten fuer die Karte „Wetter & Boden" des
 * Garten2-Steuerpults.
 *
 * Regen gestern kommt bewusst aus dem Netatmo-Alias (`alias.0.Wetterdaten.regenGestern`,
 * GEMESSEN), nicht aus dem Open-Meteo-Modellwert des Adapters — Saschas
 * ausdrueckliche Entscheidung vom 22.09.2026. Regen heute/morgen bleiben beim
 * Adapter (`sprinklecontrol.0.info.*`), dafuer gibt es keinen Messwert.
 */
import { useDatapoint } from '../../../hooks/useDatapoint';

const REGEN_GESTERN_DP = 'alias.0.Wetterdaten.regenGestern';

export interface SprinkleWeather {
    etpToday: number | null;
    etpYesterday: number | null;
    /** 'up' = heute verdunstet mehr als gestern, 'down' = weniger, 'flat' = etwa gleich. */
    etpTrend: 'up' | 'down' | 'flat' | null;
    rainToday: number | null;
    rainTomorrow: number | null;
    /** Netatmo-Messwert, nicht das Open-Meteo-Modell. */
    rainYesterday: number | null;
    loaded: boolean;
}

export function useSprinkleWeather(instance: string): SprinkleWeather {
    const etpTodayDp = useDatapoint(`${instance}.evaporation.ETpToday`);
    const etpYesterdayDp = useDatapoint(`${instance}.evaporation.ETpYesterday`);
    const rainTodayDp = useDatapoint(`${instance}.info.rainToday`);
    const rainTomorrowDp = useDatapoint(`${instance}.info.rainTomorrow`);
    const rainYesterdayDp = useDatapoint(REGEN_GESTERN_DP);

    const etpToday = typeof etpTodayDp.value === 'number' ? etpTodayDp.value : null;
    const etpYesterday = typeof etpYesterdayDp.value === 'number' ? etpYesterdayDp.value : null;
    const rainToday = typeof rainTodayDp.value === 'number' ? rainTodayDp.value : null;
    const rainTomorrow = typeof rainTomorrowDp.value === 'number' ? rainTomorrowDp.value : null;
    const rainYesterday = typeof rainYesterdayDp.value === 'number' ? rainYesterdayDp.value : null;

    let etpTrend: SprinkleWeather['etpTrend'] = null;
    if (etpToday !== null && etpYesterday !== null) {
        const delta = etpToday - etpYesterday;
        etpTrend = Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
    }

    const loaded =
        etpTodayDp.state !== null &&
        etpYesterdayDp.state !== null &&
        rainTodayDp.state !== null &&
        rainTomorrowDp.state !== null;

    return { etpToday, etpYesterday, etpTrend, rainToday, rainTomorrow, rainYesterday, loaded };
}
