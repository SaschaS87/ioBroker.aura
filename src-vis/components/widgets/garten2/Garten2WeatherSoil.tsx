/**
 * Karte „Wetter & Boden" des Garten2-Steuerpults — reine Anzeige.
 *
 * Restfeuchte wird 1:1 gezeigt, KEIN Clamping auf 100 % — der Adapter
 * erlaubt bis 150 % (`max:150` in der Objektdefinition, bestaetigt
 * 22.09.2026), Werte über 100 % sind also korrekt so.
 *
 * Regen gestern kommt aus dem Netatmo-Alias (gemessen), Regen heute/morgen
 * aus dem Adapter (Prognose/Zaehler). Im Zeitplan-Modus wird die Restfeuchte
 * eines Kreises nicht nachgefuehrt — derselbe Hinweistext wie in
 * GartenCircleCard.tsx (TIMER_MODE_MOISTURE_HINT).
 */
import { Droplets, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { TIMER_MODE_MOISTURE_HINT } from '../garten/gartenConstants';
import type { SprinkleWeather } from './useSprinkleWeather';
import type { CircleProbeData } from './Garten2Widget';

function fmtMm(v: number | null): string {
    return v === null ? '—' : `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm`;
}

interface Props {
    weather: SprinkleWeather;
    circles: CircleProbeData[];
    showSoilMoisture: boolean;
}

export function Garten2WeatherSoil({ weather, circles, showSoilMoisture }: Props) {
    const anyScheduleMode = circles.some((c) => c.state.mode === 'schedule');

    return (
        <div className="garten-card garten2-weather">
            <div className="garten-card-t">
                <span className="garten-name">Wetter &amp; Boden</span>
            </div>

            <div className="garten2-etp-row">
                <div className="garten2-etp-cell">
                    <span className="garten2-etp-label">Verdunstung heute</span>
                    <span className="garten2-etp-value">
                        {weather.etpToday === null
                            ? '—'
                            : weather.etpToday.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                        {weather.etpToday !== null && <span className="garten2-etp-unit"> mm</span>}
                        {weather.etpTrend === 'up' && <TrendingUp size={14} className="garten2-etp-trend is-up" />}
                        {weather.etpTrend === 'down' && (
                            <TrendingDown size={14} className="garten2-etp-trend is-down" />
                        )}
                    </span>
                </div>
                <div className="garten2-etp-cell">
                    <span className="garten2-etp-label">gestern</span>
                    <span className="garten2-etp-value garten2-etp-value--sub">
                        {weather.etpYesterday === null
                            ? '—'
                            : weather.etpYesterday.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                        {weather.etpYesterday !== null && <span className="garten2-etp-unit"> mm</span>}
                    </span>
                </div>
                <div className="garten2-etp-cell">
                    <span className="garten2-etp-label">Regen heute</span>
                    <span className="garten2-etp-value garten2-etp-value--sub">{fmtMm(weather.rainToday)}</span>
                </div>
            </div>

            <p className="garten-note">
                Regen gestern: {fmtMm(weather.rainYesterday)} (gemessen) · Regen morgen (Prognose):{' '}
                {fmtMm(weather.rainTomorrow)}
            </p>

            {showSoilMoisture && circles.length > 0 && (
                <div className="garten2-soil-list">
                    {circles.map((c) => {
                        const muted = c.state.mode === 'schedule';
                        return (
                            <div key={c.sprinkleName} className={`garten2-soil-row${muted ? ' is-muted' : ''}`}>
                                <span className="garten2-soil-name">{c.label}</span>
                                <span className="garten2-soil-value">
                                    <Droplets size={12} />
                                    {c.state.soilMoisture === null ? '—' : `${Math.round(c.state.soilMoisture)} %`}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {showSoilMoisture && anyScheduleMode && (
                <p className="garten-note">
                    <Info size={11} /> {TIMER_MODE_MOISTURE_HINT}
                </p>
            )}
        </div>
    );
}
