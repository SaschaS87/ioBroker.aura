/**
 * Änderungs-Erkennung der Editoren (Feature 30, Phase 2): "Sichern" ist grau, bis sich gegenüber dem
 * Ausgangsstand etwas geändert hat. Reine Funktionen, ohne React.
 */
import type { PlanEntry, PlanModel, Scene, SceneIcon, SceneTarget } from './planModel';

export type SceneTargetDraft = { closed: number; slat?: number; quiet?: true };
export type SceneTargets = Record<string, SceneTargetDraft>;
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
                {
                    closed: t.closed,
                    slat: model.deviceOf(t.key)?.hasSlat ? (t.slat ?? 0) : undefined,
                    ...(t.quiet === true ? { quiet: true as const } : {}),
                },
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
        return !!y && x.closed === y.closed && (x.slat ?? null) === (y.slat ?? null) && !!x.quiet === !!y.quiet;
    });
}

/** Ziele des Entwurfs als Liste fürs Speichern: Schlüsselreihenfolge key, closed, slat, quiet; nie ein Schlüssel mit undefined. */
export function sceneTargetsToList(targets: SceneTargets): SceneTarget[] {
    return Object.entries(targets).map(([key, v]) => {
        const out: SceneTarget = { key, closed: v.closed };
        if (v.slat !== undefined) out.slat = v.slat;
        if (v.quiet === true) out.quiet = true;
        return out;
    });
}

/** Szene aus dem Editor-Entwurf, so wie sie gespeichert wird. */
export function sceneFromDraft(id: string, d: SceneDraft): Scene {
    return {
        id,
        name: d.name.trim() || 'Ohne Namen',
        icon: d.icon,
        favorite: d.favorite,
        targets: sceneTargetsToList(d.targets),
    };
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
