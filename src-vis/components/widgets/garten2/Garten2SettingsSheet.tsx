/**
 * Einstellungen-Sheet des Garten2-Steuerpults — bisher nur die Regensperre.
 *
 * Portal-Muster wie ShutterSheet.tsx (Rollläden): Rendert ausserhalb des
 * react-grid-layout-Baums nach `[data-aura-app="frontend"]`, sonst würde ein
 * `transform` auf einem Vorfahren `position: fixed` auf die Kachel
 * einschränken. `useSheetDismiss` liefert Wisch-nach-unten/Backdrop/Escape.
 *
 * Die Regensperre (`native.thresholdRain`) ist KEIN normaler State, sondern
 * ein Feld der Adapter-Instanz-Konfiguration — geschrieben über
 * `extendObjectDirect('system.adapter.<instance>', { native: {...} })`.
 * Sascha's Vorgabe vom 22.09.2026: **immer** eine Bestätigung vor dem
 * Schreiben ("Das startet die Bewässerungssteuerung neu"), UND gesperrt,
 * solange irgendein Kreis `valveOn === true` ist — kein stilles Schreiben.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus } from 'lucide-react';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { extendObjectDirect, getObjectDirect } from '../../../hooks/useIoBroker';
import { ConfirmOverlay } from '../ConfirmOverlay';
import { useSheetDismiss } from '../useSheetDismiss';
import './Garten2Widget.css';

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 20;
const STEP = 0.1;

function clampThreshold(n: number): number {
    if (!Number.isFinite(n)) return 0;
    const rounded = Math.round(n * 10) / 10;
    if (rounded < MIN_THRESHOLD) return MIN_THRESHOLD;
    if (rounded > MAX_THRESHOLD) return MAX_THRESHOLD;
    return rounded;
}

interface Props {
    instance: string;
    /** Läuft gerade irgendein Kreis (`valveOn === true`)? Dann bleibt der
     *  Stepper gesperrt, unabhängig von plantInteractive. */
    anyRunning: boolean;
    plantInteractive: boolean;
    onClose: () => void;
}

export function Garten2SettingsSheet({ instance, anyRunning, plantInteractive, onClose }: Props) {
    const adminPortalTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget;
    const { sheetStyle, backdropStyle, dragHandlers, onBackdropClick, startClose } = useSheetDismiss(onClose);

    const [loaded, setLoaded] = useState(false);
    const [saved, setSaved] = useState<number | null>(null);
    const [draft, setDraft] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const obj = (await getObjectDirect(`system.adapter.${instance}`)) as {
                native?: { thresholdRain?: unknown };
            } | null;
            if (cancelled) return;
            const raw = obj?.native?.thresholdRain;
            setSaved(typeof raw === 'number' ? raw : null);
            setLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [instance]);

    const value = draft ?? saved ?? 0;
    const locked = !plantInteractive || anyRunning || !loaded;

    const step = (delta: number) => {
        if (locked) return;
        setDraft(clampThreshold(value + delta));
    };

    const writeThreshold = async (v: number) => {
        setSaving(true);
        setError(null);
        try {
            await extendObjectDirect(`system.adapter.${instance}`, { native: { thresholdRain: v } });
            const obj = (await getObjectDirect(`system.adapter.${instance}`, { skipCache: true })) as {
                native?: { thresholdRain?: unknown };
            } | null;
            const written = obj?.native?.thresholdRain;
            if (written !== v) {
                throw new Error('Wert wurde nicht übernommen');
            }
            setSaved(v);
            setDraft(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const requestSave = () => {
        if (locked || draft === null || draft === saved) return;
        setConfirming(true);
    };

    return createPortal(
        <div className="garten2-sheet-backdrop" style={backdropStyle} onClick={onBackdropClick}>
            <div className="garten2-sheet" style={sheetStyle} role="dialog" aria-modal="true">
                <div
                    className="garten2-sheet-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="garten2-sheet-grip">
                        <div className="garten2-sheet-grip-handle" />
                    </div>
                    <div className="garten2-sheet-header">
                        <div className="garten2-sheet-header-title">
                            <h2 className="garten2-sheet-title">Einstellungen</h2>
                            <p className="garten2-sheet-subtitle">Gartenbewässerung</p>
                        </div>
                    </div>
                </div>

                <div className="garten2-sheet-body">
                    <div className="garten2-sheet-row">
                        <div className="garten2-sheet-row-text">
                            <span className="garten2-sheet-row-title">Regensperre</span>
                            <span className="garten-note">
                                Ab dieser Regenmenge (mm) setzt die Anlage automatisch aus.
                            </span>
                        </div>
                    </div>

                    <div className="garten-dur-edit garten2-threshold-edit">
                        <button
                            type="button"
                            className="garten-chip-btn"
                            onClick={() => step(-STEP)}
                            disabled={locked || value <= MIN_THRESHOLD}
                            aria-label="Regensperre verringern"
                        >
                            <Minus size={13} />
                        </button>
                        <span className="garten2-threshold-value">
                            {loaded
                                ? value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                : '—'}
                        </span>
                        <span className="garten-dur-unit">mm</span>
                        <button
                            type="button"
                            className="garten-chip-btn"
                            onClick={() => step(STEP)}
                            disabled={locked || value >= MAX_THRESHOLD}
                            aria-label="Regensperre erhöhen"
                        >
                            <Plus size={13} />
                        </button>
                    </div>

                    {anyRunning && (
                        <p className="garten-note garten-dev-note">
                            Ein Kreis läuft gerade — die Regensperre ist gesperrt, solange bewässert wird.
                        </p>
                    )}
                    {error && <p className="garten-note garten-dev-note">Fehler beim Speichern: {error}</p>}

                    <div className="garten-btn-row">
                        <button
                            type="button"
                            className="garten-btn is-pri"
                            onClick={requestSave}
                            disabled={locked || draft === null || draft === saved || saving}
                        >
                            {saving ? 'Speichert …' : 'Speichern'}
                        </button>
                    </div>

                    {confirming && (
                        <ConfirmOverlay
                            text="Das startet die Bewässerungssteuerung neu. Trotzdem speichern?"
                            onConfirm={() => {
                                setConfirming(false);
                                if (draft !== null) void writeThreshold(draft);
                            }}
                            onCancel={() => setConfirming(false)}
                        />
                    )}
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
