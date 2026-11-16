/**
 * UI-Facelift, Entwurfsphase Garten (nur Dev-Vorschau, nur bei „Neu" im gelben Umschalter).
 *
 * Vier Entwürfe derselben Seite aus den gemeinsamen Bausteinen (aura-fl-section, -card, -row, -foot):
 *   A  Liste, Kreis als Unterseite   Kreise als Zeilen, ein Tipp schiebt die Seite des Kreises herein
 *   B  Alles auf einer Seite         je Kreis eine Karte mit Modus, Terminen und Handbetrieb
 *   C  Übersicht, Kreis als Pop-up   Kreise mit Bodenfeuchte rechts, ein Tipp öffnet ein Pop-up von unten
 *   D  Nach Aufgabe sortiert         „Von Hand gießen", „Automatik", „Zeitplan" (Unterseite), „Wetter und Boden"
 *
 * Daten und Schreibwege sind die der heutigen Seite (Garten2Widget reicht sie herein): Kreise über
 * useSprinkleCircle, Wetter über useSprinkleWeather, Termine über useGartenPlanData. Termin-Pop-up
 * (GartenEventModal) und Regensperre (Garten2SettingsSheet) sind die vorhandenen Bausteine, nur über die
 * Brücken-Datei GartenFacelift.css im neuen Aussehen.
 *
 * Die gelbe Leiste „Zustand" (Echt / Beispiel / Läuft) gehört nicht zum Entwurf: Bei „Beispiel" und „Läuft"
 * werden Termine, Modus, Gießen und Stoppen nur in der Anzeige nachgespielt, nichts geht an den Pi.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertTriangle,
    CalendarClock,
    ChevronDown,
    ChevronRight,
    CloudRain,
    Droplets,
    Minus,
    Play,
    Plus,
    SlidersHorizontal,
    Sprout,
    Square,
    SunMedium,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import type { TimerEvent, TimerWeekday } from '../../../types';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import { getObjectDirect } from '../../../hooks/useIoBroker';
import { IosActionSheet, IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import { useSheetDismiss } from '../useSheetDismiss';
import { GartenEventModal } from '../garten/GartenEventModal';
import { eventTime } from '../garten/GartenScheduleList';
import { GartenSwitch } from '../garten/GartenSwitch';
import {
    clampMinutes,
    DEFAULT_MANUAL_MINUTES,
    MAX_MINUTES,
    MIN_MINUTES,
    PARALLEL_HINT,
    TIMER_MODE_MOISTURE_HINT,
} from '../garten/gartenConstants';
import type { CircleMode, CircleStatus } from '../garten/useSprinkleCircle';
import type { CircleProbeData } from './Garten2Widget';
import { countdownToSeconds, PLACEHOLDER_WATER_AMOUNT } from './Garten2Hero';
import { Garten2SettingsSheet } from './Garten2SettingsSheet';
import { slotKeys, type GartenPlanEntry } from './gartenPlanModel';
import type { GartenPlanData } from './useGartenPlanData';
import type { SprinkleWeather } from './useSprinkleWeather';
import { GARTEN_SCENES, useGartenSceneStore, type GartenDraft, type GartenScene } from './gartenDraft';
import './GartenFacelift.css';

type Draft = Exclude<GartenDraft, 'ALT'>;

export interface GartenFaceliftProps {
    draft: Draft;
    instance: string;
    circles: CircleProbeData[];
    weather: SprinkleWeather;
    plan: GartenPlanData;
    /** Termine und Schalter bedienbar (nicht im Bearbeitungsmodus des Admins). */
    interactive: boolean;
    /** Anlage schaltbar (Modus, Handbetrieb, Regensperre); in der Dev-Vorschau false. */
    plantInteractive: boolean;
    confirmManualStart: boolean;
    manualDefaultMinutes: number;
    showSoilMoisture: boolean;
    /** Dev-Vorschau sperrt Schreibbefehle an die Anlage (Hinweis am Seitenende). */
    devBlocked: boolean;
}

/** Ein Kreis, wie ihn die Entwürfe brauchen; bei „Beispiel" mit nachgespielten Aktionen. */
interface GfCircle {
    name: string;
    label: string;
    mode: CircleMode;
    status: CircleStatus;
    countdown: string;
    runningTime: string;
    soil: number | null;
    lastOn: string;
    setMode: (next: 'evaporation' | 'schedule') => void;
    start: (minutes: number) => void;
    stop: () => void;
}

// ── Rechnen und Texte ────────────────────────────────────────────────────────

const WEEKDAY_SHORT: Record<TimerWeekday, string> = {
    mon: 'Mo',
    tue: 'Di',
    wed: 'Mi',
    thu: 'Do',
    fri: 'Fr',
    sat: 'Sa',
    sun: 'So',
};
const WEEKDAY_ORDER: TimerWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** Reihenfolge von `Date.getDay()`: 0 = Sonntag. */
const WEEKDAY_INDEX: Record<TimerWeekday, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Nächster geplanter Start unter den aktiven Terminen (Regel wie nextEventText der heutigen Seite). */
function nextRun(events: TimerEvent[], now: Date): { at: number; text: string } | null {
    let best: { at: number; text: string } | null = null;
    for (const ev of events) {
        if (!ev.enabled || ev.trigger.kind !== 'time') continue;
        for (const d of ev.weekdays) {
            const at = new Date(now.getTime());
            at.setHours(ev.trigger.hour, ev.trigger.minute, 0, 0);
            let delta = (WEEKDAY_INDEX[d] - now.getDay() + 7) % 7;
            if (delta === 0 && at.getTime() <= now.getTime()) delta = 7;
            at.setDate(at.getDate() + delta);
            if (!best || at.getTime() < best.at)
                best = { at: at.getTime(), text: `${WEEKDAY_SHORT[d]} ${eventTime(ev)}` };
        }
    }
    return best;
}

function daysText(days: TimerWeekday[]): string {
    const on = WEEKDAY_ORDER.filter((d) => days.includes(d));
    if (on.length === 0) return 'Kein Wochentag';
    if (on.length === 7) return 'Täglich';
    const key = on.join(',');
    if (key === 'mon,tue,wed,thu,fri') return 'Mo–Fr';
    if (key === 'sat,sun') return 'Sa, So';
    return on.map((d) => WEEKDAY_SHORT[d]).join(' ');
}

const num = (v: number, digits: number) => v.toLocaleString('de-DE', { maximumFractionDigits: digits });
const mm = (v: number | null, digits = 1) => (v === null ? '–' : `${num(v, digits)} mm`);
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)} %`);

// ── Zustand zum Ansehen (nur Dev-Vorschau) ───────────────────────────────────

function sampleEntries(names: string[]): GartenPlanEntry[] {
    const ev = (
        id: string,
        kreis: string | undefined,
        hour: number,
        minute: number,
        minutes: number,
        weekdays: TimerWeekday[],
        extra: Partial<GartenPlanEntry> = {},
    ): GartenPlanEntry[] =>
        kreis
            ? [
                  {
                      id: `bsp-${id}`,
                      kreis,
                      enabled: true,
                      weekdays,
                      trigger: { kind: 'time', hour, minute },
                      filter: 'all-days',
                      value: String(minutes),
                      ...extra,
                  },
              ]
            : [];
    return [
        ...ev('1', names[0], 6, 0, 10, ['mon', 'wed', 'fri']),
        ...ev('2', names[0], 20, 30, 5, WEEKDAY_ORDER, { label: 'Nachguss', enabled: false }),
        ...ev('3', names[1], 6, 0, 12, ['mon', 'wed', 'fri']),
        ...ev('4', names[2], 5, 30, 8, ['tue', 'thu', 'sat']),
    ];
}

interface Sim {
    modes: Record<string, 'evaporation' | 'schedule'>;
    run: { name: string; minutes: number; startMs: number } | null;
    entries: GartenPlanEntry[];
    scharf: Record<string, boolean>;
    ansaat: Record<string, boolean>;
}

function freshSim(scene: GartenScene, names: string[]): Sim {
    return {
        modes: Object.fromEntries(names.map((n, i) => [n, i === 1 ? 'evaporation' : 'schedule'])),
        run: scene === 'LAEUFT' && names[0] ? { name: names[0], minutes: 10, startMs: Date.now() - 150_000 } : null,
        entries: sampleEntries(names),
        scharf: {},
        ansaat: {},
    };
}

/**
 * Liefert Kreise und Zeitplan für die Anzeige. Bei „Echt" unverändert die Werte und Schreibwege der
 * heutigen Seite. Bei „Beispiel"/„Läuft" ein lokaler Stand, der nichts schreibt.
 */
function useGartenView(p: GartenFaceliftProps): {
    circles: GfCircle[];
    plan: GartenPlanData;
    plantInteractive: boolean;
    interactive: boolean;
    sim: boolean;
} {
    const scene = useGartenSceneStore((s) => s.scene);
    const simOn = scene !== 'ECHT';
    const names = p.circles.map((c) => c.sprinkleName);
    const namesKey = names.join('|');
    const [sim, setSim] = useState<Sim>(() => freshSim(scene, names));
    // Sekundentakt nur, solange im Beispiel ein Kreis läuft
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        setNowMs(Date.now());
        setSim(freshSim(scene, namesKey ? namesKey.split('|') : []));
    }, [scene, namesKey]);
    const simRunning = simOn && sim.run !== null;
    useEffect(() => {
        if (!simRunning) return;
        const t = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [simRunning]);
    const left = sim.run
        ? Math.min(
              sim.run.minutes * 60,
              Math.max(0, sim.run.minutes * 60 - Math.floor((nowMs - sim.run.startMs) / 1000)),
          )
        : 0;
    useEffect(() => {
        if (simRunning && left === 0) setSim((s) => ({ ...s, run: null }));
    }, [simRunning, left]);

    if (!simOn) {
        return {
            circles: p.circles.map((c) => ({
                name: c.sprinkleName,
                label: c.label,
                mode: c.state.mode,
                status: c.state.status,
                countdown: c.state.countdown,
                runningTime: c.state.runningTime,
                soil: c.state.soilMoisture,
                lastOn: c.state.lastOn,
                setMode: c.state.setMode,
                start: c.state.startManual,
                stop: c.state.stop,
            })),
            plan: p.plan,
            plantInteractive: p.plantInteractive,
            interactive: p.interactive,
            sim: false,
        };
    }

    const circles: GfCircle[] = p.circles.map((c) => {
        const running = sim.run?.name === c.sprinkleName;
        return {
            name: c.sprinkleName,
            label: c.label,
            mode: sim.modes[c.sprinkleName] ?? 'schedule',
            status: running ? 'running' : 'idle',
            countdown: running
                ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
                : '',
            runningTime: running ? String(sim.run?.minutes ?? '') : '00:00',
            soil: c.state.soilMoisture,
            lastOn: c.state.lastOn,
            setMode: (next) => setSim((s) => ({ ...s, modes: { ...s.modes, [c.sprinkleName]: next } })),
            start: (minutes) => {
                setNowMs(Date.now());
                setSim((s) => ({ ...s, run: { name: c.sprinkleName, minutes, startMs: Date.now() } }));
            },
            stop: () => setSim((s) => ({ ...s, run: null })),
        };
    });
    const local = (change: (s: Sim) => Sim) => {
        setSim(change);
        return Promise.resolve();
    };
    const plan: GartenPlanData = {
        ...p.plan,
        entries: sim.entries,
        entriesError: null,
        scriptStale: false,
        settingsLoaded: true,
        settings: { aktiv: true, scharf: sim.scharf, ansaat: sim.ansaat },
        saveEntry: (e) =>
            local((s) => ({
                ...s,
                entries: s.entries.some((x) => x.id === e.id)
                    ? s.entries.map((x) => (x.id === e.id ? e : x))
                    : [...s.entries, e],
            })),
        deleteEntry: (id) => local((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== id) })),
        toggleEntry: (id) =>
            local((s) => ({ ...s, entries: s.entries.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) })),
        setScharf: (k, v) => local((s) => ({ ...s, scharf: { ...s.scharf, [k]: v } })),
        setAnsaat: (k, v) => local((s) => ({ ...s, ansaat: { ...s.ansaat, [k]: v } })),
    };
    return { circles, plan, plantInteractive: true, interactive: true, sim: true };
}

/** Regensperre der Adapter-Instanz, nur lesen (für den Wert in der Zeile; geändert wird im Pop-up). */
function useThresholdRain(instance: string, reload: number): number | null {
    const [value, setValue] = useState<number | null>(null);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const obj = (await getObjectDirect(`system.adapter.${instance}`, { skipCache: reload > 0 })) as {
                native?: { thresholdRain?: unknown };
            } | null;
            const raw = obj?.native?.thresholdRain;
            if (!cancelled) setValue(typeof raw === 'number' ? raw : null);
        })();
        return () => {
            cancelled = true;
        };
    }, [instance, reload]);
    return value;
}

// ── Gemeinsamer Zusammenhang der Seite ───────────────────────────────────────

interface Ctx {
    circles: GfCircle[];
    weather: SprinkleWeather;
    plan: GartenPlanData;
    interactive: boolean;
    plantInteractive: boolean;
    confirm: boolean;
    minutes: number;
    showSoil: boolean;
    collisions: Set<string>;
    now: Date;
    eventsOf: (name: string) => GartenPlanEntry[];
    scharf: (name: string) => boolean;
    ansaat: (name: string) => boolean;
    /** Laufen die Termine dieses Kreises überhaupt (Zeitplan-Modus oder Neuansaat)? */
    termineLaufen: (c: GfCircle) => boolean;
    run: (job: Promise<void>) => void;
    edit: (c: GfCircle, entry: GartenPlanEntry | 'new') => void;
}

/** Kurzstand eines Kreises für die Unterzeile. */
function circleSub(c: GfCircle, x: Ctx): string {
    if (c.status === 'running') return `Läuft${c.countdown ? ` · noch ${c.countdown}` : ''}`;
    if (c.status === 'waiting') return 'Wartet, ein anderer Kreis läuft';
    if (c.mode === 'unknown') return 'Modus unbekannt';
    const ansaat = x.ansaat(c.name);
    if (c.mode === 'evaporation' && !ansaat) return 'Verdunstung';
    const head = c.mode === 'evaporation' ? 'Verdunstung · Neuansaat' : 'Zeitplan';
    if (!x.scharf(c.name)) return `${head} · pausiert`;
    const next = nextRun(x.eventsOf(c.name), x.now);
    return `${head} · ${next ? `nächster Lauf ${next.text}` : 'kein Termin'}`;
}

/** „Nächster Lauf" oder „Pausiert" für Kreise, deren Termine laufen; sonst null. */
function nextLabel(c: GfCircle, x: Ctx): string | null {
    if (!x.termineLaufen(c)) return null;
    if (!x.scharf(c.name)) return 'Pausiert';
    return nextRun(x.eventsOf(c.name), x.now)?.text ?? 'Kein Termin';
}

const PLAN_FOOT =
    'Aus pausiert alle Termine dieses Kreises. Bei Neuansaat laufen die Termine auch im Verdunstungsmodus, z. B. 4× 5 Min. täglich.';

// ── Seite ────────────────────────────────────────────────────────────────────

type Sub = { kind: 'circle'; name: string } | { kind: 'plan' } | null;

export function GartenFacelift(p: GartenFaceliftProps) {
    const { draft } = p;
    const view = useGartenView(p);
    const scene = useGartenSceneStore((s) => s.scene);
    const setScene = useGartenSceneStore((s) => s.setScene);

    const [sub, setSub] = useState<Sub>(null);
    const [sheet, setSheet] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsSeen, setSettingsSeen] = useState(0);
    const [editing, setEditing] = useState<{ c: GfCircle; entry: GartenPlanEntry | 'new' } | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const threshold = useThresholdRain(p.instance, settingsSeen);

    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen oder Entwurf gewechselt: wieder auf der Übersicht
    useEffect(() => {
        if (hidden) setSub(null);
    }, [hidden]);
    useEffect(() => {
        setSub(null);
        setSheet(null);
    }, [draft]);

    // Minutentakt für „nächster Lauf"
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(t);
    }, []);

    const { circles, plan } = view;
    // Kollisionserkennung wie auf der heutigen Seite: zwei aktive Termine zur selben Wochentag-Uhrzeit
    const collisions = useMemo(() => {
        const names = new Set(circles.map((c) => c.name));
        const buckets = new Map<string, string[]>();
        for (const ev of plan.entries) {
            if (!ev.enabled || !names.has(ev.kreis)) continue;
            for (const key of slotKeys(ev)) buckets.set(key, [...(buckets.get(key) ?? []), ev.id]);
        }
        const hit = new Set<string>();
        for (const ids of buckets.values()) if (ids.length > 1) for (const id of ids) hit.add(id);
        return hit;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [circles.map((c) => c.name).join('|'), plan.entries]);

    const x: Ctx = {
        circles,
        weather: p.weather,
        plan,
        interactive: view.interactive,
        plantInteractive: view.plantInteractive,
        confirm: p.confirmManualStart,
        minutes: p.manualDefaultMinutes || DEFAULT_MANUAL_MINUTES,
        showSoil: p.showSoilMoisture,
        collisions,
        now,
        eventsOf: (name) => plan.entries.filter((e) => e.kreis === name),
        scharf: (name) => plan.settings.scharf[name] !== false,
        ansaat: (name) => plan.settings.ansaat[name] === true,
        termineLaufen: (c) => c.mode === 'schedule' || plan.settings.ansaat[c.name] === true,
        run: (job) => {
            job.then(() => setSaveError(null)).catch((e: unknown) =>
                setSaveError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'),
            );
        },
        edit: (c, entry) => setEditing({ c, entry }),
    };

    const running = circles.find((c) => c.status === 'running') ?? null;
    const subCircle = sub?.kind === 'circle' ? (circles.find((c) => c.name === sub.name) ?? null) : null;
    const sheetCircle = sheet ? (circles.find((c) => c.name === sheet) ?? null) : null;

    const settingsSection = (
        <Section title="Einstellungen">
            <div className="aura-fl-card">
                <button
                    type="button"
                    className="aura-fl-row aura-fl-row--nav gf-navrow"
                    onClick={() => setSettingsOpen(true)}
                >
                    <span className="aura-fl-row-icon gf-ico">
                        <SlidersHorizontal size={20} />
                    </span>
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title gf-row-title">Regensperre</span>
                    </span>
                    <span className="gf-row-val gf-row-val--soft">{threshold === null ? '' : mm(threshold)}</span>
                    <ChevronRight size={18} className="aura-fl-chev" />
                </button>
            </div>
            <p className="aura-fl-foot gf-foot">Ab dieser Regenmenge setzt die Anlage automatisch aus.</p>
        </Section>
    );

    const top = (
        <>
            {/* Nur Dev-Vorschau, kein Teil des Entwurfs */}
            <div className="gf-sim" role="group" aria-label="Zustand zeigen, nur Vorschau">
                <span className="gf-sim-label">Zustand</span>
                {GARTEN_SCENES.map((s) => (
                    <button
                        key={s.key}
                        type="button"
                        className="gf-sim-btn"
                        data-sel={s.key === scene || undefined}
                        aria-pressed={s.key === scene}
                        onClick={() => setScene(s.key)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
            <Section>
                <Head running={running} x={x} />
            </Section>
            <Warnings plan={plan} saveError={saveError} />
        </>
    );

    const devNote = (
        <p className="aura-fl-foot gf-foot gf-devnote">
            {view.sim
                ? 'Beispiel: Termine, Modus, Gießen und Stoppen werden nur in der Vorschau nachgespielt. Wetter und Bodenfeuchte sind echt.'
                : p.devBlocked
                  ? 'Lokale Vorschau: Modus, Handbetrieb und die Regensperre sind hier ausgegraut, sie schalten erst auf dem Pi. Termine gehen nur in die Testdatenpunkte (Garten_Dev) und laufen dort im Trockenlauf.'
                  : null}
        </p>
    );

    let home: ReactNode;
    if (draft === 'A') {
        home = (
            <div className="gf-home">
                {top}
                <Section title="Bewässerungskreise">
                    <div className="aura-fl-card">
                        {circles.map((c) => (
                            <CircleNavRow
                                key={c.name}
                                c={c}
                                x={x}
                                onOpen={() => setSub({ kind: 'circle', name: c.name })}
                            />
                        ))}
                    </div>
                </Section>
                <Section title="Wetter">
                    <WeatherRows x={x} />
                </Section>
                {settingsSection}
                {devNote}
            </div>
        );
    } else if (draft === 'B') {
        home = (
            <div className="gf-home">
                {top}
                <Section title="Wetter">
                    <WeatherTiles x={x} />
                </Section>
                {circles.map((c) => (
                    <CircleInline key={c.name} c={c} x={x} />
                ))}
                {settingsSection}
                {devNote}
            </div>
        );
    } else if (draft === 'C') {
        home = (
            <div className="gf-home">
                {top}
                <Section title="Bewässerungskreise" foot={soilFoot(x)}>
                    <div className="aura-fl-card">
                        {circles.map((c) => (
                            <CircleNavRow key={c.name} c={c} x={x} soilRight onOpen={() => setSheet(c.name)} />
                        ))}
                    </div>
                </Section>
                <Section title="Wetter">
                    <WeatherCompact x={x} />
                </Section>
                {settingsSection}
                {devNote}
            </div>
        );
    } else {
        const total = plan.entries.filter((e) => circles.some((c) => c.name === e.kreis)).length;
        const nexts = circles
            .filter((c) => x.termineLaufen(c) && x.scharf(c.name))
            .map((c) => ({ c, n: nextRun(x.eventsOf(c.name), now) }))
            .filter((v): v is { c: GfCircle; n: { at: number; text: string } } => v.n !== null)
            .sort((a, b) => a.n.at - b.n.at);
        home = (
            <div className="gf-home">
                {top}
                <Section title="Von Hand gießen" foot={PARALLEL_HINT}>
                    <div className="aura-fl-card">
                        {circles.map((c) => (
                            <div key={c.name} className="aura-fl-row gf-manualrow" data-status={c.status}>
                                <span className="aura-fl-row-main">
                                    <span className="aura-fl-row-title gf-row-title">{c.label}</span>
                                    <span className="aura-fl-row-sub">
                                        {c.status === 'running'
                                            ? `Läuft${c.countdown ? ` · noch ${c.countdown}` : ''}`
                                            : c.status === 'waiting'
                                              ? 'Wartet'
                                              : c.lastOn
                                                ? `Zuletzt ${c.lastOn}`
                                                : 'Bereit'}
                                    </span>
                                </span>
                                <Manual c={c} x={x} compact />
                            </div>
                        ))}
                    </div>
                </Section>
                <Section title="Automatik">
                    <div className="aura-fl-card">
                        {circles.map((c) => (
                            <div key={c.name} className="aura-fl-row gf-moderow">
                                <span className="aura-fl-row-main">
                                    <span className="aura-fl-row-title gf-row-title">{c.label}</span>
                                </span>
                                <ModeSeg c={c} x={x} small />
                            </div>
                        ))}
                    </div>
                </Section>
                <Section title="Zeitplan">
                    <div className="aura-fl-card">
                        <button
                            type="button"
                            className="aura-fl-row aura-fl-row--nav gf-navrow"
                            onClick={() => setSub({ kind: 'plan' })}
                        >
                            <span className="aura-fl-row-icon gf-ico">
                                <CalendarClock size={20} />
                            </span>
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title gf-row-title">Termine</span>
                                <span className="aura-fl-row-sub">
                                    {total === 1 ? '1 Termin' : `${total} Termine`}
                                    {nexts[0] ? ` · nächster Lauf ${nexts[0].c.label}, ${nexts[0].n.text}` : ''}
                                </span>
                            </span>
                            <ChevronRight size={18} className="aura-fl-chev" />
                        </button>
                    </div>
                </Section>
                <Section title="Wetter und Boden" foot={soilFoot(x)}>
                    <WeatherRows x={x} withSoil />
                </Section>
                {settingsSection}
                {devNote}
            </div>
        );
    }

    const subNode =
        subCircle !== null ? (
            <div className="ios-page gf-subpage">
                <IosNavBar
                    sticky
                    title={subCircle.label}
                    backLabel="Garten"
                    backFallback="Zurück"
                    onBack={() => setSub(null)}
                />
                <CircleDetail c={subCircle} x={x} />
            </div>
        ) : sub?.kind === 'plan' ? (
            <div className="ios-page gf-subpage">
                <IosNavBar
                    sticky
                    title="Zeitplan"
                    backLabel="Garten"
                    backFallback="Zurück"
                    onBack={() => setSub(null)}
                />
                <Warnings plan={plan} saveError={saveError} />
                {circles.map((c, i) => {
                    const next = nextLabel(c, x);
                    return (
                        <Section
                            key={c.name}
                            title={c.label}
                            right={next ? <span className="gf-headbit">{next}</span> : undefined}
                            foot={
                                i === circles.length - 1
                                    ? `Zeitplan scharf: ${PLAN_FOOT}`
                                    : x.termineLaufen(c)
                                      ? undefined
                                      : 'Verdunstungsmodus: Die Termine laufen erst im Zeitplan-Modus oder bei Neuansaat.'
                            }
                        >
                            <div className="aura-fl-card">
                                <PlanSwitches c={c} x={x} />
                                <EventRows c={c} x={x} />
                            </div>
                        </Section>
                    );
                })}
            </div>
        ) : null;

    const pages = [
        { key: 'home', node: home },
        ...(subNode ? [{ key: `s-${sub?.kind}-${subCircle?.name ?? ''}`, node: subNode }] : []),
    ];

    return (
        <div
            className={`aura-fl-scope gf-page gf-page--${draft.toLowerCase()}`}
            data-gf-draft={draft}
            data-widget-interactive
        >
            <IosStack rootRef={rootRef} pages={pages} depth={subNode ? 1 : 0} sizing="current" manageScroll bleed={6} />

            {sheetCircle && (
                <Sheet title={sheetCircle.label} sub={circleSub(sheetCircle, x)} onClose={() => setSheet(null)}>
                    <CircleDetail c={sheetCircle} x={x} />
                </Sheet>
            )}

            {editing && (
                <GartenEventModal
                    initial={
                        editing.entry === 'new'
                            ? {
                                  id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                  enabled: true,
                                  label: '',
                                  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
                                  trigger: { kind: 'time', hour: 8, minute: 0 },
                                  filter: 'all-days',
                                  value: String(x.minutes),
                              }
                            : editing.entry
                    }
                    circleLabel={editing.c.label}
                    onSave={(ev) => {
                        // `kreis` immer neu setzen: der Dialog kennt das Feld nicht.
                        x.run(plan.saveEntry({ ...ev, kreis: editing.c.name }));
                        setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                    onDelete={
                        editing.entry === 'new'
                            ? undefined
                            : () => {
                                  x.run(plan.deleteEntry((editing.entry as GartenPlanEntry).id));
                                  setEditing(null);
                              }
                    }
                />
            )}

            {settingsOpen && (
                <Garten2SettingsSheet
                    instance={p.instance}
                    anyRunning={p.circles.some((c) => c.state.valveOn === true)}
                    // immer die echte Sperre: Die Regensperre wird nie nachgespielt
                    plantInteractive={p.plantInteractive}
                    onClose={() => {
                        setSettingsOpen(false);
                        setSettingsSeen((n) => n + 1);
                    }}
                />
            )}
        </div>
    );
}

// ── Bausteine der Seite ──────────────────────────────────────────────────────

function Section({
    title,
    right,
    children,
    foot,
}: {
    title?: string;
    right?: ReactNode;
    children: ReactNode;
    foot?: ReactNode;
}) {
    return (
        <section className={`aura-fl-section gf-section${title ? '' : ' gf-section--plain'}`}>
            {title && (
                <div className="aura-fl-section-head gf-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                    {right}
                </div>
            )}
            {children}
            {foot && <p className="aura-fl-foot gf-foot">{foot}</p>}
        </section>
    );
}

function soilFoot(x: Ctx): string | undefined {
    return x.showSoil && x.circles.some((c) => c.mode === 'schedule')
        ? `Bodenfeuchte: ${TIMER_MODE_MOISTURE_HINT}`
        : undefined;
}

/** Kopf-Karte: laufender Kreis (blau, Restzeit groß, Stoppen) oder Ruhezustand mit dem nächsten Lauf. */
function Head({ running, x }: { running: GfCircle | null; x: Ctx }) {
    if (!running) {
        const nexts = x.circles
            .filter((c) => x.termineLaufen(c) && x.scharf(c.name))
            .map((c) => ({ c, n: nextRun(x.eventsOf(c.name), x.now) }))
            .filter((v): v is { c: GfCircle; n: { at: number; text: string } } => v.n !== null)
            .sort((a, b) => a.n.at - b.n.at);
        const waiting = x.circles.find((c) => c.status === 'waiting');
        return (
            <div className="aura-fl-card gf-head" data-state="idle">
                <Droplets className="gf-head-mark" aria-hidden />
                <span className="gf-head-title">Es läuft gerade kein Kreis</span>
                <span className="gf-head-sub">
                    {waiting
                        ? `${waiting.label} wartet auf den Start`
                        : nexts[0]
                          ? `Nächster Lauf: ${nexts[0].c.label}, ${nexts[0].n.text}`
                          : 'Kein Termin geplant'}
                </span>
            </div>
        );
    }
    const total = clampMinutes(running.runningTime) * 60;
    const left = countdownToSeconds(running.countdown) ?? total;
    const fraction = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
    return (
        <div className="aura-fl-card gf-head" data-state="run">
            <Droplets className="gf-head-mark" aria-hidden />
            <span className="gf-head-title">{running.label} wird gegossen</span>
            <span className="gf-head-time">
                <span className="gf-head-time-val">{running.countdown || '–'}</span>
                <span className="gf-head-time-label">verbleibend</span>
            </span>
            <span
                className="gf-head-bar"
                role="img"
                aria-label={`${running.label}, ${running.countdown || '–'} verbleibend`}
            >
                <span className="gf-head-bar-fill" style={{ width: `${Math.round((1 - fraction) * 100)}%` }} />
            </span>
            <span className="gf-head-foot">
                <span className="gf-head-fact">
                    <Droplets size={14} /> {PLACEHOLDER_WATER_AMOUNT}
                </span>
                <button
                    type="button"
                    className="gf-head-stop"
                    onClick={x.plantInteractive ? running.stop : undefined}
                    disabled={!x.plantInteractive}
                >
                    <Square size={13} /> Stoppen
                </button>
            </span>
        </div>
    );
}

/** Warnungen der heutigen Seite (Ausführung aus, Skript läuft nicht, Lese- und Schreibfehler). */
function Warnings({ plan, saveError }: { plan: GartenPlanData; saveError: string | null }) {
    const items: { key: string; title: string; text?: string }[] = [];
    if (plan.settingsLoaded && !plan.settings.aktiv)
        items.push({
            key: 'aus',
            title: 'Zeitplan-Ausführung ist aus',
            text: 'Die Termine werden angezeigt, aber nicht ausgelöst, bis der Zeitplan freigegeben ist.',
        });
    if (plan.scriptStale)
        items.push({
            key: 'skript',
            title: 'Zeitplan-Skript läuft nicht',
            text: 'Das Skript Garten_Zeitplan hat sich seit über 3 Minuten nicht gemeldet. Termine werden derzeit nicht ausgelöst.',
        });
    if (plan.entriesError) items.push({ key: 'lesen', title: `Zeitplan: ${plan.entriesError}` });
    if (saveError) items.push({ key: 'sichern', title: saveError });
    if (items.length === 0) return null;
    return (
        <section className="aura-fl-section gf-section gf-section--plain">
            <div className="aura-fl-card gf-warn" role="status">
                {items.map((w) => (
                    <div key={w.key} className="aura-fl-row gf-warnrow">
                        <span className="aura-fl-row-icon gf-ico gf-ico--warn">
                            <AlertTriangle size={20} />
                        </span>
                        <span className="aura-fl-row-main">
                            <span className="gf-warn-title">{w.title}</span>
                            {w.text && <span className="gf-warn-text">{w.text}</span>}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Zeile eines Kreises, die weiterführt (Unterseite in A, Pop-up in C). */
function CircleNavRow({ c, x, soilRight, onOpen }: { c: GfCircle; x: Ctx; soilRight?: boolean; onOpen: () => void }) {
    const sub = circleSub(c, x);
    return (
        <button type="button" className="aura-fl-row aura-fl-row--nav gf-navrow" onClick={onOpen}>
            <span className="aura-fl-row-icon gf-ico" data-status={c.status}>
                {c.mode === 'evaporation' ? <SunMedium size={20} /> : <Sprout size={20} />}
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title gf-row-title">{c.label}</span>
                <span className="aura-fl-row-sub">
                    {soilRight || !x.showSoil || c.status !== 'idle' ? sub : `${sub} · Boden ${pct(c.soil)}`}
                </span>
            </span>
            {soilRight && x.showSoil && (
                <span className={`gf-row-val${c.mode === 'schedule' ? ' gf-row-val--soft' : ''}`}>{pct(c.soil)}</span>
            )}
            <ChevronRight size={18} className="aura-fl-chev" />
        </button>
    );
}

// ── Wetter: drei Formen ──────────────────────────────────────────────────────

function Trend({ w }: { w: SprinkleWeather }) {
    if (w.etpTrend === 'up')
        return <TrendingUp size={15} className="gf-trend gf-trend--up" aria-label="mehr als gestern" />;
    if (w.etpTrend === 'down')
        return <TrendingDown size={15} className="gf-trend gf-trend--down" aria-label="weniger als gestern" />;
    return null;
}

/** Schlichte Zeilen ohne Symbol (wie „Aktuelle Werte" der Heizung), auf Wunsch mit der Bodenfeuchte je Kreis. */
function WeatherRows({ x, withSoil }: { x: Ctx; withSoil?: boolean }) {
    const w = x.weather;
    const rows: { key: string; label: string; sub?: string; text: ReactNode; soft?: boolean }[] = [
        {
            key: 'et0',
            label: 'Verdunstung heute',
            text: (
                <>
                    {mm(w.etpToday, 2)} <Trend w={w} />
                </>
            ),
        },
        { key: 'et1', label: 'Verdunstung gestern', text: mm(w.etpYesterday, 2) },
        { key: 'r0', label: 'Regen heute', text: mm(w.rainToday) },
        { key: 'r1', label: 'Regen gestern', sub: 'gemessen', text: mm(w.rainYesterday) },
        { key: 'r2', label: 'Regen morgen', sub: 'Prognose', text: mm(w.rainTomorrow) },
        ...(withSoil && x.showSoil
            ? x.circles.map((c) => ({
                  key: `s-${c.name}`,
                  label: `Bodenfeuchte ${c.label}`,
                  text: pct(c.soil),
                  soft: c.mode === 'schedule',
              }))
            : []),
    ];
    return (
        <div className="aura-fl-card">
            {rows.map((r) => (
                <div key={r.key} className="aura-fl-row gf-valrow gf-valrow--plain">
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title gf-row-title">{r.label}</span>
                        {r.sub && <span className="aura-fl-row-sub">{r.sub}</span>}
                    </span>
                    <span className={`gf-row-val${r.soft ? ' gf-row-val--soft' : ''}`}>{r.text}</span>
                </div>
            ))}
        </div>
    );
}

/** Kacheln in einer Karte: oben Verdunstung (2), unten Regen (3). */
function WeatherTiles({ x }: { x: Ctx }) {
    const w = x.weather;
    return (
        <div className="aura-fl-card gf-tiles">
            <div className="gf-tile gf-tile--half">
                <span className="gf-tile-label">Verdunstung heute</span>
                <span className="gf-tile-val">
                    {mm(w.etpToday, 2)} <Trend w={w} />
                </span>
            </div>
            <div className="gf-tile gf-tile--half">
                <span className="gf-tile-label">Verdunstung gestern</span>
                <span className="gf-tile-val">{mm(w.etpYesterday, 2)}</span>
            </div>
            <div className="gf-tile">
                <span className="gf-tile-label">Regen heute</span>
                <span className="gf-tile-val">{mm(w.rainToday)}</span>
            </div>
            <div className="gf-tile">
                <span className="gf-tile-label">gestern</span>
                <span className="gf-tile-val">{mm(w.rainYesterday)}</span>
                <span className="gf-tile-note">gemessen</span>
            </div>
            <div className="gf-tile">
                <span className="gf-tile-label">morgen</span>
                <span className="gf-tile-val">{mm(w.rainTomorrow)}</span>
                <span className="gf-tile-note">Prognose</span>
            </div>
        </div>
    );
}

/** Zwei Zeilen mit Symbol: der heutige Wert rechts, gestern und morgen in der Unterzeile. */
function WeatherCompact({ x }: { x: Ctx }) {
    const w = x.weather;
    return (
        <div className="aura-fl-card">
            <div className="aura-fl-row gf-valrow">
                <span className="aura-fl-row-icon gf-ico">
                    <SunMedium size={20} />
                </span>
                <span className="aura-fl-row-main">
                    <span className="aura-fl-row-title gf-row-title">Verdunstung heute</span>
                    <span className="aura-fl-row-sub">gestern {mm(w.etpYesterday, 2)}</span>
                </span>
                <span className="gf-row-val">
                    {mm(w.etpToday, 2)} <Trend w={w} />
                </span>
            </div>
            <div className="aura-fl-row gf-valrow">
                <span className="aura-fl-row-icon gf-ico">
                    <CloudRain size={20} />
                </span>
                <span className="aura-fl-row-main">
                    <span className="aura-fl-row-title gf-row-title">Regen heute</span>
                    <span className="aura-fl-row-sub">
                        gestern {mm(w.rainYesterday)} · morgen {mm(w.rainTomorrow)}
                    </span>
                </span>
                <span className="gf-row-val">{mm(w.rainToday)}</span>
            </div>
        </div>
    );
}

// ── Bedienen eines Kreises ───────────────────────────────────────────────────

/** Verdunstung / Zeitplan. Läuft der Kreis gerade, fragt ein Auswahlmenü vorher nach (wie bisher). */
function ModeSeg({ c, x, small }: { c: GfCircle; x: Ctx; small?: boolean }) {
    const [pending, setPending] = useState<'evaporation' | 'schedule' | null>(null);
    const known = c.mode !== 'unknown';
    const choose = (next: 'evaporation' | 'schedule') => {
        if (!x.plantInteractive || !known || next === c.mode) return;
        if (c.status === 'running') setPending(next);
        else c.setMode(next);
    };
    return (
        <>
            <div
                className={`gf-seg${small ? ' gf-seg--small' : ''}`}
                role="group"
                aria-label={`Automatik ${c.label}`}
                title={known ? undefined : 'Dieser Kreis hat keinen autoOn-Datenpunkt.'}
            >
                {(['evaporation', 'schedule'] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        className="gf-seg-btn"
                        data-on={c.mode === m || undefined}
                        aria-pressed={c.mode === m}
                        onClick={() => choose(m)}
                        disabled={!x.plantInteractive || !known}
                    >
                        {m === 'evaporation' ? 'Verdunstung' : 'Zeitplan'}
                    </button>
                ))}
            </div>
            <IosActionSheet
                open={pending !== null}
                title="Der Kreis läuft gerade"
                message="Ein Moduswechsel kann ihn sofort stoppen."
                actions={[
                    {
                        key: 'ok',
                        label: 'Trotzdem umschalten',
                        tone: 'destructive',
                        onSelect: () => {
                            if (pending) c.setMode(pending);
                            setPending(null);
                        },
                    },
                ]}
                cancelLabel="Abbrechen"
                onCancel={() => setPending(null)}
            />
        </>
    );
}

/** Handbetrieb: Dauer wählen, „Jetzt gießen" (mit Rückfrage, wenn eingestellt), „Stoppen" ohne Rückfrage. */
function Manual({ c, x, compact }: { c: GfCircle; x: Ctx; compact?: boolean }) {
    const [text, setText] = useState<string>(String(clampMinutes(x.minutes)));
    const [asking, setAsking] = useState(false);
    const minutes = clampMinutes(text);
    const on = x.plantInteractive;
    const running = c.status === 'running';
    const waiting = c.status === 'waiting';
    const startNow = () => {
        setAsking(false);
        c.start(minutes);
    };
    const stepper = (
        <span className="gf-step">
            <button
                type="button"
                className="gf-step-btn"
                onClick={() => setText(String(clampMinutes(minutes - 1)))}
                disabled={!on || minutes <= MIN_MINUTES}
                aria-label="Eine Minute weniger"
            >
                <Minus size={16} />
            </button>
            <input
                type="number"
                className="gf-step-input"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={1}
                inputMode="numeric"
                pattern="[0-9]*"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => setText(String(clampMinutes(text)))}
                disabled={!on}
                aria-label="Dauer in Minuten"
            />
            <span className="gf-step-unit">Min</span>
            <button
                type="button"
                className="gf-step-btn"
                onClick={() => setText(String(clampMinutes(minutes + 1)))}
                disabled={!on || minutes >= MAX_MINUTES}
                aria-label="Eine Minute mehr"
            >
                <Plus size={16} />
            </button>
        </span>
    );
    const ask = (
        <IosActionSheet
            open={asking}
            title={`${c.label} jetzt ${minutes} Minuten gießen?`}
            actions={[{ key: 'ok', label: 'Gießen', tone: 'strong', onSelect: startNow }]}
            cancelLabel="Abbrechen"
            onCancel={() => setAsking(false)}
        />
    );
    const begin = () => (x.confirm ? setAsking(true) : startNow());

    if (compact) {
        return (
            <span className="gf-manual gf-manual--compact">
                {!running && stepper}
                {running ? (
                    <button
                        type="button"
                        className="gf-round gf-round--stop"
                        onClick={c.stop}
                        disabled={!on}
                        aria-label={`${c.label} stoppen`}
                    >
                        <Square size={15} />
                    </button>
                ) : (
                    <button
                        type="button"
                        className="gf-round"
                        onClick={begin}
                        disabled={!on || waiting}
                        aria-label={`${c.label} jetzt gießen`}
                        title={waiting ? 'Ein anderer Kreis läuft gerade' : undefined}
                    >
                        <Play size={16} />
                    </button>
                )}
                {ask}
            </span>
        );
    }
    return (
        <>
            {!running && (
                <div className="aura-fl-row gf-valrow gf-valrow--plain">
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title gf-row-title">Dauer</span>
                    </span>
                    {stepper}
                </div>
            )}
            <div className="aura-fl-row gf-btnrow">
                {running ? (
                    <button type="button" className="gf-btn gf-btn--stop" onClick={c.stop} disabled={!on}>
                        <Square size={15} /> Stoppen
                    </button>
                ) : (
                    <button
                        type="button"
                        className="gf-btn gf-btn--go"
                        onClick={begin}
                        disabled={!on || waiting}
                        title={waiting ? 'Ein anderer Kreis läuft gerade' : undefined}
                    >
                        <Play size={15} /> {waiting ? 'Wartet' : 'Jetzt gießen'}
                    </button>
                )}
            </div>
            {ask}
        </>
    );
}

/** Schalter „Zeitplan scharf" und „Neuansaat" als Zeilen. */
function PlanSwitches({ c, x }: { c: GfCircle; x: Ctx }) {
    const scharf = x.scharf(c.name);
    const ansaat = x.ansaat(c.name);
    return (
        <>
            <div className="aura-fl-row gf-valrow gf-valrow--plain gf-switchrow">
                <span className="aura-fl-row-main">
                    <span className="aura-fl-row-title gf-row-title">Zeitplan scharf</span>
                </span>
                <GartenSwitch
                    on={scharf}
                    disabled={!x.interactive}
                    onToggle={() => x.run(x.plan.setScharf(c.name, !scharf))}
                    label="Zeitplan scharf"
                    title="Zeitplan scharf: aus pausiert alle Termine dieses Kreises"
                />
            </div>
            <div className="aura-fl-row gf-valrow gf-valrow--plain gf-switchrow">
                <span className="aura-fl-row-main">
                    <span className="aura-fl-row-title gf-row-title">Neuansaat</span>
                </span>
                <GartenSwitch
                    on={ansaat}
                    disabled={!x.interactive}
                    onToggle={() => x.run(x.plan.setAnsaat(c.name, !ansaat))}
                    label="Neuansaat"
                    title="Neuansaat: Termine laufen auch im Verdunstungsmodus"
                />
            </div>
        </>
    );
}

/** Terminliste eines Kreises: Antippen bearbeitet, der Schalter rechts schaltet den Termin, unten „Termin hinzufügen". */
function EventRows({ c, x }: { c: GfCircle; x: Ctx }) {
    const events = x.eventsOf(c.name);
    return (
        <>
            {events.length === 0 && (
                <div className="aura-fl-row gf-valrow gf-valrow--plain gf-emptyrow">
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-sub">Noch kein Termin angelegt.</span>
                    </span>
                </div>
            )}
            {events.map((ev) => (
                <div key={ev.id} className={`aura-fl-row gf-evrow${ev.enabled ? '' : ' is-off'}`}>
                    <button
                        type="button"
                        className="gf-ev-main"
                        onClick={x.interactive ? () => x.edit(c, ev) : undefined}
                        disabled={!x.interactive}
                    >
                        <span className="aura-fl-row-title gf-row-title gf-ev-title">
                            {eventTime(ev)}
                            <span className="gf-ev-dur"> · {ev.value || '?'} Min</span>
                            {x.collisions.has(ev.id) && (
                                <span
                                    className="gf-ev-warn"
                                    title={`Startet nacheinander, weil ein anderer Kreis zur selben Zeit geplant ist. ${PARALLEL_HINT}`}
                                >
                                    <AlertTriangle size={15} />
                                </span>
                            )}
                        </span>
                        <span className="aura-fl-row-sub">
                            {daysText(ev.weekdays)}
                            {ev.label ? ` · ${ev.label}` : ''}
                            {x.collisions.has(ev.id) ? ' · startet nacheinander' : ''}
                        </span>
                    </button>
                    <GartenSwitch
                        on={ev.enabled}
                        disabled={!x.interactive}
                        onToggle={() => x.run(x.plan.toggleEntry(ev.id))}
                        label={ev.enabled ? 'Termin aktiv, abschalten' : 'Termin inaktiv, einschalten'}
                        title={ev.enabled ? 'Aktiv' : 'Inaktiv'}
                    />
                </div>
            ))}
            <button
                type="button"
                className="aura-fl-row aura-fl-row--nav gf-addrow"
                onClick={x.interactive ? () => x.edit(c, 'new') : undefined}
                disabled={!x.interactive}
            >
                <Plus size={18} /> Termin hinzufügen
            </button>
        </>
    );
}

/** Zeitplan eines Kreises als zwei Abschnitte: Schalter, dann Termine. */
function PlanBlock({ c, x }: { c: GfCircle; x: Ctx }) {
    const next = nextLabel(c, x);
    return (
        <>
            <Section title="Zeitplan" foot={PLAN_FOOT}>
                <div className="aura-fl-card">
                    <PlanSwitches c={c} x={x} />
                </div>
            </Section>
            <Section
                title="Termine"
                right={next ? <span className="gf-headbit">{next}</span> : undefined}
                foot={
                    x.termineLaufen(c)
                        ? undefined
                        : 'Verdunstungsmodus: Die Termine laufen erst im Zeitplan-Modus oder bei Neuansaat.'
                }
            >
                <div className="aura-fl-card">
                    <EventRows c={c} x={x} />
                </div>
            </Section>
        </>
    );
}

/** Alles zu einem Kreis: Unterseite in A, Inhalt des Pop-ups in C. */
function CircleDetail({ c, x }: { c: GfCircle; x: Ctx }) {
    return (
        <div className="gf-detail">
            <Section title="Automatik">
                <div className="aura-fl-card gf-segcard">
                    <ModeSeg c={c} x={x} />
                </div>
            </Section>
            <Section title="Von Hand gießen" foot={c.status === 'waiting' ? PARALLEL_HINT : undefined}>
                <div className="aura-fl-card">
                    <Manual c={c} x={x} />
                </div>
            </Section>
            <PlanBlock c={c} x={x} />
            <Section title="Boden" foot={x.showSoil && c.mode === 'schedule' ? TIMER_MODE_MOISTURE_HINT : undefined}>
                <div className="aura-fl-card">
                    {x.showSoil && (
                        <div className="aura-fl-row gf-valrow gf-valrow--plain">
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title gf-row-title">Bodenfeuchte</span>
                            </span>
                            <span className={`gf-row-val${c.mode === 'schedule' ? ' gf-row-val--soft' : ''}`}>
                                {pct(c.soil)}
                            </span>
                        </div>
                    )}
                    <div className="aura-fl-row gf-valrow gf-valrow--plain">
                        <span className="aura-fl-row-main">
                            <span className="aura-fl-row-title gf-row-title">Zuletzt gegossen</span>
                        </span>
                        <span className="gf-row-val">{c.lastOn || '–'}</span>
                    </div>
                </div>
            </Section>
        </div>
    );
}

/** B: ein Kreis komplett in einer Karte, die Termine klappen in der Karte auf. */
function CircleInline({ c, x }: { c: GfCircle; x: Ctx }) {
    const [open, setOpen] = useState(false);
    const events = x.eventsOf(c.name);
    const next = nextLabel(c, x);
    const status = c.status === 'running' ? `Läuft · ${c.countdown}` : c.status === 'waiting' ? 'Wartet' : null;
    return (
        <Section
            title={c.label}
            right={status ? <span className="gf-headbit gf-headbit--run">{status}</span> : undefined}
            foot={
                x.ansaat(c.name) && c.mode === 'evaporation'
                    ? 'Neuansaat: Die Termine laufen auch im Verdunstungsmodus.'
                    : undefined
            }
        >
            <div className="aura-fl-card">
                <div className="gf-segcard">
                    <ModeSeg c={c} x={x} />
                </div>
                {x.showSoil && (
                    <div className="aura-fl-row gf-valrow gf-valrow--plain gf-afterseg">
                        <span className="aura-fl-row-main">
                            <span className="aura-fl-row-title gf-row-title">Bodenfeuchte</span>
                            {c.mode === 'schedule' && (
                                <span className="aura-fl-row-sub">{TIMER_MODE_MOISTURE_HINT}</span>
                            )}
                        </span>
                        <span className={`gf-row-val${c.mode === 'schedule' ? ' gf-row-val--soft' : ''}`}>
                            {pct(c.soil)}
                        </span>
                    </div>
                )}
                <button
                    type="button"
                    className="aura-fl-row aura-fl-row--nav gf-valrow gf-valrow--plain gf-foldrow"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                >
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title gf-row-title">Termine</span>
                        <span className="aura-fl-row-sub">
                            {events.length === 0
                                ? 'Keiner angelegt'
                                : events.length === 1
                                  ? '1 Termin'
                                  : `${events.length} Termine`}
                            {next
                                ? ` · ${next === 'Pausiert' ? 'pausiert' : next === 'Kein Termin' ? 'keiner aktiv' : `nächster Lauf ${next}`}`
                                : ''}
                        </span>
                    </span>
                    <ChevronDown size={18} className={`aura-fl-chev gf-fold-chev${open ? ' is-open' : ''}`} />
                </button>
                {open && (
                    <div className="gf-fold">
                        <PlanSwitches c={c} x={x} />
                        <EventRows c={c} x={x} />
                    </div>
                )}
                <div className="aura-fl-row gf-valrow gf-valrow--plain gf-manualrow" data-status={c.status}>
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title gf-row-title">Gießen</span>
                        {c.lastOn && <span className="aura-fl-row-sub">Zuletzt {c.lastOn}</span>}
                    </span>
                    <Manual c={c} x={x} compact />
                </div>
            </div>
        </Section>
    );
}

// ── Pop-up von unten (C) ─────────────────────────────────────────────────────

function Sheet({
    title,
    sub,
    onClose,
    children,
}: {
    title: string;
    sub?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const adminTarget = usePortalTarget();
    const target = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget;
    const { sheetStyle, backdropStyle, scrimClosing, dragHandlers, onBackdropClick, startClose } =
        useSheetDismiss(onClose);
    return createPortal(
        <div
            className="gf-sheet-backdrop aura-scrim"
            data-scrim-closing={scrimClosing}
            style={backdropStyle}
            onClick={onBackdropClick}
        >
            <div className="gf-sheet" style={sheetStyle} role="dialog" aria-modal="true" aria-label={title}>
                <div
                    className="gf-sheet-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="gf-sheet-grip">
                        <div className="gf-sheet-grip-handle" />
                    </div>
                    <div className="gf-sheet-header">
                        <h2 className="gf-sheet-title">{title}</h2>
                        {sub && <p className="gf-sheet-sub">{sub}</p>}
                    </div>
                </div>
                <div className="gf-sheet-body aura-fl-sheet-body">{children}</div>
            </div>
        </div>,
        target,
    );
}
