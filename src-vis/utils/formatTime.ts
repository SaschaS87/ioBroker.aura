// For real UTC timestamps (ISO strings with a "Z" suffix, e.g.
// Status.modelllaufZeit / letzterAbruf) — this must actually convert to local
// time rather than slice the string, or it'd be off by the UTC offset.
// Shared between WeatherForecastStripWidget.tsx and DataSourceHealthBox.tsx
// (moved here 01.09.2026 to break a circular import: DataSourceHealthBox
// used to import it back from WeatherForecastStripWidget, which pulled the
// whole weather widget — and with it echarts, 1.1 MB — into every widget
// that renders a DataSourceHealthBox, including the Rollläden tab).
export function localTime(iso: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '–';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
