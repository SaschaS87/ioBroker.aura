import type { WidgetConfig, ClickAction } from '../../../types';
import type { EChartTimeRange } from '../../../hooks/useMultiSeriesData';
import { RoomClimateDetails } from '../RoomClimateDetails';

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
            <RoomClimateDetails
                temperatureDp={temperatureDp}
                humidityDp={humidityDp}
                historyInstance={historyInstance}
                title={widget.title ?? 'Temperatur'}
                decimals={widget.options?.decimals as number | undefined}
                showCurrentHeader
                initialRange={(widget.options?.echartRange as EChartTimeRange | undefined) ?? '24h'}
                enableDayNav={(widget.options?.echartDayNav as boolean | undefined) ?? true}
            />
        </div>
    );
}
