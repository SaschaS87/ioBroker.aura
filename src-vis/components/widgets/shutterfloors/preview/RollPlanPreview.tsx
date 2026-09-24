/**
 * Umschalter fuer die Planer-Entwuerfe (Szenen + Wochenplan) auf dem
 * Rolllaeden-Tab — erscheint NUR in der Dev-Vorschau (import.meta.env.DEV),
 * nie im Build fuer den Pi.
 *
 * Runde 3: Kachel O–R (Slider: Fahrten + Szenen), Popup A oder L. Frei
 * kombinierbar. Runde 1 in a95beb15 (variants.tsx), Runde 2 in 2a36dfc0.
 * Die Etagenliste darunter bleibt in allen Entwuerfen unveraendert.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { usePlanModel } from './planModel';
import { parseSunDp } from './parts';
import { type ListStyle } from './round2';
import { KACHELN3 as KACHELN, POPUPS3 as POPUPS } from './round3';
import './RollPlanPreview.css';

const LS_KEY = 'aura.shutterfloors.preview.r3';

type Choice = { variant: string; popup: ListStyle; samples: boolean };
const DEFAULT: Choice = { variant: KACHELN[0].key, popup: 'L', samples: true };

function readLs(): Choice {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const v = JSON.parse(raw) as Partial<Choice>;
            const known = v.variant === 'IST' || KACHELN.some((x) => x.key === v.variant);
            return {
                variant: known && v.variant ? v.variant : DEFAULT.variant,
                popup: POPUPS.some((p) => p.key === v.popup) ? (v.popup as ListStyle) : DEFAULT.popup,
                samples: v.samples ?? true,
            };
        }
    } catch {
        /* Vorschau-Komfort, darf fehlen */
    }
    return DEFAULT;
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
    const current = KACHELN.find((v) => v.key === choice.variant);
    const popup = POPUPS.find((p) => p.key === choice.popup);
    return (
        <div className="rpp-switch">
            <div className="rpp-switch-row">
                <span>Runde 3 · Kachel:</span>
                {[{ key: 'IST', name: 'Bisheriger Stand' }, ...KACHELN].map((v) => (
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
            {current && (
                <div className="rpp-switch-row">
                    <span>Popup:</span>
                    {POPUPS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            className={`rpp-switch-btn${choice.popup === p.key ? ' is-active' : ''}`}
                            onClick={() => setChoice({ ...choice, popup: p.key })}
                        >
                            {p.key}
                        </button>
                    ))}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                        <input type="checkbox" checked={choice.samples} onChange={(e) => setChoice({ ...choice, samples: e.target.checked })} />
                        Beispieldaten
                    </label>
                </div>
            )}
            <span className="rpp-switch-name">
                {current ? `${current.key} · ${current.name}` : 'Bisheriger Stand'}
                {current && popup ? ` — ${popup.key} · ${popup.name}` : ''}
            </span>
            {current && (
                <span>
                    Nur lokal: Szenen fahren nicht wirklich, nichts geht an den Pi. Echt sind Rollladen-Stellungen und Sonnenzeiten.
                    Kachel wischen oder Pfeile tippen; „Planen“ öffnet das Popup.
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

export function RollPlanVariant({
    variant,
    popup,
    samples,
    floors,
}: {
    variant: string;
    popup: ListStyle;
    samples: boolean;
    floors: ShutterFloorDef[];
}) {
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
    const K = KACHELN.find((v) => v.key === variant)?.C;
    if (!K) return null;
    return (
        <>
            {floors.flatMap((f) => f.devices).map((d) => (
                <PosProbe key={d.key} k={d.key} dp={d.posDp} onUpdate={onPos} />
            ))}
            <div className="rpp">
                <K model={model} listStyle={popup} />
            </div>
        </>
    );
}
