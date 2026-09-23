/**
 * Umschalter fuer die Garten2-Design-Entwuerfe — erscheint NUR in der
 * Dev-Vorschau (import.meta.env.DEV), nie im Build fuer den Pi.
 *
 * „Ist" zeigt den bisherigen Aufbau (Garten2Widget rendert dann wie gehabt),
 * G–L die Entwuerfe der Runde 2 aus variants.tsx (Runde 1: A–F, Commit
 * 115bb7da). Die Wahl merkt sich der Browser.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDatapoint } from '../../../../hooks/useDatapoint';
import type { CircleProbeData } from '../Garten2Widget';
import type { SprinkleWeather } from '../useSprinkleWeather';
import { useG2PreviewModel, type G2Extras } from './previewModel';
import { VARIANTS } from './variants';
import './Garten2Preview.css';

const LS_KEY = 'aura.garten2.preview';

const DEFAULT_VARIANT = VARIANTS[0].key;

function readLs(): { variant: string; samples: boolean } {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const v = JSON.parse(raw) as { variant?: string; samples?: boolean };
            // Gemerkte Wahl aus einer frueheren Runde (z. B. „A") gibt es nicht mehr.
            const known = v.variant === 'IST' || VARIANTS.some((x) => x.key === v.variant);
            return { variant: known && v.variant ? v.variant : DEFAULT_VARIANT, samples: v.samples ?? true };
        }
    } catch {
        /* Vorschau-Komfort, darf fehlen */
    }
    return { variant: DEFAULT_VARIANT, samples: true };
}

export function useGarten2PreviewChoice() {
    const [choice, setChoice] = useState(readLs);
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(choice));
        } catch {
            /* egal */
        }
    }, [choice]);
    return [choice, setChoice] as const;
}

/** Liest die Verlaufs-Datenpunkte, die das Steuerpult bisher nicht braucht. */
function ExtrasProbe({
    instance,
    name,
    onUpdate,
}: {
    instance: string;
    name: string;
    onUpdate: (name: string, x: G2Extras) => void;
}) {
    const base = `${instance}.sprinkle.${name}.history`;
    const rt = useDatapoint(`${base}.lastRunningTime`);
    const lc = useDatapoint(`${base}.lastConsumed`);
    const wc = useDatapoint(`${base}.curCalWeekConsumed`);
    const lastRunningTime = typeof rt.value === 'string' ? rt.value : '';
    const lastConsumed = typeof lc.value === 'number' ? lc.value : null;
    const weekConsumed = typeof wc.value === 'number' ? wc.value : null;
    useEffect(() => {
        onUpdate(name, { lastRunningTime, lastConsumed, weekConsumed });
    }, [name, lastRunningTime, lastConsumed, weekConsumed, onUpdate]);
    return null;
}

export function Garten2PreviewBar({
    choice,
    setChoice,
}: {
    choice: { variant: string; samples: boolean };
    setChoice: (c: { variant: string; samples: boolean }) => void;
}) {
    const current = VARIANTS.find((v) => v.key === choice.variant);
    return (
        <div className="g2p-switch">
            <div className="g2p-switch-row">
                <span>Entwurf, Runde 2:</span>
                {[{ key: 'IST', name: 'Bisheriger Stand' }, ...VARIANTS].map((v) => (
                    <button
                        key={v.key}
                        type="button"
                        className={`g2p-switch-btn${choice.variant === v.key ? ' is-active' : ''}`}
                        onClick={() => setChoice({ ...choice, variant: v.key })}
                    >
                        {v.key === 'IST' ? 'Ist' : v.key}
                    </button>
                ))}
            </div>
            <div className="g2p-switch-row" style={{ justifyContent: 'space-between' }}>
                <span className="g2p-switch-name">{current ? `${current.key} · ${current.name}` : 'Bisheriger Stand'}</span>
                {current && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <input
                            type="checkbox"
                            checked={choice.samples}
                            onChange={(e) => setChoice({ ...choice, samples: e.target.checked })}
                        />
                        Beispieldaten
                    </label>
                )}
            </div>
            {current && (
                <span>
                    Nur lokal: „Gießen" und Moduswechsel werden simuliert, nichts geht an den Pi. Beispieldaten = erfundene Termine und Verbräuche.
                </span>
            )}
        </div>
    );
}

export function Garten2PreviewVariant({
    variant,
    samples,
    instance,
    probes,
    weather,
    onOpenSettings,
}: {
    variant: string;
    samples: boolean;
    instance: string;
    probes: CircleProbeData[];
    weather: SprinkleWeather;
    onOpenSettings: () => void;
}) {
    const [extras, setExtras] = useState<Record<string, G2Extras>>({});
    const onExtras = useCallback((name: string, x: G2Extras) => {
        setExtras((prev) => ({ ...prev, [name]: x }));
    }, []);
    const model = useG2PreviewModel(probes, extras, weather, samples, onOpenSettings);
    const V = VARIANTS.find((v) => v.key === variant)?.C;
    if (!V) return null;
    return (
        <>
            {probes.map((p) => (
                <ExtrasProbe key={p.sprinkleName} instance={instance} name={p.sprinkleName} onUpdate={onExtras} />
            ))}
            <V model={model} />
        </>
    );
}
