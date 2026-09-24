/**
 * Planer-Entwurf Runde 5 (nur Dev-Vorschau).
 *
 * Saschas Idee: Die Ansicht ist keine Entwurfsfrage mehr, sondern eine
 * Einstellung im Popup (Reiter Einstellungen, Karte „Ansicht“):
 *   Listen im Popup   – kompakt (A) oder mit Rollladen-Namen (L)
 *   Startseite        – Heute oder die nächsten 3 Fahrten
 *   Szenen            – Liste (S) oder Kacheln, 6 pro Seite (W)
 * Auf der Kachel stehen immer nur die Favoriten.
 */
import { useEffect, useState } from 'react';
import { Seg } from './parts';
import type { ListStyle } from './round2';
import { PlanKachel, type FirstPage, type Props } from './round4';

type SceneView = 'S' | 'W';
type View = { list: ListStyle; first: FirstPage; scenes: SceneView };
const LS_KEY = 'aura.shutterfloors.preview.view';
const DEFAULT: View = { list: 'L', first: 'today', scenes: 'W' };

function readView(): View {
    try {
        const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as Partial<View> | null;
        if (v) {
            return {
                list: v.list === 'A' ? 'A' : 'L',
                first: v.first === 'next' ? 'next' : 'today',
                scenes: v.scenes === 'S' ? 'S' : 'W',
            };
        }
    } catch {
        /* Vorschau-Komfort, darf fehlen */
    }
    return DEFAULT;
}

function ViewCard({ view, setView }: { view: View; setView: (v: View) => void }) {
    return (
        <div className="rpp-card rpp-pad">
            <span className="rpp-label">Ansicht</span>
            <span className="rpp-hint">Listen hier im Fenster</span>
            <Seg<ListStyle>
                size="sm"
                value={view.list}
                options={[
                    { value: 'A', label: 'kompakt' },
                    { value: 'L', label: 'mit Rollladen-Namen' },
                ]}
                onChange={(list) => setView({ ...view, list })}
            />
            <span className="rpp-hint">Erste Seite der Kachel</span>
            <Seg<FirstPage>
                size="sm"
                value={view.first}
                options={[
                    { value: 'today', label: 'Heute' },
                    { value: 'next', label: 'Nächste 3' },
                ]}
                onChange={(first) => setView({ ...view, first })}
            />
            <span className="rpp-hint">Szenen auf der Kachel</span>
            <Seg<SceneView>
                size="sm"
                value={view.scenes}
                options={[
                    { value: 'S', label: 'Liste' },
                    { value: 'W', label: 'Kacheln, 6 pro Seite' },
                ]}
                onChange={(scenes) => setView({ ...view, scenes })}
            />
        </div>
    );
}

export function KachelX({ model }: Props) {
    const [view, setView] = useState<View>(readView);
    useEffect(() => {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(view));
        } catch {
            /* egal */
        }
    }, [view]);
    return (
        <PlanKachel
            model={model}
            listStyle={view.list}
            first={view.first}
            favOnly
            layout={view.scenes === 'S' ? 'list' : 2}
            paged={view.scenes === 'W'}
            extraOpts={<ViewCard view={view} setView={setView} />}
        />
    );
}
