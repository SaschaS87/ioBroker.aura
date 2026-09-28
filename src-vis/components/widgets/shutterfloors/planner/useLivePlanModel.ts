/**
 * Live-Variante von `usePlanModel` (planModel.ts): baut dieselbe
 * PlanModel-Schnittstelle, aber aus echten Daten statt Beispieldaten —
 * Geraeteliste/Stellungen vom Pi, Szenen/Wochenplan/Einstellungen aus
 * useRollPlanData, Sofort-Fahren ueber den von aussen uebergebenen
 * `runScene` (RollPlanTile.tsx verdrahtet ihn gegen useSceneCommand). Die
 * reine Rechenlogik (Sonnenzeiten, Trigger-Minuten, Feiertage) kommt
 * unveraendert aus planModel.ts — hier wird nur der Rahmen (Devices, Sun,
 * Occurrences, Schreibfunktionen) gegen echte Quellen statt gegen
 * Beispieldaten verdrahtet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShutterFloorDef } from '../types';
import {
    addDays,
    calcSun,
    effectiveWeekday,
    parseHhmm,
    sameDay,
    triggerMinutes,
    type HolidayMode,
    type Occurrence,
    type PlanDevice,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type Scene,
    type SunDay,
} from './planModel';
import type { RollPlanData } from './useRollPlanData';

export interface PiSun {
    sunrise: string | null;
    sunset: string | null;
    dawn: string | null;
    dusk: string | null;
}

export function useLivePlanModel(
    floorsCfg: ShutterFloorDef[],
    positions: Record<string, number | null>,
    piSun: PiSun,
    data: RollPlanData,
    runScene: (id: string) => void,
): PlanModel {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(id);
    }, []);
    const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), [now]);
    const todayStr = useMemo(
        () => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        [today],
    );

    const devices = useMemo<PlanDevice[]>(
        () =>
            floorsCfg.flatMap((f) =>
                f.devices.map((d) => ({
                    key: d.key,
                    label: d.label,
                    kind: d.kind,
                    floor: f.name,
                    hasSlat: !!d.slatDp,
                    hasSlow: !!d.slowPosDp,
                    closed: positions[d.key] ?? null,
                })),
            ),
        [floorsCfg, positions],
    );
    const floors = useMemo(() => floorsCfg.map((f) => f.name), [floorsCfg]);

    const scenes = data.scenes;
    const entries = data.entries;
    const master = data.settings.master;
    const holidayMode = data.settings.holidayMode;
    const pausedToday = data.settings.pausedTodayDate === todayStr;

    const piToday = useMemo(() => {
        const sr = parseHhmm(piSun.sunrise);
        const ss = parseHhmm(piSun.sunset);
        if (sr === null || ss === null) return null;
        return {
            sunrise: sr,
            sunset: ss,
            dawn: parseHhmm(piSun.dawn) ?? sr - 30,
            dusk: parseHhmm(piSun.dusk) ?? ss + 30,
            fromPi: true,
        } as SunDay;
    }, [piSun.sunrise, piSun.sunset, piSun.dawn, piSun.dusk]);

    const sunFor = useCallback((d: Date) => (sameDay(d, today) && piToday ? piToday : calcSun(d)), [today, piToday]);

    const occurrences = useCallback(
        (d: Date): Occurrence[] => {
            const wd = effectiveWeekday(d, holidayMode);
            if (wd === null) return [];
            const sun = sunFor(d);
            return entries
                .filter((e) => e.enabled && e.days[wd])
                .map((e) => {
                    const r = triggerMinutes(e.trigger, sun);
                    return { min: r.min, clamped: r.clamped, entry: e };
                })
                .sort((a, b) => a.min - b.min);
        },
        [entries, holidayMode, sunFor],
    );

    const nowMin = now.getHours() * 60 + now.getMinutes();

    const upcoming = useCallback(
        (limit: number) => {
            const out: { date: Date; occ: Occurrence }[] = [];
            if (!master) return out;
            for (let i = 0; i < 8 && out.length < limit; i++) {
                const d = addDays(today, i);
                if (i === 0 && pausedToday) continue;
                for (const occ of occurrences(d)) {
                    if (i === 0 && occ.min <= nowMin) continue;
                    out.push({ date: d, occ });
                    if (out.length >= limit) break;
                }
            }
            return out;
        },
        [master, pausedToday, occurrences, today, nowMin],
    );

    const nextRunOf = useCallback(
        (entry: PlanEntry) => {
            for (let i = 0; i < 8; i++) {
                const d = addDays(today, i);
                const wd = effectiveWeekday(d, holidayMode);
                if (wd === null || !entry.days[wd]) continue;
                const { min } = triggerMinutes(entry.trigger, sunFor(d));
                if (i === 0 && min <= nowMin) continue;
                return { date: d, min };
            }
            return null;
        },
        [today, holidayMode, sunFor, nowMin],
    );

    const sceneOf = useCallback((id: string) => scenes.find((s) => s.id === id), [scenes]);
    const deviceOf = useCallback((key: string) => devices.find((d) => d.key === key), [devices]);
    const targetName = useCallback(
        (tg: PlanTarget) =>
            tg.kind === 'scene' ? (scenes.find((s) => s.id === tg.sceneId)?.name ?? 'Szene gelöscht') : (devices.find((d) => d.key === tg.key)?.label ?? tg.key),
        [scenes, devices],
    );
    const targetCount = useCallback(
        (tg: PlanTarget) => (tg.kind === 'scene' ? (scenes.find((s) => s.id === tg.sceneId)?.targets.length ?? 0) : 1),
        [scenes],
    );
    const entriesOfScene = useCallback(
        (sceneId: string) => entries.filter((e) => e.target.kind === 'scene' && e.target.sceneId === sceneId),
        [entries],
    );

    const [toast, setToast] = useState<string | null>(null);
    const showToast = useCallback((text: string) => {
        setToast(text);
        window.setTimeout(() => setToast((cur) => (cur === text ? null : cur)), 2600);
    }, []);

    const setMaster = useCallback((v: boolean) => void data.saveSettings({ master: v }), [data]);
    const setPausedToday = useCallback((v: boolean) => void data.saveSettings({ pausedTodayDate: v ? todayStr : null }), [data, todayStr]);
    const setHolidayMode = useCallback((m: HolidayMode) => void data.saveSettings({ holidayMode: m }), [data]);

    const saveScene = useCallback((s: Scene) => void data.saveScene(s), [data]);
    const deleteScene = useCallback((id: string) => void data.deleteScene(id), [data]);
    const toggleFavorite = useCallback(
        (id: string) => {
            const s = scenes.find((x) => x.id === id);
            if (s) void data.saveScene({ ...s, favorite: !s.favorite });
        },
        [scenes, data],
    );
    const saveEntry = useCallback((e: PlanEntry) => void data.saveEntry(e), [data]);
    const deleteEntry = useCallback((id: string) => void data.deleteEntry(id), [data]);
    const toggleEntry = useCallback(
        (id: string) => {
            const e = entries.find((x) => x.id === id);
            if (e) void data.saveEntry({ ...e, enabled: !e.enabled });
        },
        [entries, data],
    );

    return {
        now,
        today,
        devices,
        floors,
        scenes,
        entries,
        master,
        pausedToday,
        holidayMode,
        samples: false,
        sunFor,
        occurrences,
        upcoming,
        nextRunOf,
        sceneOf,
        deviceOf,
        targetName,
        targetCount,
        entriesOfScene,
        setMaster,
        setPausedToday,
        setHolidayMode,
        saveScene,
        deleteScene,
        toggleFavorite,
        saveEntry,
        deleteEntry,
        toggleEntry,
        runScene,
        toast,
        showToast,
    };
}
