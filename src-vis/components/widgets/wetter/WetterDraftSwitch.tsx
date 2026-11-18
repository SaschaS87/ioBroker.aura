/**
 * Gelber Entwurfs-Umschalter der Wetter-Seite (Alt, A bis D). Existiert nur in der Dev-Vorschau und wird von
 * App.tsx hinter import.meta.env.DEV geladen, nie im Build. Gleiche Optik wie der frühere Umschalter.
 */
import { WETTER_DRAFTS, useWetterDraftStore } from './wetterDraft';
import './WetterDraftSwitch.css';

export default function WetterDraftSwitch() {
    const draft = useWetterDraftStore((s) => s.draft);
    const setDraft = useWetterDraftStore((s) => s.setDraft);
    return (
        <div className="wx-devswitch" title="Entwurfs-Umschalter, nur lokal">
            <span className="wx-devswitch-drafts" role="group" aria-label="Entwürfe der Wetter-Seite">
                {WETTER_DRAFTS.map((d) => (
                    <button
                        key={d.key}
                        type="button"
                        className="wx-devswitch-draft"
                        data-sel={d.key === draft || undefined}
                        aria-pressed={d.key === draft}
                        title={d.name}
                        onClick={() => setDraft(d.key)}
                    >
                        {d.label}
                    </button>
                ))}
            </span>
        </div>
    );
}
