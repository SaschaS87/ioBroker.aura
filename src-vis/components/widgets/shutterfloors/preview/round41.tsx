/**
 * Runde 41–65 (02.11.2026), nur Dev-Vorschau: Entwurf 35 „Einstellungen-Look"
 * nach Saschas Anmerkungen ueberarbeitet („35 neu") plus drei unabhaengige
 * Reihen zum Kombinieren:
 *   A 41–50  Auf/Zu-Tasten rechts in der Zeile   (pvButtons.tsx)
 *   B 51–60  Symbole links je Art                 (pvIcons.tsx)
 *   C 61–65  Fenster Zeitplan/Szenen + Editoren   (pvWindows.tsx)
 * „35" bei A/B bzw. „Ist" bei C zeigt jeweils den Stand vor dieser Runde.
 *
 * Gegenueber 35: keine grosse Ueberschrift und keine Zeile „15 Antriebe",
 * kein eigener grauer/schwarzer Grund – die Gruppen stehen auf dem
 * Hintergrund des Themes und tragen die Karten-Variablen des Hausstils.
 * Kopfgruppe Zeitplan/Szenen, Etagen-Gruppen und Farben je Art bleiben.
 */
import { useEffect, type KeyboardEvent } from 'react';
import { CalendarClock, ChevronRight, Layers } from 'lucide-react';
import { PlanWindows, type TilesRender } from '../planner/PlanWindows';
import type { ShutterFloorDeviceDef } from '../types';
import { useRowControl } from './useRowControl';
import { ActBtns, planInfo, RadioBadge, TypeIcon, type Picks, type PvCtx } from './pvParts';
import { ActA } from './pvButtons';
import { KindIcon } from './pvIcons';
import { PvPlanWindows } from './pvWindows';
import { FloorGroup } from './round201';
import './round41.css';

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

function RowN({ d, c, p, firstRest }: { d: ShutterFloorDeviceDef; c: PvCtx; p: Picks; firstRest?: boolean }) {
    const r = useRowControl(d);
    return (
        <div
            className={`v35-row vn-row${r.busy ? ' is-busy' : ''}${firstRest ? ' vf-rest-first' : ''}`}
            {...tap(() => c.openSheet(d))}
            aria-label={`${d.label}, ${r.status}`}
        >
            <span className={`v35-ico is-${d.kind} vn-ico vn-ico--${p.b}`}>
                {p.b === '35' ? (
                    <TypeIcon kind={d.kind} closed={r.closed} busy={r.busy} size={17} />
                ) : (
                    <KindIcon set={p.b} kind={d.kind} s={{ closed: r.closed, busy: r.busy, slat: r.slat }} />
                )}
                <RadioBadge show={r.offline} />
            </span>
            <span className="v35-main">
                <span className="v35-name">{d.label}</span>
                <span className={`v35-val${r.busy ? ' is-busy' : ''}`}>{r.status}</span>
            </span>
            {p.a === '35' ? (
                <ActBtns c={r} label={d.label} connected={c.connected} look="seg" size={17} />
            ) : (
                <ActA look={p.a} r={r} label={d.label} connected={c.connected} kind={d.kind} />
            )}
        </div>
    );
}

/** Kopfgruppe wie in 35, Symbole unveraendert („10 von 10"). */
const tiles: TilesRender = (m, open) => {
    const p = planInfo(m);
    return (
        <div className="v35-group">
            <button type="button" className="v35-row v35-row--nav" onClick={() => open('plan')}>
                <span className="v35-ico is-orange">
                    <CalendarClock size={16} />
                </span>
                <span className="v35-main">
                    <span className="v35-name">Zeitplan</span>
                    <span className="v35-val">{p.time ? `${p.status} · ${p.day} ${p.time}` : p.status}</span>
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
};

export function RoundN({ c }: { c: PvCtx }) {
    const p = c.picks ?? { a: '35', b: '35', c: 'IST', d: '35', e: '35' };
    const isFav = c.fav?.has ?? (() => false);
    // Fenster per Portal: Look-Kennung an <html>, wie data-pv.
    useEffect(() => {
        document.documentElement.dataset.pvC = p.c;
        return () => {
            delete document.documentElement.dataset.pvC;
        };
    }, [p.c]);
    return (
        <div className="vn">
            {p.c === 'IST' ? (
                <PlanWindows model={c.m} renderTiles={tiles} />
            ) : (
                <PvPlanWindows model={c.m} look={p.c} renderTiles={tiles} />
            )}
            {c.floors.map((f) => (
                <FloorGroup
                    key={f.name}
                    floor={f}
                    look={p.e}
                    isFav={isFav}
                    row={(d, firstRest) => <RowN key={d.key} d={d} c={c} p={p} firstRest={firstRest} />}
                />
            ))}
            <div className="pv-foot">{c.footer}</div>
        </div>
    );
}
