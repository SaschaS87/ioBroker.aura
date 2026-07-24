import { create } from 'zustand';

/**
 * Shared height mode for the responsive room-climate bars (experimental
 * "Wohnklima v1" tab). A single in-tab switcher writes the mode here and every
 * roomclimate widget that opted in (options.responsiveHeight === true) reads it,
 * so all bars re-render together. Persisted to localStorage so the choice
 * survives a reload while testing on the phone.
 *
 * Widgets WITHOUT options.responsiveHeight ignore this store entirely — the
 * original "Wohnklima" tab keeps its fixed grid-derived height.
 */
export type RoomClimateHeightMode = 'fixed' | 'fill' | 'scaled';

const STORAGE_KEY = 'aura-roomclimate-heightmode';

function loadMode(): RoomClimateHeightMode {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'fixed' || v === 'fill' || v === 'scaled') return v;
    } catch {
        /* localStorage unavailable (private mode / SSR) — fall back to default */
    }
    return 'scaled';
}

interface RoomClimateHeightStore {
    mode: RoomClimateHeightMode;
    setMode: (mode: RoomClimateHeightMode) => void;
}

export const useRoomClimateHeightStore = create<RoomClimateHeightStore>()((set) => ({
    mode: loadMode(),
    setMode: (mode) => {
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            /* ignore persistence failure */
        }
        set({ mode });
    },
}));
