/**
 * Entwurf des UI-Facelifts (nur Dev-Vorschau): Der gelbe Umschalter wählt „Ist" oder „Neu". Bei „Neu" steht
 * `data-fl-variant` am <body> (gesetzt von FaceliftStage) und schaltet das Raster in facelift-blocks.css ein.
 *
 * Offene Gestaltungsfragen lassen sich im Umschalter einzeln durchklicken (FACELIFT_KNOBS): Jede Wahl steht
 * als eigenes Attribut `data-fl-<name>` am <body> und stellt dort nur ihre Tokens um. Ist eine Frage
 * entschieden, wandert der gewählte Wert als Grundwert ins CSS und der Regler fliegt raus.
 *
 * Nur `react` und `zustand` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { createContext, useContext } from 'react';
import { create } from 'zustand';

export type FaceliftVariant = 'neu';
export type FaceliftChoice = 'IST' | 'NEU';

/** Gespeicherte Wahl lesen. Alles außer „IST" (auch A bis E aus der ersten Entwurfsrunde) wird zu „NEU". */
export function parseChoice(v: string | null): FaceliftChoice {
    return v === 'IST' ? 'IST' : 'NEU';
}

export function choiceToVariant(c: FaceliftChoice): FaceliftVariant | null {
    return c === 'IST' ? null : 'neu';
}

/** Regler des Umschalters: name = Attribut `data-fl-<name>`, erster Wert = Grundwert. */
export const FACELIFT_KNOBS = [
    {
        name: 'icons',
        label: 'Symbole',
        options: [
            { key: 'std', label: 'wie bisher' },
            { key: 'fein', label: 'kleiner' },
            { key: 'zart', label: 'zart' },
        ],
    },
    {
        name: 'radius',
        label: 'Rundung',
        options: [
            { key: 'ios', label: 'iOS 26' },
            { key: 'mittel', label: 'mittel' },
            { key: 'klein', label: 'bisher' },
        ],
    },
    {
        name: 'titles',
        label: 'Titel',
        options: [
            { key: 'ios', label: '15 halbfett' },
            { key: 'leicht', label: '15 normal' },
            { key: 'klein', label: '13 normal' },
        ],
    },
    {
        name: 'more',
        label: '„x weitere"',
        options: [
            { key: 'head', label: 'im Titel' },
            { key: 'row', label: 'als Zeile' },
        ],
    },
] as const;

export type FaceliftKnob = (typeof FACELIFT_KNOBS)[number]['name'];
export type FaceliftOptions = Record<FaceliftKnob, string>;

const OPTIONS_KEY = 'aura.facelift.options';

function readOptions(): FaceliftOptions {
    const out = {} as FaceliftOptions;
    let saved: Record<string, unknown> = {};
    try {
        saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') ?? {};
    } catch {
        /* privater Modus oder kaputter Eintrag: Grundwerte */
    }
    for (const k of FACELIFT_KNOBS) {
        const v = saved[k.name];
        out[k.name] = k.options.some((o) => o.key === v) ? (v as string) : k.options[0].key;
    }
    return out;
}

export const useFaceliftOptionsStore = create<{
    options: FaceliftOptions;
    setOption: (name: FaceliftKnob, value: string) => void;
}>((set, get) => ({
    options: readOptions(),
    setOption: (name, value) => {
        const options = { ...get().options, [name]: value };
        set({ options });
        try {
            localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
        } catch {
            /* privater Modus */
        }
    },
}));

export const FaceliftVariantContext = createContext<FaceliftVariant | null>(null);

/** Aktiver Entwurf; im Pi-Build immer null. */
export function useFaceliftVariant(): FaceliftVariant | null {
    const v = useContext(FaceliftVariantContext);
    return import.meta.env.DEV ? v : null;
}

/** Stand der Regler (nur sinnvoll, wenn useFaceliftVariant() nicht null ist). */
export function useFaceliftOptions(): FaceliftOptions {
    return useFaceliftOptionsStore((s) => s.options);
}
