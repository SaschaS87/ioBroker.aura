import { useRef, useState, type ReactNode } from 'react';
import { IosFootnote, IosStack } from '../../../common/ios';
import type { ShutterFloorDef } from '../types';
import { RollPlanTile } from '../planner/RollPlanTile';
import { PlanHome, PlanSettings, PlanTiles, ScenesHome, type Tab } from '../planner/PlanWindows';
import { EntryEditor, SceneEditor, type SheetView } from '../planner/editors';
import type { PlanModel } from '../planner/planModel';
import { pageInfo, type Route, type StackEntry } from './routes';
import { DraftHead, EditToggle, GearButton, headActionsFor, type DraftKey } from './variants';

interface DraftPageProps {
    draft: DraftKey;
    route: StackEntry;
    parent: Route;
    m: PlanModel;
    push: (r: Route) => void;
    pop: () => void;
}

function DraftPage({ draft, route, parent, m, push, pop }: DraftPageProps) {
    const [edit, setEdit] = useState(false);
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    const info = pageInfo(route, m);
    const origin = pageInfo(parent, m).title;
    const actions = headActionsFor(draft);
    // Die Szene bleibt samt Zustand darunter eingehängt: back und draft werden ignoriert.
    const setView = (v: SheetView) => {
        if (v.v === 'scene') push({ v: 'scene', id: v.id });
        else if (v.v === 'entry') push({ v: 'entry', id: v.id, preset: v.preset });
    };

    let right: ReactNode = null;
    let content: ReactNode = null;
    const editorPage = route.v === 'scene' || route.v === 'entry';
    if (route.v === 'plan') {
        content = (
            <div className="pw-home">
                <PlanHome m={m} setView={setView} />
            </div>
        );
        right = <GearButton draft={draft} onClick={() => push({ v: 'settings' })} />;
    } else if (route.v === 'scenes') {
        content = (
            <div className="pw-home">
                <ScenesHome m={m} setView={setView} edit={edit} />
            </div>
        );
        right = <EditToggle draft={draft} edit={edit} onToggle={() => setEdit(!edit)} />;
    } else if (route.v === 'settings') {
        content = (
            <div className="pw-home">
                <PlanSettings m={m} />
            </div>
        );
    } else if (route.v === 'scene') {
        content = (
            <SceneEditor
                model={m}
                scene={route.id ? m.sceneOf(route.id) : undefined}
                onDone={pop}
                setView={setView}
                headSlot={slot}
                renderActions={actions}
            />
        );
    } else if (route.v === 'entry') {
        content = (
            <EntryEditor
                model={m}
                entry={route.id ? m.entries.find((x) => x.id === route.id) : undefined}
                preset={route.preset}
                onDone={pop}
                headSlot={slot}
                renderActions={actions}
            />
        );
    }

    return (
        <div className="ios-page f30-scope rpp-sheet-backdrop">
            <DraftHead
                draft={draft}
                info={info}
                origin={origin}
                onBack={pop}
                right={right}
                rightRef={editorPage ? setSlot : undefined}
            />
            {content}
            {draft === 'A' && info.subtitle ? <IosFootnote desc={info.subtitle} /> : null}
        </div>
    );
}

function PlannerStack({
    draft,
    m,
    list,
}: {
    draft: DraftKey;
    m: PlanModel;
    list: (open: (t: Tab) => void) => ReactNode;
}) {
    const [stack, setStack] = useState<StackEntry[]>([]);
    const uid = useRef(0);
    const push = (r: Route) => {
        const id = ++uid.current; // außerhalb des Updaters, wegen StrictMode
        setStack((s) => [...s, { ...r, uid: id } as StackEntry]);
    };
    const pop = () => setStack((s) => s.slice(0, -1));
    const pages = [
        { key: 'list', node: list((t) => push(t === 'plan' ? { v: 'plan' } : { v: 'scenes' })) },
        ...stack.map((r, i) => ({
            key: `p${r.uid}`,
            node: (
                <DraftPage
                    draft={draft}
                    route={r}
                    parent={i === 0 ? { v: 'list' } : stack[i - 1]}
                    m={m}
                    push={push}
                    pop={pop}
                />
            ),
        })),
    ];
    return <IosStack pages={pages} depth={stack.length} sizing="current" manageScroll bleed={6} />;
}

export interface DraftStackProps {
    draft: DraftKey;
    floors: ShutterFloorDef[];
    root: string;
    connected: boolean;
    banner: ReactNode;
    floorList: ReactNode;
    footer: ReactNode;
    sheet: ReactNode;
}

/** Entwurf: Zeitplan und Szenen als Unterseiten statt Fenster von unten (nur Dev-Vorschau). */
export function DraftStack({ draft, floors, root, connected, banner, floorList, footer, sheet }: DraftStackProps) {
    return (
        <div className="shutter-floors-widget">
            {banner}
            <RollPlanTile
                floors={floors}
                root={root}
                render={(m) => (
                    <PlannerStack
                        draft={draft}
                        m={m}
                        list={(open) => (
                            <div className={`sf${connected ? '' : ' is-offline'}`}>
                                <PlanTiles m={m} open={open} />
                                {floorList}
                                <div className="sf-foot">{footer}</div>
                            </div>
                        )}
                    />
                )}
            />
            {sheet}
        </div>
    );
}
