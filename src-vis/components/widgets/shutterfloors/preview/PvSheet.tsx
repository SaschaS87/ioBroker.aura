/**
 * Feinregler der Entwuerfe 31–40 (nur Dev-Vorschau): Fenster von unten mit
 * Griff, grosse Zahl, Schieber, Schnellwerte 0/25/50/75/100, Auf/Stopp/Zu,
 * Lamellenwinkel nur bei Raffstore, Leise-Feder nur bei faehigen Antrieben,
 * Funkzeile. Fahrlogik wie ShutterSheet.tsx: Schieber und Schnellwerte legen
 * einen Entwurf an, gefahren wird erst mit der Bestaetigungstaste.
 *
 * Zwei Regler-Formen:
 * - 'pill':   dicker senkrechter Schieber wie Helligkeit im Kontrollzentrum
 * - 'window': die bekannte Fenstergrafik (ShutterViz) als Schieber
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Feather, Square, X } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore, slatPendingKey } from '../../shuttershared/useShutterDevice';
import { ShutterViz } from '../../shuttershared/ShutterViz';
import { SlatSlider } from '../../shuttershared/SlatSlider';
import { tapFeedback } from '../../shuttershared/haptics';
import { useSheetDismiss } from '../../useSheetDismiss';
import { useDragValue, SNAP_POS, KNOB_PAD } from '../../shuttershared/useDragValue';
import { radioDpsFromPosDp, radioLevel, isRadioOffline, RADIO_COLOR, clockTime } from '../../shuttershared/tahomaRadio';
import { ArrowToTopIcon, ArrowToBottomIcon } from '../../../icons/ShutterActionIcons';
import type { ShutterFloorDeviceDef } from '../types';
import { useRowControl } from './useRowControl';

export type ReglerKind = 'pill' | 'window';

const H = 260;
const LEVEL_WORD = { good: 'Funk gut', normal: 'Funk normal', low: 'Funk schwach' } as const;

export function PvSheet({
    device,
    connected,
    regler,
    onClose,
}: {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    regler: ReglerKind;
    onClose: () => void;
}) {
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const ctl = useRowControl(device);
    const { markPending } = usePendingStore();
    const [posDraft, setPosDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const [slow, setSlow] = useState(false);

    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: rs } = useDatapoint(radioDps?.statusDp ?? '');
    const { state: rr } = useDatapoint(radioDps?.rssiDp ?? '');
    const { state: rd } = useDatapoint(radioDps?.discreteDp ?? '');
    const offline = isRadioOffline(rs?.val);
    const level = radioLevel(rd?.val);
    const rssi = typeof rr?.val === 'number' ? rr.val : null;

    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    const closedNow = ctl.closed ?? 0;
    const shown = posDraft ?? closedNow;
    const { handlers, isDragging } = useDragValue({
        get: () => posDraft ?? closedNow,
        set: setPosDraft,
        snapPoints: SNAP_POS,
        spanPx: H,
    });

    const travel = ctl.busy && posDraft === null && state.targetOpen !== null && state.startOpen !== null;
    const targetClosed = state.targetOpen !== null ? 100 - state.targetOpen : null;
    const startClosed = state.startOpen !== null ? 100 - state.startOpen : null;
    const vizClosed = posDraft ?? (travel && targetClosed !== null ? targetClosed : closedNow);
    const unknown = ctl.unknown && posDraft === null;
    const slatShown = slatDraft ?? state.slatShownPos ?? 0;
    const slatKnown = !state.isSlatUnknown || slatDraft !== null;
    const hasDraft = posDraft !== null || slatDraft !== null;

    const confirm = () => {
        tapFeedback();
        if (posDraft !== null && device.posDp) {
            const targetRaw = device.invertPosition ? posDraft : 100 - posDraft;
            const dp = slow && device.slowPosDp ? device.slowPosDp : device.posDp;
            const already = state.ackedPos !== null && Math.round(state.ackedPos) === Math.round(targetRaw);
            if (!already) {
                setState(dp, targetRaw, { diag: true });
                markPending(device.key, targetRaw, state.lastKnownAckedPos);
            }
        }
        if (slatDraft !== null && device.slatDp) {
            const already = state.slatAckedPos !== null && Math.round(state.slatAckedPos) === Math.round(slatDraft);
            if (!already) {
                setState(device.slatDp, slatDraft, { diag: true });
                markPending(slatPendingKey(device.key), slatDraft);
            }
        }
        setPosDraft(null);
        setSlatDraft(null);
        setSlow(false);
    };
    const act = (fn: () => void) => () => {
        tapFeedback();
        fn();
        setPosDraft(null);
        setSlatDraft(null);
        setSlow(false);
    };

    let word = '';
    if (travel)
        word = targetClosed !== null && startClosed !== null && targetClosed > startClosed ? 'fährt zu' : 'fährt auf';
    else if (ctl.busy && posDraft === null) word = 'fährt';
    else if (unknown) word = 'Stellung unbekannt';
    else if (ctl.estimate && posDraft === null) word = 'nicht bestätigt';
    else if (shown <= 3) word = 'ganz offen';
    else if (shown >= 97) word = 'ganz geschlossen';
    else word = 'geschlossen';

    const draftLabel =
        posDraft !== null
            ? posDraft <= 3
                ? 'Öffnen'
                : posDraft >= 97
                  ? 'Schließen'
                  : `Auf ${Math.round(posDraft)} % fahren`
            : 'Lamelle stellen';

    return createPortal(
        <div className="pvs-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div
                className="pvs"
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="pvs-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="pvs-grip" />
                    <div className="pvs-head">
                        <div className="pvs-head-text">
                            <div className="pvs-title">{device.label}</div>
                            <div className="pvs-sub">
                                {device.room ||
                                    (device.kind === 'raffstore'
                                        ? 'Raffstore'
                                        : device.kind === 'dachfenster'
                                          ? 'Dachfenster'
                                          : 'Fenster')}
                            </div>
                        </div>
                        <span
                            className="pvs-head-btns"
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            onPointerMove={(e) => e.stopPropagation()}
                        >
                            {device.slowPosDp && (
                                <button
                                    type="button"
                                    className={`pvs-round${slow ? ' is-on' : ''}`}
                                    onClick={() => setSlow((v) => !v)}
                                    aria-label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
                                    title="Nächste Fahrt leise"
                                >
                                    <Feather size={17} />
                                </button>
                            )}
                            <button type="button" className="pvs-round" onClick={startClose} aria-label="Schließen">
                                <X size={18} />
                            </button>
                        </span>
                    </div>
                </div>

                <div className="pvs-body">
                    <div className="pvs-value-row">
                        <div
                            className={`pvs-value${offline ? ' is-stale' : ''}${ctl.estimate && !hasDraft ? ' is-estimate' : ''}`}
                        >
                            {unknown ? (
                                <span className="pvs-value-unknown">unbekannt</span>
                            ) : travel && startClosed !== null && targetClosed !== null ? (
                                <>
                                    {Math.round(startClosed)}
                                    <span className="pvs-arrow">→</span>
                                    {Math.round(targetClosed)}
                                    <span className="pvs-unit">%</span>
                                </>
                            ) : (
                                <>
                                    {Math.round(shown)}
                                    <span className="pvs-unit">% zu</span>
                                </>
                            )}
                        </div>
                        <div className={`pvs-word${ctl.busy ? ' is-busy' : ''}`}>
                            {slow && !ctl.busy ? 'nächste Fahrt leise' : word}
                        </div>
                    </div>

                    <div className="pvs-instruments">
                        {regler === 'pill' ? (
                            <div
                                className={`pvs-pill${isDragging ? ' is-drag' : ''}${ctl.busy ? ' is-busy' : ''}${offline ? ' is-stale' : ''}${unknown ? ' is-unknown' : ''}`}
                                {...handlers}
                                role="slider"
                                aria-label="Position"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(shown)}
                                tabIndex={0}
                            >
                                <div className="pvs-pill-fill" style={{ height: `${unknown ? 0 : vizClosed}%` }} />
                                {SNAP_POS.slice(1, -1).map((p) => (
                                    <span key={p} className="pvs-pill-mark" style={{ top: `${p}%` }} />
                                ))}
                            </div>
                        ) : (
                            <div className={`pvs-window${offline ? ' is-stale' : ''}`} {...handlers}>
                                <ShutterViz
                                    closedFrac={unknown ? null : vizClosed}
                                    isMoving={ctl.busy}
                                    isUnknown={unknown}
                                    direction={state.direction}
                                    size="control"
                                    widthPx={device.slatDp ? 150 : 170}
                                    heightPx={H}
                                    snapMarks={SNAP_POS}
                                    isDragging={isDragging}
                                />
                            </div>
                        )}
                        {device.slatDp && (
                            <div className="pvs-slat">
                                <div className="pvs-slat-val">{slatKnown ? `${Math.round(slatShown)}°` : '–'}</div>
                                <SlatSlider
                                    value={slatShown}
                                    onChange={setSlatDraft}
                                    spanPx={H - 2 * KNOB_PAD}
                                    disabled={!connected || !slatKnown}
                                    isMoving={state.isSlatActing && slatDraft === null}
                                />
                                <div className="pvs-slat-cap">Lamelle</div>
                            </div>
                        )}
                    </div>

                    <div className="pvs-chips" role="group" aria-label="Schnellwerte Position">
                        {SNAP_POS.map((p) => (
                            <button
                                key={p}
                                type="button"
                                className={`pvs-chip${posDraft === p ? ' is-on' : ''}`}
                                onClick={() => setPosDraft(p)}
                                disabled={!connected}
                            >
                                {p === 0 ? 'Offen' : p === 100 ? 'Zu' : p}
                            </button>
                        ))}
                    </div>
                    {device.slatDp && (
                        <div className="pvs-chips" role="group" aria-label="Schnellwerte Lamelle">
                            {[
                                [0, 'Waagerecht'],
                                [50, 'Halb'],
                                [90, 'Geschlossen'],
                            ].map(([v, l]) => (
                                <button
                                    key={v}
                                    type="button"
                                    className={`pvs-chip pvs-chip--wide${slatDraft === v ? ' is-on' : ''}`}
                                    onClick={() => setSlatDraft(v as number)}
                                    disabled={!connected}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="pvs-actions">
                        {ctl.busy && !hasDraft ? (
                            <button
                                type="button"
                                className="pvs-big pvs-big--stop"
                                onClick={act(ctl.stop)}
                                disabled={!connected}
                            >
                                <Square size={18} fill="currentColor" /> Stopp
                            </button>
                        ) : hasDraft ? (
                            <>
                                <button
                                    type="button"
                                    className="pvs-big pvs-big--ghost"
                                    onClick={() => {
                                        setPosDraft(null);
                                        setSlatDraft(null);
                                    }}
                                >
                                    Verwerfen
                                </button>
                                <button
                                    type="button"
                                    className="pvs-big pvs-big--go"
                                    onClick={confirm}
                                    disabled={!connected}
                                >
                                    {draftLabel}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="pvs-big"
                                    onClick={act(ctl.open)}
                                    disabled={!connected}
                                    aria-label="Öffnen"
                                >
                                    <ArrowToTopIcon size={20} /> Auf
                                </button>
                                <button
                                    type="button"
                                    className="pvs-big"
                                    onClick={act(ctl.close)}
                                    disabled={!connected}
                                    aria-label="Schließen"
                                >
                                    <ArrowToBottomIcon size={20} /> Zu
                                </button>
                            </>
                        )}
                    </div>

                    {!connected && <div className="pvs-notice">TaHoma-Box nicht erreichbar</div>}

                    <div className={`pvs-radio${offline ? ' is-offline' : ''}`}>
                        {offline ? (
                            <>Kein Funkkontakt – Anzeige veraltet{rs?.lc ? ` · seit ${clockTime(rs.lc)} Uhr` : ''}</>
                        ) : (
                            <>
                                {level && <span style={{ color: RADIO_COLOR[level] }}>{LEVEL_WORD[level]}</span>}
                                {rssi !== null && ` (${rssi})`}
                                {rs?.ts ? ` · geprüft ${clockTime(rs.ts)} Uhr` : ''}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
