import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useT } from '../../../i18n';
import type { WidgetConfig } from '../../../types';

interface Props {
    widget: WidgetConfig;
}

function ShutterViz({ closedFrac, isMoving }: { closedFrac: number; isMoving: boolean }) {
    const accent = isMoving
        ? 'var(--accent-yellow, #f59e0b)'
        : closedFrac < 1
          ? 'var(--accent)'
          : 'var(--text-secondary)';
    return (
        <div
            style={{
                width: 120,
                height: 140,
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                borderRadius: 8,
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${closedFrac * 100}%`,
                    transition: 'height 0.4s ease',
                    backgroundImage:
                        'repeating-linear-gradient(to bottom, transparent 0px, transparent 8px, color-mix(in srgb, var(--text-secondary) 30%, transparent) 8px, color-mix(in srgb, var(--text-secondary) 30%, transparent) 10px)',
                }}
            />
            {closedFrac > 0.02 && closedFrac < 0.98 && (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${closedFrac * 100}%`,
                        height: 2,
                        background: accent,
                        transition: 'top 0.4s ease',
                        boxShadow: `0 0 4px ${accent}88`,
                    }}
                />
            )}
            {isMoving && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: accent }} />
                </div>
            )}
        </div>
    );
}

export function ShutterPopupBody({ widget }: Props) {
    const opts = widget.options ?? {};
    const { state, setValue } = useDatapoint(widget.datapoint);
    const { value: activityVal } = useDatapoint((opts.activityDp as string) ?? '');
    const { state: slatState, setValue: setSlatValue } = useDatapoint((opts.slatDp as string) ?? '');
    const { value: connectionVal } = useDatapoint((opts.connectionDp as string) ?? '');
    const { setState } = useIoBroker();
    const t = useT();

    const isConnected = connectionVal !== false; // Default to true if no connectionDp set

    // ──────────────────────────────────────────────────────────────────────────
    // Aufgabe 1: Only use ack:true values for position display
    // ──────────────────────────────────────────────────────────────────────────
    const [ackedPos, setAckedPos] = useState<number | null>(null);
    useEffect(() => {
        if (state?.ack === true && typeof state.val === 'number') {
            setAckedPos(Math.round(state.val));
        }
    }, [state?.val, state?.ack]);

    const [ackedSlatPos, setAckedSlatPos] = useState<number | null>(null);
    useEffect(() => {
        if (slatState?.ack === true && typeof slatState.val === 'number') {
            setAckedSlatPos(Math.round(slatState.val));
        }
    }, [slatState?.val, slatState?.ack]);

    const rawPos = ackedPos ?? 0;
    const pos = (opts.invertPosition as boolean) ? 100 - rawPos : rawPos;
    const closedFrac = Math.max(0, Math.min(1, (100 - pos) / 100));
    const showClosedPercent = !!(opts.showClosedPercent as boolean);
    const isMoving = activityVal === true || activityVal === 1 || activityVal === '1' || activityVal === 'true';

    const slatPos = ackedSlatPos ?? 0;
    const hasSlatDp = typeof opts.slatDp === 'string' && opts.slatDp.length > 0;

    const [sliderDraft, setSliderDraft] = useState<number | null>(null);
    const [slatDraft, setSlatDraft] = useState<number | null>(null);
    const display = sliderDraft ?? pos;
    const slatDisplay = slatDraft ?? slatPos;

    const writePos = (p: number) => {
        const raw = (opts.invertPosition as boolean) ? 100 - p : p;
        setValue(raw);
        setSliderDraft(null);
    };

    const writeSlatPos = (p: number) => {
        setSlatValue(p);
        setSlatDraft(null);
    };

    const stop = () => {
        const stopDp = opts.stopDp as string | undefined;
        if (stopDp) setState(stopDp, true);
        else setState(widget.datapoint, rawPos);
    };

    const btnStyle: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="flex flex-col items-center gap-6 py-6 px-4">
            <div className="flex items-center gap-8">
                {/* Visualization */}
                <ShutterViz closedFrac={closedFrac} isMoving={isMoving} />

                {/* Vertical control column */}
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={() => writePos(100)}
                        disabled={!isConnected}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={{ ...btnStyle, opacity: isConnected ? 1 : 0.5, cursor: isConnected ? 'pointer' : 'not-allowed' }}
                    >
                        <ChevronUp size={22} />
                    </button>
                    <button
                        onClick={stop}
                        disabled={!isConnected}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={{ ...btnStyle, opacity: isConnected ? 1 : 0.5, cursor: isConnected ? 'pointer' : 'not-allowed' }}
                    >
                        <Square size={18} />
                    </button>
                    <button
                        onClick={() => writePos(0)}
                        disabled={!isConnected}
                        className="w-12 h-12 flex items-center justify-center rounded-xl hover:opacity-80 transition-opacity"
                        style={{ ...btnStyle, opacity: isConnected ? 1 : 0.5, cursor: isConnected ? 'pointer' : 'not-allowed' }}
                    >
                        <ChevronDown size={22} />
                    </button>
                </div>
            </div>

            {/* Connection status warning */}
            {!isConnected && (
                <div
                    className="text-xs text-center px-4 py-2"
                    style={{
                        color: 'var(--accent-red, #ef4444)',
                        background: 'var(--accent-red, #ef4444)11',
                        borderRadius: '8px',
                    }}
                >
                    {t('shutter.notConnected')}
                </div>
            )}

            {/* Position display + slider */}
            <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Position</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {showClosedPercent ? 100 - display : display}%
                    </span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={display}
                    onChange={(e) => setSliderDraft(Number(e.target.value))}
                    onMouseUp={() => {
                        if (sliderDraft !== null) writePos(sliderDraft);
                    }}
                    onTouchEnd={() => {
                        if (sliderDraft !== null) writePos(sliderDraft);
                    }}
                    disabled={!isConnected}
                    style={{
                        accentColor: 'var(--accent)',
                        width: '100%',
                        opacity: isConnected ? 1 : 0.5,
                        cursor: isConnected ? 'pointer' : 'not-allowed',
                    }}
                    className="h-2 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>Zu</span>
                    <span>Offen</span>
                </div>
            </div>

            {/* Quick positions */}
            <div className="flex gap-2">
                {[0, 25, 50, 75, 100].map((p) => (
                    <button
                        key={p}
                        onClick={() => writePos(p)}
                        disabled={!isConnected}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                        style={{
                            background: Math.abs(display - p) < 3 ? 'var(--accent)' : 'var(--app-bg)',
                            color: Math.abs(display - p) < 3 ? '#fff' : 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                            opacity: isConnected ? 1 : 0.5,
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                        }}
                    >
                        {p}%
                    </button>
                ))}
            </div>

            {/* Slate orientation (lamella angle) */}
            {hasSlatDp && (
                <div className="w-full max-w-xs space-y-2 pt-4 border-t border-var(--app-border)" style={{ borderTopColor: 'var(--app-border)' }}>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--text-secondary)' }}>Lamellenwinkel</span>
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                            {slatDisplay}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={slatDisplay}
                        onChange={(e) => setSlatDraft(Number(e.target.value))}
                        onMouseUp={() => {
                            if (slatDraft !== null) writeSlatPos(slatDraft);
                        }}
                        onTouchEnd={() => {
                            if (slatDraft !== null) writeSlatPos(slatDraft);
                        }}
                        disabled={!isConnected}
                        style={{
                            accentColor: 'var(--accent)',
                            width: '100%',
                            opacity: isConnected ? 1 : 0.5,
                            cursor: isConnected ? 'pointer' : 'not-allowed',
                        }}
                        className="h-2 rounded-lg appearance-none"
                    />
                    <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        <span>Waagerecht</span>
                        <span>Geschlossen</span>
                    </div>

                    {/* Quick slat angles */}
                    <div className="flex gap-2 pt-1">
                        {[0, 50, 90].map((angle) => {
                            const label = angle === 0 ? 'Waagerecht (0)' : angle === 50 ? 'Halb (50)' : 'Geschlossen (90)';
                            return (
                                <button
                                    key={angle}
                                    onClick={() => writeSlatPos(angle)}
                                    disabled={!isConnected}
                                    className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity flex-1"
                                    style={{
                                        background: Math.abs(slatDisplay - angle) < 3 ? 'var(--accent)' : 'var(--app-bg)',
                                        color: Math.abs(slatDisplay - angle) < 3 ? '#fff' : 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                        opacity: isConnected ? 1 : 0.5,
                                        cursor: isConnected ? 'pointer' : 'not-allowed',
                                    }}
                                    title={label}
                                >
                                    {angle}%
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
