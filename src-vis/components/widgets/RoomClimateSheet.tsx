import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { RoomClimateDetails, TEMP_COLOR } from './RoomClimateDetails';
import { useSheetDismiss } from './useSheetDismiss';
import { formatNum } from '../../utils/formatValue';
import './RoomClimateSheet.css';

export interface RoomClimateSheetProps {
    title: string;
    temperatureDp: string;
    humidityDp?: string;
    historyInstance?: string;
    decimals?: number;
    onClose: () => void;
    currentTemp?: number | null;
    unit?: string;
    showHeaderValue?: boolean;
    showLastChangeFooter?: boolean;
}

export function RoomClimateSheet({
    title,
    temperatureDp,
    humidityDp,
    historyInstance = 'history.0',
    decimals,
    onClose,
    currentTemp,
    unit = '°C',
    showHeaderValue = false,
    showLastChangeFooter = false,
}: RoomClimateSheetProps) {
    // Prefer the frontend container so styles inherit per-layout scoped CSS vars.
    // Falls back to the portal target (admin context) or document.body.
    const adminTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget;

    // Swipe-down-to-dismiss. Only the grip/header block is draggable — the body
    // keeps its own scrolling, so a drag there would fight the scroll gesture.
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    return createPortal(
        <div className="rc-sheet-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div className="rc-sheet" style={sheetStyle} onClick={(e) => e.stopPropagation()}>
                {/* Drag zone: grip + title. touch-action none so the browser does
                    not claim the vertical gesture for scrolling. */}
                <div
                    className="rc-sheet-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="rc-sheet-grip">
                        <div className="rc-sheet-grip-handle" />
                    </div>

                    <div className="rc-sheet-header">
                        <div className="rc-sheet-title">{title}</div>
                        {showHeaderValue && typeof currentTemp === 'number' && (
                            <div style={{ fontWeight: 600, color: TEMP_COLOR, fontSize: '16px' }}>
                                {formatNum(currentTemp, decimals ?? 0)}
                                {unit}
                            </div>
                        )}
                    </div>
                </div>

                {/* Body: room climate details */}
                <div className="rc-sheet-body">
                    <RoomClimateDetails
                        temperatureDp={temperatureDp}
                        humidityDp={humidityDp}
                        historyInstance={historyInstance}
                        title={title}
                        decimals={decimals}
                        showCurrentHeader={false}
                        chartHeight={150}
                        showLastChangeFooter={showLastChangeFooter}
                    />
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
