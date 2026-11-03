/**
 * Feinregler „schlicht" (Reihe D, Runde 220–229, 03.11.2026), nur Dev-Vorschau.
 *
 * Feste Vorgaben aus den Runden davor:
 * - nur Schieber, keine Schnellwerte, kein „Verwerfen" (Schliessen verwirft)
 * - Stern fuer Favoriten oben rechts im Kopf
 * - Taste schlicht „OK" (waehrend der Fahrt „Stopp")
 * - Raffstore: Position und Lamelle gleich hoch und auf einer Linie, feste
 *   Spaltenbreiten, damit der Abstand nicht springt, wenn das Wort wechselt
 * Neu in dieser Runde (sheetLooks.ts): Feder ohne Hintergrund zwischen Zahl
 * und Schieber, beim Raffstore keine Feder, schmale Lamelle.
 *
 * Fahrlogik unveraendert wie ShutterSheet.tsx/PvSheet.tsx: Schieber legen
 * einen Entwurf an, gefahren wird erst mit der Taste. In der Dev-Vorschau
 * haelt devWriteGuard das Schreiben auf, es faehrt nichts.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import type { SheetLook } from './sheetLooks';
import './round201.css';

/** Hoehe beider Schieber – eine Zahl fuer Position UND Lamelle. */
const H = 260;
/** Lamelle: schmaler Schieber bzw. Strich mit Knopf, Abstand zur Position */
const SLAT_PILL_W = 30;
const SLAT_TRACK_W = 28;
const GAP = 16;
const LEVEL_WORD = { good: 'Funk gut', normal: 'Funk normal', low: 'Funk schwach' } as const;
const KIND_WORD = { fenster: 'Fenster', dachfenster: 'Dachfenster', raffstore: 'Raffstore' } as const;

interface SliderProps {
    value: number;
    set: (v: number) => void;
    snaps: number[];
    label: string;
    busy: boolean;
    unknown: boolean;
    stale: boolean;
    disabled: boolean;
    width: number;
    chip?: ReactNode;
}

function cls(...c: (string | false)[]) {
    return c.filter(Boolean).join(' ');
}

/** Senkrechter Schieber als Flaeche: Fuellung von oben = Anteil zu. */
function Pill({ value, set, snaps, label, busy, unknown, stale, disabled, width, chip }: SliderProps) {
    const { handlers, isDragging } = useDragValue({ get: () => value, set, snapPoints: snaps, spanPx: H });
    return (
        <div
            className={cls(
                'pvq-pill',
                width < 40 && 'is-narrow',
                isDragging && 'is-drag',
                busy && 'is-busy',
                unknown && 'is-unknown',
                stale && 'is-stale',
                disabled && 'is-disabled',
            )}
            style={{ height: H, width }}
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
            {snaps.slice(1, snaps[snaps.length - 1] === 100 ? -1 : undefined).map((p) => (
                <span key={p} className="pvq-pill-mark" style={{ top: `${p}%` }} />
            ))}
            {chip !== undefined && <span className="pvq-pill-chip">{chip}</span>}
        </div>
    );
}

/** Lamelle als duenner Strich mit rundem Knopf (226). */
function Track({ value, set, snaps, label, busy, unknown, disabled, width }: SliderProps) {
    const { handlers, isDragging } = useDragValue({ get: () => value, set, snapPoints: snaps, spanPx: H - 24 });
    const y = 12 + ((H - 24) * (unknown ? 0 : value)) / 100;
    return (
        <div
            className={cls('pvq-track', isDragging && 'is-drag', busy && 'is-busy', disabled && 'is-disabled')}
            style={{ height: H, width }}
            {...(disabled ? {} : handlers)}
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
        >
            <span className="pvq-track-rail" />
            <span className="pvq-track-fill" style={{ height: y - 12 }} />
            <span className="pvq-track-knob" style={{ transform: `translate(-50%, ${y - 12}px)` }} />
        </div>
    );
}

export function PvSheetSlim({
    device,
    connected,
    look: lookIn,
    fav,
    onClose,
}: {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    look: SheetLook;
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
    const hasSlat = !!device.slatDp;
    // 230: Raffstore bekommen eigene Angaben (wie 227), Fenster die Grundangaben (wie 223).
    const look: SheetLook = hasSlat && lookIn.raff ? { ...lookIn, ...lookIn.raff } : lookIn;
    // Raffstore haben keine Leise-Fahrt; die Feder gibt es nur, wo der
    // Antrieb einen Slow-Datenpunkt hat.
    const canSlow = !!device.slowPosDp && !hasSlat;

    const confirm = () => {
        tapFeedback();
        if (posDraft !== null && device.posDp) {
            const targetRaw = device.invertPosition ? posDraft : 100 - posDraft;
            const dp = slow && canSlow && device.slowPosDp ? device.slowPosDp : device.posDp;
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

    const isFav = fav.has(device.key);
    const stopPtr = {
        onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerUp: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerMove: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    };

    const slatW = look.slat === 'track' ? SLAT_TRACK_W : SLAT_PILL_W;
    const inside = look.value === 'inside';

    const posVal = unknown ? (
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
    );
    const slatVal = slatKnown ? `${Math.round(slatShown)}°` : '–';
    const posShort = unknown
        ? '–'
        : travel && targetClosed !== null
          ? `→ ${Math.round(targetClosed)} %`
          : `${Math.round(shown)} %`;

    // Zeile zwischen Zahl und Schieber: Feder (Fenster mit Leise-Fahrt),
    // „Position"/„Lamelle" (Raffstore) oder leer – immer gleich hoch.
    const featherSlot = canSlow ? (
        <div className={`pvq-slot pvq-slot--${look.feder}`}>
            <button
                type="button"
                className={cls('pvq-feder', slow && 'is-on', busy && 'is-hidden')}
                onClick={() => {
                    tapFeedback();
                    setSlow((v) => !v);
                }}
                disabled={busy}
                aria-pressed={slow}
                aria-label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
                title="Nächste Fahrt leise"
            >
                <Feather size={20} strokeWidth={1.9} />
                {look.feder === 'word' && <span className="pvq-feder-word">leise</span>}
            </button>
        </div>
    ) : (
        <div className="pvq-slot">{hasSlat ? <span className="pvq-cap">Position</span> : null}</div>
    );

    const posCol = (
        <div className="pvq-col" style={{ width: look.posW }}>
            {!inside && (
                <>
                    <div
                        className={cls(
                            'pvq-val',
                            offline && 'is-stale',
                            ctl.estimate && posDraft === null && 'is-estimate',
                            posDraft !== null && 'is-live',
                        )}
                    >
                        {posVal}
                    </div>
                    <div className={cls('pvq-word', ctl.busy && 'is-busy')}>{posWord}</div>
                </>
            )}
            {featherSlot}
            <Pill
                value={vizClosed}
                set={setPosDraft}
                snaps={SNAP_POS}
                label="Position"
                busy={ctl.busy}
                unknown={unknown}
                stale={offline}
                disabled={false}
                width={look.posW}
                chip={inside ? posShort : undefined}
            />
        </div>
    );

    const slatProps: SliderProps = {
        value: slatShown,
        set: setSlatDraft,
        snaps: SNAP_SLAT,
        label: 'Lamellenwinkel',
        busy: slatTravel,
        unknown: !slatKnown,
        stale: false,
        disabled: !connected || !slatKnown,
        width: slatW,
        chip: inside && look.slat === 'pill' ? slatVal : undefined,
    };
    const slatCol = hasSlat && (
        <div
            className="pvq-col pvq-col--slat"
            style={
                look.align === 'pos'
                    ? { width: slatW, position: 'absolute', top: 0, left: look.posW + GAP }
                    : { width: slatW }
            }
        >
            {!inside && (
                <>
                    <div
                        className={cls(
                            'pvq-val pvq-val--slat',
                            slatDraft !== null && 'is-live',
                            slatTravel && 'is-target',
                        )}
                    >
                        {slatVal}
                    </div>
                    <div className="pvq-word" />
                </>
            )}
            <div className="pvq-slot">
                <span className="pvq-cap">Lamelle</span>
            </div>
            {look.slat === 'track' ? <Track {...slatProps} /> : <Pill {...slatProps} />}
            {inside && look.slat === 'track' && <span className="pvq-track-val">{slatVal}</span>}
        </div>
    );

    const groupW = look.align === 'group' && hasSlat ? look.posW + GAP + slatW : look.posW;
    const btnW = look.btn === 'full' ? '100%' : `${look.btn === 'pos' ? look.posW : look.btn}px`;
    const running = busy && !hasDraft;

    return createPortal(
        <div className="pvs-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div
                className={cls('pvs', 'pvq', `is-${device.kind}`, `pvq--fill-${look.fill}`)}
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
                            className={cls('pvq-star', isFav && 'is-on')}
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
                    <div className="pvq-inst" style={{ width: groupW, gap: GAP } as CSSProperties}>
                        {posCol}
                        {slatCol}
                    </div>

                    <div className="pvq-act" style={{ width: btnW }}>
                        {running ? (
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
                                OK
                            </button>
                        )}
                    </div>

                    {!connected && <div className="pvs-notice">TaHoma-Box nicht erreichbar</div>}

                    <div className={cls('pvq-radio', offline && 'is-offline')}>
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
