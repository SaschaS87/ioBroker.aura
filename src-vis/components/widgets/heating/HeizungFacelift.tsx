/**
 * UI-Facelift, Entwurfsphase Heizung (nur Dev-Vorschau, gelber Umschalter auf „Neu" und ein Buchstabe).
 *
 * Die Seite ist ein einziges Widget (HeatingWidget). Es liest alle Datenpunkte wie bisher und übergibt hier
 * nur die fertigen Werte (HzModel) und eine Funktion, die den Inhalt einer Auswertung liefert (dieselbe
 * Komponente HeatingDetails wie in den heutigen Klappboxen). Die Entwürfe A bis D ordnen das aus den
 * Facelift-Bausteinen (aura-fl-*) neu an und unterscheiden sich vor allem darin, wie man zu den fünf
 * Auswertungen kommt:
 *   A  Liste wie in den iOS-Einstellungen, Auswertung als Pop-up von unten
 *   B  Status groß, Werte als Kacheln, Auswertung als Unterseite von rechts
 *   C  Auswertung klappt in der Karte auf (wie heute)
 *   D  alles auf einer Seite, Auswertung über einen Segment-Schalter
 *
 * Nur lesend: kein Schreibbefehl, kein Datenpunkt wird angelegt.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    ChevronDown,
    ChevronRight,
    Droplet,
    Flame,
    Gauge,
    History,
    Power,
    RefreshCw,
    Snowflake,
    SunMedium,
    Thermometer,
    Waves,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { formatNum } from '../../../utils/formatValue';
import { IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import { HeizungSheet } from './HeizungSheet';
import type { HeizungDraft } from './heizungDraft';
import './HeizungFacelift.css';

export type HzBox = 'heizkreis' | 'betrieb' | 'warmwasser' | 'aussen' | 'energie';

export interface HzModel {
    mode: 'heat' | 'water' | 'idle';
    modeLabel: string;
    sinceText: string;
    pumpe: boolean;
    abtauen: boolean;
    heizstab: boolean;
    vorlauf: number | null;
    ruecklauf: number | null;
    spreizung: number | null;
    volumenstrom: number | null;
    aussen: number | null;
}

const BOXES: { key: HzBox; title: string; short: string; sub: string; Icon: LucideIcon }[] = [
    { key: 'heizkreis', title: 'Heizkreis', short: 'Heizkreis', sub: 'Vorlauf/Rücklauf · HK1-Soll', Icon: Activity },
    { key: 'betrieb', title: 'Betrieb', short: 'Betrieb', sub: 'Was lief wann', Icon: History },
    { key: 'warmwasser', title: 'Warmwasser', short: 'Wasser', sub: 'Ist · Soll · Hysterese', Icon: Droplet },
    { key: 'aussen', title: 'Außenfühler-Check', short: 'Fühler', sub: 'Fühler · Netatmo · Sonne', Icon: SunMedium },
    { key: 'energie', title: 'Energie', short: 'Energie', sub: 'Strom · Wärme · Arbeitszahl', Icon: Zap },
];

const MODE_ICON: Record<HzModel['mode'], LucideIcon> = { heat: Flame, water: Droplet, idle: Power };

/** Wert mit Einheit wie auf der heutigen Seite (Leerzeichen vor der Einheit), sonst Gedankenstrich. */
const val = (v: number | null, d: number, unit: string) => (v !== null ? `${formatNum(v, d)} ${unit}` : '–');

interface ValueDef {
    key: string;
    label: string;
    short: string;
    text: string;
    Icon: LucideIcon;
}
function values(m: HzModel): ValueDef[] {
    return [
        { key: 'vl', label: 'Vorlauf', short: 'Vorlauf', text: val(m.vorlauf, 1, '°C'), Icon: ArrowUpFromLine },
        { key: 'rl', label: 'Rücklauf', short: 'Rücklauf', text: val(m.ruecklauf, 1, '°C'), Icon: ArrowDownToLine },
        { key: 'sp', label: 'Spreizung', short: 'Spreizung', text: val(m.spreizung, 1, 'K'), Icon: Gauge },
        { key: 'vs', label: 'Volumenstrom', short: 'Volumenstr.', text: val(m.volumenstrom, 0, 'l/min'), Icon: Waves },
        { key: 'at', label: 'Außentemperatur', short: 'Außen', text: val(m.aussen, 1, '°C'), Icon: Thermometer },
    ];
}
const vlrl = (m: HzModel) =>
    m.vorlauf !== null && m.ruecklauf !== null ? `${formatNum(m.vorlauf, 1)} / ${formatNum(m.ruecklauf, 1)} °C` : '–';

const PARTS: { key: 'pumpe' | 'abtauen' | 'heizstab'; label: string; Icon: LucideIcon }[] = [
    { key: 'pumpe', label: 'Pumpe', Icon: RefreshCw },
    { key: 'abtauen', label: 'Abtauen', Icon: Snowflake },
    { key: 'heizstab', label: 'Heizstab', Icon: Zap },
];

interface Ctx {
    m: HzModel;
    details: (b: HzBox) => ReactNode;
}

export function HeizungFacelift({ draft, m, details }: Ctx & { draft: Exclude<HeizungDraft, 'ALT'> }) {
    const ctx: Ctx = { m, details };
    let body: ReactNode;
    if (draft === 'A') body = <DraftA {...ctx} />;
    else if (draft === 'B') body = <DraftB {...ctx} />;
    else if (draft === 'C') body = <DraftC {...ctx} />;
    else body = <DraftD {...ctx} />;
    return (
        <div className={`aura-fl-scope hz-page hz-page--${draft.toLowerCase()}`} data-hz-draft={draft} data-widget-interactive>
            {body}
        </div>
    );
}

// ── gemeinsame Teile ─────────────────────────────────────────────────────────

function Section({ title, children, foot }: { title?: string; children: ReactNode; foot?: ReactNode }) {
    return (
        <section className={`aura-fl-section hz-section${title ? '' : ' hz-section--plain'}`}>
            {title && (
                <div className="aura-fl-section-head hz-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                </div>
            )}
            {children}
            {foot && <p className="aura-fl-foot hz-foot">{foot}</p>}
        </section>
    );
}

/** Zeile „Was die Wärmepumpe gerade tut": Symbol in der Farbe des Betriebs, darunter der Verdichter. */
function StatusRow({ m, sub }: { m: HzModel; sub?: ReactNode }) {
    const Icon = MODE_ICON[m.mode];
    return (
        <div className="aura-fl-row hz-status" data-mode={m.mode}>
            <span className="aura-fl-row-icon hz-ico hz-ico--mode">
                <Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title hz-row-title">{m.modeLabel}</span>
                <span className="aura-fl-row-sub">{sub ?? m.sinceText}</span>
            </span>
        </div>
    );
}

/** Pumpe · Abtauen · Heizstab als kleine Marken (aktiv farbig, sonst blass) */
function Chips({ m }: { m: HzModel }) {
    return (
        <div className="hz-chips" data-mode={m.mode}>
            {PARTS.map(({ key, label, Icon }) => (
                <span key={key} className="hz-chip" data-on={m[key] || undefined}>
                    <Icon size={15} />
                    {label}
                </span>
            ))}
        </div>
    );
}

function ValueRow({ v }: { v: ValueDef }) {
    return (
        <div className="aura-fl-row hz-valrow">
            <span className="aura-fl-row-icon hz-ico">
                <v.Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title hz-row-title">{v.label}</span>
            </span>
            <span className="hz-row-val">{v.text}</span>
        </div>
    );
}

function BoxRow({ box, onClick, chev }: { box: (typeof BOXES)[number]; onClick: () => void; chev: ReactNode }) {
    return (
        <button type="button" className="aura-fl-row aura-fl-row--nav hz-boxrow" onClick={onClick}>
            <span className="aura-fl-row-icon hz-ico">
                <box.Icon size={20} />
            </span>
            <span className="aura-fl-row-main">
                <span className="aura-fl-row-title hz-row-title">{box.title}</span>
                <span className="aura-fl-row-sub">{box.sub}</span>
            </span>
            {chev}
        </button>
    );
}

// ── A: Liste, Auswertungen als Pop-up ────────────────────────────────────────
function DraftA({ m, details }: Ctx) {
    const [sheet, setSheet] = useState<{ box: HzBox; seq: number } | null>(null);
    const open = BOXES.find((b) => b.key === sheet?.box);
    return (
        <>
            <Section title="Wärmepumpe">
                <div className="aura-fl-card">
                    <StatusRow m={m} />
                    {PARTS.map(({ key, label, Icon }) => (
                        <div key={key} className="aura-fl-row hz-valrow">
                            <span className="aura-fl-row-icon hz-ico" data-on={m[key] || undefined}>
                                <Icon size={20} />
                            </span>
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title hz-row-title">{label}</span>
                            </span>
                            <span className={`hz-row-val${m[key] ? '' : ' hz-row-val--off'}`}>{m[key] ? 'Ein' : 'Aus'}</span>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="Aktuelle Werte">
                <div className="aura-fl-card">
                    {values(m).map((v) => (
                        <ValueRow key={v.key} v={v} />
                    ))}
                </div>
            </Section>
            <Section title="Auswertungen">
                <div className="aura-fl-card">
                    {BOXES.map((b) => (
                        <BoxRow
                            key={b.key}
                            box={b}
                            onClick={() => setSheet((s) => ({ box: b.key, seq: (s?.seq ?? 0) + 1 }))}
                            chev={<ChevronRight size={18} className="aura-fl-chev" />}
                        />
                    ))}
                </div>
            </Section>
            {sheet && open && (
                <HeizungSheet key={sheet.seq} title={open.title} onClose={() => setSheet(null)}>
                    <div className="aura-fl-card hz-detail">{details(open.key)}</div>
                </HeizungSheet>
            )}
        </>
    );
}

// ── B: Status groß, Kacheln, Unterseiten ─────────────────────────────────────
function DraftB({ m, details }: Ctx) {
    const [box, setBox] = useState<HzBox | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen: beim Zurückkommen wieder auf der Übersicht
    useEffect(() => {
        if (hidden) setBox(null);
    }, [hidden]);
    const sel = BOXES.find((b) => b.key === box) ?? null;
    const Icon = MODE_ICON[m.mode];
    const tiles = [
        { key: 'vlrl', label: 'Vorlauf / Rücklauf', text: vlrl(m) },
        { key: 'sp', label: 'Spreizung', text: val(m.spreizung, 1, 'K') },
        { key: 'vs', label: 'Volumenstrom', text: val(m.volumenstrom, 0, 'l/min') },
        { key: 'at', label: 'Außentemperatur', text: val(m.aussen, 1, '°C') },
    ];

    const home = (
        <div className="hz-b-home">
            <Section>
                <div className="aura-fl-card hz-hero" data-mode={m.mode}>
                    <span className="hz-hero-title">
                        <Icon size={24} />
                        {m.modeLabel}
                    </span>
                    <span className="hz-hero-sub">{m.sinceText}</span>
                    <Chips m={m} />
                </div>
            </Section>
            <Section>
                <div className="aura-fl-card hz-grid">
                    {tiles.map((t) => (
                        <div key={t.key} className="hz-cell">
                            <span className="hz-cell-label">{t.label}</span>
                            <span className="hz-cell-val">{t.text}</span>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="Auswertungen">
                <div className="aura-fl-card">
                    {BOXES.map((b) => (
                        <BoxRow
                            key={b.key}
                            box={b}
                            onClick={() => setBox(b.key)}
                            chev={<ChevronRight size={18} className="aura-fl-chev" />}
                        />
                    ))}
                </div>
            </Section>
        </div>
    );

    const pages = [
        { key: 'home', node: home },
        ...(sel
            ? [
                  {
                      key: `b-${sel.key}`,
                      node: (
                          <div className="ios-page hz-subpage">
                              <IosNavBar
                                  sticky
                                  title={sel.title}
                                  backLabel="Heizung"
                                  backFallback="Zurück"
                                  onBack={() => setBox(null)}
                              />
                              <div className="aura-fl-card hz-detail">{details(sel.key)}</div>
                          </div>
                      ),
                  },
              ]
            : []),
    ];
    return <IosStack rootRef={rootRef} pages={pages} depth={sel ? 1 : 0} sizing="current" manageScroll bleed={6} />;
}

// ── C: Aufklappen in der Karte ───────────────────────────────────────────────
function DraftC({ m, details }: Ctx) {
    const [openBox, setOpenBox] = useState<HzBox | null>(null);
    const vs = values(m);
    return (
        <>
            <Section>
                <div className="aura-fl-card">
                    <StatusRow m={m} />
                    <div className="hz-chiprow">
                        <Chips m={m} />
                    </div>
                </div>
            </Section>
            <Section title="Aktuelle Werte">
                <div className="aura-fl-card">
                    <div className="aura-fl-row hz-valrow hz-valrow--plain">
                        <span className="aura-fl-row-main">
                            <span className="aura-fl-row-title hz-row-title">Vorlauf / Rücklauf</span>
                        </span>
                        <span className="hz-row-val">{vlrl(m)}</span>
                    </div>
                    {vs.slice(2).map((v) => (
                        <div key={v.key} className="aura-fl-row hz-valrow hz-valrow--plain">
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title hz-row-title">{v.label}</span>
                            </span>
                            <span className="hz-row-val">{v.text}</span>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="Auswertungen" foot="Zeile antippen, die Auswertung klappt darunter auf.">
                <div className="aura-fl-card">
                    {BOXES.map((b) => {
                        const isOpen = openBox === b.key;
                        return (
                            <div key={b.key} className="hz-fold" data-open={isOpen || undefined}>
                                <BoxRow
                                    box={b}
                                    onClick={() => setOpenBox(isOpen ? null : b.key)}
                                    chev={<ChevronDown size={18} className={`aura-fl-chev hz-fold-chev${isOpen ? ' is-open' : ''}`} />}
                                />
                                {isOpen && <div className="hz-fold-body hz-detail">{details(b.key)}</div>}
                            </div>
                        );
                    })}
                </div>
            </Section>
        </>
    );
}

// ── D: Alles auf einer Seite ─────────────────────────────────────────────────
function DraftD({ m, details }: Ctx) {
    const [box, setBox] = useState<HzBox>('heizkreis');
    const on = PARTS.filter((p) => m[p.key]).map((p) => p.label);
    const strip = [
        { key: 'vlrl', label: 'Vor- / Rücklauf', text: vlrl(m) },
        { key: 'sp', label: 'Spreizung', text: val(m.spreizung, 1, 'K') },
        { key: 'vs', label: 'Volumenstr.', text: val(m.volumenstrom, 0, 'l/min') },
        { key: 'at', label: 'Außen', text: val(m.aussen, 1, '°C') },
    ];
    return (
        <>
            <Section>
                <div className="aura-fl-card">
                    <StatusRow m={m} sub={`${m.sinceText}${on.length ? ` · ${on.join(', ')}` : ''}`} />
                    <div className="hz-strip">
                        {strip.map((s) => (
                            <div key={s.key} className="hz-strip-item">
                                <span className="hz-strip-val">{s.text}</span>
                                <span className="hz-strip-label">{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Section>
            <Section title="Auswertung">
                <div className="aura-fl-card hz-inline">
                    <div className="hz-tabs" role="tablist" aria-label="Auswertung">
                        {BOXES.map((b) => (
                            <button
                                key={b.key}
                                type="button"
                                role="tab"
                                aria-selected={box === b.key}
                                className="hz-tab"
                                data-on={box === b.key || undefined}
                                onClick={() => setBox(b.key)}
                            >
                                {b.short}
                            </button>
                        ))}
                    </div>
                    <div key={box} className="hz-inline-body">
                        {details(box)}
                    </div>
                </div>
            </Section>
        </>
    );
}
