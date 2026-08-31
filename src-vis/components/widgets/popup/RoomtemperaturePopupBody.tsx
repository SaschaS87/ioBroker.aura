import { Suspense } from 'react';
import type { WidgetConfig, ClickAction } from '../../../types';
import { lazyWithReload } from '../../../utils/lazyWithReload';

// RoomClimateDetails pulls in echarts (~1.1 MB). This body is reached through
// WidgetClickPopup, which WidgetFrame imports statically — a static import here
// therefore put the whole chart library into the initial bundle for every user,
// including those who never open a room popup. Fetched on the click instead,
// same as RoomClimateWidget does for its inline detail view.
const RoomClimateDetails = lazyWithReload(() =>
    import('../RoomClimateDetails').then((m) => ({ default: m.RoomClimateDetails })),
);

interface Props {
    widget: WidgetConfig;
    action: Extract<ClickAction, { kind: 'popup-roomtemperature' }>;
}

export function RoomtemperaturePopupBody({ widget, action }: Props) {
    // Temperature dp: action override first (universal widgets keep their dp in
    // grid cells, not in widget.datapoint), then widget-level datapoint.
    const temperatureDp = action.temperatureDp || widget.datapoint;
    const humidityDp = action.humidityDp || (widget.options?.humidityDatapoint as string) || '';
    const historyInstance =
        action.historyInstance || (widget.options?.historyInstance as string) || 'history.0';

    return (
        <div className="w-full max-w-[600px] p-5" onPointerDown={(e) => e.stopPropagation()}>
            {/* Placeholder holds the popup's height while echarts arrives. */}
            <Suspense fallback={<div style={{ height: 260 }} />}>
                <RoomClimateDetails
                    temperatureDp={temperatureDp}
                    humidityDp={humidityDp}
                    historyInstance={historyInstance}
                    title={widget.title ?? 'Temperatur'}
                    decimals={widget.options?.decimals as number | undefined}
                    showCurrentHeader
                    showLastChangeFooter={widget.options?.detailsLastChange === true}
                />
            </Suspense>
        </div>
    );
}
