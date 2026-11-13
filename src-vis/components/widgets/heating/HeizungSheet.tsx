/**
 * UI-Facelift, Heizung (nur Dev-Vorschau): Pop-up von unten für eine Auswertung (Entwurf A).
 *
 * Gleiche Mechanik wie RoomClimateSheet: Gerüst-Klassen rc-sheet*, Schließen über useSheetDismiss (Wischen
 * am Kopf, Tipp daneben, Escape), Hintergrund über .aura-scrim (kein eigener Schleier, kein eigener
 * Schatten). Aussehen über hz-sheet* in HeizungFacelift.css, seitlicher Rand über .aura-fl-sheet-body.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { useSheetDismiss } from '../useSheetDismiss';
import '../RoomClimateSheet.css';

export function HeizungSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const adminTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget;
    const { sheetStyle, backdropStyle, scrimClosing, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    return createPortal(
        <div
            className="rc-sheet-backdrop aura-scrim hz-sheet-backdrop"
            data-scrim-closing={scrimClosing}
            style={backdropStyle}
            onClick={onBackdropClick}
        >
            <div className="rc-sheet hz-sheet" style={sheetStyle} onClick={(e) => e.stopPropagation()}>
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
                    </div>
                </div>
                <div className="rc-sheet-body aura-fl-sheet-body">{children}</div>
            </div>
        </div>,
        portalTarget,
    );
}
