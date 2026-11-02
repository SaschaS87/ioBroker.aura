/**
 * Entwurfs-Umschalter „Rollläden modern" (Runde 31–40, 02.11.2026), nur in
 * der Dev-Vorschau (import.meta.env.DEV), siehe Vault „Steuerung/
 * Entwurfs-Umschalter in der Dev-Vorschau". Nach der Wahl samt preview/
 * entfernen.
 *
 * - „Ist" zeigt den heutigen Tab unveraendert (inkl. Planer gegen _Dev).
 * - Die Entwuerfe lesen die ECHTEN Szenen/Zeitpunkte unter
 *   0_userdata.0.Rollladen, nur lesend: Speichern haelt devWriteGuard auf,
 *   Szenen-Fahren wird als Hinweis nachgespielt. Auf/Zu/Stopp und der
 *   Feinregler laufen ueber setState und werden ebenfalls vom Guard
 *   abgefangen – es faehrt nichts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from '../types';
import type { PlanModel } from '../planner/planModel';
import { useRollPlanData } from '../planner/useRollPlanData';
import { useLivePlanModel } from '../planner/useLivePlanModel';
import { Toast } from '../planner/parts';
import { PvSheet } from './PvSheet';
import { useRowControl } from './useRowControl';
import type { Acts, DevInfo, PvCtx } from './pvParts';
import { VARIANTS } from './variants';
import '../planner/RollPlan.css';
import './ModernPreview.css';

const LIVE_ROOT = '0_userdata.0.Rollladen';
const KEY_PICK = 'aura.shutterfloors.modern.preview';

function load(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function save(key: string, v: string) {
    try {
        localStorage.setItem(key, v);
    } catch {
        /* privates Fenster – Wahl gilt dann nur fuer diese Sitzung */
    }
}

function PosProbe({ k, dp, onUpdate }: { k: string; dp: string; onUpdate: (k: string, v: number | null) => void }) {
    const { value } = useDatapoint(dp);
    const v = typeof value === 'number' ? value : null;
    useEffect(() => {
        onUpdate(k, v);
    }, [k, v, onUpdate]);
    return null;
}

function parseSunDp(v: unknown): string | null {
    return typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v : null;
}

/** Meldet Zustand und Befehle eines Antriebs nach oben. */
function Reporter({
    d,
    floor,
    report,
    acts,
}: {
    d: ShutterFloorDeviceDef;
    floor: string;
    report: (k: string, i: DevInfo) => void;
    acts: Acts;
}) {
    const c = useRowControl(d);
    acts.current[d.key] = { open: c.open, stop: c.stop, close: c.close };
    const { closed, busy, dir, unknown, offline, status, short } = c;
    useEffect(() => {
        report(d.key, {
            key: d.key,
            label: d.label,
            floor,
            kind: d.kind,
            closed,
            busy,
            dir,
            unknown,
            offline,
            status,
            short,
        });
    }, [d.key, d.label, d.kind, floor, closed, busy, dir, unknown, offline, status, short, report]);
    return null;
}

function usePlanPreviewModel(floors: ShutterFloorDef[]): {
    m: PlanModel;
    onPos: (k: string, v: number | null) => void;
} {
    const [positions, setPositions] = useState<Record<string, number | null>>({});
    const onPos = useCallback((k: string, v: number | null) => {
        setPositions((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    }, []);
    const sunrise = useDatapoint('javascript.0.variables.astro.sunrise');
    const sunset = useDatapoint('javascript.0.variables.astro.sunset');
    const dawn = useDatapoint('javascript.0.variables.astro.dawn');
    const dusk = useDatapoint('javascript.0.variables.astro.dusk');
    const data = useRollPlanData(LIVE_ROOT);
    const noop = useCallback(() => {}, []);
    const live = useLivePlanModel(
        floors,
        positions,
        {
            sunrise: parseSunDp(sunrise.value),
            sunset: parseSunDp(sunset.value),
            dawn: parseSunDp(dawn.value),
            dusk: parseSunDp(dusk.value),
        },
        data,
        noop,
    );
    const m = useMemo<PlanModel>(
        () => ({
            ...live,
            runScene: (id: string) => live.showToast(`Vorschau: „${live.sceneOf(id)?.name ?? id}" würde jetzt fahren`),
        }),
        [live],
    );
    return { m, onPos };
}

function Host({
    floors,
    connected,
    footer,
    pick,
}: {
    floors: ShutterFloorDef[];
    connected: boolean;
    footer: ReactNode;
    pick: string;
}) {
    const { m, onPos } = usePlanPreviewModel(floors);
    const [reg, setReg] = useState<Record<string, DevInfo>>({});
    const report = useCallback((k: string, i: DevInfo) => {
        setReg((prev) => {
            const o = prev[k];
            if (o && (Object.keys(i) as (keyof DevInfo)[]).every((f) => o[f] === i[f])) return prev;
            return { ...prev, [k]: i };
        });
    }, []);
    const acts: Acts = useRef({});
    const [sheet, setSheet] = useState<{ d: ShutterFloorDeviceDef; seq: number } | null>(null);
    const variant = VARIANTS.find((v) => v.key === pick) ?? VARIANTS[0];

    // Farbwelt der Variante auch fuer die Fenster, die per Portal ausserhalb
    // des Widgets haengen (Zeitplan, Szenen, Editoren, Feinregler).
    useEffect(() => {
        document.documentElement.dataset.pv = variant.key;
        return () => {
            delete document.documentElement.dataset.pv;
        };
    }, [variant.key]);

    const ctx: PvCtx = {
        floors,
        connected,
        m,
        reg,
        acts,
        openSheet: (d) => setSheet((s) => ({ d, seq: (s?.seq ?? 0) + 1 })),
        footer,
    };
    const V = variant.C;
    return (
        <>
            {floors.flatMap((f) =>
                f.devices.map((d) => (
                    <span key={d.key} hidden>
                        <PosProbe k={d.key} dp={d.posDp} onUpdate={onPos} />
                        <Reporter d={d} floor={f.name} report={report} acts={acts} />
                    </span>
                )),
            )}
            <div className={`pv-root pv-${variant.key}${connected ? '' : ' is-offline'}`}>
                <V c={ctx} />
            </div>
            {sheet && (
                <PvSheet
                    key={sheet.seq}
                    device={sheet.d}
                    connected={connected}
                    regler={variant.regler}
                    onClose={() => setSheet(null)}
                />
            )}
            <Toast model={m} />
        </>
    );
}

export function ModernPreview({
    floors,
    connected,
    banner,
    footer,
    ist,
}: {
    floors: ShutterFloorDef[];
    connected: boolean;
    banner: ReactNode;
    footer: ReactNode;
    ist: ReactNode;
}) {
    const [pick, setPickState] = useState<string>(() => {
        const v = load(KEY_PICK);
        return v === 'IST' || VARIANTS.some((x) => x.key === v) ? (v as string) : VARIANTS[0].key;
    });
    const setPick = (v: string) => {
        save(KEY_PICK, v);
        setPickState(v);
    };
    const variant = VARIANTS.find((v) => v.key === pick);
    return (
        <>
            <div className="pv-bar" role="toolbar" aria-label="Entwurfs-Umschalter">
                <div className="pv-bar-btns">
                    {[{ key: 'IST' }, ...VARIANTS].map((v) => (
                        <button
                            key={v.key}
                            type="button"
                            className={`pv-bar-btn${pick === v.key ? ' is-active' : ''}`}
                            onClick={() => setPick(v.key)}
                        >
                            {v.key === 'IST' ? 'Ist' : v.key}
                        </button>
                    ))}
                </div>
                <div className="pv-bar-name">
                    {pick === 'IST' || !variant ? 'Ist · heutiger Stand' : `${variant.key} · ${variant.name}`}
                </div>
                {variant && pick !== 'IST' && <div className="pv-bar-desc">{variant.desc}</div>}
                <div className="pv-bar-hint">
                    nur lokal · echte Stellungen, Szenen und Zeitpunkte vom Pi, nur lesend · Fahren wird nur angezeigt,
                    es fährt nichts
                </div>
            </div>
            {pick === 'IST' || !variant ? (
                ist
            ) : (
                <>
                    {banner}
                    <Host floors={floors} connected={connected} footer={footer} pick={pick} />
                </>
            )}
        </>
    );
}
