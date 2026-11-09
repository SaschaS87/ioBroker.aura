import type { PlanEntry, PlanModel } from './planModel';

export type Route =
    | { v: 'list' }
    | { v: 'plan' }
    | { v: 'scenes' }
    | { v: 'settings' }
    | { v: 'scene'; id: string | null }
    | { v: 'entry'; id: string | null; preset?: Partial<PlanEntry> };
/** Eintrag im Stapel; uid macht den Schlüssel auch bei erneutem Öffnen derselben Seite eindeutig. */
export type StackEntry = Route & { uid: number };

/** Titel der Seite (steht im Kopf und als Zurück-Text der Folgeseite). */
export function pageTitle(r: Route, m: PlanModel): string {
    switch (r.v) {
        case 'plan':
            return 'Zeitplan';
        case 'scenes':
            return 'Szenen';
        case 'settings':
            return 'Einstellungen';
        case 'scene':
            return (r.id && m.sceneOf(r.id)?.name) || 'Neue Szene';
        case 'entry': {
            const known = !!r.id && m.entries.some((x) => x.id === r.id);
            return known ? 'Zeitpunkt bearbeiten' : 'Neuer Zeitpunkt';
        }
        default:
            return 'Rollläden';
    }
}
