/**
 * Pop-up „Ziel in dieser Szene" (Szenen-Editor im Facelift). Gleicher Aufbau wie der
 * Feinregler (ShutterDetailSheet), aber der Rollladen fährt NICHT: Das Pop-up setzt nur das
 * Ziel im Entwurf des Szenen-Editors. Darum hier bewusst kein Datenpunkt-Zugriff und kein
 * Schreiben (keine Datenpunkt- und Fahr-Hooks).
 *
 * - Position 0–100 % zu, Schieber rastet wie im Feinregler ein; mit „−" und „+" geht jeder
 *   ganze Wert (zum Beispiel 78 %).
 * - Lamelle (Raffstore) 0–90 Grad, wie im Feinregler und in den Szenen-Daten.
 * - Feder „leise" nur bei Antrieben mit Slow-Datenpunkt und ohne Lamelle.
 * - „Übernehmen" gibt das Ziel an den Editor zurück, „fährt nicht mit" nimmt den Rollladen aus der Szene.
 */
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Feather } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { HapticButton } from '../../shuttershared/HapticButton';
import { SNAP_POS, SNAP_SLAT } from '../../shuttershared/useDragValue';
import { useSheetDismiss } from '../../useSheetDismiss';
import { GAP, Pill, POS_W, SLAT_W, BTN_W_PLAIN, BTN_W_SLAT } from '../ShutterDetailSheet';
import type { PlanDevice } from './planModel';
import type { SceneTargetDraft } from './editorDirty';

const SLAT_MAX = 90;

function cls(...c: (string | false)[]) {
    return c.filter(Boolean).join(' ');
}

const clampInt = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

export function SceneTargetSheet({
    device,
    value,
    onApply,
    onClose,
}: {
    device: PlanDevice;
    value: SceneTargetDraft | null;
    onApply: (v: SceneTargetDraft | null) => void;
    onClose: () => void;
}) {
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { sheetStyle, backdropStyle, scrimClosing, dragHandlers, onBackdropClick, startClose } =
        useSheetDismiss(onClose);

    const canSlow = device.hasSlow && !device.hasSlat;
    const [included, setIncluded] = useState(value !== null);
    const [pos, setPos] = useState(value?.closed ?? Math.round(device.closed ?? 0));
    const [slat, setSlat] = useState(value?.slat ?? 0);
    const [quiet, setQuiet] = useState(value?.quiet === true);

    const build = (inc: boolean, p: number, s: number, q: boolean, keepQuiet: boolean): SceneTargetDraft | null =>
        inc
            ? {
                  closed: p,
                  ...(device.hasSlat ? { slat: s } : {}),
                  ...((canSlow ? q : keepQuiet) ? { quiet: true as const } : {}),
              }
            : null;
    const keepQuiet = value?.quiet === true;
    const result = build(included, pos, slat, quiet, keepQuiet);
    const initial = build(
        value !== null,
        value?.closed ?? Math.round(device.closed ?? 0),
        value?.slat ?? 0,
        value?.quiet === true,
        keepQuiet,
    );
    const changed = JSON.stringify(result) !== JSON.stringify(initial);

    const setPosition = (v: number) => {
        setPos(clampInt(v, 100));
        setIncluded(true);
    };
    const setSlatValue = (v: number) => {
        setSlat(clampInt(v, SLAT_MAX));
        setIncluded(true);
    };

    const apply = () => {
        onApply(result);
        startClose();
    };

    let posWord = '';
    if (!included) posWord = 'fährt nicht mit';
    else if (pos <= 0) posWord = 'ganz offen';
    else if (pos >= 100) posWord = 'ganz geschlossen';

    const step = (label: string, sign: '−' | '+', onPress: () => void, disabled: boolean) => (
        <button type="button" className="sds-step" aria-label={label} disabled={disabled} onClick={onPress}>
            {sign}
        </button>
    );

    const slot = canSlow ? (
        <div className="sds-slot">
            <HapticButton
                key={quiet ? 'feder-on' : 'feder-off'}
                className={cls('sds-feder', quiet && 'is-on', !included && 'is-hidden')}
                disabled={!included}
                onPress={() => setQuiet((v) => !v)}
                title="In dieser Szene leise fahren"
                label={quiet ? 'Leise fahren: ein' : 'Leise fahren: aus'}
            >
                <Feather size={20} strokeWidth={1.9} />
                <span className="sds-feder-word">leise</span>
            </HapticButton>
        </div>
    ) : (
        <div className="sds-slot">{device.hasSlat ? <span className="sds-cap">Position</span> : null}</div>
    );

    const posCol = (
        <div className="sds-col" style={{ width: POS_W }}>
            <div className="sds-valrow">
                {step('1 % weniger', '−', () => setPosition(pos - 1), included && pos <= 0)}
                <div className={cls('sds-val', !included && 'is-stale')}>
                    {included ? (
                        <>
                            {pos}
                            <span className="sds-unit"> % zu</span>
                        </>
                    ) : (
                        '–'
                    )}
                </div>
                {step('1 % mehr', '+', () => setPosition(pos + 1), included && pos >= 100)}
            </div>
            <div className="sds-word">{posWord}</div>
            {slot}
            <Pill
                value={pos}
                set={(v) => setPosition(v)}
                snaps={SNAP_POS}
                label="Position"
                busy={false}
                unknown={false}
                stale={!included}
                disabled={false}
                width={POS_W}
            />
        </div>
    );

    const slatCol = device.hasSlat && (
        <div className="sds-col sds-col--slat" style={{ width: SLAT_W }}>
            <div className={cls('sds-val sds-val--slat', !included && 'is-stale')}>{included ? `${slat}°` : '–'}</div>
            <div className="sds-word">
                <span className="sds-cap">Lamelle</span>
            </div>
            <div className="sds-slot sds-slot--steps">
                {step('1 % weniger', '−', () => setSlatValue(slat - 1), included && slat <= 0)}
                {step('1 % mehr', '+', () => setSlatValue(slat + 1), included && slat >= SLAT_MAX)}
            </div>
            <Pill
                value={slat}
                set={(v) => setSlatValue(v)}
                snaps={SNAP_SLAT}
                label="Lamellenwinkel"
                busy={false}
                unknown={false}
                stale={!included}
                disabled={false}
                width={SLAT_W}
            />
        </div>
    );

    const groupW = device.hasSlat ? POS_W + GAP + SLAT_W : POS_W;
    const btnW = device.hasSlat ? BTN_W_SLAT : BTN_W_PLAIN;

    return createPortal(
        <div
            className="sds-backdrop aura-scrim"
            data-scrim-closing={scrimClosing}
            style={backdropStyle}
            onClick={onBackdropClick}
        >
            <div
                className={cls('sds', `is-${device.kind}`)}
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                aria-label={`${device.label}, Ziel in dieser Szene`}
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
                            <div className="sds-sub">{`${device.floor} · Ziel in dieser Szene`}</div>
                        </div>
                    </div>
                </div>

                <div className="sds-body">
                    <div className="sds-inst" style={{ width: groupW, gap: GAP } as CSSProperties}>
                        {posCol}
                        {slatCol}
                    </div>

                    <div className="sds-act" style={{ width: btnW }}>
                        <HapticButton className="sds-go" disabled={!changed} onPress={apply} label="Übernehmen">
                            Übernehmen
                        </HapticButton>
                    </div>

                    <div className="sds-slot">
                        <HapticButton
                            key={included ? 'skip-off' : 'skip-on'}
                            className={cls('sds-feder', !included && 'is-on')}
                            onPress={() => setIncluded((v) => !v)}
                            title="Fährt bei dieser Szene nicht mit"
                            label={included ? 'Fährt nicht mit: aus' : 'Fährt nicht mit: ein'}
                        >
                            <Ban size={20} strokeWidth={1.9} />
                            <span className="sds-feder-word">fährt nicht mit</span>
                        </HapticButton>
                    </div>
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
