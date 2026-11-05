import { dayLabel, hhmm, type PlanEntry, type PlanModel } from '../planner/planModel';
import { nextRun, statusText } from '../planner/PlanWindows';

export type Route =
    | { v: 'list' }
    | { v: 'plan' }
    | { v: 'scenes' }
    | { v: 'settings' }
    | { v: 'scene'; id: string | null }
    | { v: 'entry'; id: string | null; preset?: Partial<PlanEntry> };
/** Eintrag im Stapel; uid macht den Schlüssel auch bei erneutem Öffnen derselben Seite eindeutig. */
export type StackEntry = Route & { uid: number };
export interface PageInfo {
    title: string;
    subtitle: string;
    status: string;
}

/** Titel, alter Fenster-Untertitel (A: Fußnote) und Statuszeile (C), wie im bisherigen PlanSheet. */
export function pageInfo(r: Route, m: PlanModel): PageInfo {
    switch (r.v) {
        case 'plan': {
            const st = statusText(m);
            const n = nextRun(m);
            return {
                title: 'Zeitplan',
                subtitle: st,
                status: n ? `${st} · ${dayLabel(n.date, m.today)} ${hhmm(n.occ.min)}` : st,
            };
        }
        case 'scenes': {
            const t = `${m.scenes.length} Szenen`;
            return { title: 'Szenen', subtitle: t, status: t };
        }
        case 'settings':
            return { title: 'Einstellungen', subtitle: 'Zeitplan', status: 'Zeitplan' };
        case 'scene': {
            const t = 'Welche Rollläden fahren wohin?';
            return { title: (r.id && m.sceneOf(r.id)?.name) || 'Neue Szene', subtitle: t, status: t };
        }
        case 'entry': {
            const t = 'Was fährt wann?';
            const known = !!r.id && m.entries.some((x) => x.id === r.id);
            return { title: known ? 'Zeitpunkt bearbeiten' : 'Neuer Zeitpunkt', subtitle: t, status: t };
        }
        default:
            return { title: 'Rollläden', subtitle: '', status: '' };
    }
}
