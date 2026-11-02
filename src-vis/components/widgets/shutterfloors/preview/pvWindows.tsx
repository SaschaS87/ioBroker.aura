/**
 * Reihe C (Runde 41–65, 02.11.2026): die Fenster Zeitplan und Szenen im
 * Look von Entwurf 35, fuenf Fassungen 61–65, nur Dev-Vorschau.
 *
 * Gleiches Verhalten wie PlanWindows.tsx (Produktion), nur die Startseiten
 * der beiden Fenster und die Einstellungen sind neu gezeichnet. Fenster-
 * Geruest und Editoren (Szene, Zeitpunkt) kommen unveraendert aus
 * editors.tsx und bekommen ihren Look per CSS ueber html[data-pv-c].
 *
 * Alle Funktionen bleiben: naechste Fahrt antippen, Heute aussetzen, Plan
 * aus/an, Zeitpunkte mit Schalter, Zeitpunkt hinzufuegen, Feiertagsregel,
 * naechster Feiertag, Sonnenzeiten, Szenen sofort fahren (Favoriten/Weitere),
 * Stift zum Bearbeiten, Neue Szene.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
    AlarmClock,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
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
    type PlanEntry,
    type PlanModel,
    type Scene,
    type SceneIcon,
} from '../planner/planModel';
import { DayLetters, SceneGlyph, Seg, Toggle } from '../planner/parts';
import { PlanSheet, type SheetView } from '../planner/editors';
import { countdown, namesLine, nextRun, statusText, type Tab, type TilesRender } from '../planner/PlanWindows';

export const WIN_LOOKS: { key: string; name: string; desc: string }[] = [
    {
        key: '61',
        name: 'Gruppen mit Schaltern',
        desc: 'Wie die Einstellungen-App: Gruppen, farbige Symbole je Zeitpunkt, „Zeitplan" und „Heute aussetzen" als Schalter, Feiertage zum Abhaken.',
    },
    {
        key: '62',
        name: 'Kurzbefehle-Kacheln',
        desc: 'Nächste Fahrt als große Karte mit zwei Knöpfen, Szenen als farbige Kacheln wie in der Kurzbefehle-App.',
    },
    {
        key: '63',
        name: 'Ruhig',
        desc: 'Aufbau wie 61, aber ohne bunte Quadrate: graue Symbole, Farbe nur bei Schaltern und Knöpfen.',
    },
    {
        key: '64',
        name: 'Tages-Zeitleiste',
        desc: 'Zeitpunkte als Zeitleiste des heutigen Tages mit „jetzt"-Marke. Szenen als Liste mit Fahr-Knopf.',
    },
    {
        key: '65',
        name: 'Große Überschrift',
        desc: 'Fensterkopf mit großer Überschrift, Inhalt wie 61, Szenen als runde Symbole wie im Kontrollzentrum.',
    },
];

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

function trig(e: PlanEntry): string {
    if (e.trigger.kind === 'time') return e.trigger.time;
    const base = e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang';
    const o = e.trigger.offset;
    return o === 0 ? base : `${base} ${o > 0 ? '+' : '−'}${Math.abs(o)} min`;
}

function emptyText(m: PlanModel): string {
    if (!m.master) return 'Zeitplan ist ausgeschaltet.';
    return m.entries.length ? 'Nichts geplant.' : 'Noch keine Zeitpunkte.';
}

// ── Bausteine ──────────────────────────────────────────────────────────

/** Farbiges Quadrat; in 63 nur ein graues Symbol. */
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

/** Merk-Einstellung je Geraet (localStorage), wie frueher die Ansicht-Schalter. */
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
/** Szenen-Darstellung: Wahl aus den Einstellungen, sonst wie der Entwurf. */
function sceneLookFor(view: SceneView, look: string): string {
    if (view === 'kacheln') return '62';
    if (view === 'liste') return look === '62' || look === '65' ? '61' : look;
    return look;
}

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

type W = { m: PlanModel; setView: (v: SheetView) => void; look: string };

function sortedEntries(m: PlanModel) {
    const sun = m.sunFor(m.today);
    return [...m.entries].sort((a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min);
}

// ── Zeitplan ───────────────────────────────────────────────────────────

function NextHero({ m, setView, look }: W) {
    const n = nextRun(m);
    if (look === '62') {
        return (
            <div className="pw-hero">
                <span className="pw-hero-label">Als Nächstes</span>
                {n ? (
                    <button
                        type="button"
                        className="pw-hero-main"
                        onClick={() => setView({ v: 'entry', id: n.occ.entry.id })}
                    >
                        <span className="pw-hero-time">{hhmm(n.occ.min)}</span>
                        <span className="pw-hero-what">{m.targetName(n.occ.entry.target)}</span>
                        <span className="pw-hero-sub">
                            <span className="pw-pill">{countdown(m, n)}</span>
                            {dayLabel(n.date, m.today)} · {namesLine(m, n.occ.entry.target, 2)}
                        </span>
                    </button>
                ) : (
                    <span className="pw-sub">{emptyText(m)}</span>
                )}
                <div className="pw-hero-actions">
                    <button
                        type="button"
                        className={`pw-cap${m.pausedToday ? ' is-on' : ''}`}
                        onClick={() => m.setPausedToday(!m.pausedToday)}
                    >
                        <Pause size={15} />
                        {m.pausedToday ? 'Heute wieder an' : 'Heute aussetzen'}
                    </button>
                    <button
                        type="button"
                        className={`pw-cap${m.master ? '' : ' is-on'}`}
                        onClick={() => m.setMaster(!m.master)}
                    >
                        <Power size={15} />
                        {m.master ? 'Plan aus' : 'Plan an'}
                    </button>
                </div>
            </div>
        );
    }
    return (
        <>
            <GH>Als Nächstes</GH>
            <div className="pw-group">
                {n ? (
                    <GRow
                        cls="pw-row--next"
                        lead={<Sq color={TRIG_COLOR[n.occ.entry.trigger.kind]}>{trigIcon(n.occ.entry, 17)}</Sq>}
                        title={
                            <>
                                <span className="pw-next-time">{hhmm(n.occ.min)}</span>
                                <span className="pw-next-what">{m.targetName(n.occ.entry.target)}</span>
                            </>
                        }
                        sub={`${dayLabel(n.date, m.today)}, ${countdown(m, n)} · ${namesLine(m, n.occ.entry.target, 2)}`}
                        right={<Chev />}
                        onClick={() => setView({ v: 'entry', id: n.occ.entry.id })}
                    />
                ) : (
                    <GRow title={<span className="pw-muted">{emptyText(m)}</span>} />
                )}
            </div>
        </>
    );
}

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

function EntryList({ m, setView }: W) {
    const entries = sortedEntries(m);
    return (
        <>
            <GH>Alle Zeitpunkte</GH>
            <div className="pw-group">
                {entries.length === 0 && <GRow title={<span className="pw-muted">Noch keine Zeitpunkte.</span>} />}
                {entries.map((e) => (
                    <GRow
                        key={e.id}
                        cls={e.enabled ? '' : 'is-off'}
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
                                <DayLetters days={e.days} dim={!e.enabled} />
                                <span className="pw-ell">{namesLine(m, e.target, 2)}</span>
                            </span>
                        }
                        right={<Toggle on={e.enabled} onChange={() => m.toggleEntry(e.id)} label="Zeitpunkt aktiv" />}
                        onClick={() => setView({ v: 'entry', id: e.id })}
                    />
                ))}
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
        </>
    );
}

/**
 * 64: Zeitpunkte als heutige Zeitleiste, „jetzt" an der richtigen Stelle.
 * Ersetzt „Als Nächstes": die nächste Fahrt ist hervorgehoben und trägt den
 * Countdown. Bei „Heute aussetzen" sind die noch ausstehenden heutigen
 * Fahrten ausgegraut. Nur eingeschaltete Zeitpunkte stehen im Ablauf, ohne
 * Schalter; ausgeschaltete liegen zugeklappt darunter (Saschas Wunsch
 * 02.11.2026), ein- und ausgeschaltet wird im Zeitpunkt unter „Aktiv".
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

function PlanHome(p: W) {
    const { m, look } = p;
    return (
        <>
            {look !== '64' && <NextHero {...p} />}
            {look !== '62' && <Switches m={m} />}
            {look === '64' ? <Timeline {...p} /> : <EntryList {...p} />}
        </>
    );
}

function PlanSettings({ m, look }: { m: PlanModel; look: string }) {
    const [view, setViewPref] = usePref<SceneView>(KEY_SCENE_VIEW, '');
    const shown = sceneLookFor(view, look) === '62' ? 'kacheln' : 'liste';
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
            {look === '62' ? (
                <div className="pw-group pw-pad">
                    <Seg<HolidayMode> size="md" value={m.holidayMode} options={opts} onChange={m.setHolidayMode} />
                </div>
            ) : (
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
            )}
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
                        { value: 'liste', label: 'Szenen als Liste', sub: 'eine Zeile je Szene, wie 61' },
                        {
                            value: 'kacheln',
                            label: 'Szenen als Kacheln',
                            sub: 'farbige Kacheln, zwei nebeneinander, wie 62',
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

function SceneList({ m, setView, edit, list, add, look }: W & { edit: boolean; list: Scene[]; add: boolean }) {
    const { flash, fire } = useFlash();
    const tapScene = (s: Scene) => {
        if (edit) return setView({ v: 'scene', id: s.id });
        m.runScene(s.id);
        fire(s.id);
    };
    const newBtnLabel = 'Neue Szene';

    if (look === '62') {
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
    if (look === '65') {
        return (
            <div className="pw-rounds">
                {list.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`pw-round${flash === s.id ? ' is-flash' : ''}${edit ? ' is-edit' : ''}`}
                        style={{ ['--sq' as string]: SCENE_COLOR[s.icon] ?? '#0a84ff' }}
                        onClick={() => tapScene(s)}
                    >
                        <span className="pw-round-ico">
                            <SceneGlyph icon={s.icon} size={26} />
                            {edit && (
                                <span className="pw-round-badge">
                                    <Pencil size={11} />
                                </span>
                            )}
                        </span>
                        <span className="pw-round-name">{s.name}</span>
                        <span className="pw-round-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 1)}</span>
                    </button>
                ))}
                {edit && add && (
                    <button
                        type="button"
                        className="pw-round pw-round--add"
                        onClick={() => setView({ v: 'scene', id: null })}
                    >
                        <span className="pw-round-ico">
                            <Plus size={24} />
                        </span>
                        <span className="pw-round-name">{newBtnLabel}</span>
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
                        ) : look === '64' ? (
                            <span className="pw-go">
                                <Play size={13} fill="currentColor" /> Fahren
                            </span>
                        ) : (
                            <span className="pw-play">
                                <Play size={13} fill="currentColor" />
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

function ScenesHome(p: W & { edit: boolean }) {
    const { m, edit } = p;
    const [view] = usePref<SceneView>(KEY_SCENE_VIEW, '');
    const [more, setMore] = usePref<'0' | '1'>(KEY_SCENE_MORE, '0');
    const q = { ...p, look: sceneLookFor(view, p.look) };
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

// ── Fenster ────────────────────────────────────────────────────────────

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

export function PvPlanWindows({
    model: m,
    look,
    renderTiles,
}: {
    model: PlanModel;
    look: string;
    renderTiles: TilesRender;
}) {
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
        home = <ScenesHome m={m} setView={setView} edit={edit} look={look} />;
        headerRight = (
            <HeadBtn label={edit ? 'Fertig' : 'Szenen bearbeiten'} onClick={() => setEdit(!edit)}>
                {edit ? <Check size={20} /> : <Pencil size={18} />}
            </HeadBtn>
        );
    } else if (opts) {
        title = 'Einstellungen';
        subtitle = 'Zeitplan';
        home = <PlanSettings m={m} look={look} />;
    } else {
        home = <PlanHome m={m} setView={setView} look={look} />;
        headerRight = (
            <HeadBtn label="Einstellungen" onClick={() => setOpts(true)}>
                <Settings size={19} />
            </HeadBtn>
        );
    }

    return (
        <>
            {renderTiles(m, open)}
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
                    home={<div className={`pw-home pw-${look}`}>{home}</div>}
                />
            )}
        </>
    );
}
