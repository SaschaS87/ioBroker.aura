/**
 * Gelber Entwurfs-Umschalter „Letzte Fahrten" (Ist, A–C). Nur Dev-Vorschau, gleiche Optik wie der
 * Wetter-Umschalter (dessen CSS wird mitbenutzt).
 */
import { createPortal } from 'react-dom';
import { FAHRTEN_DRAFTS, useFahrtenDraftStore } from './fahrtenDraft';
import '../../wetter/WetterDraftSwitch.css';
// Die Entwurfs-CSS hängt am Umschalter: Er wird nur in DEV (lazy) geladen, so kommt sie nie in den Build.
import './FahrtenDrafts.css';

export default function FahrtenDraftSwitch() {
    const draft = useFahrtenDraftStore((s) => s.draft);
    const setDraft = useFahrtenDraftStore((s) => s.setDraft);
    const beispiel = useFahrtenDraftStore((s) => s.beispiel);
    const setBeispiel = useFahrtenDraftStore((s) => s.setBeispiel);
    return createPortal(
        <div className="wx-devswitch" title="Entwürfe „Letzte Fahrten“, nur lokal">
            <span className="wx-devswitch-drafts" role="group" aria-label="Entwürfe Letzte Fahrten">
                {FAHRTEN_DRAFTS.map((d) => (
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
                <button
                    type="button"
                    className="wx-devswitch-draft"
                    data-sel={beispiel || undefined}
                    aria-pressed={beispiel}
                    title="Beispielfehler einblenden (erfunden, nur zum Ansehen)"
                    onClick={() => setBeispiel(!beispiel)}
                >
                    Fehler
                </button>
            </span>
        </div>,
        document.body,
    );
}
