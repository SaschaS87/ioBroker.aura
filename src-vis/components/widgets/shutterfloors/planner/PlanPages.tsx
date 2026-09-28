/**
 * Seiten der Rolllaeden-Planer-Kachel (Produktion, Feature 23): Slider mit
 * zwei Bereichen — Seite 1 die Fahrten (Heute oder die naechsten drei),
 * dahinter die Favoriten-Szenen als Schnellknoepfe, ggf. ueber mehrere
 * Seiten zu je 6 (Ansicht „Kacheln", siehe useRollPlanView.ts).
 *
 * Herkunft: Runde 3 des inzwischen entfernten Entwurfs (TodayPage/NextPage/Stack/Head) und
 * Runde 4 (PlanKachel/SceneBlock/Favoriten). Die reinen
 * Szenen-als-Liste/Kacheln-Kacheln ohne Favoriten (SceneRowsPage/
 * SceneTilesPage aus Runde 3) waren nur Entwurfs-Zwischenschritte und sind
 * hier nicht mehr enthalten — Runde 5 (RollPlanTile.tsx) nutzt ausschliesslich
 * `PlanKachel` mit `favOnly=true`.
 */
import { useState, type ReactNode } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import { fmtDate, hhmm, WD_SHORT, weekdayOf, type PlanModel, type Scene } from './planModel';
import { OccRow, PlayBtn, SceneGlyph, Toast } from './parts';
import { Chevron, dayHead, Dots, emptyText, isPast, namesLine, PlanLink, PlanPopup, statusText, usePager, useSheet, type Pager, type Sheet } from './PlanPopup';
import type { ListStyle } from './useRollPlanView';

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

// ── Seite 2+: Favoriten-Szenen als Schnellknöpfe ───────────────────────

export type FirstPage = 'today' | 'next';
export type Layout = 'list' | 2 | 3 | 4;

function useFlash() {
    const [flash, setFlash] = useState<string | null>(null);
    return {
        flash,
        fire: (id: string) => {
            setFlash(id);
            window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 900);
        },
    };
}

/** „Alle 12 Szenen" – öffnet das Popup direkt auf dem Reiter Szenen. */
function AllScenesLink({ sheet, total, tile }: { sheet: Sheet; total: number; tile?: boolean }) {
    if (tile) {
        return (
            <button type="button" className="rpp-qtile rpp-qtile--more" onClick={() => sheet.show({ v: 'home' }, 'scenes')}>
                <span className="rpp-qtile-more-n">{total}</span>
                <span className="rpp-qtile-sub">alle Szenen</span>
            </button>
        );
    }
    return (
        <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => sheet.show({ v: 'home' }, 'scenes')}>
            Alle {total} Szenen
            <ChevronRight size={16} className="rpp-chev" style={{ marginLeft: 'auto' }} />
        </button>
    );
}

function SceneBlock({
    m,
    sheet,
    scenes,
    layout,
    more,
}: {
    m: PlanModel;
    sheet: Sheet;
    scenes: Scene[];
    layout: Layout;
    /** Link „alle Szenen" zeigen (nur wenn im Popup mehr liegt als hier) */
    more: boolean;
}) {
    const { flash, fire } = useFlash();
    const run = (s: Scene) => {
        m.runScene(s.id);
        fire(s.id);
    };
    if (layout === 'list') {
        return (
            <div className="rpp-pg-list">
                {scenes.length === 0 && <div className="rpp-empty rpp-center">Keine Favoriten – im Popup mit dem Stern markieren.</div>}
                {scenes.map((s) => (
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
                {more && <AllScenesLink sheet={sheet} total={m.scenes.length} />}
            </div>
        );
    }
    return (
        <div className={`rpp-qtiles rpp-qtiles--${layout}`}>
            {scenes.length === 0 && <div className="rpp-empty rpp-center rpp-qtiles-empty">Keine Favoriten – im Popup mit dem Stern markieren.</div>}
            {scenes.map((s) => (
                <button key={s.id} type="button" className={`rpp-qtile${flash === s.id ? ' is-flash' : ''}`} onClick={() => run(s)}>
                    <span className="rpp-qtile-top">
                        <SceneGlyph icon={s.icon} size={layout === 4 ? 20 : 18} />
                        {layout === 2 && <Play size={12} className="rpp-qtile-play" />}
                    </span>
                    <span className="rpp-qtile-name">{s.name}</span>
                    {layout === 2 && <span className="rpp-qtile-sub">{namesLine(m, { kind: 'scene', sceneId: s.id }, 2)}</span>}
                </button>
            ))}
            {more && <AllScenesLink sheet={sheet} total={m.scenes.length} tile />}
        </div>
    );
}

/** Grundgerüst der Kachel: Seite 1 Fahrten, Seite 2+ Favoriten-Szenen. */
export function PlanKachel({
    model: m,
    listStyle,
    first,
    favOnly,
    layout,
    paged,
}: {
    model: PlanModel;
    listStyle: ListStyle;
    first: FirstPage;
    favOnly: boolean;
    layout: Layout;
    paged: boolean;
}) {
    const sh = useSheet();
    const shown = favOnly ? m.scenes.filter((s) => s.favorite) : m.scenes;
    const more = shown.length < m.scenes.length;
    // Ansicht „Kacheln": je 6 Szenen eine eigene Seite; sonst alles auf einer Seite
    const chunks: Scene[][] = paged ? Array.from({ length: Math.max(1, Math.ceil(shown.length / 6)) }, (_, i) => shown.slice(i * 6, i * 6 + 6)) : [shown];
    const pg = usePager(1 + chunks.length);
    const First = first === 'today' ? TodayPage : NextPage;
    const hint = layout === 'list' ? '▷ fährt die Szene sofort' : 'Antippen fährt die Szene sofort';
    const pages = [
        <First key="f" m={m} pager={pg} sheet={sh} />,
        ...chunks.map((c, i) => (
            <ScenePage
                key={`s${i}`}
                m={m}
                pager={pg}
                sheet={sh}
                title={favOnly ? 'Favoriten' : 'Szenen'}
                sub={chunks.length > 1 ? `Seite ${i + 1} von ${chunks.length} · ${hint}` : hint}
                scenes={c}
                layout={layout}
                more={more && i === chunks.length - 1}
            />
        )),
    ];
    return (
        <>
            <div className="rpp-card rpp-pg" {...pg.handlers}>
                <Stack pager={pg} pages={pages} />
                <Dots pager={pg} left={<span className="rpp-pg-status">{statusText(m)}</span>} right={<PlanLink sheet={sh} />} />
            </div>
            <PlanPopup model={m} sheet={sh} listStyle={listStyle} />
            <Toast model={m} />
        </>
    );
}

function ScenePage(props: { m: PlanModel; pager: Pager; sheet: Sheet; title: string; sub: string; scenes: Scene[]; layout: Layout; more: boolean }) {
    return (
        <>
            <Head pager={props.pager} title={props.title} sub={props.sub} />
            <SceneBlock m={props.m} sheet={props.sheet} scenes={props.scenes} layout={props.layout} more={props.more} />
        </>
    );
}
