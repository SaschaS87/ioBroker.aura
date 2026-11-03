/**
 * Gemeinsame Bausteine der Entwuerfe 31–40 (nur Dev-Vorschau).
 */
import type { MutableRefObject, ReactNode } from 'react';
import { RadioOff, Square } from 'lucide-react';
import { WindowIcon, RoofWindowIcon, RaffstoreIcon } from '../../../icons/ShutterTypeIcons';
import { ArrowToTopIcon, ArrowToBottomIcon } from '../../../icons/ShutterActionIcons';
import { dayLabel, hhmm, type PlanModel } from '../planner/planModel';
import { countdown, nextRun, statusText } from '../planner/PlanWindows';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from '../types';
import type { RowControl } from './useRowControl';
import type { ReglerKind } from './PvSheet';

/** Was jeder Antrieb nach oben meldet (fuer Lagebild, Hausfront, Live-Pille). */
export interface DevInfo {
    key: string;
    label: string;
    floor: string;
    kind: ShutterFloorDeviceDef['kind'];
    closed: number | null;
    busy: boolean;
    dir: 'up' | 'down' | null;
    unknown: boolean;
    offline: boolean;
    status: string;
    short: string;
}

export type Acts = MutableRefObject<Record<string, Pick<RowControl, 'open' | 'stop' | 'close'>>>;

export interface PvCtx {
    floors: ShutterFloorDef[];
    connected: boolean;
    m: PlanModel;
    reg: Record<string, DevInfo>;
    acts: Acts;
    openSheet: (d: ShutterFloorDeviceDef) => void;
    footer: ReactNode;
    /** Runde 41–65: Wahl je Reihe (A Tasten, B Symbole, C Fenster) */
    picks?: Picks;
}

export interface Picks {
    a: string;
    b: string;
    c: string;
}

export interface Variant {
    key: string;
    name: string;
    desc: string;
    regler: ReglerKind;
    C: (p: { c: PvCtx }) => ReactNode;
}

// ── Symbole ────────────────────────────────────────────────────────────

export function TypeIcon({
    kind,
    size = 20,
    closed,
    busy,
}: {
    kind: ShutterFloorDeviceDef['kind'];
    size?: number;
    closed: number | null;
    busy?: boolean;
}) {
    const I = kind === 'dachfenster' ? RoofWindowIcon : kind === 'raffstore' ? RaffstoreIcon : WindowIcon;
    return <I size={size} closedFrac={closed} isMoving={busy} />;
}

export function RadioBadge({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="pv-radio-badge" title="Kein Funkkontakt" aria-label="Kein Funkkontakt">
            <RadioOff size={11} strokeWidth={2.2} />
        </span>
    );
}

// ── Auf / Stopp / Zu ───────────────────────────────────────────────────

/** Auf + Zu, waehrend der Fahrt nur Stopp. Klicks laufen nicht zur Zeile durch. */
export function ActBtns({
    c,
    label,
    connected,
    look = 'round',
    size = 20,
}: {
    c: RowControl;
    label: string;
    connected: boolean;
    look?: 'round' | 'seg' | 'glass' | 'mini' | 'plain';
    size?: number;
}) {
    const stop = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation();
        fn();
    };
    if (c.busy) {
        return (
            <span className={`pv-act pv-act--${look}`}>
                <button
                    type="button"
                    className="pv-act-btn pv-act-btn--stop"
                    onClick={stop(c.stop)}
                    disabled={!connected}
                    aria-label={`${label} stoppen`}
                    title="Stopp"
                >
                    <Square size={size * 0.72} fill="currentColor" />
                </button>
            </span>
        );
    }
    return (
        <span className={`pv-act pv-act--${look}`}>
            <button
                type="button"
                className="pv-act-btn"
                onClick={stop(c.open)}
                disabled={!connected}
                aria-label={`${label} öffnen`}
                title="Öffnen"
            >
                <ArrowToTopIcon size={size} />
            </button>
            <button
                type="button"
                className="pv-act-btn"
                onClick={stop(c.close)}
                disabled={!connected}
                aria-label={`${label} schließen`}
                title="Schließen"
            >
                <ArrowToBottomIcon size={size} />
            </button>
        </span>
    );
}

// ── Zeitplan-Texte ─────────────────────────────────────────────────────

export function planInfo(m: PlanModel) {
    const n = nextRun(m);
    return {
        status: statusText(m),
        active: m.master && !m.pausedToday,
        time: n ? hhmm(n.occ.min) : null,
        day: n ? dayLabel(n.date, m.today) : null,
        what: n ? m.targetName(n.occ.entry.target) : null,
        countdown: n ? countdown(m, n) : null,
        /** Minuten bis zur naechsten Fahrt (fuer Ringe) */
        minutes: n
            ? Math.max(
                  0,
                  Math.round(
                      (new Date(n.date.getFullYear(), n.date.getMonth(), n.date.getDate(), 0, n.occ.min).getTime() -
                          m.now.getTime()) /
                          60000,
                  ),
              )
            : null,
    };
}

export function nextLine(m: PlanModel): string {
    const p = planInfo(m);
    return p.time ? `nächste ${p.day} ${p.time}` : '–';
}

export function sortedScenes(m: PlanModel) {
    return [...m.scenes].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
}

export function floorShort(name: string) {
    if (/erd/i.test(name)) return 'EG';
    if (/ober/i.test(name)) return 'OG';
    return name;
}
