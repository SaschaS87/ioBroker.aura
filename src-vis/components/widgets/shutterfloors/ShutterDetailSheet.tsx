/**
 * Feinregler eines Rollladens (Feature 27, Fassung 230, Saschas Wahl vom
 * 03.11.2026). Ersetzt das fruehere ShutterSheet.
 *
 * - nur Schieber, keine Schnellwerte, kein „Verwerfen" (Schliessen verwirft)
 * - Stern fuer Favoriten oben rechts im Kopf (nur wenn es den
 *   Favoriten-Datenpunkt gibt)
 * - Taste schlicht „OK" (waehrend der Fahrt „Stopp")
 * - Fenster: Position mittig, Feder „leise" zwischen Zahl und Schieber (nur
 *   mit Slow-Datenpunkt), Taste so breit wie der Schieber
 * - Raffstore: keine Leise-Fahrt; Position und Lamelle gemeinsam mittig auf
 *   einer Linie, feste Spaltenbreiten, damit der Abstand nicht springt, wenn
 *   das Wort wechselt; Taste 200 px
 *
 * Fahrlogik unveraendert wie im frueheren ShutterSheet: Schieber legen einen
 * Entwurf an, gefahren wird erst mit der Taste.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Feather, Square, Star } from 'lucide-react';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useT } from '../../../i18n';
import type { TranslationKey } from '../../../i18n';
import { useShutterDevice, usePendingStore, slatPendingKey } from '../shuttershared/useShutterDevice';
import { HapticButton } from '../shuttershared/HapticButton';
import { tapFeedback } from '../shuttershared/haptics';
import { useSheetDismiss } from '../useSheetDismiss';
import { useDragValue, SNAP_POS, SNAP_SLAT } from '../shuttershared/useDragValue';
import { radioDpsFromPosDp, radioLevel, isRadioOffline, RADIO_COLOR, clockTime } from '../shuttershared/tahomaRadio';
import { useShutterControl } from './useShutterControl';
import type { Favorites } from './useFavorites';
import type { ShutterFloorDeviceDef } from './types';
import './ShutterDetailSheet.css';

/** Hoehe beider Schieber – eine Zahl fuer Position UND Lamelle. */
const H = 260;
/** Breite des Positions-Schiebers */
const POS_W = 140;
/** Breite der schmalen Lamelle (Raffstore) und Abstand zur Position */
const SLAT_W = 30;
const GAP = 16;
/** Breite der OK-Taste: Fenster wie der Schieber, Raffstore 200 px */
const BTN_W_PLAIN = 140;
const BTN_W_SLAT = 200;
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
}

function cls(...c: (string | false)[]) {
    return c.filter(Boolean).join(' ');
}

/** Senkrechter Schieber als Flaeche: Fuellung von oben = Anteil zu. */
function Pill({ value, set, snaps, label, busy, unknown, stale, disabled, width }: SliderProps) {
    const { handlers, isDragging } = useDragValue({ get: () => value, set, snapPoints: snaps, spanPx: H });
    return (
        <div
            className={cls(
                'sds-pill',
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
            <div className="sds-pill-fill" style={{ height: `${unknown ? 0 : value}%` }} />
            {snaps.slice(1, snaps[snaps.length - 1] === 100 ? -1 : undefined).map((p) => (
                <span key={p} className="sds-pill-mark" style={{ top: `${p}%` }} />
            ))}
        </div>
    );
}

export function ShutterDetailSheet({
    device,
    connected,
    fav,
    onClose,
}: {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    fav: Favorites;
    onClose: () => void;
}) {
    // Portal statt Inline-Rendering (01.09.2026, Rollläden-Umbau): Das Widget
    // ist seit dem Wegfall von fillTab ein normales react-grid-layout-Kind.
    // react-grid-layout setzt per Default useCSSTransforms=true und damit ein
    // `transform` auf den Vorfahren – das macht ihn zum Containing Block fuer
    // `position: fixed`, der Backdrop wuerde dann nur die Kachel abdecken statt
    // den Bildschirm. Portal nach dem Frontend-Root umgeht das, exakt wie beim
    // Raumklima-Sheet (RoomClimateSheet.tsx).
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { setState } = useIoBroker();
    const t = useT();
    const state = useShutterDevice(device);
    const ctl = useShutterControl(device);
    const { markPending } = usePendingStore();
    const [posDraft, setPosDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    // Feder "leise fahren" (21.09.2026): scharf fuer genau die naechste OK-Fahrt,
    // danach faellt sie von selbst zurueck – siehe confirm/stop.
    const [slow, setSlow] = useState(false);

    // Funkzeile (Feature 16, 02.09.2026). Absolute Uhrzeit, Abo genuegt –
    // bewusst KEIN 10-s-Takt wie in RoomClimateDetails, dessen Fusszeile eine
    // RELATIVE Zeit ("vor 5 Minuten") zeigt. Kein Hinweisbalken fuer den
    // Funkausfall – ausdrueckliche Vorgabe Saschas vom 02.09.2026.
    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: rs } = useDatapoint(radioDps?.statusDp ?? '');
    const { state: rr } = useDatapoint(radioDps?.rssiDp ?? '');
    const { state: rd } = useDatapoint(radioDps?.discreteDp ?? '');
    const offline = isRadioOffline(rs?.val);
    const level = radioLevel(rd?.val);
    const rssi = typeof rr?.val === 'number' ? rr.val : null;
    const checkedTs = rs?.ts ?? 0;
    const sinceTs = rs?.lc ?? 0;

    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    const closedNow = ctl.closed ?? 0;
    const shown = posDraft ?? closedNow;
    const travel = ctl.busy && posDraft === null && state.targetOpen !== null && state.startOpen !== null;
    const targetClosed = state.targetOpen !== null ? 100 - state.targetOpen : null;
    const startClosed = state.startOpen !== null ? 100 - state.startOpen : null;
    const vizClosed = posDraft ?? (travel && targetClosed !== null ? targetClosed : closedNow);
    const unknown = ctl.unknown && posDraft === null;

    // Lamelle: waehrend ihres Auftrags zeigt sie das Ziel.
    const slatTravel = state.isSlatActing && slatDraft === null && state.slatTarget !== null;
    const slatShown = slatDraft ?? (slatTravel ? (state.slatTarget as number) : (state.slatShownPos ?? 0));
    const slatKnown = !state.isSlatUnknown || slatDraft !== null || slatTravel;
    const hasDraft = posDraft !== null || slatDraft !== null;
    const busy = ctl.busy || state.isSlatActing;
    const hasSlat = !!device.slatDp;
    // Raffstore haben keine Leise-Fahrt; die Feder gibt es nur, wo der
    // Antrieb einen Slow-Datenpunkt hat.
    const canSlow = !!device.slowPosDp && !hasSlat;

    const confirm = () => {
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

    const posVal = unknown ? (
        '–'
    ) : travel && startClosed !== null && targetClosed !== null ? (
        <>
            {Math.round(startClosed)}
            <span className="sds-arrow">→</span>
            <span className="sds-target">{Math.round(targetClosed)} %</span>
        </>
    ) : (
        <>
            {Math.round(shown)}
            <span className="sds-unit"> % zu</span>
        </>
    );
    const slatVal = slatKnown ? `${Math.round(slatShown)}°` : '–';

    // Zeile zwischen Zahl und Schieber: Feder (Fenster mit Leise-Fahrt),
    // „Position"/„Lamelle" (Raffstore) oder leer – immer gleich hoch.
    // HapticButton (Haptik Vorgabe B): bei der Feder wechselt der key mit dem
    // Zustand, damit der unsichtbare Schalter dahinter immer neu startet.
    const featherSlot = canSlow ? (
        <div className="sds-slot">
            <HapticButton
                key={slow ? 'slow-on' : 'slow-off'}
                className={cls('sds-feder', slow && 'is-on', busy && 'is-hidden')}
                disabled={busy}
                onPress={() => setSlow((v) => !v)}
                title="Nächste Fahrt leise"
                label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
            >
                <Feather size={20} strokeWidth={1.9} />
                <span className="sds-feder-word">leise</span>
            </HapticButton>
        </div>
    ) : (
        <div className="sds-slot">{hasSlat ? <span className="sds-cap">Position</span> : null}</div>
    );

    const posCol = (
        <div className="sds-col" style={{ width: POS_W }}>
            <div
                className={cls(
                    'sds-val',
                    offline && 'is-stale',
                    ctl.estimate && posDraft === null && 'is-estimate',
                    posDraft !== null && 'is-live',
                )}
            >
                {posVal}
            </div>
            <div className={cls('sds-word', ctl.busy && 'is-busy')}>{posWord}</div>
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
                width={POS_W}
            />
        </div>
    );

    const slatCol = hasSlat && (
        <div className="sds-col sds-col--slat" style={{ width: SLAT_W }}>
            <div className={cls('sds-val sds-val--slat', slatDraft !== null && 'is-live', slatTravel && 'is-target')}>
                {slatVal}
            </div>
            <div className="sds-word" />
            <div className="sds-slot">
                <span className="sds-cap">Lamelle</span>
            </div>
            <Pill
                value={slatShown}
                set={setSlatDraft}
                snaps={SNAP_SLAT}
                label="Lamellenwinkel"
                busy={slatTravel}
                unknown={!slatKnown}
                stale={false}
                disabled={!connected || !slatKnown}
                width={SLAT_W}
            />
        </div>
    );

    const groupW = hasSlat ? POS_W + GAP + SLAT_W : POS_W;
    const btnW = hasSlat ? BTN_W_SLAT : BTN_W_PLAIN;
    // Ziehen waehrend einer Fahrt zeigt „OK" statt „Stopp": ein Entwurf geht vor.
    const running = busy && !hasDraft;

    return createPortal(
        <div className="sds-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div
                className={cls('sds', `is-${device.kind}`)}
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                aria-label={device.label}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="sds-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="sds-grip" />
                    <div className="sds-head">
                        <div className="sds-head-text">
                            <div className="sds-title">{device.label}</div>
                            <div className="sds-sub">{device.room || KIND_WORD[device.kind]}</div>
                        </div>
                        {fav.available && (
                            <button
                                type="button"
                                className={cls('sds-star', isFav && 'is-on')}
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
                        )}
                    </div>
                </div>

                <div className="sds-body">
                    <div className="sds-inst" style={{ width: groupW, gap: GAP } as CSSProperties}>
                        {posCol}
                        {slatCol}
                    </div>

                    <div className="sds-act" style={{ width: btnW }}>
                        {running ? (
                            <HapticButton
                                className="sds-go sds-go--stop"
                                disabled={!connected}
                                onPress={stop}
                                label="Stopp"
                            >
                                <Square size={17} fill="currentColor" /> Stopp
                            </HapticButton>
                        ) : (
                            <HapticButton
                                className="sds-go"
                                disabled={!connected || !hasDraft}
                                onPress={confirm}
                                label="OK"
                            >
                                OK
                            </HapticButton>
                        )}
                    </div>

                    {!connected && <div className="sds-notice">TaHoma-Box nicht erreichbar</div>}

                    <div className={cls('sds-radio', offline && 'is-offline')}>
                        {offline ? (
                            <>
                                {t('shuttersheet.radio.offline')}
                                {sinceTs > 0 && ` · ${t('shuttersheet.radio.since', { time: clockTime(sinceTs) })}`}
                            </>
                        ) : (
                            <>
                                {level && (
                                    <span style={{ color: RADIO_COLOR[level] }}>
                                        {t(`shuttersheet.radio.${level}` as TranslationKey)}
                                    </span>
                                )}
                                {rssi !== null && ` (${rssi})`}
                                {checkedTs > 0 &&
                                    ` · ${t('shuttersheet.radio.checked', { time: clockTime(checkedTs) })}`}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
