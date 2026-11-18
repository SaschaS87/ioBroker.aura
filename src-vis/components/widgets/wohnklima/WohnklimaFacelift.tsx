/**
 * UI-Facelift Wohnklima: Liste je Etage (Richtung A, Sascha 18.11.2026).
 *
 * Die Seite besteht aus Einzel-Widgets (Überschriften + Raumbalken). Dashboard.tsx übergibt sie hier in
 * Reihenfolge; daraus entsteht ein Modell „Abschnitt → Räume", das aus den Facelift-Bausteinen (aura-fl-*)
 * gezeichnet wird. Konfiguration bleibt die der Widgets: Titel, Symbol, Datenpunkte, Nachkommastellen,
 * Verlaufs-Instanz. Antippen öffnet den Raum als Unterseite von rechts (wie bei Heizung und Garten) mit
 * denselben Werten wie das frühere Pop-up.
 *
 * Nur lesend: kein Schreibbefehl, kein Datenpunkt wird angelegt.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Thermometer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WidgetConfig } from '../../../types';
import { getWidgetIcon } from '../../../utils/widgetIconMap';
import { formatNum } from '../../../utils/formatValue';
import { splitDpRef } from '../../../utils/dpRef';
import { useGlobalSettingsStore } from '../../../store/globalSettingsStore';
import { getStateFromCache, useIoBroker } from '../../../hooks/useIoBroker';
import { IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import { WohnklimaRoomDetails } from './WohnklimaRoomDetails';
import './WohnklimaFacelift.css';

// ── Modell ───────────────────────────────────────────────────────────────────

interface Room {
    id: string;
    title: string;
    Icon: LucideIcon;
    tempDp: string;
    humDp: string;
    historyInstance: string;
    decimals: number;
    unit: string;
    headerValue: boolean;
    lastChange: boolean;
}
interface Group {
    id: string;
    title: string;
    rooms: Room[];
    /** Nur Fühler ohne Luftfeuchte (Außentemperatur) */
    outdoor: boolean;
}

function buildGroups(widgets: WidgetConfig[], defaultDecimals: number): Group[] {
    const groups: Group[] = [];
    let cur: Group | null = null;
    for (const w of widgets) {
        if (w.type === 'header') {
            cur = { id: w.id, title: w.title ?? '', rooms: [], outdoor: false };
            groups.push(cur);
            continue;
        }
        if (w.type !== 'roomclimate') continue;
        if (!cur) {
            cur = { id: `g-${w.id}`, title: '', rooms: [], outdoor: false };
            groups.push(cur);
        }
        const o = (w.options ?? {}) as Record<string, unknown>;
        cur.rooms.push({
            id: w.id,
            title: w.title || w.datapoint.split('.').slice(-2)[0],
            Icon: getWidgetIcon(o.icon as string | undefined, Thermometer),
            tempDp: w.datapoint,
            humDp: (o.humidityDatapoint as string) ?? '',
            historyInstance: (o.historyInstance as string) ?? '',
            decimals: (o.decimals as number) ?? defaultDecimals,
            unit: (o.unit as string) ?? '°C',
            headerValue: o.detailsHeaderValue === true,
            lastChange: o.detailsLastChange === true,
        });
    }
    const out = groups.filter((g) => g.rooms.length > 0);
    out.forEach((g) => (g.outdoor = g.rooms.every((r) => !r.humDp)));
    return out;
}

/** Momentanwerte aller beteiligten Datenpunkte (gleiche Quelle wie useDatapoint: Cache, getState, Abo). */
function useValues(refs: string[]): Map<string, number | null> {
    const { subscribe, getState, connected } = useIoBroker();
    const ids = useMemo(() => Array.from(new Set(refs.filter(Boolean).map((r) => splitDpRef(r).id))), [refs]);
    const key = ids.join('|');
    const [vals, setVals] = useState<Map<string, number | null>>(() => {
        const m = new Map<string, number | null>();
        ids.forEach((id) => {
            const v = getStateFromCache(id)?.val;
            m.set(id, typeof v === 'number' ? v : null);
        });
        return m;
    });
    useEffect(() => {
        if (!connected) return;
        let cancelled = false;
        const put = (id: string, v: unknown) =>
            setVals((prev) => {
                const nv = typeof v === 'number' ? v : null;
                if (prev.get(id) === nv) return prev;
                const m = new Map(prev);
                m.set(id, nv);
                return m;
            });
        const unsubs = ids.map((id) => {
            const c = getStateFromCache(id);
            if (c) put(id, c.val);
            getState(id).then((s) => {
                if (s && !cancelled) put(id, s.val);
            });
            return subscribe(id, (s) => put(id, s?.val));
        });
        return () => {
            cancelled = true;
            unsubs.forEach((u) => u());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, connected, subscribe, getState]);
    return vals;
}

// ── Formatierung (wie die Balken der heutigen Seite: Wert und Einheit ohne Abstand) ─────────────────────────

function fmt(v: number | null | undefined, decimals: number, unit: string): string {
    return typeof v === 'number' ? `${formatNum(v, decimals)}${unit}` : '–';
}

// ── Seite ────────────────────────────────────────────────────────────────────

export function WohnklimaFacelift({ widgets }: { widgets: WidgetConfig[] }) {
    const { defaultDecimals } = useGlobalSettingsStore();
    const groups = useMemo(() => buildGroups(widgets, defaultDecimals), [widgets, defaultDecimals]);
    const refs = useMemo(() => groups.flatMap((g) => g.rooms.flatMap((r) => [r.tempDp, r.humDp])), [groups]);
    const vals = useValues(refs);
    const t = (r: Room) => vals.get(splitDpRef(r.tempDp).id) ?? null;

    // Raum als Unterseite von rechts wie bei Heizung und Garten (Sascha, 18.11.2026).
    const [roomId, setRoomId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    useEffect(() => {
        if (hidden) setRoomId(null);
    }, [hidden]);
    const rooms = groups.flatMap((g) => g.rooms);
    const sel = rooms.find((r) => r.id === roomId) ?? null;
    const pages = [
        { key: 'home', node: <RoomList groups={groups} t={t} open={(r) => setRoomId(r.id)} /> },
        ...(sel
            ? [
                  {
                      key: `r-${sel.id}`,
                      node: (
                          <div className="ios-page wk-subpage wk-roompage">
                              <IosNavBar
                                  sticky
                                  title={sel.title}
                                  backLabel="Wohnklima"
                                  backFallback="Zurück"
                                  onBack={() => setRoomId(null)}
                              />
                              <WohnklimaRoomDetails
                                  temperatureDp={sel.tempDp}
                                  humidityDp={sel.humDp}
                                  historyInstance={sel.historyInstance}
                                  title={sel.title}
                                  decimals={sel.decimals}
                                  showLastChangeFooter={sel.lastChange}
                              />
                          </div>
                      ),
                  },
              ]
            : []),
    ];
    return (
        <div className="aura-fl-scope wk-page wk-page--a" data-wk-draft="A" data-widget-interactive>
            <IosStack rootRef={rootRef} pages={pages} depth={sel ? 1 : 0} sizing="current" manageScroll bleed={6} />
        </div>
    );
}

interface ListProps {
    groups: Group[];
    t: (r: Room) => number | null;
    open: (r: Room) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="aura-fl-section wk-section">
            {title && (
                <div className="aura-fl-section-head wk-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                </div>
            )}
            {children}
        </section>
    );
}

/** Zeile wie in den iOS-Einstellungen: Symbol, Raum, rechts Temperatur. Luftfeuchte erst im Pop-up (Sascha, 13.11.). */
function RoomRow({ room, t, open }: { room: Room; t: number | null; open: (r: Room) => void }) {
    const Icon = room.Icon;
    return (
        <button type="button" className="aura-fl-row aura-fl-row--nav wk-row" onClick={() => open(room)}>
            <span className={`aura-fl-row-icon wk-ico${room.humDp ? '' : ' wk-ico--out'}`}>
                <Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title wk-row-title">{room.title}</span>
            </span>
            <span className="wk-row-val">{fmt(t, room.decimals, room.unit)}</span>
            <ChevronRight size={18} className="aura-fl-chev wk-chev" />
        </button>
    );
}

// ── Liste je Etage ───────────────────────────────────────────────────────────
function RoomList({ groups, t, open }: ListProps) {
    return (
        <>
            {groups.map((g) => (
                <Section key={g.id} title={g.title}>
                    <div className="aura-fl-card wk-card">
                        {g.rooms.map((r) => (
                            <RoomRow key={r.id} room={r} t={t(r)} open={open} />
                        ))}
                    </div>
                </Section>
            ))}
            <p className="aura-fl-foot wk-foot wk-foot--page">Raum antippen für Verlauf, Tiefst- und Höchstwert.</p>
        </>
    );
}
