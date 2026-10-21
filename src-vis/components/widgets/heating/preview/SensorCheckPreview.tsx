/**
 * Umschalter fuer die Entwuerfe des „Aussenfuehler-Checks" im Heizung-Tab —
 * erscheint NUR in der Dev-Vorschau (import.meta.env.DEV), nie im Pi-Build.
 *
 * „Ist" = die Box ist nicht vorhanden (bisheriger Stand), A–C = Entwuerfe der
 * Runde 1 aus variants.tsx. Die Wahl merkt sich der Browser.
 */
import { useEffect, useState } from 'react';
import { VARIANTS } from './variants';
import './SensorCheckPreview.css';

const LS_KEY = 'aura.heatingSensorCheck.preview';
const DEFAULT_VARIANT = 'A';

function readChoice(): string {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            // Unbekannte Werte (z. B. aus einer spaeteren Runde) fallen auf A zurueck.
            if (raw === 'IST' || VARIANTS.some((v) => v.key === raw)) return raw;
        }
    } catch {
        /* Vorschau-Komfort, darf fehlen */
    }
    return DEFAULT_VARIANT;
}

export function useSensorCheckPreviewChoice() {
    const [choice, setChoice] = useState<string>(readChoice);
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, choice);
        } catch {
            /* egal */
        }
    }, [choice]);
    return [choice, setChoice] as const;
}

export function SensorCheckPreviewBar({ choice, setChoice }: { choice: string; setChoice: (c: string) => void }) {
    const current = VARIANTS.find((v) => v.key === choice);
    return (
        <div
            className="scp-switch"
            onClick={(e) => e.stopPropagation()}
            data-widget-interactive
        >
            <div className="scp-row">
                <span>Entwurf Außenfühler-Check, Runde 1:</span>
                {[{ key: 'IST', name: 'Ist' }, ...VARIANTS].map((v) => (
                    <button
                        key={v.key}
                        type="button"
                        className={`scp-btn${choice === v.key ? ' is-active' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setChoice(v.key);
                        }}
                    >
                        {v.key === 'IST' ? 'Ist' : v.key}
                    </button>
                ))}
            </div>
            <div className="scp-row" style={{ justifyContent: 'space-between' }}>
                <span className="scp-name">{current ? `${current.key} · ${current.name}` : 'Ist · Box nicht vorhanden'}</span>
                <span>nur lokal</span>
            </div>
        </div>
    );
}

export { VARIANTS };
