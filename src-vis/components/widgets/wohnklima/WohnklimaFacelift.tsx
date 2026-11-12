/**
 * UI-Facelift, Entwurfsphase Wohnklima (nur Dev-Vorschau, gelber Umschalter auf „Neu" und ein Buchstabe).
 *
 * Die Seite besteht heute aus 13 Einzel-Widgets (Überschriften + Raumbalken). Dashboard.tsx übergibt sie
 * hier in Reihenfolge; daraus entsteht ein Modell „Abschnitt → Räume", und die Entwürfe A bis D zeichnen es
 * aus den Facelift-Bausteinen (aura-fl-*) neu. Konfiguration bleibt die der Widgets: Titel, Symbol,
 * Datenpunkte, Nachkommastellen, Verlaufs-Instanz. Antippen öffnet für jeden Raum dasselbe Pop-up
 * (RoomClimateSheet, look 'facelift') mit denselben Werten wie heute.
 *
 * Nur lesend: kein Schreibbefehl, kein Datenpunkt wird angelegt.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Droplets, Layers, Thermometer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WidgetConfig } from '../../../types';
import { lazyWithReload } from '../../../utils/lazyWithReload';
import { getWidgetIcon } from '../../../utils/widgetIconMap';
import { formatNum } from '../../../utils/formatValue';
import { splitDpRef } from '../../../utils/dpRef';
import { useGlobalSettingsStore } from '../../../store/globalSettingsStore';
import { getStateFromCache, useIoBroker } from '../../../hooks/useIoBroker';
import { IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import type { WohnklimaDraft } from './wohnklimaDraft';
import './WohnklimaFacelift.css';

const RoomClimateSheet = lazyWithReload(() =>
    import('../RoomClimateSheet').then((m) => ({ default: m.RoomClimateSheet })),
);

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
function span(vs: (number | null | undefined)[], decimals: number, unit: string): string {
    const n = vs.filter((v): v is number => typeof v === 'number');
    if (n.length === 0) return '–';
    const lo = Math.min(...n);
    const hi = Math.max(...n);
    return lo === hi ? fmt(lo, decimals, unit) : `${formatNum(lo, decimals)}–${fmt(hi, decimals, unit)}`;
}
function mean(vs: (number | null | undefined)[]): number | null {
    const n = vs.filter((v): v is number => typeof v === 'number');
    return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

// ── Seite ────────────────────────────────────────────────────────────────────

export function WohnklimaFacelift({ widgets, draft }: { widgets: WidgetConfig[]; draft: Exclude<WohnklimaDraft, 'ALT'> }) {
    const { defaultDecimals } = useGlobalSettingsStore();
    const groups = useMemo(() => buildGroups(widgets, defaultDecimals), [widgets, defaultDecimals]);
    const refs = useMemo(() => groups.flatMap((g) => g.rooms.flatMap((r) => [r.tempDp, r.humDp])), [groups]);
    const vals = useValues(refs);
    const t = (r: Room) => vals.get(splitDpRef(r.tempDp).id) ?? null;
    const h = (r: Room) => (r.humDp ? (vals.get(splitDpRef(r.humDp).id) ?? null) : null);

    // Pop-up: frische Instanz bei jedem Öffnen (wie RoomClimateWidget)
    const [sheet, setSheet] = useState<{ room: Room; seq: number } | null>(null);
    const open = (room: Room) => setSheet((s) => ({ room, seq: (s?.seq ?? 0) + 1 }));

    const ctx: DraftCtx = { groups, t, h, open };
    let body: ReactNode;
    if (draft === 'A') body = <DraftA {...ctx} />;
    else if (draft === 'B') body = <DraftB {...ctx} />;
    else if (draft === 'C') body = <DraftC {...ctx} />;
    else body = <DraftD {...ctx} />;

    return (
        <div className={`aura-fl-scope wk-page wk-page--${draft.toLowerCase()}`} data-wk-draft={draft}>
            {body}
            {sheet && (
                <Suspense fallback={null}>
                    <RoomClimateSheet
                        key={sheet.seq}
                        look="facelift"
                        title={sheet.room.title}
                        temperatureDp={sheet.room.tempDp}
                        humidityDp={sheet.room.humDp}
                        historyInstance={sheet.room.historyInstance}
                        decimals={sheet.room.decimals}
                        currentTemp={t(sheet.room)}
                        unit={sheet.room.unit}
                        showHeaderValue={false}
                        showLastChangeFooter={sheet.room.lastChange}
                        onClose={() => setSheet(null)}
                    />
                </Suspense>
            )}
        </div>
    );
}

interface DraftCtx {
    groups: Group[];
    t: (r: Room) => number | null;
    h: (r: Room) => number | null;
    open: (r: Room) => void;
}

function Section({ title, right, children, foot }: { title: string; right?: ReactNode; children: ReactNode; foot?: ReactNode }) {
    return (
        <section className="aura-fl-section wk-section">
            {(title || right) && (
                <div className="aura-fl-section-head wk-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                    {right}
                </div>
            )}
            {children}
            {foot && <p className="aura-fl-foot wk-foot">{foot}</p>}
        </section>
    );
}

/** Zeile wie in den iOS-Einstellungen: Symbol, Raum, darunter Luftfeuchte, rechts Temperatur. */
function RoomRow({ room, t, h, open }: { room: Room; t: number | null; h: number | null; open: (r: Room) => void }) {
    const Icon = room.Icon;
    return (
        <button type="button" className="aura-fl-row aura-fl-row--nav wk-row" onClick={() => open(room)}>
            <span className={`aura-fl-row-icon wk-ico${room.humDp ? '' : ' wk-ico--out'}`}>
                <Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title wk-row-title">{room.title}</span>
                {room.humDp && (
                    <span className="aura-fl-row-sub wk-row-sub">Luftfeuchte {fmt(h, room.decimals, '%')}</span>
                )}
            </span>
            <span className="wk-row-val">{fmt(t, room.decimals, room.unit)}</span>
            <ChevronRight size={18} className="aura-fl-chev wk-chev" />
        </button>
    );
}

// ── A: Liste je Etage ────────────────────────────────────────────────────────
function DraftA({ groups, t, h, open }: DraftCtx) {
    return (
        <>
            {groups.map((g) => (
                <Section key={g.id} title={g.title}>
                    <div className="aura-fl-card wk-card">
                        {g.rooms.map((r) => (
                            <RoomRow key={r.id} room={r} t={t(r)} h={h(r)} open={open} />
                        ))}
                    </div>
                </Section>
            ))}
            <p className="aura-fl-foot wk-foot wk-foot--page">Raum antippen für Verlauf, Tiefst- und Höchstwert.</p>
        </>
    );
}

// ── B: Raster in der Karte ───────────────────────────────────────────────────
function DraftB({ groups, t, h, open }: DraftCtx) {
    return (
        <>
            {groups.map((g) => (
                <Section key={g.id} title={g.title}>
                    <div className={`aura-fl-card wk-grid${g.rooms.length % 2 ? ' wk-grid--odd' : ''}`}>
                        {g.rooms.map((r) => {
                            const Icon = r.Icon;
                            return (
                                <button key={r.id} type="button" className="wk-cell" onClick={() => open(r)}>
                                    <span className="wk-cell-head">
                                        <Icon size={15} className="wk-cell-ico" />
                                        <span className="wk-cell-name">{r.title}</span>
                                    </span>
                                    <span className="wk-cell-temp">{fmt(t(r), r.decimals, r.unit)}</span>
                                    {r.humDp && (
                                        <span className="wk-cell-hum">
                                            <Droplets size={12} className="wk-cell-hum-ico" />
                                            {fmt(h(r), r.decimals, '%')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </Section>
            ))}
        </>
    );
}

// ── C: Überblick und Tabelle ─────────────────────────────────────────────────
function DraftC({ groups, t, h, open }: DraftCtx) {
    const outdoor = groups.filter((g) => g.outdoor).flatMap((g) => g.rooms);
    const indoorGroups = groups.filter((g) => !g.outdoor);
    const indoor = indoorGroups.flatMap((g) => g.rooms);
    const dec = indoor[0]?.decimals ?? outdoor[0]?.decimals ?? 1;
    const unit = indoor[0]?.unit ?? '°C';
    const out = outdoor[0];
    return (
        <>
            <Section title="Überblick">
                <div className="aura-fl-card wk-sum">
                    {out && (
                        <button type="button" className="wk-sum-out" onClick={() => open(out)}>
                            <span className="wk-sum-label">{out.title}</span>
                            <span className="wk-sum-big">{fmt(t(out), out.decimals, out.unit)}</span>
                            <span className="wk-sum-hint">
                                Verlauf
                                <ChevronRight size={14} className="wk-sum-hint-chev" />
                            </span>
                        </button>
                    )}
                    <div className="wk-sum-in">
                        <div className="wk-sum-line">
                            <span className="wk-sum-k">Innen im Mittel</span>
                            <span className="wk-sum-v">{fmt(mean(indoor.map(t)), dec, unit)}</span>
                        </div>
                        <div className="wk-sum-line">
                            <span className="wk-sum-k">Spanne</span>
                            <span className="wk-sum-v">{span(indoor.map(t), dec, unit)}</span>
                        </div>
                        <div className="wk-sum-line">
                            <span className="wk-sum-k">Luftfeuchte</span>
                            <span className="wk-sum-v">{span(indoor.map(h), dec, '%')}</span>
                        </div>
                    </div>
                </div>
            </Section>
            {indoorGroups.map((g) => (
                <Section
                    key={g.id}
                    title={g.title}
                    right={
                        <span className="wk-colhead">
                            <span className="wk-colhead-hum">Feuchte</span>
                            <span className="wk-colhead-temp">Temp.</span>
                        </span>
                    }
                >
                    <div className="aura-fl-card wk-table">
                        {g.rooms.map((r) => (
                            <button key={r.id} type="button" className="aura-fl-row aura-fl-row--nav wk-trow" onClick={() => open(r)}>
                                <span className="aura-fl-row-main">
                                    <span className="aura-fl-row-title wk-trow-name">{r.title}</span>
                                </span>
                                <span className="wk-trow-hum">{r.humDp ? fmt(h(r), r.decimals, '%') : ''}</span>
                                <span className="wk-trow-temp">{fmt(t(r), r.decimals, r.unit)}</span>
                            </button>
                        ))}
                    </div>
                </Section>
            ))}
            <p className="aura-fl-foot wk-foot wk-foot--page">Mittel und Spannen aus den Innenräumen. Raum antippen für den Verlauf.</p>
        </>
    );
}

// ── D: Etagen als Unterseiten ────────────────────────────────────────────────
function DraftD({ groups, t, h, open }: DraftCtx) {
    const [floor, setFloor] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen: beim Zurückkommen wieder auf der Übersicht
    useEffect(() => {
        if (hidden) setFloor(null);
    }, [hidden]);

    const outdoor = groups.filter((g) => g.outdoor);
    const indoor = groups.filter((g) => !g.outdoor);
    const sel = indoor.find((g) => g.id === floor) ?? null;

    const home = (
        <div className="wk-d-home">
            {outdoor.map((g) => (
                <Section key={g.id} title={g.title}>
                    <div className="aura-fl-card wk-card">
                        {g.rooms.map((r) => (
                            <RoomRow key={r.id} room={r} t={t(r)} h={h(r)} open={open} />
                        ))}
                    </div>
                </Section>
            ))}
            <Section title="Räume" foot="Rechts das Mittel der Raumtemperaturen, darunter die Spanne der Luftfeuchte.">
                <div className="aura-fl-card wk-card">
                    {indoor.map((g) => {
                        const d = g.rooms[0]?.decimals ?? 1;
                        const u = g.rooms[0]?.unit ?? '°C';
                        return (
                            <button key={g.id} type="button" className="aura-fl-row aura-fl-row--nav wk-row wk-floorrow" onClick={() => setFloor(g.id)}>
                                <span className="aura-fl-row-icon wk-ico wk-ico--floor">
                                    <Layers size={20} />
                                </span>
                                <span className="aura-fl-row-main">
                                    <span className="aura-fl-row-title wk-row-title">{g.title}</span>
                                    <span className="aura-fl-row-sub wk-row-sub">
                                        Luftfeuchte {span(g.rooms.map(h), d, '%')}
                                    </span>
                                </span>
                                <span className="wk-row-val wk-row-val--avg">Ø {fmt(mean(g.rooms.map(t)), d, u)}</span>
                                <ChevronRight size={18} className="aura-fl-chev wk-chev" />
                            </button>
                        );
                    })}
                </div>
            </Section>
        </div>
    );

    const pages = [
        { key: 'home', node: home },
        ...(sel
            ? [
                  {
                      key: `f-${sel.id}`,
                      node: (
                          <div className="ios-page wk-subpage">
                              <IosNavBar
                                  sticky
                                  title={sel.title}
                                  backLabel="Wohnklima"
                                  backFallback="Zurück"
                                  onBack={() => setFloor(null)}
                              />
                              <Section title="" foot="Raum antippen für Verlauf, Tiefst- und Höchstwert.">
                                  <div className="aura-fl-card wk-card">
                                      {sel.rooms.map((r) => (
                                          <RoomRow key={r.id} room={r} t={t(r)} h={h(r)} open={open} />
                                      ))}
                                  </div>
                              </Section>
                          </div>
                      ),
                  },
              ]
            : []),
    ];
    return <IosStack rootRef={rootRef} pages={pages} depth={sel ? 1 : 0} sizing="current" manageScroll bleed={6} />;
}
