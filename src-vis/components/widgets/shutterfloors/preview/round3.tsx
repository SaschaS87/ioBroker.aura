/**
 * Planer-Entwuerfe Runde 3 (nur Dev-Vorschau).
 *
 * Saschas Klarstellung: Die Kachel ist ein Slider mit genau ZWEI Seiten.
 *   Seite 1 – die Fahrten: entweder „heute“ (wie B) oder „die naechsten drei“
 *             (wie E).
 *   Seite 2 – die eigenen Szenen als Schnellknoepfe zum sofort Fahren
 *             (z. B. „Fernsehen“: beide Wohnzimmer zu).
 * Blaettern wie RainStationWidget (Pfeile, Punkte) plus Wischen.
 *
 * O Heute + Szenen als Liste · P Naechste 3 + Szenen als Liste
 * Q Heute + Szenen als Kacheln · R Naechste 3 + Szenen als Kacheln
 */
import { useState, type ComponentType, type ReactNode } from 'react';
import { Play, Plus } from 'lucide-react';
import { fmtDate, hhmm, WD_SHORT, weekdayOf, type PlanModel, type Scene } from './planModel';
import { OccRow, PlayBtn, SceneGlyph, Toast } from './parts';
import {
    Chevron,
    dayHead,
    Dots,
    emptyText,
    isPast,
    namesLine,
    PlanLink,
    PlanPopup,
    statusText,
    usePager,
    useSheet,
    type ListStyle,
    type Pager,
    type Sheet,
} from './round2';

type Props = { model: PlanModel; listStyle: ListStyle };

/** Zwei Seiten; nur die aktive wird angezeigt. */
export function Stack({ pager, pages }: { pager: Pager; pages: ReactNode[] }) {
    return (
        <div className="rpp-stack">
            {pages.map((p, i) => (
                <div
                    key={i === pager.idx ? `on-${i}-${pager.dir}` : `off-${i}`}
                    className={`rpp-stack-page${i === pager.idx ? ` is-on ${pager.dir > 0 ? 'is-next' : 'is-prev'}` : ''}`}
                    aria-hidden={i !== pager.idx}
                >
                    {p}
                </div>
            ))}
        </div>
    );
}

export function Head({ pager, title, sub }: { pager: Pager; title: string; sub: string }) {
    return (
        <div className="rpp-pg-head">
            <Chevron pager={pager} d={-1} />
            <div className="rpp-pg-headtext">
                <span className="rpp-pg-title">{title}</span>
                <span className="rpp-pg-sub">{sub}</span>
            </div>
            <Chevron pager={pager} d={1} />
        </div>
    );
}

// ── Seite 1: Fahrten ───────────────────────────────────────────────────

export function TodayPage({ m, pager, sheet }: { m: PlanModel; pager: Pager; sheet: Sheet }) {
    const occ = m.occurrences(m.today);
    const h = dayHead(m, m.today);
    return (
        <>
            <Head pager={pager} title="Heute" sub={`${h.hol ? `${h.hol} · ` : ''}${h.sub}`} />
            <div className="rpp-pg-list">
                {occ.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, m.today)}</div>}
                {occ.map((o) => (
                    <OccRow key={o.entry.id} model={m} occ={o} past={isPast(m, m.today, o)} onClick={() => sheet.show({ v: 'entry', id: o.entry.id })} />
                ))}
            </div>
        </>
    );
}

export function NextPage({ m, pager, sheet }: { m: PlanModel; pager: Pager; sheet: Sheet }) {
    const up = m.upcoming(3);
    const sun = m.sunFor(m.today);
    return (
        <>
            <Head
                pager={pager}
                title="Als Nächstes"
                sub={`${WD_SHORT[weekdayOf(m.today)]} ${fmtDate(m.today)} · ↑ ${hhmm(sun.sunrise)} · ↓ ${hhmm(sun.sunset)}`}
            />
            <div className="rpp-pg-list">
                {up.length === 0 && <div className="rpp-empty rpp-center">{emptyText(m, m.today)}</div>}
                {up.map(({ date, occ }) => (
                    <OccRow
                        key={`${date.toDateString()}-${occ.entry.id}`}
                        model={m}
                        occ={occ}
                        showDate={date}
                        onClick={() => sheet.show({ v: 'entry', id: occ.entry.id })}
                    />
                ))}
            </div>
        </>
    );
}

// ── Seite 2: Szenen als Schnellknöpfe ──────────────────────────────────

/** Liste: Zeile antippen = Szene bearbeiten, Play = sofort fahren. */
function SceneRowsPage({ m, pager, sheet }: { m: PlanModel; pager: Pager; sheet: Sheet }) {
    return (
        <>
            <Head pager={pager} title="Szenen" sub="▷ fährt die Szene sofort" />
            <div className="rpp-pg-list">
                {m.scenes.length === 0 && <div className="rpp-empty rpp-center">Noch keine Szenen – über „Planen“ anlegen.</div>}
                {m.scenes.map((s) => (
                    <div key={s.id} role="button" tabIndex={0} className="rpp-row rpp-row--tap" onClick={() => sheet.show({ v: 'scene', id: s.id })}>
                        <span className="rpp-row-icon">
                            <SceneGlyph icon={s.icon} />
                        </span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">{s.name}</span>
                            <span className="rpp-sub rpp-ellipsis">{namesLine(m, { kind: 'scene', sceneId: s.id })}</span>
                        </span>
                        <PlayBtn onClick={() => m.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                    </div>
                ))}
            </div>
        </>
    );
}

/** Kacheln: ganze Kachel antippen = sofort fahren (wie ein Lichtschalter). */
function SceneTilesPage({ m, pager, sheet }: { m: PlanModel; pager: Pager; sheet: Sheet }) {
    const [flash, setFlash] = useState<string | null>(null);
    const run = (s: Scene) => {
        m.runScene(s.id);
        setFlash(s.id);
        window.setTimeout(() => setFlash((f) => (f === s.id ? null : f)), 900);
    };
    return (
        <>
            <Head pager={pager} title="Szenen" sub="Antippen fährt die Szene sofort" />
            <div className="rpp-qtiles">
                {m.scenes.map((s) => (
                    <button key={s.id} type="button" className={`rpp-qtile${flash === s.id ? ' is-flash' : ''}`} onClick={() => run(s)}>
                        <span className="rpp-qtile-top">
                            <SceneGlyph icon={s.icon} size={18} />
                            <Play size={12} className="rpp-qtile-play" />
                        </span>
                        <span className="rpp-qtile-name">{s.name}</span>
                        <span className="rpp-qtile-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}</span>
                    </button>
                ))}
                {m.scenes.length === 0 && (
                    <button type="button" className="rpp-qtile rpp-qtile--add" onClick={() => sheet.show({ v: 'scene', id: null })}>
                        <Plus size={18} />
                        <span className="rpp-qtile-sub">Erste Szene anlegen</span>
                    </button>
                )}
            </div>
        </>
    );
}

// ── Kachel-Gerüst ──────────────────────────────────────────────────────

type PageC = ComponentType<{ m: PlanModel; pager: Pager; sheet: Sheet }>;

function makeKachel(First: PageC, Second: PageC) {
    return function Kachel({ model: m, listStyle }: Props) {
        const sh = useSheet();
        const pg = usePager(2);
        return (
            <>
                <div className="rpp-card rpp-pg" {...pg.handlers}>
                    <Stack pager={pg} pages={[<First key="a" m={m} pager={pg} sheet={sh} />, <Second key="b" m={m} pager={pg} sheet={sh} />]} />
                    <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
                </div>
                <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
                <Toast model={m} />
            </>
        );
    };
}

export const KACHELN3: { key: string; name: string; C: ComponentType<Props> }[] = [
    { key: 'O', name: 'Heute + Szenen als Liste', C: makeKachel(TodayPage, SceneRowsPage) },
    { key: 'P', name: 'Nächste 3 + Szenen als Liste', C: makeKachel(NextPage, SceneRowsPage) },
    { key: 'Q', name: 'Heute + Szenen als Kacheln', C: makeKachel(TodayPage, SceneTilesPage) },
    { key: 'R', name: 'Nächste 3 + Szenen als Kacheln', C: makeKachel(NextPage, SceneTilesPage) },
];

export const POPUPS3: { key: ListStyle; name: string }[] = [
    { key: 'A', name: 'kompakt wie Runde 1' },
    { key: 'L', name: 'mit Rollladen-Namen' },
];
