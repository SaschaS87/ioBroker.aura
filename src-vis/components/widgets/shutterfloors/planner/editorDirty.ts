/**
 * Änderungs-Erkennung der Editoren (Feature 30, Phase 2): "Sichern" ist grau, bis sich gegenüber dem
 * Ausgangsstand etwas geändert hat. Reine Funktionen, ohne React.
 */
import type { PlanEntry, PlanModel, Scene, SceneIcon } from './planModel';

export type SceneTargets = Record<string, { closed: number; slat?: number }>;
export type SceneDraft = { name: string; icon: SceneIcon; favorite: boolean; targets: SceneTargets };

/** Ausgangsstand einer Szene, so wie der Editor sie lädt. Neue Szene: leer. */
export function sceneDraftOf(scene: Scene | undefined, model: Pick<PlanModel, 'deviceOf'>): SceneDraft {
    return {
        name: scene?.name ?? '',
        icon: scene?.icon ?? 'sun',
        favorite: scene?.favorite ?? false,
        targets: Object.fromEntries(
            (scene?.targets ?? []).map((t) => [
                t.key,
                { closed: t.closed, slat: model.deviceOf(t.key)?.hasSlat ? (t.slat ?? 0) : undefined },
            ]),
        ),
    };
}

export function sameSceneDraft(a: SceneDraft, b: SceneDraft): boolean {
    if (a.name.trim() !== b.name.trim()) return false;
    if (a.icon !== b.icon) return false;
    if (!!a.favorite !== !!b.favorite) return false;
    const ka = Object.keys(a.targets);
    const kb = Object.keys(b.targets);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => {
        const x = a.targets[k];
        const y = b.targets[k];
        return !!y && x.closed === y.closed && (x.slat ?? null) === (y.slat ?? null);
    });
}

/** Zeitpunkt in fester Schlüsselreihenfolge; quiet false und fehlend gelten gleich. */
function normEntry(e: PlanEntry) {
    const t = e.target;
    return {
        id: e.id,
        days: e.days.map(Boolean),
        trigger: {
            kind: e.trigger.kind,
            time: e.trigger.time,
            offset: e.trigger.offset,
            earliest: e.trigger.earliest ?? null,
            latest: e.trigger.latest ?? null,
        },
        target:
            t.kind === 'scene'
                ? { kind: 'scene', sceneId: t.sceneId }
                : { kind: 'device', key: t.key, closed: t.closed },
        enabled: !!e.enabled,
        quiet: !!e.quiet,
    };
}

export function sameEntry(a: PlanEntry, b: PlanEntry): boolean {
    return JSON.stringify(normEntry(a)) === JSON.stringify(normEntry(b));
}
