import { useState, type ReactNode } from 'react';
import { useDeviceThemeModel } from './previewModel';
import { VariantA, VariantB, VariantC } from './variants';
import './DeviceSettingsPreview.css';

/**
 * Entwurfs-Umschalter fuer die Geraete-Einstellungen (nur Dev-Vorschau).
 * Wird in DeviceSettingsWidget nur im Dev-Build geladen und kommt nie in den
 * Pi-Build. Die Wahl der Variante steht nur lokal im Browser.
 */

type Variant = 'ist' | 'a' | 'b' | 'c';

const KEY = 'aura.devicesettings.preview';
const VARIANTS: { key: Variant; label: string; title: string }[] = [
    { key: 'ist', label: 'Ist', title: 'Heutiger Aufbau' },
    { key: 'a', label: 'A', title: 'Push wie iPhone' },
    { key: 'b', label: 'B', title: 'Master-Detail ab 640 px' },
    { key: 'c', label: 'C', title: 'Inline-Aufklappen' },
];

function readVariant(): Variant {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'a' || v === 'b' || v === 'c' ? v : 'ist';
    } catch {
        return 'ist';
    }
}

function writeVariant(v: Variant): void {
    try {
        localStorage.setItem(KEY, v);
    } catch {
        /* private mode */
    }
}

export default function DeviceSettingsPreview({ inert, ist }: { inert: boolean; ist: ReactNode }) {
    const [variant, setVariant] = useState<Variant>(readVariant);
    const [sample, setSample] = useState(false);
    const model = useDeviceThemeModel();

    const pick = (v: Variant) => {
        setVariant(v);
        writeVariant(v);
    };
    const current = VARIANTS.find((v) => v.key === variant);

    return (
        <div className="ds-pv-wrap">
            <div className="ds-pv-bar" data-ds-pv-bar>
                <div className="ds-pv-bar-row">
                    <span className="ds-pv-bar-label">Entwurf</span>
                    <div className="ds-pv-seg" role="group" aria-label="Entwurf wählen">
                        {VARIANTS.map((v) => (
                            <button
                                key={v.key}
                                type="button"
                                data-ds-pv={v.key}
                                aria-pressed={variant === v.key}
                                title={v.title}
                                onClick={() => pick(v.key)}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                    <label className="ds-pv-bar-check">
                        <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
                        Beispieldaten
                    </label>
                </div>
                <div className="ds-pv-bar-note">{current?.title} · nur in der lokalen Vorschau, nicht auf dem Pi</div>
            </div>
            {variant === 'ist' && ist}
            {variant === 'a' && <VariantA model={model} inert={inert} sample={sample} />}
            {variant === 'b' && <VariantB model={model} inert={inert} sample={sample} />}
            {variant === 'c' && <VariantC model={model} inert={inert} sample={sample} />}
        </div>
    );
}
