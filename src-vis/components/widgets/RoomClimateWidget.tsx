import { useState } from 'react';
import { ChevronDown, Thermometer } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useDashboardMobile } from '../../contexts/DashboardMobileContext';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import type { WidgetProps, ClickAction } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { formatNum } from '../../utils/formatValue';
import { RoomClimateDetails } from './RoomClimateDetails';
import { WidgetClickPopup } from './popup/WidgetClickPopup';
import type { EChartTimeRange } from '../../hooks/useMultiSeriesData';

/**
 * Slim room-climate bar: icon + room name + temperature + chevron. The
 * last-change display is NOT rendered here — the standard WidgetFrame overlay
 * handles it (options showLastChange/lastChangePosition), consistent with all
 * other widget types.
 *
 * Mobile (single-column stack): tapping expands an inline details panel and
 * pushes the widgets below down. Desktop (fixed grid, no reflow possible):
 * tapping opens the same details as popup.
 *
 * The widget is on the mobile autoHeight list (the expanded panel must be able
 * to grow), so the collapsed bar enforces the grid-derived cell height itself:
 * height stays identical to fixed-height widgets (e.g. the Wohnklima bars) and
 * stable from the first frame — it does not depend on loaded sensor values.
 */
export function RoomClimateWidget({ config, editMode }: WidgetProps) {
    const isMobile = useDashboardMobile();
    const [expanded, setExpanded] = useState(false);
    const [popupOpen, setPopupOpen] = useState(false);

    const o = config.options ?? {};
    const { value: rawTemp } = useDatapoint(config.datapoint);
    const temp = typeof rawTemp === 'number' ? rawTemp : null;

    const humidityDp = (o.humidityDatapoint as string) ?? '';
    const historyInstance = (o.historyInstance as string) ?? '';
    const initialRange = (o.historyRange as EChartTimeRange | undefined) ?? '24h';
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const unit = (o.unit as string) ?? '°C';
    const RoomIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
    const iconSize = (o.iconSize as number) || 20;
    const nameFontSize = (o.nameFontSize as number) || 17;
    const valueFontSize = (o.valueFontSize as number) || 20;

    // Same cell-height formula the mobile stack uses for fixed-height widgets
    // (Dashboard.tsx): h * gridRowHeight + (h - 1) * gridGap.
    const activeLayoutIdCtx = useActiveLayoutId();
    const effectiveSettings = useEffectiveSettings(activeLayoutIdCtx);
    const hPad = (effectiveSettings.widgetPadding as number | undefined) ?? 16;
    const rowH = (effectiveSettings.gridRowHeight as number | undefined) ?? 20;
    const gap = (effectiveSettings.gridGap as number | undefined) ?? 10;
    const cellH = config.gridPos.h * rowH + (config.gridPos.h - 1) * gap;

    const toggle = () => {
        if (editMode) return;
        if (isMobile) setExpanded((x) => !x);
        else setPopupOpen(true);
    };

    const popupAction: Extract<ClickAction, { kind: 'popup-roomtemperature' }> = {
        kind: 'popup-roomtemperature',
        temperatureDp: config.datapoint,
        humidityDp: humidityDp || undefined,
        historyInstance: historyInstance || undefined,
    };

    return (
        <div className="flex flex-col h-full" style={{ padding: `0 ${hPad}px` }} data-widget-interactive>
            {/* Bar area: on mobile exactly one grid cell tall (stable while
                loading); on desktop it fills the fixed cell. The expanded
                panel's separator therefore sits exactly at the height where
                the collapsed widget's bottom edge is. */}
            <div
                className="flex items-center"
                style={isMobile ? { minHeight: cellH } : { flex: '1 1 auto', minHeight: 0 }}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                    }}
                    className="flex items-center gap-2.5 w-full text-left focus:outline-none"
                    style={{ background: 'transparent' }}
                >
                    {/* text-primary matches the icon-cell fallback of the universal
                        widget's custom grid (CustomGridView) — consistent with the
                        hand-built Wohnklima bars. */}
                    <RoomIcon size={iconSize} style={{ color: 'var(--text-primary)', flexShrink: 0 }} />
                    <span className="flex items-baseline gap-2 flex-1 min-w-0">
                        <span
                            className="truncate flex-1"
                            style={{ color: 'var(--text-primary)', fontSize: nameFontSize }}
                        >
                            {config.title || config.datapoint.split('.').slice(-2)[0]}
                        </span>
                        <span
                            className="font-bold shrink-0"
                            style={{ color: 'var(--text-primary)', fontSize: valueFontSize }}
                        >
                            {temp !== null ? `${formatNum(temp, decimals)}${unit}` : '–'}
                        </span>
                    </span>
                    <ChevronDown
                        size={15}
                        className="shrink-0 transition-transform duration-200"
                        style={{
                            color: 'var(--text-secondary)',
                            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                    />
                </button>
            </div>

            {/* Inline expand (mobile stack only — pushes the bars below down) */}
            {isMobile && expanded && (
                <div
                    style={{ borderTop: '1px solid var(--app-border)', paddingTop: 12, paddingBottom: 10 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <RoomClimateDetails
                        temperatureDp={config.datapoint}
                        humidityDp={humidityDp}
                        historyInstance={historyInstance || 'history.0'}
                        title={config.title || 'Temperatur'}
                        decimals={decimals}
                        showCurrentHeader={false}
                        initialRange={initialRange}
                        enableDayNav
                        chartHeight={150}
                    />
                </div>
            )}

            {/* Desktop: same details in the centered popup */}
            {popupOpen && !isMobile && (
                <WidgetClickPopup widget={config} action={popupAction} onClose={() => setPopupOpen(false)} />
            )}
        </div>
    );
}
