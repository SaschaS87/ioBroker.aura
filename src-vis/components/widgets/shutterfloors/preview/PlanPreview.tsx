/**
 * Entwurfs-Umschalter fuer die Rolllaeden-Planer-Kachel (Feature 23,
 * Ueberarbeitung 31.10.2026: Wischen zwischen Fahrten und Szenen hat im
 * Alltag gestoert). Nur in der Dev-Vorschau (import.meta.env.DEV), siehe
 * Vault „Steuerung/Entwurfs-Umschalter in der Dev-Vorschau".
 *
 * Daten: liest die ECHTEN Szenen/Wochenplan/Einstellungen unter
 * 0_userdata.0.Rollladen (nicht _Dev, dort liegt nur „WC Test") – nur lesend.
 * Schreibversuche aus dem Popup haelt devWriteGuard auf (fremder Namespace),
 * Sofort-Fahren wird hier nur als Hinweis nachgespielt.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { usePlanModel, type PlanModel } from '../planner/planModel';
import { useRollPlanData } from '../planner/useRollPlanData';
import { useLivePlanModel } from '../planner/useLivePlanModel';
import { useRollPlanViewStore } from '../planner/useRollPlanView';
import { PlanKachel } from '../planner/PlanPages';
import { PlanPopup, useSheet } from '../planner/PlanPopup';
import { Toast } from '../planner/parts';
import { VARIANTS } from './variants';
import { ROUND2, Round2 } from './round2';
import '../planner/RollPlan.css';
import './PlanPreview.css';

const LIVE_ROOT = '0_userdata.0.Rollladen';
const KEY_PICK = 'aura.shutterfloors.planner.preview';
const KEY_SAMPLES = 'aura.shutterfloors.planner.preview.samples';

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

function usePick() {
    const [pick, setPick] = useState<string>(() => {
        const v = load(KEY_PICK);
        return v === 'IST' || [...VARIANTS, ...ROUND2].some((x) => x.key === v) ? (v as string) : ROUND2[0].key;
    });
    const [samples, setSamples] = useState(() => load(KEY_SAMPLES) === '1');
    return {
        pick,
        setPick: (v: string) => {
            save(KEY_PICK, v);
            setPick(v);
        },
        samples,
        setSamples: (v: boolean) => {
            save(KEY_SAMPLES, v ? '1' : '0');
            setSamples(v);
        },
    };
}

/** Wie PosProbe in RollPlanTile.tsx – Kopie, damit die Produktion unberuehrt bleibt. */
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

export function PlanPreview({ floors }: { floors: ShutterFloorDef[] }) {
    const { pick, setPick, samples, setSamples } = usePick();
    const [positions, setPositions] = useState<Record<string, number | null>>({});
    const onPos = useCallback((k: string, v: number | null) => {
        setPositions((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    }, []);
    const sunrise = useDatapoint('javascript.0.variables.astro.sunrise');
    const sunset = useDatapoint('javascript.0.variables.astro.sunset');
    const dawn = useDatapoint('javascript.0.variables.astro.dawn');
    const dusk = useDatapoint('javascript.0.variables.astro.dusk');
    const sun = {
        sunrise: parseSunDp(sunrise.value),
        sunset: parseSunDp(sunset.value),
        dawn: parseSunDp(dawn.value),
        dusk: parseSunDp(dusk.value),
    };

    const data = useRollPlanData(LIVE_ROOT);
    const noop = useCallback(() => {}, []);
    const live = useLivePlanModel(floors, positions, sun, data, noop);
    const sample = usePlanModel(floors, positions, sun, true);
    const base = samples ? sample : live;
    // Sofort-Fahren nur nachspielen – in der Vorschau faehrt nichts.
    const m = useMemo<PlanModel>(
        () => ({
            ...base,
            runScene: (id: string) => base.showToast(`Vorschau: „${base.sceneOf(id)?.name ?? id}" würde jetzt fahren`),
        }),
        [base],
    );
    const { list, first, scenes: sceneView } = useRollPlanViewStore();
    const sh = useSheet();
    const variant = VARIANTS.find((v) => v.key === pick);
    const r2 = ROUND2.find((v) => v.key === pick);
    const chosen = variant ?? r2;
    const btn = (key: string, label: string) => (
        <button
            key={key}
            type="button"
            className={`pv-bar-btn${pick === key ? ' is-active' : ''}`}
            onClick={() => setPick(key)}
        >
            {label}
        </button>
    );

    return (
        <div className="rpp">
            {floors
                .flatMap((f) => f.devices)
                .map((d) => (
                    <PosProbe key={d.key} k={d.key} dp={d.posDp} onUpdate={onPos} />
                ))}
            <div className="pv-bar" role="toolbar" aria-label="Entwurfs-Umschalter">
                <div className="pv-bar-btns">
                    <span className="pv-bar-group">
                        <span className="pv-bar-group-label">Runde 2</span>
                        {ROUND2.map((v) => btn(v.key, v.key))}
                    </span>
                    <span className="pv-bar-group">
                        <span className="pv-bar-group-label">Runde 1</span>
                        {btn('IST', 'Ist')}
                        {VARIANTS.map((v) => btn(v.key, v.key))}
                    </span>
                </div>
                <div className="pv-bar-name">
                    {pick === 'IST'
                        ? 'Ist · Heutiger Stand (mit Wischen)'
                        : `${pick} · ${chosen?.name}${r2 ? ' (Kachel wie 10, eigene Fenster)' : ''}`}
                </div>
                {chosen && pick !== 'IST' && <div className="pv-bar-desc">{chosen.desc}</div>}
                <div className="pv-bar-foot">
                    <label className="pv-bar-check">
                        <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />{' '}
                        Beispieldaten
                    </label>
                    <span className="pv-bar-hint">
                        nur lokal · {samples ? 'erfundene Szenen' : 'echte Szenen vom Pi, nur lesend'}
                    </span>
                </div>
            </div>
            {r2 ? (
                <>
                    <Round2 m={m} sh={sh} v={r2} />
                    <Toast model={m} />
                </>
            ) : pick === 'IST' || !variant ? (
                <PlanKachel
                    model={m}
                    listStyle={list}
                    first={first}
                    favOnly
                    layout={sceneView === 'S' ? 'list' : 2}
                    paged={sceneView === 'W'}
                />
            ) : (
                <>
                    <variant.C m={m} sh={sh} />
                    <PlanPopup model={m} sheet={sh} listStyle={list} />
                    <Toast model={m} />
                </>
            )}
        </div>
    );
}
