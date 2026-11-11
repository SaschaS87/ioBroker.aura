/**
 * Entwurf des UI-Facelifts (nur Dev-Vorschau): Der gelbe Umschalter wählt „Ist" oder „Neu". Bei „Neu" steht
 * `data-fl-variant` am <body> (gesetzt von FaceliftStage) und schaltet das Raster in facelift-blocks.css ein.
 *
 * Die Fragen der zweiten Runde (Symbole, Rundung, Titel, „x weitere") sind entschieden und stehen als
 * Grundwerte im CSS; Regler gibt es keine mehr.
 *
 * Nur `react` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { createContext, useContext } from 'react';

export type FaceliftVariant = 'neu';
export type FaceliftChoice = 'IST' | 'NEU';

/** Gespeicherte Wahl lesen. Alles außer „IST" (auch A bis E aus der ersten Entwurfsrunde) wird zu „NEU". */
export function parseChoice(v: string | null): FaceliftChoice {
    return v === 'IST' ? 'IST' : 'NEU';
}

export function choiceToVariant(c: FaceliftChoice): FaceliftVariant | null {
    return c === 'IST' ? null : 'neu';
}

export const FaceliftVariantContext = createContext<FaceliftVariant | null>(null);

/** Aktiver Entwurf; im Pi-Build immer null. */
export function useFaceliftVariant(): FaceliftVariant | null {
    const v = useContext(FaceliftVariantContext);
    return import.meta.env.DEV ? v : null;
}
