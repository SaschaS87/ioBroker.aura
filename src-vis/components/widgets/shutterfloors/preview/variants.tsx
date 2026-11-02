/**
 * Die zehn Entwuerfe „Rollläden modern" (Runde 31–40, 02.11.2026), nur
 * Dev-Vorschau. Jeder Entwurf zeigt dieselben Funktionen: Zeitplan- und
 * Szenen-Einstieg (Fenster aus PlanWindows), 15 Antriebe nach Etage mit
 * Auf/Stopp/Zu, Antippen oeffnet den Feinregler, Fusszeile mit Datenquellen
 * und Signalstaerke. Keine Etagen-Sammelknoepfe.
 */
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarClock, ChevronRight, Layers, Play } from 'lucide-react';
import { PlanWindows } from '../planner/PlanWindows';
import { SceneGlyph } from '../planner/parts';
import type { ShutterFloorDeviceDef } from '../types';
import { useRowControl } from './useRowControl';
import {
    ActBtns,
    floorShort,
    nextLine,
    planInfo,
    RadioBadge,
    sortedScenes,
    TypeIcon,
    type DevInfo,
    type PvCtx,
    type Variant,
} from './pvParts';

// ── Helfer ─────────────────────────────────────────────────────────────

function tap(fn: () => void) {
    return {
        role: 'button' as const,
        tabIndex: 0,
        onClick: fn,
        onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fn();
            }
        },
    };
}

function Foot({ c }: { c: PvCtx }) {
    return <div className="pv-foot">{c.footer}</div>;
}

type RowProps = { d: ShutterFloorDeviceDef; c: PvCtx };

/** Schlanke Zeile, Grundlage fuer mehrere Entwuerfe (Klasse steuert die Optik). */
function Row({
    d,
    c,
    look = 'round',
    cls = 'pv-row',
}: RowProps & { look?: 'round' | 'seg' | 'glass' | 'plain'; cls?: string }) {
    const r = useRowControl(d);
    return (
        <div
            className={`${cls}${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <span className="pv-row-icon">
                <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={20} />
                <RadioBadge show={r.offline} />
            </span>
            <span className="pv-row-text">
                <span className="pv-row-name">{d.label}</span>
                <span className={`pv-row-status${r.busy ? ' is-busy' : ''}`}>{r.status}</span>
            </span>
            <ActBtns c={r} label={d.label} connected={c.connected} look={look} />
        </div>
    );
}

// ── 31 Home-Kacheln ────────────────────────────────────────────────────

function Tile31({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div
            className={`v31-tile${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <div className="v31-fill" style={{ height: `${r.closed ?? 0}%` }} />
            <div className="v31-top">
                <span className="v31-icon">
                    <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={20} />
                    <RadioBadge show={r.offline} />
                </span>
            </div>
            <div className="v31-text">
                <div className="v31-name">{d.label}</div>
                <div className={`v31-status${r.busy ? ' is-busy' : ''}`}>{r.status}</div>
            </div>
            <ActBtns c={r} label={d.label} connected={c.connected} look="round" size={17} />
        </div>
    );
}

function V31({ c }: { c: PvCtx }) {
    return (
        <>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => (
                    <div className="v31-plan">
                        <button type="button" className="v31-plan-tile" onClick={() => open('plan')}>
                            <span className="v31-plan-icon is-orange">
                                <CalendarClock size={18} />
                            </span>
                            <span className="v31-plan-title">Zeitplan</span>
                            <span className="v31-plan-sub">{planInfo(m).status}</span>
                            <span className="v31-plan-sub">{nextLine(m)}</span>
                        </button>
                        <button type="button" className="v31-plan-tile" onClick={() => open('scenes')}>
                            <span className="v31-plan-icon is-purple">
                                <Layers size={18} />
                            </span>
                            <span className="v31-plan-title">Szenen</span>
                            <span className="v31-plan-sub">{m.scenes.length} angelegt</span>
                            <span className="v31-plan-sub">antippen zum Fahren</span>
                        </button>
                    </div>
                )}
            />
            {c.floors.map((f) => (
                <section key={f.name} className="v31-floor">
                    <h3 className="v31-floor-title">
                        {f.name} <span>{f.devices.length}</span>
                    </h3>
                    <div className="v31-grid">
                        {f.devices.map((d) => (
                            <Tile31 key={d.key} d={d} c={c} />
                        ))}
                    </div>
                </section>
            ))}
            <Foot c={c} />
        </>
    );
}

// ── 32 Kontrollzentrum ─────────────────────────────────────────────────

function Col32({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div className="v32-col">
            <button
                type="button"
                className={`v32-pill${r.busy ? ' is-busy' : ''}${r.unknown ? ' is-unknown' : ''}`}
                onClick={() => c.openSheet(d)}
                aria-label={`${d.label}, ${r.status}`}
            >
                <span className="v32-pill-fill" style={{ height: `${r.closed ?? 0}%` }} />
                <span className="v32-pill-icon">
                    <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={16} />
                    <RadioBadge show={r.offline} />
                </span>
                <span className="v32-pill-val">{r.busy ? '…' : r.short}</span>
            </button>
            <span className="v32-name">{d.label}</span>
            <ActBtns c={r} label={d.label} connected={c.connected} look="mini" size={15} />
        </div>
    );
}

function V32({ c }: { c: PvCtx }) {
    return (
        <>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => {
                    const p = planInfo(m);
                    return (
                        <div className="v32-mods">
                            <button type="button" className="v32-mod v32-mod--btn" onClick={() => open('plan')}>
                                <span className={`v32-mod-circle${p.active ? ' is-on' : ''}`}>
                                    <CalendarClock size={20} />
                                </span>
                                <span className="v32-mod-title">Zeitplan</span>
                                <span className="v32-mod-sub">{p.time ? `${p.day} ${p.time}` : p.status}</span>
                            </button>
                            <button type="button" className="v32-mod v32-mod--btn" onClick={() => open('scenes')}>
                                <span className="v32-mod-circle is-on is-purple">
                                    <Layers size={20} />
                                </span>
                                <span className="v32-mod-title">Szenen</span>
                                <span className="v32-mod-sub">{m.scenes.length} Szenen</span>
                            </button>
                        </div>
                    );
                }}
            />
            {c.floors.map((f) => (
                <section key={f.name} className="v32-mod">
                    <div className="v32-mod-head">{f.name}</div>
                    <div className="v32-grid">
                        {f.devices.map((d) => (
                            <Col32 key={d.key} d={d} c={c} />
                        ))}
                    </div>
                </section>
            ))}
            <Foot c={c} />
        </>
    );
}

// ── 33 Wetter-Stimmung ─────────────────────────────────────────────────

function phaseOf(c: PvCtx): 'night' | 'morning' | 'day' | 'evening' {
    const sun = c.m.sunFor(c.m.today);
    const now = c.m.now.getHours() * 60 + c.m.now.getMinutes();
    if (now < sun.sunrise - 30 || now > sun.sunset + 45) return 'night';
    if (now < sun.sunrise + 120) return 'morning';
    if (now > sun.sunset - 90) return 'evening';
    return 'day';
}

function V33({ c }: { c: PvCtx }) {
    const phase = phaseOf(c);
    return (
        <div className={`v33 v33--${phase}`}>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => {
                    const p = planInfo(m);
                    const sc = sortedScenes(m);
                    return (
                        <>
                            <button type="button" className="v33-hero" onClick={() => open('plan')}>
                                <span className="v33-hero-label">Zeitplan · {p.status}</span>
                                <span className="v33-hero-time">{p.time ?? '–'}</span>
                                <span className="v33-hero-what">{p.what ?? 'Nichts geplant'}</span>
                                {p.countdown && (
                                    <span className="v33-hero-sub">
                                        {p.day} · {p.countdown}
                                    </span>
                                )}
                            </button>
                            <button type="button" className="v33-glass v33-scenes" onClick={() => open('scenes')}>
                                <span className="v33-cap">
                                    <Layers size={13} /> SZENEN
                                </span>
                                <span className="v33-scene-chips">
                                    {sc.slice(0, 3).map((s) => (
                                        <span key={s.id} className="v33-scene-chip">
                                            <SceneGlyph icon={s.icon} size={14} /> {s.name}
                                        </span>
                                    ))}
                                    {!sc.length && <span className="v33-scene-chip">noch keine Szenen</span>}
                                </span>
                            </button>
                        </>
                    );
                }}
            />
            {c.floors.map((f) => (
                <section key={f.name} className="v33-glass">
                    <div className="v33-cap">{f.name.toUpperCase()}</div>
                    {f.devices.map((d) => (
                        <Row key={d.key} d={d} c={c} look="glass" cls="v33-row pv-row" />
                    ))}
                </section>
            ))}
            <Foot c={c} />
        </div>
    );
}

// ── 34 Hausfront ───────────────────────────────────────────────────────

function House34({ c }: { c: PvCtx }) {
    const all = c.floors.flatMap((f) => f.devices.map((d) => ({ d, floor: f.name })));
    const isOG = (n: string) => /ober/i.test(n);
    const og = all.filter((x) => isOG(x.floor) && x.d.kind !== 'dachfenster');
    const roof = all.filter((x) => isOG(x.floor) && x.d.kind === 'dachfenster');
    const eg = all.filter((x) => !isOG(x.floor));
    const W = 360;
    const place = (list: typeof all, y: number, h: number, x0: number, x1: number) => {
        const n = list.length;
        const slot = (x1 - x0) / Math.max(1, n);
        const w = Math.min(30, slot - 8);
        return list.map((x, i) => ({ ...x, x: x0 + slot * i + (slot - w) / 2, y, w, h }));
    };
    const wins = [
        ...place(roof, 50, 22, 150, 210),
        ...place(og, 100, 38, 34, W - 34),
        ...place(eg, 166, x34h(eg), 34, W - 34),
    ];
    return (
        <svg className="v34-house" viewBox={`0 0 ${W} 222`} role="group" aria-label="Hausfront mit allen Rollläden">
            <polygon className="v34-roof" points={`14,88 ${W / 2},14 ${W - 14},88`} />
            <rect className="v34-wall" x="24" y="88" width={W - 48} height="128" rx="4" />
            <line className="v34-split" x1="24" x2={W - 24} y1="152" y2="152" />
            <text className="v34-floor-label" x="30" y="100">
                OG
            </text>
            <text className="v34-floor-label" x="30" y="164">
                EG
            </text>
            {wins.map(({ d, x, y, w, h }) => {
                const i: DevInfo | undefined = c.reg[d.key];
                const closed = i?.closed ?? null;
                return (
                    <g
                        key={d.key}
                        className={`v34-win${i?.busy ? ' is-busy' : ''}${closed === null ? ' is-unknown' : ''}${i?.offline ? ' is-offline' : ''}`}
                        {...tap(() => c.openSheet(d))}
                        aria-label={`${d.label}, ${i?.status ?? 'unbekannt'}`}
                    >
                        <title>{`${d.label}: ${i?.status ?? 'unbekannt'}`}</title>
                        <rect className="v34-glass" x={x} y={y} width={w} height={h} rx="3" />
                        <rect className="v34-shutter" x={x} y={y} width={w} height={(h * (closed ?? 0)) / 100} rx="3" />
                        <rect className="v34-frame" x={x} y={y} width={w} height={h} rx="3" />
                        {i?.offline && <circle className="v34-dot" cx={x + w} cy={y} r="3.5" />}
                    </g>
                );
            })}
        </svg>
    );
}
function x34h(eg: unknown[]) {
    return eg.length ? 42 : 0;
}

function V34({ c }: { c: PvCtx }) {
    return (
        <>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => (
                    <div className="v34-plan">
                        <button type="button" className="v34-plan-btn" onClick={() => open('plan')}>
                            <CalendarClock size={16} /> Zeitplan <span>{nextLine(m)}</span>
                        </button>
                        <button type="button" className="v34-plan-btn" onClick={() => open('scenes')}>
                            <Layers size={16} /> Szenen <span>{m.scenes.length}</span>
                        </button>
                    </div>
                )}
            />
            <div className="v34-card">
                <House34 c={c} />
                <div className="v34-hint">Fenster antippen öffnet den Feinregler</div>
            </div>
            {c.floors.map((f) => (
                <section key={f.name} className="v34-list">
                    <div className="v34-list-title">{f.name}</div>
                    {f.devices.map((d) => (
                        <Row key={d.key} d={d} c={c} look="plain" cls="v34-row pv-row" />
                    ))}
                </section>
            ))}
            <Foot c={c} />
        </>
    );
}

// ── 35 Einstellungen-Look ──────────────────────────────────────────────

function Row35({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div
            className={`v35-row${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <span className={`v35-ico is-${d.kind}`}>
                <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={17} />
                <RadioBadge show={r.offline} />
            </span>
            <span className="v35-main">
                <span className="v35-name">{d.label}</span>
                <span className={`v35-val${r.busy ? ' is-busy' : ''}`}>{r.status}</span>
            </span>
            <ActBtns c={r} label={d.label} connected={c.connected} look="seg" size={17} />
        </div>
    );
}

function V35({ c }: { c: PvCtx }) {
    return (
        <div className="v35">
            <div className="v35-large">Rollläden</div>
            <div className="v35-large-sub">{c.floors.reduce((n, f) => n + f.devices.length, 0)} Antriebe</div>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => {
                    const p = planInfo(m);
                    return (
                        <div className="v35-group">
                            <button type="button" className="v35-row v35-row--nav" onClick={() => open('plan')}>
                                <span className="v35-ico is-orange">
                                    <CalendarClock size={16} />
                                </span>
                                <span className="v35-main">
                                    <span className="v35-name">Zeitplan</span>
                                    <span className="v35-val">
                                        {p.time ? `${p.status} · ${p.day} ${p.time}` : p.status}
                                    </span>
                                </span>
                                <ChevronRight size={18} className="v35-chev" />
                            </button>
                            <button type="button" className="v35-row v35-row--nav" onClick={() => open('scenes')}>
                                <span className="v35-ico is-purple">
                                    <Layers size={16} />
                                </span>
                                <span className="v35-main">
                                    <span className="v35-name">Szenen</span>
                                    <span className="v35-val">{m.scenes.length} angelegt</span>
                                </span>
                                <ChevronRight size={18} className="v35-chev" />
                            </button>
                        </div>
                    );
                }}
            />
            {c.floors.map((f) => (
                <section key={f.name}>
                    <div className="v35-group-head">{f.name.toUpperCase()}</div>
                    <div className="v35-group">
                        {f.devices.map((d) => (
                            <Row35 key={d.key} d={d} c={c} />
                        ))}
                    </div>
                </section>
            ))}
            <Foot c={c} />
        </div>
    );
}

// ── 36 Widget-Stapel ───────────────────────────────────────────────────

function Ring({ frac, children }: { frac: number; children: ReactNode }) {
    const R = 44;
    const L = 2 * Math.PI * R;
    return (
        <span className="v36-ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="v36-ring-bg" cx="50" cy="50" r={R} />
                <circle
                    className="v36-ring-fg"
                    cx="50"
                    cy="50"
                    r={R}
                    strokeDasharray={L}
                    strokeDashoffset={L * (1 - Math.max(0.02, Math.min(1, frac)))}
                />
            </svg>
            <span className="v36-ring-in">{children}</span>
        </span>
    );
}

function W36({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div
            className={`v36-w v36-w--s${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <span className="v36-w-icon">
                <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={24} />
                <RadioBadge show={r.offline} />
            </span>
            <span className={`v36-w-val${r.busy ? ' is-busy' : ''}`}>{r.busy ? 'fährt' : r.short}</span>
            <span className="v36-w-name">{d.label}</span>
            <ActBtns c={r} label={d.label} connected={c.connected} look="mini" size={14} />
        </div>
    );
}

function V36({ c }: { c: PvCtx }) {
    return (
        <>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => {
                    const p = planInfo(m);
                    const sc = sortedScenes(m).slice(0, 3);
                    return (
                        <div className="v36-top">
                            <button type="button" className="v36-w v36-w--l" onClick={() => open('plan')}>
                                <span className="v36-w-cap">Zeitplan</span>
                                <Ring frac={p.minutes !== null ? 1 - p.minutes / 1440 : 0}>
                                    <b>{p.time ?? '–'}</b>
                                    <small>{p.countdown ?? p.status}</small>
                                </Ring>
                                <span className="v36-w-foot">{p.what ?? p.status}</span>
                            </button>
                            <div className="v36-w v36-w--l v36-scenes">
                                <button
                                    type="button"
                                    className="v36-w-cap v36-w-cap--btn"
                                    onClick={() => open('scenes')}
                                >
                                    Szenen <ChevronRight size={14} />
                                </button>
                                {sc.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        className="v36-scene"
                                        onClick={() => m.runScene(s.id)}
                                        disabled={!c.connected}
                                    >
                                        <SceneGlyph icon={s.icon} size={15} />
                                        <span>{s.name}</span>
                                        <Play size={12} fill="currentColor" />
                                    </button>
                                ))}
                                {!sc.length && <span className="v36-w-foot">noch keine Szenen</span>}
                            </div>
                        </div>
                    );
                }}
            />
            {c.floors.map((f) => (
                <section key={f.name}>
                    <div className="v36-head">{f.name}</div>
                    <div className="v36-grid">
                        {f.devices.map((d) => (
                            <W36 key={d.key} d={d} c={c} />
                        ))}
                    </div>
                </section>
            ))}
            <Foot c={c} />
        </>
    );
}

// ── 37 Etagen-Umschalter ───────────────────────────────────────────────

const KEY37 = 'aura.shutterfloors.modern.v37.floor';

function Card37({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div
            className={`v37-card${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <span className="v37-viz">
                <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={34} />
                <RadioBadge show={r.offline} />
            </span>
            <span className="v37-text">
                <span className="v37-name">{d.label}</span>
                <span className={`v37-status${r.busy ? ' is-busy' : ''}`}>{r.status}</span>
            </span>
            <ActBtns c={r} label={d.label} connected={c.connected} look="round" size={20} />
        </div>
    );
}

function V37({ c }: { c: PvCtx }) {
    const [idx, setIdxState] = useState(() => {
        try {
            return Number(localStorage.getItem(KEY37)) || 0;
        } catch {
            return 0;
        }
    });
    const setIdx = (i: number) => {
        try {
            localStorage.setItem(KEY37, String(i));
        } catch {
            /* egal */
        }
        setIdxState(i);
    };
    const f = c.floors[Math.min(idx, c.floors.length - 1)];
    const busyElsewhere = Object.values(c.reg).filter((i) => i.busy && i.floor !== f.name).length;
    return (
        <>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => (
                    <div className="v37-plan">
                        <button type="button" className="v37-plan-btn" onClick={() => open('plan')}>
                            <CalendarClock size={17} />
                            <span>
                                <b>Zeitplan</b>
                                <small>{nextLine(m)}</small>
                            </span>
                        </button>
                        <button type="button" className="v37-plan-btn" onClick={() => open('scenes')}>
                            <Layers size={17} />
                            <span>
                                <b>Szenen</b>
                                <small>{m.scenes.length} angelegt</small>
                            </span>
                        </button>
                    </div>
                )}
            />
            <div className="v37-seg" role="tablist">
                {c.floors.map((fl, i) => (
                    <button
                        key={fl.name}
                        type="button"
                        role="tab"
                        aria-selected={fl === f}
                        className={`v37-seg-btn${fl === f ? ' is-on' : ''}`}
                        onClick={() => setIdx(i)}
                    >
                        {fl.name} <span>{fl.devices.length}</span>
                    </button>
                ))}
            </div>
            {busyElsewhere > 0 && <div className="v37-note">Im anderen Stockwerk fahren gerade {busyElsewhere}</div>}
            <div className="v37-list">
                {f.devices.map((d) => (
                    <Card37 key={d.key} d={d} c={c} />
                ))}
            </div>
            <Foot c={c} />
        </>
    );
}

// ── 38 Lagebild oben ───────────────────────────────────────────────────

type F38 = 'all' | 'open' | 'half' | 'closed' | 'busy' | 'offline' | 'unknown';
const match38: Record<F38, (i: DevInfo) => boolean> = {
    all: () => true,
    open: (i) => i.closed !== null && i.closed <= 3,
    half: (i) => i.closed !== null && i.closed > 3 && i.closed < 97,
    closed: (i) => i.closed !== null && i.closed >= 97,
    busy: (i) => i.busy,
    offline: (i) => i.offline,
    unknown: (i) => i.unknown,
};

function V38({ c }: { c: PvCtx }) {
    const [flt, setFlt] = useState<F38>('all');
    const infos = Object.values(c.reg);
    const n = (k: F38) => infos.filter(match38[k]).length;
    const total = c.floors.reduce((s, f) => s + f.devices.length, 0);
    const segs: [F38, string][] = [
        ['open', 'v38-c-open'],
        ['half', 'v38-c-half'],
        ['closed', 'v38-c-closed'],
        ['unknown', 'v38-c-unknown'],
    ];
    const R = 40;
    const L = 2 * Math.PI * R;
    let acc = 0;
    const chips: [F38, string][] = [
        ['open', 'offen'],
        ['half', 'halb'],
        ['closed', 'zu'],
        ['busy', 'fahren'],
        ['offline', 'ohne Funk'],
        ['unknown', 'unbekannt'],
    ];
    return (
        <>
            <div className="v38-head">
                <svg className="v38-donut" viewBox="0 0 100 100" aria-hidden="true">
                    <circle className="v38-donut-bg" cx="50" cy="50" r={R} />
                    {segs.map(([k, cls]) => {
                        const part = total ? n(k) / total : 0;
                        const el = part ? (
                            <circle
                                key={k}
                                className={`v38-donut-seg ${cls}`}
                                cx="50"
                                cy="50"
                                r={R}
                                strokeDasharray={`${Math.max(0, part * L - 3)} ${L}`}
                                strokeDashoffset={-acc * L}
                            />
                        ) : null;
                        acc += part;
                        return el;
                    })}
                </svg>
                <div className="v38-head-text">
                    <div className="v38-big">{total}</div>
                    <div className="v38-sub">Rollläden</div>
                    <div className="v38-legend">
                        {segs.map(([k, cls]) =>
                            n(k) ? (
                                <span key={k}>
                                    <i className={cls} /> {n(k)} {chips.find((x) => x[0] === k)?.[1]}
                                </span>
                            ) : null,
                        )}
                    </div>
                </div>
            </div>
            <div className="v38-chips">
                <button
                    type="button"
                    className={`v38-chip${flt === 'all' ? ' is-on' : ''}`}
                    onClick={() => setFlt('all')}
                >
                    Alle
                </button>
                {chips.map(([k, l]) =>
                    n(k) ? (
                        <button
                            key={k}
                            type="button"
                            className={`v38-chip${flt === k ? ' is-on' : ''}${k === 'offline' || k === 'unknown' ? ' is-warn' : ''}${k === 'busy' ? ' is-busy' : ''}`}
                            onClick={() => setFlt(flt === k ? 'all' : k)}
                        >
                            {n(k)} {l}
                        </button>
                    ) : null,
                )}
            </div>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => (
                    <div className="v38-plan">
                        <button type="button" className="v38-plan-btn" onClick={() => open('plan')}>
                            <CalendarClock size={16} />
                            <span>
                                {planInfo(m).time ? `${planInfo(m).time} ${planInfo(m).what}` : planInfo(m).status}
                            </span>
                            <ChevronRight size={15} />
                        </button>
                        <button type="button" className="v38-plan-btn" onClick={() => open('scenes')}>
                            <Layers size={16} />
                            <span>Szenen ({m.scenes.length})</span>
                            <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            />
            {c.floors.map((f) => {
                const list = f.devices.filter((d) => {
                    const i = c.reg[d.key];
                    return flt === 'all' || (i && match38[flt](i));
                });
                if (!list.length) return null;
                return (
                    <section key={f.name} className="v38-card">
                        <div className="v38-card-head">
                            {f.name}
                            {flt !== 'all' && (
                                <span>
                                    {list.length} von {f.devices.length}
                                </span>
                            )}
                        </div>
                        {list.map((d) => (
                            <Row key={d.key} d={d} c={c} look="round" cls="v38-row pv-row" />
                        ))}
                    </section>
                );
            })}
            <Foot c={c} />
        </>
    );
}

// ── 39 Live-Pille ──────────────────────────────────────────────────────

function V39({ c }: { c: PvCtx }) {
    const [openList, setOpenList] = useState(false);
    const moving = Object.values(c.reg).filter((i) => i.busy);
    const total = c.floors.reduce((s, f) => s + f.devices.length, 0);
    const p = planInfo(c.m);
    return (
        <>
            {moving.length > 0 && (
                <div className={`v39-island${openList || moving.length === 1 ? ' is-open' : ''}`}>
                    {moving.length === 1 ? (
                        <div className="v39-live">
                            <span className="v39-live-dot" />
                            <span className="v39-live-text">
                                <b>{moving[0].label}</b> {moving[0].status}
                            </span>
                            <button
                                type="button"
                                className="v39-live-stop"
                                onClick={() => c.acts.current[moving[0].key]?.stop()}
                                disabled={!c.connected}
                                aria-label={`${moving[0].label} stoppen`}
                            >
                                ■
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="v39-live v39-live--sum"
                                onClick={() => setOpenList(!openList)}
                            >
                                <span className="v39-live-dot" />
                                <span className="v39-live-text">
                                    <b>{moving.length} Rollläden</b> fahren
                                </span>
                                <ChevronRight size={16} className={openList ? 'v39-rot' : ''} />
                            </button>
                            {openList &&
                                moving.map((i) => (
                                    <div key={i.key} className="v39-live v39-live--sub">
                                        <span className="v39-live-text">
                                            <b>{i.label}</b> {i.status}
                                        </span>
                                        <button
                                            type="button"
                                            className="v39-live-stop"
                                            onClick={() => c.acts.current[i.key]?.stop()}
                                            disabled={!c.connected}
                                            aria-label={`${i.label} stoppen`}
                                        >
                                            ■
                                        </button>
                                    </div>
                                ))}
                        </>
                    )}
                    <div className="v39-live-bar" />
                </div>
            )}
            <div className="v39-large">Rollläden</div>
            <div className="v39-large-sub">
                {total} Antriebe · {p.status}
                {p.time ? ` · nächste ${p.time}` : ''}
            </div>
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => (
                    <div className="v39-plan">
                        <button type="button" className="v39-capsule" onClick={() => open('plan')}>
                            <CalendarClock size={16} /> Zeitplan
                        </button>
                        <button type="button" className="v39-capsule" onClick={() => open('scenes')}>
                            <Layers size={16} /> Szenen · {m.scenes.length}
                        </button>
                    </div>
                )}
            />
            {c.floors.map((f) => (
                <section key={f.name} className="v39-card">
                    <div className="v39-card-head">
                        {f.name} <span>{floorShort(f.name)}</span>
                    </div>
                    {f.devices.map((d) => (
                        <Row key={d.key} d={d} c={c} look="round" cls="v39-row pv-row" />
                    ))}
                </section>
            ))}
            <Foot c={c} />
        </>
    );
}

// ── 40 Glas-Konsole ────────────────────────────────────────────────────

function Tile40({ d, c }: RowProps) {
    const r = useRowControl(d);
    return (
        <div
            className={`v40-tile${r.busy ? ' is-busy' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <div className="v40-tile-top">
                <span className="v40-icon">
                    <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={18} />
                    <RadioBadge show={r.offline} />
                </span>
                <span className="v40-gauge" aria-hidden="true">
                    <span style={{ height: `${r.closed ?? 0}%` }} />
                </span>
            </div>
            <div className="v40-name">{d.label}</div>
            <div className={`v40-status${r.busy ? ' is-busy' : ''}`}>{r.status}</div>
            <ActBtns c={r} label={d.label} connected={c.connected} look="glass" size={18} />
        </div>
    );
}

function V40({ c }: { c: PvCtx }) {
    return (
        <div className="v40">
            <PlanWindows
                model={c.m}
                renderTiles={(m, open) => {
                    const p = planInfo(m);
                    return (
                        <div className="v40-plan">
                            <button type="button" className="v40-panel v40-plan-btn" onClick={() => open('plan')}>
                                <span className={`v40-orb${p.active ? ' is-on' : ''}`}>
                                    <CalendarClock size={18} />
                                </span>
                                <span className="v40-plan-title">Zeitplan</span>
                                <span className="v40-plan-sub">{p.time ? `${p.day} ${p.time}` : p.status}</span>
                            </button>
                            <button type="button" className="v40-panel v40-plan-btn" onClick={() => open('scenes')}>
                                <span className="v40-orb is-on">
                                    <Layers size={18} />
                                </span>
                                <span className="v40-plan-title">Szenen</span>
                                <span className="v40-plan-sub">{m.scenes.length} angelegt</span>
                            </button>
                        </div>
                    );
                }}
            />
            {c.floors.map((f) => (
                <section key={f.name} className="v40-panel v40-floor">
                    <div className="v40-floor-head">{f.name}</div>
                    <div className="v40-grid">
                        {f.devices.map((d) => (
                            <Tile40 key={d.key} d={d} c={c} />
                        ))}
                    </div>
                </section>
            ))}
            <Foot c={c} />
        </div>
    );
}

// ── Liste ──────────────────────────────────────────────────────────────

export const VARIANTS: Variant[] = [
    {
        key: '31',
        name: 'Home-Kacheln',
        regler: 'pill',
        C: V31,
        desc: 'Jeder Antrieb als Kachel im Zweier-Raster, die Kachel füllt sich von oben, je weiter er zu ist. Auf/Zu als runde Knöpfe in der Kachel.',
    },
    {
        key: '32',
        name: 'Kontrollzentrum',
        regler: 'pill',
        C: V32,
        desc: 'Je Etage ein Modul mit dicken senkrechten Schiebern. Feinregler als großer Schieber wie die Helligkeit im Kontrollzentrum.',
    },
    {
        key: '33',
        name: 'Wetter-Stimmung',
        regler: 'window',
        C: V33,
        desc: 'Farbverlauf nach Tageszeit aus den echten Sonnenzeiten, nächste Fahrt groß wie die Temperatur, Etagen als Milchglas-Karten.',
    },
    {
        key: '34',
        name: 'Hausfront',
        regler: 'window',
        C: V34,
        desc: 'Das Haus als schlichte Grafik, jedes Fenster zeigt seinen Rollladen live. Fenster antippen öffnet den Feinregler, darunter eine kompakte Liste.',
    },
    {
        key: '35',
        name: 'Einstellungen-Look',
        regler: 'pill',
        C: V35,
        desc: 'Gruppen auf grauem Grund wie in der Einstellungen-App, große Überschrift, farbige Symbole, Auf/Zu als kleiner Doppelknopf.',
    },
    {
        key: '36',
        name: 'Widget-Stapel',
        regler: 'pill',
        C: V36,
        desc: 'Wie ein Startbildschirm: großes Zeitplan-Widget mit Ring, Szenen-Widget mit direkten Fahr-Knöpfen, Antriebe als kleine Widgets im Vierer-Raster.',
    },
    {
        key: '37',
        name: 'Etagen-Umschalter',
        regler: 'window',
        C: V37,
        desc: 'Oben „Erdgeschoss | Obergeschoss" zum Antippen, gezeigt wird eine Etage mit großen Karten. Hinweis, wenn im anderen Stockwerk etwas fährt.',
    },
    {
        key: '38',
        name: 'Lagebild oben',
        regler: 'window',
        C: V38,
        desc: 'Ring-Grafik mit offen/halb/zu, darunter Status-Chips. Ein Tipp auf einen Chip zeigt nur die passenden Antriebe.',
    },
    {
        key: '39',
        name: 'Live-Pille',
        regler: 'pill',
        C: V39,
        desc: 'Ruhige Liste mit großer Überschrift. Laufende Fahrten zusätzlich als schwarze Pille oben mit Stopp, wie die Dynamic Island.',
    },
    {
        key: '40',
        name: 'Glas-Konsole',
        regler: 'pill',
        C: V40,
        desc: 'Tiefer Verlauf mit Glas-Paneelen, Kacheln mit Füllstandsbalken und großen runden Knöpfen. Hell als Milchglas.',
    },
];
