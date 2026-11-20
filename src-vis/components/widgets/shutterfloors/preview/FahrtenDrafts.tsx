/**
 * „Letzte Fahrten" – die drei Entwürfe A, B, C (nur Dev-Vorschau). Alles aus den Facelift-Bausteinen
 * (aura-fl-section, -card, -row, -foot), Farben nur über Theme-Variablen (FahrtenDrafts.css).
 *
 * A: Zeile „Letzte Fahrten" unter Automatik → Unterseite nach Tagen → Lauf als eigene Unterseite.
 * B: Eigener Abschnitt „Letzte Fahrten" im Tab mit den letzten drei, „Alle" rechts im Titel; jede Zeile
 *    klappt an Ort und Stelle auf.
 * C: Zeile unter Automatik → Unterseite mit Reitern „Fahrten | Rollläden"; Auffälliges oben; Lauf als
 *    Pop-up von unten.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertTriangle,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronRight,
    History,
    Minus,
    OctagonX,
    Smartphone,
} from 'lucide-react';
import { useSheetDismiss } from '../../useSheetDismiss';
import { Seg, DeviceGlyph } from '../planner/parts';
import type { ShutterFloorDef } from '../types';
import {
    ergebnisKurz,
    ergebnisText,
    hhmm,
    nachTag,
    tagText,
    wannText,
    zielLage,
    zielText,
    type Lauf,
    type LaufZiel,
} from './fahrtenModel';

// ── Kleinteile ─────────────────────────────────────────────────────────

function LaufIcon({ l }: { l: Lauf }) {
    if (l.lage === 'fehler')
        return (
            <span className="sf-ico aura-fl-row-icon lf-ico is-fehler">
                <AlertTriangle size={16} />
            </span>
        );
    if (l.art === 'abbruch')
        return (
            <span className="sf-ico aura-fl-row-icon lf-ico is-warn">
                <OctagonX size={16} />
            </span>
        );
    return l.art === 'plan' ? (
        <span className="sf-ico is-orange aura-fl-row-icon">
            <CalendarClock size={16} />
        </span>
    ) : (
        <span className="sf-ico is-purple aura-fl-row-icon">
            <Smartphone size={16} />
        </span>
    );
}

function Mark({ s }: { s: ReturnType<typeof zielLage> }) {
    if (s === 'gefahren' || s === 'trocken') return <Check size={18} className="lf-mark is-ok" aria-label="gefahren" />;
    if (s === 'stand') return <Minus size={18} className="lf-mark is-idle" aria-label="stand schon" />;
    if (s === 'fehler') return <AlertTriangle size={18} className="lf-mark is-fehler" aria-label="Fehler" />;
    return <OctagonX size={18} className="lf-mark is-warn" aria-label="abgebrochen" />;
}

function Section({
    title,
    right,
    children,
    foot,
}: {
    title: string;
    right?: ReactNode;
    children: ReactNode;
    foot?: ReactNode;
}) {
    return (
        <section className="aura-fl-section">
            <div className="aura-fl-section-head lf-head">
                <h2 className="aura-fl-section-title">{title}</h2>
                {right}
            </div>
            <div className="aura-fl-card">{children}</div>
            {foot && <p className="aura-fl-foot">{foot}</p>}
        </section>
    );
}

function LaufRow({ l, sub, onClick, chev = true }: { l: Lauf; sub: string; onClick?: () => void; chev?: boolean }) {
    return (
        <button type="button" className="sf-row sf-row--nav aura-fl-row aura-fl-row--nav" onClick={onClick}>
            <LaufIcon l={l} />
            <span className="sf-main aura-fl-row-main">
                <span className="sf-name aura-fl-row-title">{l.titel}</span>
                <span className={`sf-val aura-fl-row-sub${l.lage === 'fehler' ? ' lf-sub-fehler' : ''}`}>{sub}</span>
            </span>
            {chev && <ChevronRight size={18} className="sf-chev aura-fl-chev" />}
        </button>
    );
}

function ZielRow({ z }: { z: LaufZiel }) {
    const s = zielLage(z);
    return (
        <div className="sf-row aura-fl-row">
            <span className={`sf-ico is-${z.kind} aura-fl-row-icon`}>
                <DeviceGlyph kind={z.kind} closed={z.ziel} size={16} />
            </span>
            <span className="sf-main aura-fl-row-main">
                <span className="sf-name aura-fl-row-title">{z.label}</span>
                <span className={`sf-val aura-fl-row-sub${s === 'fehler' ? ' lf-sub-fehler' : ''}`}>{zielText(z)}</span>
            </span>
            <Mark s={s} />
        </div>
    );
}

function KV({ k, v }: { k: string; v: string }) {
    return (
        <div className="sf-row aura-fl-row">
            <span className="sf-main aura-fl-row-main">
                <span className="sf-name aura-fl-row-title">{k}</span>
            </span>
            <span className="lf-val">{v}</span>
        </div>
    );
}

/** Rollläden eines Laufs nach Etage, Etagen in der Reihenfolge der Konfiguration */
function nachEtage(l: Lauf, floors: ShutterFloorDef[]): { floor: string; ziele: LaufZiel[] }[] {
    const order = floors.map((f) => f.name);
    const map = new Map<string, LaufZiel[]>();
    for (const z of l.ziele) map.set(z.floor, [...(map.get(z.floor) ?? []), z]);
    return [...map.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([floor, ziele]) => ({ floor: floor || 'Ohne Etage', ziele }));
}

const FOOT_LAUF =
    '„Gefahren" heißt: Die Box hat den Befehl angenommen. Links steht, wo der Rollladen vorher war. Fahrten am Wandschalter oder einzeln in der App stehen hier nicht.';

function LaufDetail({ l, floors }: { l: Lauf; floors: ShutterFloorDef[] }) {
    return (
        <>
            <Section title="Überblick">
                <KV k="Zeit" v={`${tagText(l.zeit)} ${hhmm(l.zeit)}`} />
                <KV k="Auslöser" v={l.quelle || '–'} />
                <KV k="Ergebnis" v={ergebnisText(l) || '–'} />
            </Section>
            {nachEtage(l, floors).map((g, i, arr) => (
                <Section key={g.floor} title={g.floor} foot={i === arr.length - 1 ? FOOT_LAUF : undefined}>
                    {g.ziele.map((z) => (
                        <ZielRow key={z.key} z={z} />
                    ))}
                </Section>
            ))}
        </>
    );
}

function Leer({ geladen }: { geladen: boolean }) {
    return (
        <Section title="Letzte Fahrten">
            <div className="sf-row aura-fl-row">
                <span className="sf-main aura-fl-row-main">
                    <span className="sf-val aura-fl-row-sub">
                        {geladen ? 'Noch keine Fahrten aufgezeichnet' : 'Lädt …'}
                    </span>
                </span>
            </div>
        </Section>
    );
}

// ── Zeile unter „Automatik" (A und C) ──────────────────────────────────

export function FahrtenAutomatikRow({ laeufe, onOpen }: { laeufe: Lauf[]; onOpen: () => void }) {
    const l = laeufe[0];
    const fehler = laeufe.filter((x) => x.lage === 'fehler').length;
    const sub = !l
        ? 'Noch keine'
        : fehler
          ? `${fehler} mit Fehler · zuletzt ${wannText(l.zeit)}`
          : `${wannText(l.zeit)} · ${l.titel}`;
    return (
        <button type="button" className="sf-row sf-row--nav aura-fl-row aura-fl-row--nav" onClick={onOpen}>
            <span className={`sf-ico aura-fl-row-icon lf-ico ${fehler ? 'is-fehler' : 'is-log'}`}>
                <History size={16} />
            </span>
            <span className="sf-main aura-fl-row-main">
                <span className="sf-name aura-fl-row-title">Letzte Fahrten</span>
                <span className="sf-val aura-fl-row-sub">{sub}</span>
            </span>
            <ChevronRight size={18} className="sf-chev aura-fl-chev" />
        </button>
    );
}

// ── Entwurf A: Unterseite nach Tagen, Lauf als eigene Seite ───────────

export function FahrtenPageA({
    laeufe,
    geladen,
    onRun,
}: {
    laeufe: Lauf[];
    geladen: boolean;
    onRun: (l: Lauf) => void;
}) {
    if (!laeufe.length) return <Leer geladen={geladen} />;
    const tage = nachTag(laeufe);
    return (
        <>
            {tage.map((t, i) => (
                <Section
                    key={t.tag}
                    title={t.tag}
                    foot={
                        i === tage.length - 1
                            ? `Die letzten ${laeufe.length} Läufe aus Zeitplan und Szenen.`
                            : undefined
                    }
                >
                    {t.laeufe.map((l) => (
                        <LaufRow
                            key={l.id}
                            l={l}
                            sub={`${hhmm(l.zeit)} · ${l.quelleKurz} · ${ergebnisKurz(l)}`}
                            onClick={() => onRun(l)}
                        />
                    ))}
                </Section>
            ))}
        </>
    );
}

export function LaufPageA({ l, floors }: { l: Lauf | undefined; floors: ShutterFloorDef[] }) {
    if (!l) return <Leer geladen />;
    return <LaufDetail l={l} floors={floors} />;
}

// ── Entwurf B: Abschnitt im Tab, Zeilen klappen auf ───────────────────

function AufklappLauf({ l, open, toggle, withDay }: { l: Lauf; open: boolean; toggle: () => void; withDay: boolean }) {
    const when = withDay ? wannText(l.zeit) : hhmm(l.zeit);
    return (
        <div className={`lf-fold${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="sf-row sf-row--nav aura-fl-row aura-fl-row--nav"
                onClick={toggle}
                aria-expanded={open}
            >
                <LaufIcon l={l} />
                <span className="sf-main aura-fl-row-main">
                    <span className="sf-name aura-fl-row-title">{l.titel}</span>
                    <span className={`sf-val aura-fl-row-sub${l.lage === 'fehler' ? ' lf-sub-fehler' : ''}`}>
                        {`${when} · ${l.quelleKurz} · ${ergebnisKurz(l)}`}
                    </span>
                </span>
                <ChevronDown size={18} className="sf-chev aura-fl-chev lf-fold-chev" />
            </button>
            {open && (
                <div className="lf-fold-body">
                    <div className="lf-fold-floor">{`${l.quelle} · ${ergebnisText(l)}`}</div>
                    {/* nur Rollläden, die etwas getan haben (oder scheiterten); „standen schon" bleibt eine Zeile */}
                    {l.ziele
                        .filter((z) => zielLage(z) !== 'stand')
                        .map((z) => (
                            <ZielRow key={z.key} z={z} />
                        ))}
                    {l.n.stand > 0 && (
                        <div className="lf-fold-floor lf-fold-rest">
                            {`Standen schon: ${l.ziele
                                .filter((z) => zielLage(z) === 'stand')
                                .map((z) => z.label)
                                .join(', ')}`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function FahrtenSectionB({ laeufe, geladen, onAll }: { laeufe: Lauf[]; geladen: boolean; onAll: () => void }) {
    const [open, setOpen] = useState<string | null>(null);
    if (!laeufe.length) return <Leer geladen={geladen} />;
    const top = laeufe.slice(0, 3);
    const rest = laeufe.length - top.length;
    return (
        <Section
            title="Letzte Fahrten"
            right={
                rest > 0 ? (
                    <button type="button" className="aura-fl-fold lf-all" onClick={onAll}>
                        <span className="aura-fl-fold-label">{`${rest} weitere`}</span>
                        <ChevronRight size={14} className="aura-fl-fold-chev" />
                    </button>
                ) : undefined
            }
        >
            {top.map((l) => (
                <AufklappLauf
                    key={l.id}
                    l={l}
                    withDay
                    open={open === l.id}
                    toggle={() => setOpen(open === l.id ? null : l.id)}
                />
            ))}
        </Section>
    );
}

export function FahrtenPageB({ laeufe, geladen }: { laeufe: Lauf[]; geladen: boolean }) {
    const [open, setOpen] = useState<string | null>(null);
    if (!laeufe.length) return <Leer geladen={geladen} />;
    return (
        <>
            {nachTag(laeufe).map((t) => (
                <Section key={t.tag} title={t.tag}>
                    {t.laeufe.map((l) => (
                        <AufklappLauf
                            key={l.id}
                            l={l}
                            withDay={false}
                            open={open === l.id}
                            toggle={() => setOpen(open === l.id ? null : l.id)}
                        />
                    ))}
                </Section>
            ))}
        </>
    );
}

// ── Entwurf C: Reiter Fahrten | Rollläden, Lauf als Pop-up ────────────

function LaufSheet({ l, floors, onClose }: { l: Lauf; floors: ShutterFloorDef[]; onClose: () => void }) {
    const { sheetStyle, backdropStyle, scrimClosing, dragHandlers, onBackdropClick, startClose } =
        useSheetDismiss(onClose);
    const target = document.querySelector('[data-aura-app="frontend"]') ?? document.body;
    return createPortal(
        <div
            className="sds-backdrop aura-scrim"
            data-scrim-closing={scrimClosing}
            style={backdropStyle}
            onClick={onBackdropClick}
        >
            <div
                className="sds lf-sheet"
                style={sheetStyle}
                role="dialog"
                aria-modal="true"
                aria-label={l.titel}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="sds-drag"
                    {...dragHandlers}
                    role="button"
                    tabIndex={0}
                    aria-label="Nach unten wischen zum Schließen"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') startClose();
                    }}
                >
                    <div className="sds-grip" />
                    <div className="sds-head">
                        <div className="sds-head-text">
                            <div className="sds-title">{l.titel}</div>
                            <div className="sds-sub">{`${wannText(l.zeit)} · ${l.quelle}`}</div>
                        </div>
                    </div>
                </div>
                <div className="aura-fl-sheet-body lf-sheet-scroll aura-fl-scope">
                    <p className="lf-sheet-sum">{ergebnisText(l)}</p>
                    {nachEtage(l, floors).map((g, i, arr) => (
                        <Section key={g.floor} title={g.floor} foot={i === arr.length - 1 ? FOOT_LAUF : undefined}>
                            {g.ziele.map((z) => (
                                <ZielRow key={z.key} z={z} />
                            ))}
                        </Section>
                    ))}
                </div>
            </div>
        </div>,
        target,
    );
}

function proRollladen(laeufe: Lauf[], floors: ShutterFloorDef[]) {
    return floors.map((f) => ({
        floor: f.name,
        rows: f.devices.map((d) => {
            // letzter Lauf, in dem dieser Rollladen wirklich etwas tat (oder scheiterte)
            let hit: { l: Lauf; z: LaufZiel } | null = null;
            let fehler: { l: Lauf; z: LaufZiel } | null = null;
            for (const l of laeufe) {
                const z = l.ziele.find((x) => x.key === d.key);
                if (!z) continue;
                const s = zielLage(z);
                if (s === 'fehler' && !fehler && !hit) fehler = { l, z };
                if (s !== 'stand' && !hit) hit = { l, z };
            }
            return { d, hit, fehler };
        }),
    }));
}

export function FahrtenPageC({
    laeufe,
    geladen,
    floors,
}: {
    laeufe: Lauf[];
    geladen: boolean;
    floors: ShutterFloorDef[];
}) {
    const [tab, setTab] = useState<'zeit' | 'roll'>('zeit');
    const [sheet, setSheet] = useState<Lauf | null>(null);
    const auff = laeufe.filter((l) => l.lage !== 'ok');
    return (
        <>
            <div className="lf-seg">
                <Seg
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'zeit', label: 'Fahrten' },
                        { value: 'roll', label: 'Rollläden' },
                    ]}
                />
            </div>
            {!laeufe.length ? (
                <Leer geladen={geladen} />
            ) : tab === 'zeit' ? (
                <>
                    {auff.length > 0 && (
                        <Section title="Auffällig">
                            {auff.map((l) => (
                                <LaufRow
                                    key={l.id}
                                    l={l}
                                    sub={`${wannText(l.zeit)} · ${ergebnisKurz(l)}`}
                                    onClick={() => setSheet(l)}
                                />
                            ))}
                        </Section>
                    )}
                    <Section
                        title="Alle"
                        foot={`Die letzten ${laeufe.length} Läufe aus Zeitplan und Szenen. Antippen zeigt jeden Rollladen.`}
                    >
                        {laeufe.map((l) => (
                            <LaufRow
                                key={l.id}
                                l={l}
                                sub={`${wannText(l.zeit)} · ${l.quelleKurz} · ${ergebnisKurz(l)}`}
                                onClick={() => setSheet(l)}
                            />
                        ))}
                    </Section>
                </>
            ) : (
                proRollladen(laeufe, floors).map((g, i, arr) => (
                    <Section
                        key={g.floor}
                        title={g.floor}
                        foot={
                            i === arr.length - 1
                                ? 'Je Rollladen die letzte Fahrt, bei der er sich bewegt hat. Einzelfahrten am Schalter fehlen.'
                                : undefined
                        }
                    >
                        {g.rows.map(({ d, hit, fehler }) => {
                            const shown = fehler ?? hit;
                            return (
                                <button
                                    key={d.key}
                                    type="button"
                                    className="sf-row sf-row--nav aura-fl-row aura-fl-row--nav"
                                    disabled={!shown}
                                    onClick={() => shown && setSheet(shown.l)}
                                >
                                    <span className={`sf-ico is-${d.kind} aura-fl-row-icon`}>
                                        <DeviceGlyph kind={d.kind} closed={shown?.z.ziel ?? null} size={16} />
                                    </span>
                                    <span className="sf-main aura-fl-row-main">
                                        <span className="sf-name aura-fl-row-title">{d.label}</span>
                                        <span className={`sf-val aura-fl-row-sub${fehler ? ' lf-sub-fehler' : ''}`}>
                                            {shown
                                                ? `${wannText(shown.l.zeit)} · ${zielText(shown.z)}`
                                                : 'in den letzten Läufen nicht bewegt'}
                                        </span>
                                    </span>
                                    {shown && <ChevronRight size={18} className="sf-chev aura-fl-chev" />}
                                </button>
                            );
                        })}
                    </Section>
                ))
            )}
            {sheet && <LaufSheet l={sheet} floors={floors} onClose={() => setSheet(null)} />}
        </>
    );
}
