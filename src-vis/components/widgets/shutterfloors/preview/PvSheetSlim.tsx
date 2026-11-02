/**
 * Feinregler „schlicht" (Runde 201+, 02.11.2026), nur Dev-Vorschau.
 *
 * Saschas Vorgaben zu PvSheet (zu voll): so schlicht wie das Original
 * ShutterSheet.tsx, aber im Look von Entwurf 35.
 * - keine Schnellwerte (Offen/25/50/75/Zu) und keine Lamellen-Knoepfe,
 *   nur die Schieber
 * - Raffstore: Position und Lamelle gleich hoch und auf einer Linie – beide
 *   Spalten haben denselben Aufbau (Ueberschrift, Zahl, Wort, Schieber H px)
 * - kein „Verwerfen": Schliessen (wischen, daneben tippen, Escape) verwirft
 * - Stern fuer Favoriten oben rechts im Kopf
 * - Leise-Feder neben der Bestaetigungstaste, links oder rechts (feder)
 *
 * Fahrlogik unveraendert wie ShutterSheet.tsx/PvSheet.tsx: Schieber legen
 * einen Entwurf an, gefahren wird erst mit der Taste. In der Dev-Vorschau
 * haelt devWriteGuard das Schreiben auf, es faehrt nichts.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Feather, Square, Star } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { useIoBroker } from '../../../../hooks/useIoBroker';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore, slatPendingKey } from '../../shuttershared/useShutterDevice';
import { tapFeedback } from '../../shuttershared/haptics';
import { useSheetDismiss } from '../../useSheetDismiss';
import { useDragValue, SNAP_POS, SNAP_SLAT } from '../../shuttershared/useDragValue';
import { radioDpsFromPosDp, radioLevel, isRadioOffline, RADIO_COLOR, clockTime } from '../../shuttershared/tahomaRadio';
import type { ShutterFloorDeviceDef } from '../types';
import { useRowControl } from './useRowControl';
import type { Favorites } from './useFavorites';
import './round201.css';

export type FederSide = 'left' | 'right';

/** Hoehe beider Schieber – eine Zahl fuer Position UND Lamelle. */
const H = 260;
const LEVEL_WORD = { good: 'Funk gut', normal: 'Funk normal', low: 'Funk schwach' } as const;
const KIND_WORD = { fenster: 'Fenster', dachfenster: 'Dachfenster', raffstore: 'Raffstore' } as const;

/** Ein senkrechter Schieber: Fuellung von oben = Anteil zu. */
function Pill({
    value,
    set,
    snaps,
    kind,
    label,
    busy,
    unknown,
    stale,
    disabled,
    marks,
}: {
    value: number;
    set: (v: number) => void;
    snaps: number[];
    kind: 'pos' | 'slat';
    label: string;
    busy: boolean;
    unknown: boolean;
    stale: boolean;
    disabled: boolean;
    marks: number[];
}) {
    const { handlers, isDragging } = useDragValue({ get: () => value, set, snapPoints: snaps, spanPx: H });
    const cls = [
        'pvq-pill',
        `pvq-pill--${kind}`,
        isDragging ? 'is-drag' : '',
        busy ? 'is-busy' : '',
        unknown ? 'is-unknown' : '',
        stale ? 'is-stale' : '',
        disabled ? 'is-disabled' : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <div
            className={cls}
            style={{ height: H }}
            {...(disabled ? {} : handlers)}
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
        >
            <div className="pvq-pill-fill" style={{ height: `${unknown ? 0 : value}%` }} />
            {marks.map((p) => (
                <span key={p} className="pvq-pill-mark" style={{ top: `${p}%` }} />
            ))}
        </div>
    );
}

export function PvSheetSlim({
    device,
    connected,
    feder,
    fav,
    onClose,
}: {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    feder: FederSide;
    fav: Favorites;
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
    const travel = ctl.busy && posDraft === null && state.targetOpen !== null && state.startOpen !== null;
    const targetClosed = state.targetOpen !== null ? 100 - state.targetOpen : null;
    const startClosed = state.startOpen !== null ? 100 - state.startOpen : null;
    const vizClosed = posDraft ?? (travel && targetClosed !== null ? targetClosed : closedNow);
    const unknown = ctl.unknown && posDraft === null;

    // Lamelle wie ShutterSheet.tsx: waehrend ihres Auftrags zeigt sie das Ziel.
    const slatTravel = state.isSlatActing && slatDraft === null && state.slatTarget !== null;
    const slatShown = slatDraft ?? (slatTravel ? (state.slatTarget as number) : (state.slatShownPos ?? 0));
    const slatKnown = !state.isSlatUnknown || slatDraft !== null || slatTravel;
    const hasDraft = posDraft !== null || slatDraft !== null;
    const busy = ctl.busy || state.isSlatActing;

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
    const stop = () => {
        tapFeedback();
        ctl.stop();
        setPosDraft(null);
        setSlatDraft(null);
        setSlow(false);
    };

    let posWord = '';
    if (travel)
        posWord =
            targetClosed !== null && startClosed !== null && targetClosed > startClosed ? 'fährt zu' : 'fährt auf';
    else if (ctl.busy && posDraft === null) posWord = 'fährt';
    else if (unknown) posWord = 'unbekannt';
    else if (ctl.estimate && posDraft === null) posWord = 'nicht bestätigt';
    else if (shown <= 3) posWord = 'ganz offen';
    else if (shown >= 97) posWord = 'ganz geschlossen';

    let slatWord = '';
    if (slatTravel) slatWord = 'dreht';
    else if (!slatKnown) slatWord = 'unbekannt';
    else if (slatShown <= 5) slatWord = 'waagerecht';
    else if (slatShown >= 88) slatWord = 'geschlossen';
    else slatWord = 'halb offen';

    const goLabel =
        posDraft !== null
            ? posDraft <= 3
                ? 'Öffnen'
                : posDraft >= 97
                  ? 'Schließen'
                  : `Auf ${Math.round(posDraft)} % fahren`
            : slatDraft !== null
              ? 'Lamelle stellen'
              : 'OK';

    const isFav = fav.has(device.key);
    const stopPtr = {
        onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerUp: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerMove: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    };

    const featherBtn =
        device.slowPosDp && !busy ? (
            <button
                type="button"
                className={`pvq-feder${slow ? ' is-on' : ''}`}
                onClick={() => {
                    tapFeedback();
                    setSlow((v) => !v);
                }}
                aria-pressed={slow}
                aria-label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
                title="Nächste Fahrt leise"
            >
                <Feather size={19} />
            </button>
        ) : (
            <span />
        );

    return createPortal(
        <div className="pvs-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div
                className={`pvs pvq is-${device.kind}`}
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                aria-label={device.label}
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
                    <div className="pvq-head">
                        <div className="pvs-head-text">
                            <div className="pvs-title">{device.label}</div>
                            <div className="pvs-sub">{device.room || KIND_WORD[device.kind]}</div>
                        </div>
                        <button
                            type="button"
                            className={`pvq-star${isFav ? ' is-on' : ''}`}
                            {...stopPtr}
                            onClick={() => {
                                tapFeedback();
                                fav.toggle(device.key);
                            }}
                            aria-pressed={isFav}
                            aria-label={isFav ? 'Favorit entfernen' : 'Als Favorit markieren'}
                            title={isFav ? 'Favorit – steht in der Liste oben' : 'Als Favorit markieren'}
                        >
                            <Star size={22} fill={isFav ? 'currentColor' : 'none'} strokeWidth={1.9} />
                        </button>
                    </div>
                </div>

                <div className="pvq-body">
                    <div className="pvq-instruments">
                        <div className="pvq-col">
                            <div className="pvq-cap">Position</div>
                            <div
                                className={`pvq-val${offline ? ' is-stale' : ''}${ctl.estimate && posDraft === null ? ' is-estimate' : ''}${posDraft !== null ? ' is-live' : ''}`}
                            >
                                {unknown ? (
                                    '–'
                                ) : travel && startClosed !== null && targetClosed !== null ? (
                                    <>
                                        {Math.round(startClosed)}
                                        <span className="pvq-arrow">→</span>
                                        <span className="pvq-target">{Math.round(targetClosed)} %</span>
                                    </>
                                ) : (
                                    <>
                                        {Math.round(shown)}
                                        <span className="pvq-unit"> % zu</span>
                                    </>
                                )}
                            </div>
                            <div className={`pvq-word${ctl.busy ? ' is-busy' : ''}`}>{posWord}</div>
                            <Pill
                                value={vizClosed}
                                set={setPosDraft}
                                snaps={SNAP_POS}
                                kind="pos"
                                label="Position"
                                busy={ctl.busy}
                                unknown={unknown}
                                stale={offline}
                                disabled={false}
                                marks={SNAP_POS.slice(1, -1)}
                            />
                        </div>
                        {device.slatDp && (
                            <div className="pvq-col">
                                <div className="pvq-cap">Lamelle</div>
                                <div
                                    className={`pvq-val${slatDraft !== null ? ' is-live' : ''}${slatTravel ? ' is-target' : ''}`}
                                >
                                    {slatKnown ? `${Math.round(slatShown)}°` : '–'}
                                </div>
                                <div className={`pvq-word${slatTravel ? ' is-busy' : ''}`}>{slatWord}</div>
                                <Pill
                                    value={slatShown}
                                    set={setSlatDraft}
                                    snaps={SNAP_SLAT}
                                    kind="slat"
                                    label="Lamellenwinkel"
                                    busy={slatTravel}
                                    unknown={!slatKnown}
                                    stale={false}
                                    disabled={!connected || !slatKnown}
                                    marks={SNAP_SLAT.slice(1)}
                                />
                            </div>
                        )}
                    </div>

                    <div
                        className="pvq-confirm"
                        style={{ '--pvq-side': device.slowPosDp ? '50px' : '0px' } as CSSProperties}
                    >
                        {feder === 'left' ? featherBtn : <span />}
                        {busy && !hasDraft ? (
                            <button type="button" className="pvq-go pvq-go--stop" onClick={stop} disabled={!connected}>
                                <Square size={17} fill="currentColor" /> Stopp
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="pvq-go"
                                onClick={confirm}
                                disabled={!connected || !hasDraft}
                            >
                                {goLabel}
                            </button>
                        )}
                        {feder === 'right' ? featherBtn : <span />}
                    </div>
                    <div className={`pvq-hint${slow ? ' is-on' : ''}`}>{slow ? 'nächste Fahrt leise' : ''}</div>

                    {!connected && <div className="pvs-notice">TaHoma-Box nicht erreichbar</div>}

                    <div className={`pvq-radio${offline ? ' is-offline' : ''}`}>
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
