/**
 * Feinregler „schlicht" (Runde 201+, 02.11.2026), nur Dev-Vorschau.
 *
 * Saschas Vorgaben zu PvSheet (zu voll): so schlicht wie das Original
 * ShutterSheet.tsx, aber im Look von Entwurf 35.
 * - keine Schnellwerte (Offen/25/50/75/Zu) und keine Lamellen-Knoepfe,
 *   nur die Schieber
 * - Raffstore: Position und Lamelle gleich hoch und auf einer Linie
 * - kein „Verwerfen": Schliessen (wischen, daneben tippen, Escape) verwirft
 * - Stern fuer Favoriten oben rechts im Kopf
 * - Taste schlicht „OK" (waehrend der Fahrt „Stopp")
 *
 * Aussehen kommt aus einer SheetLook-Angabe (sheetLooks.ts): Breiten, wo die
 * Zahl steht, wie Feder und OK zusammenspielen, Fuellfarbe.
 *
 * Feste Spaltenbreiten wie im Original: Eine Spalte ist so breit wie ihr
 * Schieber, nie so breit wie ihre Beschriftung. Sonst springt beim Raffstore
 * der Abstand, sobald „halb offen" → „waagerecht" → „geschlossen" wechselt
 * (Original 27.08.2026, hier erneut 02.11.2026).
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
import { BLOCK_W, type SheetLook } from './sheetLooks';
import './round201.css';

/** Hoehe beider Schieber – eine Zahl fuer Position UND Lamelle. */
const H = 260;
const LEVEL_WORD = { good: 'Funk gut', normal: 'Funk normal', low: 'Funk schwach' } as const;
const KIND_WORD = { fenster: 'Fenster', dachfenster: 'Dachfenster', raffstore: 'Raffstore' } as const;

/** Spaltenbreiten je Look. Bei 'equal' ist die Summe immer BLOCK_W. */
function widths(look: SheetLook, hasSlat: boolean): { pos: number; slat: number; gap: number; block: number } {
    if (look.block === 'classic') return { pos: 112, slat: 64, gap: 32, block: 112 };
    if (!hasSlat) return { pos: BLOCK_W, slat: 0, gap: 0, block: BLOCK_W };
    const gap = 12;
    if (look.split === '11') {
        const w = (BLOCK_W - gap) / 2;
        return { pos: w, slat: w, gap, block: BLOCK_W };
    }
    const slat = 48;
    return { pos: BLOCK_W - gap - slat, slat, gap, block: BLOCK_W };
}

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
    width,
    chip,
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
    width: number;
    chip?: ReactNode;
}) {
    const { handlers, isDragging } = useDragValue({ get: () => value, set, snapPoints: snaps, spanPx: H });
    const cls = [
        'pvq-pill',
        `pvq-pill--${kind}`,
        width < 60 ? 'is-narrow' : '',
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
            {marks.map((p) => (
                <span key={p} className="pvq-pill-mark" style={{ top: `${p}%` }} />
            ))}
            {chip !== undefined && <span className="pvq-pill-chip">{chip}</span>}
        </div>
    );
}

export function PvSheetSlim({
    device,
    connected,
    look,
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
    const canSlow = !!device.slowPosDp;

    const confirm = (leise: boolean) => {
        tapFeedback();
        if (posDraft !== null && device.posDp) {
            const targetRaw = device.invertPosition ? posDraft : 100 - posDraft;
            const dp = leise && device.slowPosDp ? device.slowPosDp : device.posDp;
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
    const toggleSlow = () => {
        tapFeedback();
        setSlow((v) => !v);
    };

    let posWord = '';
    if (travel)
        posWord =
            targetClosed !== null && startClosed !== null && targetClosed > startClosed ? 'fährt zu' : 'fährt auf';
    else if (ctl.busy && posDraft === null) posWord = 'fährt';
    else if (unknown) posWord = 'unbekannt';
    else if (ctl.estimate && posDraft === null) posWord = 'nicht bestätigt';
    // In den Block-Fassungen mit Spalten nur Woerter, die mehr sagen als die
    // Zahl: „ganz geschlossen" neben dem Lamellen-Wort lief sonst ineinander.
    else if (look.block === 'equal' && look.labels !== 'hero') posWord = '';
    else if (shown <= 3) posWord = 'ganz offen';
    else if (shown >= 97) posWord = 'ganz geschlossen';

    let slatWord = '';
    if (slatTravel) slatWord = 'dreht';
    else if (!slatKnown) slatWord = 'unbekannt';
    else if (slatShown <= 5) slatWord = 'waagerecht';
    else if (slatShown >= 88) slatWord = 'geschlossen';
    else slatWord = 'halb offen';

    const isFav = fav.has(device.key);
    const stopPtr = {
        onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerUp: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        onPointerMove: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    };

    const w = widths(look, hasSlat);
    const eq = look.block === 'equal';
    const btnW = look.btn === 'full' ? '100%' : `${look.btn === 'pill' ? w.pos : w.block}px`;

    // ── Werte ───────────────────────────────────────────────────────────
    const posValCls = `pvq-val${offline ? ' is-stale' : ''}${ctl.estimate && posDraft === null ? ' is-estimate' : ''}${posDraft !== null ? ' is-live' : ''}`;
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
    const slatValCls = `pvq-val${slatDraft !== null ? ' is-live' : ''}${slatTravel ? ' is-target' : ''}`;
    const slatVal = slatKnown ? `${Math.round(slatShown)}°` : '–';
    // Kurzform fuer die Zahl im Schieber
    const posShort = unknown
        ? '–'
        : travel && targetClosed !== null
          ? `→ ${Math.round(targetClosed)} %`
          : `${Math.round(shown)} %`;

    // ── Schieber-Spalten ────────────────────────────────────────────────
    const pill = (k: 'pos' | 'slat') =>
        k === 'pos' ? (
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
                width={w.pos}
                chip={look.labels === 'inside' ? posShort : undefined}
            />
        ) : (
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
                width={w.slat}
                chip={look.labels === 'inside' ? slatVal : undefined}
            />
        );

    const column = (k: 'pos' | 'slat') => {
        const width = k === 'pos' ? w.pos : w.slat;
        const cap = k === 'pos' ? 'Position' : 'Lamelle';
        const val = <div className={k === 'pos' ? posValCls : slatValCls}>{k === 'pos' ? posVal : slatVal}</div>;
        const word = (
            <div className={`pvq-word${(k === 'pos' ? ctl.busy : slatTravel) ? ' is-busy' : ''}`}>
                {k === 'pos' ? posWord : slatWord}
            </div>
        );
        let inner: ReactNode;
        if (look.labels === 'cols')
            inner = (
                <>
                    <div className="pvq-cap">{cap}</div>
                    {val}
                    {word}
                    {pill(k)}
                </>
            );
        else if (look.labels === 'hero')
            inner = (
                <>
                    {pill(k)}
                    {/* Beim Fenster leer, aber gleich hoch: Taste steht wie beim Raffstore */}
                    <div className="pvq-cap pvq-cap--below">{hasSlat ? cap : ''}</div>
                </>
            );
        else if (look.labels === 'inside')
            inner = (
                <>
                    {pill(k)}
                    <div className="pvq-cap pvq-cap--below">{cap}</div>
                    {word}
                </>
            );
        else
            inner = (
                <>
                    {pill(k)}
                    {val}
                    {word}
                </>
            );
        return (
            <div key={k} className="pvq-col" style={{ width }}>
                {inner}
            </div>
        );
    };

    const hero = look.labels === 'hero' && (
        <div className="pvq-hero">
            <div className="pvq-hero-val">
                <span className={posValCls}>{posVal}</span>
                {hasSlat && (
                    <>
                        <span className="pvq-hero-sep">·</span>
                        <span className={slatValCls}>{slatVal}</span>
                    </>
                )}
            </div>
            <div className={`pvq-word${busy ? ' is-busy' : ''}`}>
                {hasSlat ? [posWord, slatWord && `Lamelle ${slatWord}`].filter(Boolean).join(' · ') : posWord}
            </div>
        </div>
    );

    // ── Taste ───────────────────────────────────────────────────────────
    const disabled = !connected || !hasDraft;
    const stopBtn = (
        <button type="button" className="pvq-go pvq-go--stop" onClick={stop} disabled={!connected}>
            <Square size={17} fill="currentColor" /> Stopp
        </button>
    );
    const okBtn = (
        <button type="button" className="pvq-go" onClick={() => confirm(slow)} disabled={disabled}>
            OK
        </button>
    );
    const featherSeg = (
        <button
            type="button"
            className={`pvq-seg-feder${slow ? ' is-on' : ''}`}
            onClick={toggleSlow}
            aria-pressed={slow}
            aria-label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
            title="Nächste Fahrt leise"
        >
            <Feather size={18} />
        </button>
    );

    // Waehrend der Fahrt ersetzt „Stopp" die Taste in derselben Breite; die
    // Zeile darunter (Hinweis, Leise-Zeile, Chip) bleibt stehen, damit das
    // Fenster nicht in der Hoehe springt.
    const running = busy && !hasDraft;
    const mainBtn = running ? stopBtn : okBtn;
    // Hinweiszeile je Look, nicht je Antrieb: gleiche Hoehe fuer Fenster und Raffstore.
    const hint = look.action === 'side' || look.action === 'split' || look.action === 'inline';
    let action: ReactNode;
    if (running && (look.action === 'split' || look.action === 'inline' || look.action === 'two')) {
        action = (
            <div className="pvq-act" style={{ width: btnW }}>
                {stopBtn}
            </div>
        );
    } else if (look.action === 'side') {
        const featherBtn =
            canSlow && !busy ? (
                <button
                    type="button"
                    className={`pvq-feder${slow ? ' is-on' : ''}`}
                    onClick={toggleSlow}
                    aria-pressed={slow}
                    aria-label={slow ? 'Leise fahren: ein' : 'Leise fahren: aus'}
                    title="Nächste Fahrt leise"
                >
                    <Feather size={19} />
                </button>
            ) : (
                <span />
            );
        action = (
            <div
                className="pvq-confirm"
                style={{ '--pvq-side': canSlow ? '50px' : '0px', '--pvq-btn': btnW } as CSSProperties}
            >
                {look.feder === 'left' ? featherBtn : <span />}
                {mainBtn}
                {look.feder === 'right' ? featherBtn : <span />}
            </div>
        );
    } else if (look.action === 'split' || look.action === 'inline') {
        action = (
            <div
                className={`pvq-act pvq-caps pvq-caps--${look.action}${disabled ? ' is-idle' : ''}`}
                style={{ width: btnW }}
            >
                {look.action === 'inline' && canSlow && featherSeg}
                {okBtn}
                {look.action === 'split' && canSlow && featherSeg}
            </div>
        );
    } else if (look.action === 'two') {
        action = (
            <div className={`pvq-act pvq-caps pvq-caps--two${disabled ? ' is-idle' : ''}`} style={{ width: btnW }}>
                {okBtn}
                {canSlow && (
                    <button
                        type="button"
                        className="pvq-go pvq-go--leise"
                        onClick={() => confirm(true)}
                        disabled={disabled}
                    >
                        <Feather size={16} /> Leise
                    </button>
                )}
            </div>
        );
    } else if (look.action === 'row') {
        action = (
            <div className="pvq-act pvq-act--stack" style={{ width: btnW }}>
                {/* Auch ohne Leise-Fahrt sichtbar (ausgegraut), damit OK bei
                    Fenster und Raffstore an derselben Stelle steht. */}
                {
                    <button
                        type="button"
                        className="pvq-row"
                        onClick={toggleSlow}
                        aria-pressed={slow}
                        disabled={running || !canSlow}
                        title={canSlow ? undefined : 'Dieser Antrieb kann nicht leise fahren'}
                    >
                        <span className="pvq-row-ico">
                            <Feather size={15} />
                        </span>
                        <span className="pvq-row-label">Leise fahren</span>
                        <span className={`pvq-switch${slow ? ' is-on' : ''}`} aria-hidden="true" />
                    </button>
                }
                {mainBtn}
            </div>
        );
    } else {
        action = (
            <div className="pvq-act pvq-act--stack" style={{ width: btnW }}>
                {
                    <button
                        type="button"
                        className={`pvq-chip${slow ? ' is-on' : ''}`}
                        onClick={toggleSlow}
                        aria-pressed={slow}
                        disabled={running || !canSlow}
                        title={canSlow ? undefined : 'Dieser Antrieb kann nicht leise fahren'}
                    >
                        <Feather size={14} /> Leise
                    </button>
                }
                {mainBtn}
            </div>
        );
    }

    const instruments = (
        <div className="pvq-instruments" style={{ gap: w.gap }}>
            {column('pos')}
            {hasSlat && column('slat')}
        </div>
    );

    const lookCls = [
        'pvs',
        'pvq',
        `is-${device.kind}`,
        `pvq--${look.key}`,
        `pvq--fill-${look.fill}`,
        `pvq--labels-${look.labels}`,
        eq ? 'pvq--equal' : '',
        look.card ? 'pvq--card' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return createPortal(
        <div className="pvs-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div
                className={lookCls}
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
                    <div className="pvq-stage">
                        {hero}
                        {instruments}
                        {action}
                        {hint && (
                            <div className={`pvq-hint${slow ? ' is-on' : ''}`}>{slow ? 'nächste Fahrt leise' : ''}</div>
                        )}
                    </div>

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
