/**
 * Rolllaeden-Planer: Kopfgruppe „Zeitplan" und „Szenen" in der Liste, jede
 * Zeile oeffnet ihr eigenes Fenster (Feature 23, Ueberarbeitung 31.10.–
 * 03.11.2026; Feature 27, Fassung 64 „Tages-Zeitleiste", Saschas Wahl).
 *
 * - Zeitplan: Hauptschalter und „Heute aussetzen" als Schalterzeilen, darunter
 *   die Zeitpunkte als Zeitleiste des heutigen Tages mit „jetzt"-Marke. Die
 *   naechste Fahrt ist hervorgehoben und traegt den Countdown. Ausgeschaltete
 *   Zeitpunkte liegen zugeklappt darunter. Feiertagsregel, Sonnenzeiten und
 *   die Wahl der Szenen-Darstellung stehen hinter dem Zahnrad oben rechts.
 * - Szenen: Antippen faehrt sofort, als Liste mit Fahr-Knopf oder als farbige
 *   Kacheln (Wahl in den Einstellungen, gilt je Geraet). „Weitere" klappt ein.
 *   Der Stift oben rechts schaltet aufs Bearbeiten.
 * - Die Editoren (Szene/Zeitpunkt) kommen aus editors.tsx, Loeschen und
 *   Speichern stehen dort als Symbole im Fensterkopf. Ihr Look kommt aus
 *   PlanWindows.css.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
    AlarmClock,
    CalendarClock,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
    Layers,
    Pause,
    Pencil,
    Play,
    Plus,
    Power,
    Settings,
    Sunrise,
    Sunset,
} from 'lucide-react';
import {
    dayLabel,
    fmtDate,
    hhmm,
    nextHoliday,
    triggerMinutes,
    WD_SHORT,
    type HolidayMode,
    type Occurrence,
    type PlanDevice,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type Scene,
    type SceneIcon,
} from './planModel';
import { closedWord, DayLetters, SceneGlyph, Toggle } from './parts';
import { PlanSheet, type SheetView } from './editors';
import './PlanWindows.css';

export type Tab = 'plan' | 'scenes';
type W = { m: PlanModel; setView: (v: SheetView) => void };
type Next = { date: Date; occ: Occurrence };

// ── Texte ──────────────────────────────────────────────────────────────

export function statusText(m: PlanModel): string {
    if (!m.master) return 'Plan aus';
    if (m.pausedToday) return 'heute ausgesetzt';
    return 'Plan aktiv';
}

/** Beteiligte Antriebe eines Ziels in der Reihenfolge der Etagenliste. */
function membersOf(m: PlanModel, tg: PlanTarget): { dev: PlanDevice; closed: number }[] {
    if (tg.kind === 'device') {
        const dev = m.deviceOf(tg.key);
        return dev ? [{ dev, closed: tg.closed }] : [];
    }
    const s = m.sceneOf(tg.sceneId);
    if (!s) return [];
    return m.devices.flatMap((dev) => {
        const t = s.targets.find((x) => x.key === dev.key);
        return t ? [{ dev, closed: t.closed }] : [];
    });
}

/** „ganzes Erdgeschoss, Büro Maxi, Mika +2" – volle Etagen zusammengefasst. */
function namesLine(m: PlanModel, tg: PlanTarget, max = 3): string {
    if (tg.kind === 'device') return `auf ${closedWord(tg.closed)}`;
    const mem = membersOf(m, tg);
    if (mem.length && mem.length === m.devices.length) return `alle ${mem.length} Rollläden`;
    const parts: string[] = [];
    m.floors.forEach((f) => {
        const onFloor = m.devices.filter((d) => d.floor === f);
        const inScene = mem.filter((x) => x.dev.floor === f);
        if (!inScene.length) return;
        if (inScene.length === onFloor.length) parts.push(`ganzes ${f}`);
        else inScene.forEach((x) => parts.push(x.dev.label));
    });
    return parts.slice(0, max).join(', ') + (parts.length > max ? ` +${parts.length - max}` : '');
}

function trig(e: PlanEntry): string {
    if (e.trigger.kind === 'time') return e.trigger.time;
    const base = e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang';
    const o = e.trigger.offset;
    return o === 0 ? base : `${base} ${o > 0 ? '+' : '−'}${Math.abs(o)} min`;
}

export function nextRun(m: PlanModel): Next | null {
    return m.upcoming(1)[0] ?? null;
}

function countdown(m: PlanModel, n: Next): string {
    const t = new Date(n.date.getFullYear(), n.date.getMonth(), n.date.getDate(), 0, n.occ.min);
    const diff = Math.max(0, Math.round((t.getTime() - m.now.getTime()) / 60000));
    if (diff < 60) return `in ${diff} min`;
    const h = Math.floor(diff / 60);
    const r = diff % 60;
    if (h < 24) return `in ${h} Std${r ? ` ${r} min` : ''}`;
    return dayLabel(n.date, m.today);
}

// ── Farben und Symbole ─────────────────────────────────────────────────

const SCENE_COLOR: Record<SceneIcon, string> = {
    sunrise: '#ff9f0a',
    sun: '#f5a623',
    sunset: '#ff6b3d',
    moon: '#5e5ce6',
    home: '#30b05a',
    heat: '#ff453a',
    tv: '#0a84ff',
};

function trigIcon(e: PlanEntry, size = 16) {
    if (e.trigger.kind === 'sunrise') return <Sunrise size={size} />;
    if (e.trigger.kind === 'sunset') return <Sunset size={size} />;
    return <AlarmClock size={size} />;
}
const TRIG_COLOR = { time: '#ff9f0a', sunrise: '#f5a623', sunset: '#5e5ce6' } as const;

// ── Bausteine ──────────────────────────────────────────────────────────

/** Farbiges Quadrat. */
function Sq({ color, children }: { color: string; children: ReactNode }) {
    return (
        <span className="pw-sq" style={{ ['--sq' as string]: color }}>
            {children}
        </span>
    );
}

function GH({ children }: { children: ReactNode }) {
    return <div className="pw-gh">{children}</div>;
}
function GF({ children }: { children: ReactNode }) {
    return <div className="pw-gf">{children}</div>;
}
/** Gruppen-Ueberschrift zum Auf- und Zuklappen, zugeklappt mit Anzahl. */
function FoldGH({
    label,
    count,
    open,
    onToggle,
}: {
    label: string;
    count: number;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            className={`pw-gh pw-gh--fold${open ? ' is-open' : ''}`}
            onClick={onToggle}
            aria-expanded={open}
        >
            <span>
                {label}
                {!open && ` (${count})`}
            </span>
            <ChevronDown size={16} className="pw-gh-chev" />
        </button>
    );
}

/** Merk-Einstellung je Geraet (localStorage). */
function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
    const [v, setV] = useState<T>(() => {
        try {
            return (localStorage.getItem(key) as T | null) ?? fallback;
        } catch {
            return fallback;
        }
    });
    const set = (n: T) => {
        setV(n);
        try {
            localStorage.setItem(key, n);
        } catch {
            /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
        }
    };
    return [v, set];
}
const KEY_SCENE_VIEW = 'aura.shutterfloors.scenes.view';
const KEY_SCENE_MORE = 'aura.shutterfloors.scenes.moreOpen';
type SceneView = '' | 'liste' | 'kacheln';

function GRow({
    lead,
    title,
    sub,
    right,
    onClick,
    cls = '',
}: {
    lead?: ReactNode;
    title: ReactNode;
    sub?: ReactNode;
    right?: ReactNode;
    onClick?: () => void;
    cls?: string;
}) {
    const inner = (
        <>
            {lead}
            <span className="pw-main">
                <span className="pw-title">{title}</span>
                {sub && <span className="pw-sub">{sub}</span>}
            </span>
            {right}
        </>
    );
    if (!onClick) return <div className={`pw-row ${cls}`}>{inner}</div>;
    return (
        <div
            className={`pw-row pw-row--tap ${cls}`}
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            {inner}
        </div>
    );
}

const Chev = () => <ChevronRight size={18} className="pw-chev" />;

function sortedEntries(m: PlanModel) {
    const sun = m.sunFor(m.today);
    return [...m.entries].sort((a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min);
}

// ── Zeitplan ───────────────────────────────────────────────────────────

/** „Zeitplan" (Hauptschalter) und „Heute aussetzen" als Schalterzeilen. */
function Switches({ m }: { m: PlanModel }) {
    return (
        <>
            <div className="pw-group">
                <GRow
                    lead={
                        <Sq color="#30b05a">
                            <Power size={16} />
                        </Sq>
                    }
                    title="Zeitplan"
                    sub={m.master ? 'fährt alle aktiven Zeitpunkte' : 'aus, es fährt nichts automatisch'}
                    right={<Toggle on={m.master} onChange={m.setMaster} label="Zeitplan an" />}
                />
                <GRow
                    lead={
                        <Sq color="#ff9f0a">
                            <Pause size={16} />
                        </Sq>
                    }
                    title="Heute aussetzen"
                    sub={
                        m.pausedToday ? 'heute fährt nichts mehr, ab morgen wieder' : 'für den Rest des Tages pausieren'
                    }
                    right={<Toggle on={m.pausedToday} onChange={m.setPausedToday} label="Heute aussetzen" />}
                />
            </div>
        </>
    );
}

/**
 * Zeitpunkte als heutige Zeitleiste, „jetzt" an der richtigen Stelle.
 * Die naechste Fahrt ist hervorgehoben und traegt den Countdown. Bei „Heute
 * aussetzen" sind die noch ausstehenden heutigen Fahrten ausgegraut. Nur
 * eingeschaltete Zeitpunkte stehen im Ablauf, ohne Schalter; ausgeschaltete
 * liegen zugeklappt darunter (Saschas Wunsch 02.11.2026), ein- und
 * ausgeschaltet wird im Zeitpunkt unter „Aktiv".
 */
function Timeline({ m, setView }: W) {
    const [offOpen, setOffOpen] = useState(false);
    const sun = m.sunFor(m.today);
    const nowMin = m.now.getHours() * 60 + m.now.getMinutes();
    const wd = (m.today.getDay() + 6) % 7;
    const all = sortedEntries(m);
    const off = all.filter((e) => !e.enabled);
    const items = all.filter((e) => e.enabled).map((e) => ({ e, min: triggerMinutes(e.trigger, sun).min }));
    const nowAt = items.findIndex((x) => x.min > nowMin);
    const n = nextRun(m);
    const isTodayNext = n !== null && n.date.toDateString() === m.today.toDateString();
    const nextWhen = (() => {
        if (!n) return '';
        const c = countdown(m, n);
        const d = dayLabel(n.date, m.today);
        return isTodayNext || c === d ? c : `${d}, ${c}`;
    })();
    const out: ReactNode[] = [];
    items.forEach((x, i) => {
        if (i === nowAt) out.push(<NowMark key="now" t={hhmm(nowMin)} />);
        const today = x.e.days[wd] && m.master;
        const paused = today && m.pausedToday && x.min > nowMin;
        const isNext = n !== null && n.occ.entry.id === x.e.id;
        out.push(
            <div
                key={x.e.id}
                className={`pw-tl-item${x.min <= nowMin ? ' is-past' : ''}${today ? '' : ' is-skip'}${
                    paused ? ' is-paused' : ''
                }${isNext ? ' is-next' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setView({ v: 'entry', id: x.e.id })}
            >
                <span className="pw-tl-time">
                    {hhmm(x.min)}
                    {x.e.trigger.kind !== 'time' && (
                        <small>{x.e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'}</small>
                    )}
                </span>
                <span className="pw-tl-dot" style={{ ['--sq' as string]: TRIG_COLOR[x.e.trigger.kind] }}>
                    {trigIcon(x.e, 13)}
                </span>
                <span className="pw-main">
                    <span className="pw-title">{m.targetName(x.e.target)}</span>
                    {isNext && <span className="pw-tl-when">{nextWhen}</span>}
                    <span className="pw-sub pw-inline">
                        {!paused && <DayLetters days={x.e.days} />}
                        <span className="pw-ell">
                            {paused ? 'heute ausgesetzt' : today ? namesLine(m, x.e.target, 2) : 'heute nicht'}
                        </span>
                    </span>
                </span>
                <Chev />
            </div>,
        );
    });
    if (nowAt === -1) out.push(<NowMark key="now" t={hhmm(nowMin)} />);
    return (
        <>
            <GH>Heute im Ablauf</GH>
            <div className="pw-group pw-tl">
                {out}
                <GRow
                    cls="pw-row--add"
                    lead={
                        <span className="pw-add-ico">
                            <Plus size={18} />
                        </span>
                    }
                    title="Zeitpunkt hinzufügen"
                    onClick={() => setView({ v: 'entry', id: null })}
                />
            </div>
            {off.length > 0 && (
                <FoldGH label="Ausgeschaltet" count={off.length} open={offOpen} onToggle={() => setOffOpen(!offOpen)} />
            )}
            {off.length > 0 && offOpen && (
                <>
                    <div className="pw-group">
                        {off.map((e) => (
                            <GRow
                                key={e.id}
                                cls="is-off"
                                lead={<Sq color={TRIG_COLOR[e.trigger.kind]}>{trigIcon(e)}</Sq>}
                                title={
                                    <>
                                        {trig(e)}
                                        <span className="pw-dot">·</span>
                                        {m.targetName(e.target)}
                                    </>
                                }
                                sub={
                                    <span className="pw-inline">
                                        <DayLetters days={e.days} dim />
                                        <span className="pw-ell">fährt nicht</span>
                                    </span>
                                }
                                right={<Chev />}
                                onClick={() => setView({ v: 'entry', id: e.id })}
                            />
                        ))}
                    </div>
                    <GF>Fahren nie, bis du sie im Zeitpunkt unter „Aktiv“ wieder einschaltest.</GF>
                </>
            )}
        </>
    );
}
function NowMark({ t }: { t: string }) {
    return (
        <div className="pw-tl-now" aria-label={`jetzt ${t}`}>
            <span>jetzt {t}</span>
        </div>
    );
}

export function PlanHome({ m, setView }: W) {
    return (
        <>
            <Switches m={m} />
            <Timeline m={m} setView={setView} />
        </>
    );
}

/** Unterseite hinter dem Zahnrad. */
export function PlanSettings({ m }: { m: PlanModel }) {
    const [view, setViewPref] = usePref<SceneView>(KEY_SCENE_VIEW, '');
    const shown = view === 'kacheln' ? 'kacheln' : 'liste';
    const nh = nextHoliday(m.today);
    const sun = m.sunFor(m.today);
    const opts: { value: HolidayMode; label: string; sub: string }[] = [
        { value: 'sunday', label: 'wie Sonntag', sub: 'es fährt, was sonntags fährt' },
        { value: 'normal', label: 'normal', sub: 'wie ein gewöhnlicher Wochentag' },
        { value: 'skip', label: 'nichts fahren', sub: 'der Plan ruht am Feiertag' },
    ];
    return (
        <>
            <GH>An Feiertagen</GH>
            <div className="pw-group" role="radiogroup">
                {opts.map((o) => (
                    <GRow
                        key={o.value}
                        title={o.label}
                        sub={o.sub}
                        right={
                            m.holidayMode === o.value ? (
                                <Check size={20} className="pw-check" />
                            ) : (
                                <span className="pw-check-space" />
                            )
                        }
                        onClick={() => m.setHolidayMode(o.value)}
                        cls={m.holidayMode === o.value ? 'is-picked' : ''}
                    />
                ))}
            </div>
            <GF>Gilt für alle Zeitpunkte. Die Feiertage rechnet die App für Baden-Württemberg.</GF>
            <GH>Zur Orientierung</GH>
            <div className="pw-group">
                <GRow
                    lead={
                        <Sq color="#ff453a">
                            <CalendarDays size={16} />
                        </Sq>
                    }
                    title="Nächster Feiertag"
                    sub={nh.name}
                    right={
                        <span className="pw-value">
                            {WD_SHORT[(nh.date.getDay() + 6) % 7]} {fmtDate(nh.date)}
                        </span>
                    }
                />
                <GRow
                    lead={
                        <Sq color="#f5a623">
                            <Sunrise size={16} />
                        </Sq>
                    }
                    title="Sonnenaufgang heute"
                    sub={sun.fromPi ? undefined : 'gerechnet'}
                    right={<span className="pw-value">{hhmm(sun.sunrise)}</span>}
                />
                <GRow
                    lead={
                        <Sq color="#5e5ce6">
                            <Sunset size={16} />
                        </Sq>
                    }
                    title="Sonnenuntergang heute"
                    sub={sun.fromPi ? undefined : 'gerechnet'}
                    right={<span className="pw-value">{hhmm(sun.sunset)}</span>}
                />
            </div>
            <GH>Darstellung</GH>
            {/* Zwei Zeilen mit Haken wie „An Feiertagen": die kleine Kapsel war kaum lesbar (Sascha, 02.11.). */}
            <div className="pw-group" role="radiogroup" aria-label="Szenen anzeigen als">
                {(
                    [
                        { value: 'liste', label: 'Szenen als Liste', sub: 'eine Zeile je Szene' },
                        {
                            value: 'kacheln',
                            label: 'Szenen als Kacheln',
                            sub: 'farbige Kacheln, zwei nebeneinander',
                        },
                    ] as const
                ).map((o) => (
                    <GRow
                        key={o.value}
                        title={o.label}
                        sub={o.sub}
                        right={
                            shown === o.value ? (
                                <Check size={20} className="pw-check" />
                            ) : (
                                <span className="pw-check-space" />
                            )
                        }
                        onClick={() => setViewPref(o.value)}
                        cls={shown === o.value ? 'is-picked' : ''}
                    />
                ))}
            </div>
            <GF>Gilt nur auf diesem Gerät.</GF>
        </>
    );
}

// ── Szenen ─────────────────────────────────────────────────────────────

function useFlash() {
    const [flash, setFlash] = useState<string | null>(null);
    const fire = (id: string) => {
        setFlash(id);
        window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 900);
    };
    return { flash, fire };
}

/** Antippen faehrt sofort; im Bearbeiten-Modus oeffnet es den Editor. */
function SceneList({
    m,
    setView,
    edit,
    list,
    add,
    kacheln,
}: W & { edit: boolean; list: Scene[]; add: boolean; kacheln: boolean }) {
    const { flash, fire } = useFlash();
    const tapScene = (s: Scene) => {
        if (edit) return setView({ v: 'scene', id: s.id });
        m.runScene(s.id);
        fire(s.id);
    };
    const newBtnLabel = 'Neue Szene';

    if (kacheln) {
        return (
            <div className="pw-tiles">
                {list.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`pw-tile${flash === s.id ? ' is-flash' : ''}${edit ? ' is-edit' : ''}`}
                        style={{ ['--sq' as string]: SCENE_COLOR[s.icon] ?? '#0a84ff' }}
                        onClick={() => tapScene(s)}
                    >
                        <span className="pw-tile-top">
                            <SceneGlyph icon={s.icon} size={22} />
                            <span className="pw-tile-act">
                                {edit ? <Pencil size={14} /> : <Play size={14} fill="currentColor" />}
                            </span>
                        </span>
                        <span className="pw-tile-name">{s.name}</span>
                        <span className="pw-tile-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}</span>
                    </button>
                ))}
                {edit && add && (
                    <button
                        type="button"
                        className="pw-tile pw-tile--add"
                        onClick={() => setView({ v: 'scene', id: null })}
                    >
                        <Plus size={22} />
                        <span className="pw-tile-sub">{newBtnLabel}</span>
                    </button>
                )}
            </div>
        );
    }
    return (
        <div className="pw-group">
            {list.map((s) => (
                <GRow
                    key={s.id}
                    cls={flash === s.id ? 'is-flash' : ''}
                    lead={
                        <Sq color={SCENE_COLOR[s.icon] ?? '#0a84ff'}>
                            <SceneGlyph icon={s.icon} size={16} />
                        </Sq>
                    }
                    title={s.name}
                    sub={namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}
                    right={
                        edit ? (
                            <Chev />
                        ) : (
                            <span className="pw-go">
                                <Play size={13} fill="currentColor" /> Fahren
                            </span>
                        )
                    }
                    onClick={() => tapScene(s)}
                />
            ))}
            {edit && add && (
                <GRow
                    cls="pw-row--add"
                    lead={
                        <span className="pw-add-ico">
                            <Plus size={18} />
                        </span>
                    }
                    title={newBtnLabel}
                    onClick={() => setView({ v: 'scene', id: null })}
                />
            )}
        </div>
    );
}

export function ScenesHome({ m, setView, edit }: W & { edit: boolean }) {
    const [view] = usePref<SceneView>(KEY_SCENE_VIEW, '');
    const [more, setMore] = usePref<'0' | '1'>(KEY_SCENE_MORE, '0');
    const kacheln = view === 'kacheln';
    const q = { m, setView, edit, kacheln };
    const fav = m.scenes.filter((s) => s.favorite);
    const rest = m.scenes.filter((s) => !s.favorite);
    const showRest = rest.length > 0 || edit;
    // „Weitere" klappt nur neben Favoriten; beim Bearbeiten ist alles offen.
    const foldable = fav.length > 0 && !edit;
    const restOpen = !foldable || more === '1';
    return (
        <>
            {fav.length > 0 && <GH>Favoriten</GH>}
            {fav.length > 0 && <SceneList {...q} list={fav} add={false} />}
            {showRest &&
                (foldable ? (
                    <FoldGH
                        label="Weitere"
                        count={rest.length}
                        open={restOpen}
                        onToggle={() => setMore(restOpen ? '0' : '1')}
                    />
                ) : (
                    <GH>{fav.length ? 'Weitere' : 'Szenen'}</GH>
                ))}
            {showRest && restOpen && <SceneList {...q} list={rest} add />}
            {edit ? (
                <GF>Szene antippen zum Bearbeiten. Ob sie Favorit ist, stellst du in der Szene ein.</GF>
            ) : m.scenes.length ? (
                <GF>Antippen fährt die Szene sofort, auch wenn der Zeitplan aus ist.</GF>
            ) : (
                <GF>Noch keine Szenen – über den Stift anlegen.</GF>
            )}
        </>
    );
}

// ── Kopfgruppe und Fenster ─────────────────────────────────────────────

/** Kopfgruppe der Liste: zwei Zeilen „Zeitplan" und „Szenen". */
export function PlanTiles({ m, open }: { m: PlanModel; open: (t: Tab) => void }) {
    const n = nextRun(m);
    return (
        <div className="sf-group">
            <button type="button" className="sf-row sf-row--nav" onClick={() => open('plan')}>
                <span className="sf-ico is-orange">
                    <CalendarClock size={16} />
                </span>
                <span className="sf-main">
                    <span className="sf-name">Zeitplan</span>
                    <span className="sf-val">
                        {n
                            ? `${statusText(m)} · ${dayLabel(n.date, m.today)} ${hhmm(n.occ.min)}`
                            : statusText(m)}
                    </span>
                </span>
                <ChevronRight size={18} className="sf-chev" />
            </button>
            <button type="button" className="sf-row sf-row--nav" onClick={() => open('scenes')}>
                <span className="sf-ico is-purple">
                    <Layers size={16} />
                </span>
                <span className="sf-main">
                    <span className="sf-name">Szenen</span>
                    <span className="sf-val">{m.scenes.length} angelegt</span>
                </span>
                <ChevronRight size={18} className="sf-chev" />
            </button>
        </div>
    );
}

function HeadBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="rpp-back rpp-head-btn pw-head-btn"
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            {children}
        </button>
    );
}

export function PlanWindows({ model: m }: { model: PlanModel }) {
    const [tab, setTab] = useState<Tab | null>(null);
    const [seq, setSeq] = useState(0);
    const [view, setView] = useState<SheetView>({ v: 'home' });
    const [opts, setOpts] = useState(false);
    const [edit, setEdit] = useState(false);
    useEffect(() => {
        setOpts(false);
        setEdit(false);
    }, [seq]);
    const open = (t: Tab) => {
        setSeq((n) => n + 1);
        setView({ v: 'home' });
        setTab(t);
    };

    let title = 'Zeitplan';
    let subtitle = statusText(m);
    let home: ReactNode;
    let headerRight: ReactNode = null;
    if (tab === 'scenes') {
        title = 'Szenen';
        subtitle = `${m.scenes.length} Szenen`;
        home = <ScenesHome m={m} setView={setView} edit={edit} />;
        headerRight = (
            <HeadBtn label={edit ? 'Fertig' : 'Szenen bearbeiten'} onClick={() => setEdit(!edit)}>
                {edit ? <Check size={20} /> : <Pencil size={18} />}
            </HeadBtn>
        );
    } else if (opts) {
        title = 'Einstellungen';
        subtitle = 'Zeitplan';
        home = <PlanSettings m={m} />;
    } else {
        home = <PlanHome m={m} setView={setView} />;
        headerRight = (
            <HeadBtn label="Einstellungen" onClick={() => setOpts(true)}>
                <Settings size={19} />
            </HeadBtn>
        );
    }

    return (
        <>
            <PlanTiles m={m} open={open} />
            {tab && (
                <PlanSheet
                    key={seq}
                    title={title}
                    subtitle={subtitle}
                    view={view}
                    setView={setView}
                    onClose={() => setTab(null)}
                    model={m}
                    headerRight={headerRight}
                    onHomeBack={tab === 'plan' && opts ? () => setOpts(false) : undefined}
                    home={<div className="pw-home">{home}</div>}
                />
            )}
        </>
    );
}
