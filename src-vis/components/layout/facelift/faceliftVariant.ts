/**
 * Entwürfe des UI-Facelifts (nur Dev-Vorschau): Der gelbe Umschalter wählt „Ist" oder einen der Entwürfe
 * A bis E. Der gewählte Entwurf steht als `data-fl-variant` am <body> (gesetzt von FaceliftStage) und stellt
 * darüber die Design-Tokens in facelift-blocks.css um. Die wenigen Stellen, an denen sich der Aufbau selbst
 * unterscheidet (Etagenkopf, Status), lesen ihn über useFaceliftVariant().
 *
 * Nur `react` importieren, damit kein Import-Kreis über FaceliftChrome entsteht.
 */
import { createContext, useContext } from 'react';

export type FaceliftVariant = 'a' | 'b' | 'c' | 'd' | 'e';
export type FaceliftChoice = 'IST' | 'A' | 'B' | 'C' | 'D' | 'E';

export const FACELIFT_CHOICES: { key: FaceliftChoice; label: string; name: string }[] = [
    { key: 'IST', label: 'Ist', name: 'Ist-Stand' },
    { key: 'A', label: 'A', name: 'Einstellungen' },
    { key: 'B', label: 'B', name: 'Große Titel' },
    { key: 'C', label: 'C', name: 'Kompakt' },
    { key: 'D', label: 'D', name: 'Etagen-Karten' },
    { key: 'E', label: 'E', name: 'Flache Liste' },
];

/** Gespeicherte Wahl lesen. „NEU" aus der Zeit vor den Entwürfen und alles Unbekannte wird zu A. */
export function parseChoice(v: string | null): FaceliftChoice {
    return FACELIFT_CHOICES.some((c) => c.key === v) ? (v as FaceliftChoice) : 'A';
}

export function choiceToVariant(c: FaceliftChoice): FaceliftVariant | null {
    return c === 'IST' ? null : (c.toLowerCase() as FaceliftVariant);
}

export const FaceliftVariantContext = createContext<FaceliftVariant | null>(null);

/** Aktiver Entwurf; im Pi-Build immer null. */
export function useFaceliftVariant(): FaceliftVariant | null {
    const v = useContext(FaceliftVariantContext);
    return import.meta.env.DEV ? v : null;
}
