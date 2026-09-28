/**
 * Ansicht-Einstellungen der Rolllaeden-Planer-Kachel (Feature 23) — jedes
 * Geraet speichert seine eigene Wahl in localStorage, NICHT auf dem Pi
 * (Sascha, Auftrag: "JEDES GERÄT FÜR SICH speichert").
 *
 * Drei Schalter (aus Runde 5 des inzwischen entfernten Entwurfs):
 *   list   – Listen im Popup kompakt (A) oder mit Rollladen-Namen (L)
 *   first  – Startseite der Kachel: Heute oder die naechsten 3 Fahrten
 *   scenes – Szenen auf der Kachel als Liste (S) oder Kacheln, 6 pro Seite (W)
 *
 * Stilvorbild: store/roomClimateHeightStore.ts (zustand + localStorage,
 * gleiches Muster fuer "geteilter UI-Zustand, geraetelokal persistiert").
 */
import { create } from 'zustand';

export type ListStyle = 'A' | 'L';
export type FirstPage = 'today' | 'next';
export type SceneView = 'S' | 'W';

export interface RollPlanView {
    list: ListStyle;
    first: FirstPage;
    scenes: SceneView;
}

const STORAGE_KEY = 'aura.shutterfloors.planner.view';

const DEFAULT_VIEW: RollPlanView = { list: 'L', first: 'today', scenes: 'W' };

function loadView(): RollPlanView {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const v = JSON.parse(raw) as Partial<RollPlanView>;
            return {
                list: v.list === 'A' ? 'A' : 'L',
                first: v.first === 'next' ? 'next' : 'today',
                scenes: v.scenes === 'S' ? 'S' : 'W',
            };
        }
    } catch {
        /* localStorage nicht verfuegbar (privates Fenster) — Default reicht */
    }
    return DEFAULT_VIEW;
}

interface RollPlanViewStore extends RollPlanView {
    setView: (patch: Partial<RollPlanView>) => void;
}

export const useRollPlanViewStore = create<RollPlanViewStore>()((set, get) => ({
    ...loadView(),
    setView: (patch) => {
        const next: RollPlanView = { list: get().list, first: get().first, scenes: get().scenes, ...patch };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* egal, Anzeige ist trotzdem korrekt fuer diese Sitzung */
        }
        set(next);
    },
}));
