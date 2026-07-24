import { useState, useEffect } from 'react';
import { ChevronDown, Thermometer } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useDashboardMobile } from '../../contexts/DashboardMobileContext';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import type { WidgetProps, ClickAction } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { useRoomClimateHeightStore, type RoomClimateHeightMode } from '../../store/roomClimateHeightStore';
import { formatNum } from '../../utils/formatValue';
import { RoomClimateDetails } from './RoomClimateDetails';
import { WidgetClickPopup } from './popup/WidgetClickPopup';

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
    const { defaultDecimals } = useGlobalSettingsStore();
    const decimals = (o.decimals as number) ?? defaultDecimals;
    const unit = (o.unit as string) ?? '°C';
    const RoomIcon = getWidgetIcon(o.icon as string | undefined, Thermometer);
    const iconSize = (o.iconSize as number) || 20;
    const nameFontSize = (o.nameFontSize as number) || 17;
    const valueFontSize = (o.valueFontSize as number) || 20;
    // Opt-in "quiet list" styling (Wohnklima v2, "Variant A"): a muted outline
    // icon, an understated room name and the temperature as the accent number.
    // Look only — behaviour (expand, chevron, popup) is identical to the slim bar.
    const cardStyle = o.cardStyle === true;

    // Same cell-height formula the mobile stack uses for fixed-height widgets
    // (Dashboard.tsx): h * gridRowHeight + (h - 1) * gridGap.
    const activeLayoutIdCtx = useActiveLayoutId();
    const effectiveSettings = useEffectiveSettings(activeLayoutIdCtx);
    const hPad = (effectiveSettings.widgetPadding as number | undefined) ?? 16;
    const rowH = (effectiveSettings.gridRowHeight as number | undefined) ?? 20;
    const gap = (effectiveSettings.gridGap as number | undefined) ?? 10;
    const cellH = config.gridPos.h * rowH + (config.gridPos.h - 1) * gap;

    // ── Experimental responsive bar height (opt-in, mobile only) ──────────────
    // Only widgets that carry options.responsiveHeight follow the shared height
    // mode (the "Wohnklima v1" test tab). Everything else keeps cellH, so the
    // original tab is byte-for-byte unchanged.
    const responsiveHeight = o.responsiveHeight === true;
    const showHeightSwitch = o.showHeightSwitch === true;
    const roomCount = Math.max(1, (o.roomCount as number) || 1);
    const heightMode = useRoomClimateHeightStore((s) => s.mode);
    const setHeightMode = useRoomClimateHeightStore((s) => s.setMode);

    // Track the live viewport height so "fill"/"scaled" react to the actual
    // device and to rotation. Only wired up when this widget opted in.
    const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800));
    useEffect(() => {
        if (!responsiveHeight) return;
        const onResize = () => setVh(window.innerHeight);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [responsiveHeight]);

    // Rough mobile chrome (header + tab bar + container padding) and the space
    // the in-tab switcher row occupies — subtracted so "fill" lands one screen.
    const MOBILE_CHROME = 96;
    const SWITCH_ROW_H = 46;
    let barMinHeight = cellH;
    if (responsiveHeight && isMobile) {
        if (heightMode === 'fill') {
            const avail = vh - MOBILE_CHROME - SWITCH_ROW_H;
            barMinHeight = Math.max(34, (avail - (roomCount - 1) * gap) / roomCount);
        } else if (heightMode === 'scaled') {
            // Grows with the screen but stays sane on any device.
            barMinHeight = Math.min(96, Math.max(48, Math.round(vh * 0.1)));
        } else {
            barMinHeight = cellH;
        }
    }

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
            {/* Experimental in-tab height switcher (only the first widget of the
                "Wohnklima v1" tab carries showHeightSwitch). Writes the shared
                mode that every responsive bar reads. Mobile only. */}
            {showHeightSwitch && isMobile && (
                <div
                    className="flex items-center gap-1 pt-1 pb-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="text-[11px] mr-1" style={{ color: 'var(--text-secondary)' }}>
                        Höhe:
                    </span>
                    {(
                        [
                            ['fixed', 'Fest'],
                            ['fill', 'Füllend'],
                            ['scaled', 'Skaliert'],
                        ] as [RoomClimateHeightMode, string][]
                    ).map(([m, label]) => (
                        <button
                            key={m}
                            onClick={(e) => {
                                e.stopPropagation();
                                setHeightMode(m);
                            }}
                            className="px-2 py-0.5 rounded text-[11px] font-medium focus:outline-none transition-opacity hover:opacity-80"
                            style={{
                                background: heightMode === m ? 'var(--accent)' : 'var(--app-border)',
                                color: heightMode === m ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Bar area: on mobile exactly one grid cell tall (stable while
                loading); on desktop it fills the fixed cell. The expanded
                panel's separator therefore sits exactly at the height where
                the collapsed widget's bottom edge is. With responsiveHeight the
                mobile min-height follows the shared mode instead of cellH. */}
            <div
                className="flex items-center"
                style={isMobile ? { minHeight: barMinHeight } : { flex: '1 1 auto', minHeight: 0 }}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                    }}
                    className={`flex items-center w-full text-left focus:outline-none ${cardStyle ? 'gap-3' : 'gap-2.5'}`}
                    style={{ background: 'transparent' }}
                >
                    {cardStyle ? (
                        <>
                            {/* Variant A "quiet list" (Wohnklima v2): a muted outline
                                icon, the understated room name and the temperature
                                as the accent number. No humidity on the face — it
                                lives in the expanded detail. */}
                            <RoomIcon size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                            <span
                                className="truncate flex-1"
                                style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 400 }}
                            >
                                {config.title || config.datapoint.split('.').slice(-2)[0]}
                            </span>
                            <span
                                className="font-medium shrink-0"
                                style={{ color: 'var(--accent)', fontSize: 19 }}
                            >
                                {temp !== null ? `${formatNum(temp, decimals)}${unit}` : '–'}
                            </span>
                            <ChevronDown
                                size={15}
                                className="shrink-0 transition-transform duration-200"
                                style={{
                                    color: 'var(--text-secondary)',
                                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                }}
                            />
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
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
