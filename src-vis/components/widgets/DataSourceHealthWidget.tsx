import { DataSourceHealthBox, type HealthSourceDef } from './shared/DataSourceHealthBox';
import type { WidgetProps } from '../../types';

/**
 * Thin standalone wrapper around DataSourceHealthBox so it can live as its
 * own dashboard widget (own card, own gridPos) instead of being hardwired
 * into WeatherForecastStripWidget's return path. Sources come purely from
 * `config.options.healthSources` — no editor form for this yet, configured
 * as raw JSON in the state (aura.0/1 config.dashboard), same as before the
 * move (see Technik/Aura Entwicklung/Feature-Dokumentation for the move).
 */
export function DataSourceHealthWidget({ config }: WidgetProps) {
    const sources = (config.options?.healthSources as HealthSourceDef[] | undefined) ?? [];
    return <DataSourceHealthBox sources={sources} />;
}
