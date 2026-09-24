/**
 * Umschalter fuer die Planer-Entwuerfe (Szenen + Wochenplan) auf dem
 * Rolllaeden-Tab — erscheint NUR in der Dev-Vorschau (import.meta.env.DEV),
 * nie im Build fuer den Pi.
 *
 * Runde 5: X – Ansicht (Popup A/L, Seite 1, Szenen S/W) als Einstellung im
 * Popup. Runde 4 S–W bleibt zum Vergleich.
 * Runde 4: Kachel S–W (Slider: Fahrten + Szenen, verschiedene Raster),
 * Seite 1 Heute/Naechste 3, Popup A oder L, Favoriten an/aus. Frei
 * kombinierbar. Fruehere Runden: 1 a95beb15, 2 2a36dfc0, 3 76316852.
 * Die Etagenliste darunter bleibt in allen Entwuerfen unveraendert.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { ShutterFloorDef } from '../types';
import { usePlanModel } from './planModel';
import { parseSunDp } from './parts';
import { type ListStyle } from './round2';
import { POPUPS3 as POPUPS } from './round3';
import { KACHELN4, type FirstPage } from './round4';
import { KachelX } from './round5';
import './RollPlanPreview.css';

const KACHELN = [{ key: 'X', name: 'Ansicht in den Einstellungen', C: KachelX }, ...KACHELN4];

const LS_KEY = 'aura.shutterfloors.preview.r4';

type Choice = { variant: string; popup: ListStyle; samples: boolean; first: FirstPage; favOnly: boolean };
const DEFAULT: Choice = { variant: 'X', popup: 'L', samples: true, first: 'today', favOnly: true };

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
                first: v.first === 'next' ? 'next' : 'today',
                favOnly: v.favOnly ?? true,
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
                <span>Runde 5 · Kachel:</span>
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
            {current && current.key !== 'X' && (
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
                    <span style={{ marginLeft: 8 }}>Seite 1:</span>
                    {(
                        [
                            ['today', 'Heute'],
                            ['next', 'Nächste 3'],
                        ] as const
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            type="button"
                            className={`rpp-switch-btn${choice.first === k ? ' is-active' : ''}`}
                            onClick={() => setChoice({ ...choice, first: k })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {current && (
                <div className="rpp-switch-row">
                    {current.key !== 'X' && (<label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <input type="checkbox" checked={choice.favOnly} onChange={(e) => setChoice({ ...choice, favOnly: e.target.checked })} />
                        Nur Favoriten auf der Kachel
                    </label>)}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                        <input type="checkbox" checked={choice.samples} onChange={(e) => setChoice({ ...choice, samples: e.target.checked })} />
                        Beispieldaten
                    </label>
                </div>
            )}
            <span className="rpp-switch-name">
                {current ? `${current.key} · ${current.name}` : 'Bisheriger Stand'}
                {current && popup && current.key !== 'X' ? ` — ${popup.key} · ${popup.name}` : ''}
            </span>
            {current && (
                <span>
                    Nur lokal: Szenen fahren nicht wirklich, nichts geht an den Pi. Echt sind Rollladen-Stellungen und Sonnenzeiten.
                    Kachel wischen oder Pfeile tippen; „Planen“ öffnet das Popup.{current.key === 'X' ? ' Ansicht umstellen: Planen → Einstellungen → Ansicht.' : ''}
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
    first,
    favOnly,
    floors,
}: {
    variant: string;
    popup: ListStyle;
    samples: boolean;
    first: FirstPage;
    favOnly: boolean;
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
                <K model={model} listStyle={popup} first={first} favOnly={favOnly} />
            </div>
        </>
    );
}
