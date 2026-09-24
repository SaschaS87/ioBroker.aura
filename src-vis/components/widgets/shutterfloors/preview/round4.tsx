/**
 * Planer-Entwuerfe Runde 4 (nur Dev-Vorschau).
 *
 * Grundform aus Runde 3: Slider, Seite 1 = Fahrten (heute oder naechste 3,
 * in der Leiste umschaltbar), dahinter die Szenen als Schnellknoepfe.
 * Neu: Favoriten. Nur als Favorit markierte Szenen stehen auf der Kachel,
 * alle anderen im Popup (Reiter Szenen, Stern zum Umschalten). Und: Was
 * passiert bei mehr Szenen?
 *
 * S Liste · T 2 Spalten · U 3 Spalten · V 4 Spalten ·
 * W 2 Spalten, weitere Szenen auf weiteren Seiten (je 6 pro Seite)
 */
import { useState, type ComponentType } from 'react';
import { ChevronRight, Play } from 'lucide-react';
import type { PlanModel, Scene } from './planModel';
import { PlayBtn, SceneGlyph, Toast } from './parts';
import { Dots, namesLine, PlanLink, PlanPopup, statusText, usePager, useSheet, type ListStyle, type Pager, type Sheet } from './round2';
import { Head, NextPage, Stack, TodayPage } from './round3';

export type FirstPage = 'today' | 'next';
type Layout = 'list' | 2 | 3 | 4;
type Props = { model: PlanModel; listStyle: ListStyle; first: FirstPage; favOnly: boolean };

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

/** „Alle 12 Szenen“ – öffnet das Popup direkt auf dem Reiter Szenen. */
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
    /** Link „alle Szenen“ zeigen (nur wenn im Popup mehr liegt als hier) */
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

function makeKachel(layout: Layout, paged: boolean) {
    return function Kachel({ model: m, listStyle, first, favOnly }: Props) {
        const sh = useSheet();
        const shown = favOnly ? m.scenes.filter((s) => s.favorite) : m.scenes;
        const more = shown.length < m.scenes.length;
        // W: je 6 Szenen eine eigene Seite; sonst alles auf einer Seite
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
    };
}

function ScenePage(props: { m: PlanModel; pager: Pager; sheet: Sheet; title: string; sub: string; scenes: Scene[]; layout: Layout; more: boolean }) {
    return (
        <>
            <Head pager={props.pager} title={props.title} sub={props.sub} />
            <SceneBlock m={props.m} sheet={props.sheet} scenes={props.scenes} layout={props.layout} more={props.more} />
        </>
    );
}

export const KACHELN4: { key: string; name: string; C: ComponentType<Props> }[] = [
    { key: 'S', name: 'Szenen als Liste', C: makeKachel('list', false) },
    { key: 'T', name: 'Szenen, 2 Spalten', C: makeKachel(2, false) },
    { key: 'U', name: 'Szenen, 3 Spalten', C: makeKachel(3, false) },
    { key: 'V', name: 'Szenen, 4 Spalten', C: makeKachel(4, false) },
    { key: 'W', name: 'Szenen, 2 Spalten, je 6 pro Seite', C: makeKachel(2, true) },
];
