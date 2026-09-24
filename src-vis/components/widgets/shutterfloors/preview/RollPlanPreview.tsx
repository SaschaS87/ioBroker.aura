/**
 * Umschalter fuer die Planer-Entwuerfe (Szenen + Wochenplan) auf dem
 * Rolllaeden-Tab — erscheint NUR in der Dev-Vorschau (import.meta.env.DEV),
 * nie im Build fuer den Pi.
 *
 * „Ist" zeigt den Tab wie bisher, A–E die Entwuerfe der Runde 1. Die
 * Etagenliste darunter bleibt in allen Entwuerfen unveraendert.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { usePlanModel } from './planModel';
import { parseSunDp } from './parts';
import { VARIANTS } from './variants';
import './RollPlanPreview.css';

const LS_KEY = 'aura.shutterfloors.preview';
const DEFAULT_VARIANT = VARIANTS[0].key;

type Choice = { variant: string; samples: boolean };

function readLs(): Choice {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const v = JSON.parse(raw) as Partial<Choice>;
            const known = v.variant === 'IST' || VARIANTS.some((x) => x.key === v.variant);
            return { variant: known && v.variant ? v.variant : DEFAULT_VARIANT, samples: v.samples ?? true };
        }
    } catch {
        /* Vorschau-Komfort, darf fehlen */
    }
    return { variant: DEFAULT_VARIANT, samples: true };
}

export function useRollPlanChoice() {
    const [choice, setChoice] = useState<Choice>(readLs);
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(choice));
        } catch {
            /* egal */
        }
    }, [choice]);
    return [choice, setChoice] as const;
}

export function RollPlanBar({ choice, setChoice }: { choice: Choice; setChoice: (c: Choice) => void }) {
    const current = VARIANTS.find((v) => v.key === choice.variant);
    return (
        <div className="rpp-switch">
            <div className="rpp-switch-row">
                <span>Entwurf Planer, Runde 1:</span>
                {[{ key: 'IST', name: 'Bisheriger Stand' }, ...VARIANTS].map((v) => (
                    <button
                        key={v.key}
                        type="button"
                        className={`rpp-switch-btn${choice.variant === v.key ? ' is-active' : ''}`}
                        onClick={() => setChoice({ ...choice, variant: v.key })}
                    >
                        {v.key === 'IST' ? 'Ist' : v.key}
                    </button>
                ))}
            </div>
            <div className="rpp-switch-row" style={{ justifyContent: 'space-between' }}>
                <span className="rpp-switch-name">{current ? `${current.key} · ${current.name}` : 'Bisheriger Stand'}</span>
                {current && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <input type="checkbox" checked={choice.samples} onChange={(e) => setChoice({ ...choice, samples: e.target.checked })} />
                        Beispieldaten
                    </label>
                )}
            </div>
            {current && (
                <span>
                    Nur lokal: Szenen fahren nicht wirklich, nichts geht an den Pi. Echt sind Rollladen-Stellungen und Sonnenzeiten.
                    Beispieldaten = erfundene Szenen und Zeitpunkte.
                </span>
            )}
        </div>
    );
}

/** Liest die aktuelle Stellung eines Antriebs und meldet sie nach oben. */
function PosProbe({ k, dp, onUpdate }: { k: string; dp: string; onUpdate: (k: string, v: number | null) => void }) {
    const { value } = useDatapoint(dp);
    const v = typeof value === 'number' ? value : null;
    useEffect(() => {
        onUpdate(k, v);
    }, [k, v, onUpdate]);
    return null;
}

export function RollPlanVariant({ variant, samples, floors }: { variant: string; samples: boolean; floors: ShutterFloorDef[] }) {
    const [positions, setPositions] = useState<Record<string, number | null>>({});
    const onPos = useCallback((k: string, v: number | null) => {
        setPositions((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
    }, []);
    const sunrise = useDatapoint('javascript.0.variables.astro.sunrise');
    const sunset = useDatapoint('javascript.0.variables.astro.sunset');
    const dawn = useDatapoint('javascript.0.variables.astro.dawn');
    const dusk = useDatapoint('javascript.0.variables.astro.dusk');
    const model = usePlanModel(
        floors,
        positions,
        {
            sunrise: parseSunDp(sunrise.value),
            sunset: parseSunDp(sunset.value),
            dawn: parseSunDp(dawn.value),
            dusk: parseSunDp(dusk.value),
        },
        samples,
    );
    const V = VARIANTS.find((v) => v.key === variant)?.C;
    if (!V) return null;
    return (
        <>
            {floors.flatMap((f) => f.devices).map((d) => (
                <PosProbe key={d.key} k={d.key} dp={d.posDp} onUpdate={onPos} />
            ))}
            <div className="rpp">
                <V model={model} />
            </div>
        </>
    );
}
