/**
 * Zeitplan und Szenen als Unterseiten im iOS-Stil (Feature 30, Phase 2). Die Liste des Rollladen-Tabs ist
 * die unterste Seite eines Stapels; "Zeitplan" und "Szenen" schieben von rechts herein, darauf folgen
 * Einstellungen, Szene und Zeitpunkt. Der Kopf haftet beim Scrollen (sticky), das Zurueck-Wort ist der
 * Titel der Vorseite.
 *
 * Tab-Wechsel: Dashboard.tsx haengt besuchte Tabs nicht aus, sondern versteckt sie. Wer zurueckkommt, soll
 * die Liste sehen. Deshalb geht der Stapel auf null zurueck, sobald der Tab verdeckt wird, ausser ein
 * Editor hat ungesicherte Aenderungen: dann bleibt der Entwurf stehen (Entscheidung Sascha, Frage E).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IosNavBar, IosStack, useTabHidden } from '../../../common/ios';
import { PlanHome, PlanSettings, ScenesHome, type Tab } from './PlanWindows';
import { EntryEditor, SceneEditor, type LeaveGuardRegister, type SheetView } from './editors';
import type { PlanModel } from './planModel';
import { pageTitle, type Route, type StackEntry } from './routes';
import './PlanPages.css';

interface PlanPageProps {
    route: StackEntry;
    parent: Route;
    m: PlanModel;
    push: (r: Route) => void;
    pop: () => void;
    reportDirty: (uid: number, dirty: boolean) => void;
}

function PlanPage({ route, parent, m, push, pop, reportDirty }: PlanPageProps) {
    const [edit, setEdit] = useState(false);
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    // Zurueck-Waechter des Editors: false = der Editor fragt nach, die Seite bleibt
    const guard = useRef<(() => boolean) | null>(null);
    const registerLeaveGuard = useCallback<LeaveGuardRegister>((g) => {
        guard.current = g;
    }, []);
    const uid = route.uid;
    const onDirtyChange = useCallback((dirty: boolean) => reportDirty(uid, dirty), [reportDirty, uid]);
    const onBack = () => {
        if (guard.current && !guard.current()) return;
        pop();
    };
    // Die Szene bleibt samt Zustand darunter eingehaengt: ein Tipp in der Szene schiebt nur die naechste Seite vor.
    const setView = (v: SheetView) => {
        if (v.v === 'scene') push({ v: 'scene', id: v.id });
        else push({ v: 'entry', id: v.id, preset: v.preset });
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
        right = (
            <button type="button" className="ios-bar-text" onClick={() => push({ v: 'settings' })}>
                Einstellungen
            </button>
        );
    } else if (route.v === 'scenes') {
        content = (
            <div className="pw-home">
                <ScenesHome m={m} setView={setView} edit={edit} />
            </div>
        );
        right = (
            <button type="button" className={`ios-bar-text${edit ? ' is-strong' : ''}`} onClick={() => setEdit(!edit)}>
                {edit ? 'Fertig' : 'Bearbeiten'}
            </button>
        );
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
                registerLeaveGuard={registerLeaveGuard}
                onDirtyChange={onDirtyChange}
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
                registerLeaveGuard={registerLeaveGuard}
                onDirtyChange={onDirtyChange}
            />
        );
    }

    return (
        <div className="ios-page pp-page">
            <IosNavBar
                sticky
                title={pageTitle(route, m)}
                backLabel={pageTitle(parent, m)}
                backFallback="Zurück"
                onBack={onBack}
                right={right}
                rightRef={editorPage ? setSlot : undefined}
            />
            {content}
        </div>
    );
}

export function PlannerStack({ m, list }: { m: PlanModel; list: (open: (t: Tab) => void) => ReactNode }) {
    const [stack, setStack] = useState<StackEntry[]>([]);
    const uid = useRef(0);
    const dirty = useRef(new Set<number>());
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);

    const push = (r: Route) => {
        const id = ++uid.current; // außerhalb des Updaters, wegen StrictMode
        setStack((s) => [...s, { ...r, uid: id } as StackEntry]);
    };
    const pop = () => setStack((s) => s.slice(0, -1));
    const reportDirty = useCallback((id: number, isDirty: boolean) => {
        if (isDirty) dirty.current.add(id);
        else dirty.current.delete(id);
    }, []);

    // Tab verlassen: Liste beim Zurueckkommen, ausser ein Editor haelt ungesicherte Aenderungen
    useEffect(() => {
        if (hidden && dirty.current.size === 0) setStack([]);
    }, [hidden]);

    const pages = [
        { key: 'list', node: list((t) => push(t === 'plan' ? { v: 'plan' } : { v: 'scenes' })) },
        ...stack.map((r, i) => ({
            key: `p${r.uid}`,
            node: (
                <PlanPage
                    route={r}
                    parent={i === 0 ? { v: 'list' } : stack[i - 1]}
                    m={m}
                    push={push}
                    pop={pop}
                    reportDirty={reportDirty}
                />
            ),
        })),
    ];
    return <IosStack rootRef={rootRef} pages={pages} depth={stack.length} sizing="current" manageScroll bleed={6} />;
}
