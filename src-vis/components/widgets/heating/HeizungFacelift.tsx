/**
 * UI-Facelift, Entwurfsphase Heizung (nur Dev-Vorschau, gelber Umschalter auf „Neu" und ein Buchstabe).
 *
 * Die Seite ist ein einziges Widget (HeatingWidget). Es liest alle Datenpunkte wie bisher und übergibt hier
 * nur die fertigen Werte (HzModel) und eine Funktion, die den Inhalt einer Auswertung liefert (dieselbe
 * Komponente HeatingDetails wie in den heutigen Klappboxen).
 *
 * Runde 2 (Saschas Rückmeldung vom 13.11.2026 zu A–D, Commit 4673aa9de):
 *   - Kopf wie in C: eine Zeile „was die Wärmepumpe gerade tut", darunter Pumpe · Abtauen · Heizstab
 *   - Auswertungen als Unterseiten von rechts (wie in B), mit Begleittext unter dem Diagramm
 *   - offen ist die Form der aktuellen Werte, darin unterscheiden sich die Entwürfe:
 *       E  Liste mit Symbolen (aus A)      F  Kacheln (aus B)      G  schlichte Zeilen (aus C)
 *   - Leiste „Betrieb zeigen": stellt Heizen, Warmwasser, Bereit und Abtauen nur in der Anzeige nach
 *
 * Runde 3 (Sascha, 13.11.2026): Die Kopf-Karte soll sich im Betrieb ganz einfärben. Der Kopf ist deshalb
 * getrennt wählbar (Leiste „Kopf"): A–D sind die Köpfe aus Runde 1, 1–15 die eingefärbten Varianten
 * (HEIZUNG_HEADS in heizungDraft.ts). E/F/G bleiben die Form der aktuellen Werte.
 *
 * Runde 4 (Sascha, 13.11.2026): Abtauen ist kein Betrieb, sondern eine Ein/Aus-Angabe wie Pumpe und
 * Heizstab: in der Leiste „Betrieb" deshalb drei eigene Schalter. Heizen rötlich statt grün. Leiste
 * „Marken": fünf Arten, wie die drei Angaben im Kopf zeigen, ob sie aktiv sind (HEIZUNG_INDS).
 *
 * Entschieden (Sascha, 14.11.2026): Kopf 11, Marken b, Werte G. Die gelben Leisten sind über HZ_PICK
 * abgeschaltet (Code bleibt, falls er es sich anders überlegt); die Seite zeigt dann immer die echten Werte.
 *
 * Nur lesend: kein Schreibbefehl, kein Datenpunkt wird angelegt.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
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
import {
    HEIZUNG_HEADS,
    HEIZUNG_INDS,
    HEIZUNG_SCENES,
    HZ_PICK,
    useHeizungHead,
    useHeizungHeadStore,
    useHeizungInd,
    useHeizungIndStore,
    useHeizungSceneStore,
    type HeizungDraft,
    type HeizungHeadFill,
    type HeizungHeadLay,
    type HeizungScene,
} from './heizungDraft';
import { HZ_SUB_PICK, HZ_ZOOM, HzSubpageProvider, useHzSubStore } from './HzSubpage';

/** Unterseiten mit Zeitdiagramm, auf denen die Zoom-Auswahl gilt. */
const ZOOM_BOXES = new Set<string>(['heizkreis', 'betrieb', 'warmwasser']);
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

const BOXES: { key: HzBox; title: string; sub: string; Icon: LucideIcon; foot: string }[] = [
    {
        key: 'heizkreis',
        title: 'Heizkreis',
        sub: 'Vorlauf/Rücklauf · HK1-Soll',
        Icon: Activity,
        foot: 'Vorlauf und Rücklauf des Heizkreises, die rötliche Fläche dazwischen ist die Spreizung. Gestrichelt der Sollwert für Heizkreis 1.',
    },
    {
        key: 'betrieb',
        title: 'Betrieb',
        sub: 'Was lief wann',
        Icon: History,
        foot: 'Oben Vorlauf und Rücklauf, darunter als Balken, wann Pumpe, Verdichter, Heizen und Warmwasser liefen.',
    },
    {
        key: 'warmwasser',
        title: 'Warmwasser',
        sub: 'Ist · Soll · Hysterese',
        Icon: Droplet,
        foot: 'Temperatur im Warmwasserspeicher gegen den Sollwert. Das blaue Band ist die Hysterese.',
    },
    {
        key: 'aussen',
        title: 'Außenfühler-Check',
        sub: 'Fühler · Netatmo · Sonne',
        Icon: SunMedium,
        foot: 'Vergleicht den Außenfühler der Wärmepumpe mit den Netatmo-Stationen. Die Balken zeigen die Abweichung, das Punktebild darunter die Abweichung je nach Helligkeit.',
    },
    {
        key: 'energie',
        title: 'Energie',
        sub: 'Strom · Wärme · Arbeitszahl',
        Icon: Zap,
        foot: 'Strom, erzeugte Wärme und Arbeitszahl der letzten 30 Tage, darunter die Zähler seit Inbetriebnahme.',
    },
];

const MODE_ICON: Record<HzModel['mode'], LucideIcon> = { heat: Flame, water: Droplet, idle: Power };

/** Wert mit Einheit wie auf der heutigen Seite (Leerzeichen vor der Einheit), sonst Gedankenstrich. */
const val = (v: number | null, d: number, unit: string) => (v !== null ? `${formatNum(v, d)} ${unit}` : '–');
const vlrl = (m: HzModel) =>
    m.vorlauf !== null && m.ruecklauf !== null ? `${formatNum(m.vorlauf, 1)} / ${formatNum(m.ruecklauf, 1)} °C` : '–';

const PARTS: { key: 'pumpe' | 'abtauen' | 'heizstab'; label: string; Icon: LucideIcon }[] = [
    { key: 'pumpe', label: 'Pumpe', Icon: RefreshCw },
    { key: 'abtauen', label: 'Abtauen', Icon: Snowflake },
    { key: 'heizstab', label: 'Heizstab', Icon: Zap },
];

/**
 * Nachgestellter Betrieb: gleiche Texte wie HeatingWidget, dazu Beispielwerte. Die Außentemperatur bleibt
 * echt. Nur Anzeige, die Auswertungen zeigen weiter die echten Verläufe.
 */
const SCENES: Record<Exclude<HeizungScene, 'ECHT'>, Partial<HzModel>> = {
    HEIZEN: {
        mode: 'heat',
        modeLabel: 'Heizt · Fußboden',
        sinceText: 'Verdichter ein · seit 12 min',
        pumpe: true,
        abtauen: false,
        heizstab: false,
        vorlauf: 29.4,
        ruecklauf: 25.1,
        spreizung: 4.3,
        volumenstrom: 21,
    },
    WASSER: {
        mode: 'water',
        modeLabel: 'Bereitet Warmwasser',
        sinceText: 'Verdichter ein · seit 25 min',
        pumpe: true,
        abtauen: false,
        heizstab: false,
        vorlauf: 54.8,
        ruecklauf: 52.9,
        spreizung: 1.9,
        volumenstrom: 13,
    },
    BEREIT: {
        mode: 'idle',
        modeLabel: 'Bereit',
        sinceText: 'Verdichter aus',
        pumpe: false,
        abtauen: false,
        heizstab: false,
        vorlauf: 24.0,
        ruecklauf: 23.8,
        spreizung: 0.2,
        volumenstrom: 0,
    },
};

interface Ctx {
    m: HzModel;
    details: (b: HzBox) => ReactNode;
}

export function HeizungFacelift({ draft, m: real, details }: Ctx & { draft: Exclude<HeizungDraft, 'ALT'> }) {
    const scene = useHeizungSceneStore((s) => s.scene);
    const setScene = useHeizungSceneStore((s) => s.setScene);
    const parts = useHeizungSceneStore((s) => s.parts);
    const setPart = useHeizungSceneStore((s) => s.setPart);
    const m: HzModel = !HZ_PICK ? real : { ...real, ...(scene === 'ECHT' ? {} : SCENES[scene]), ...parts };
    const ind = useHeizungInd();
    const setInd = useHeizungIndStore((s) => s.setInd);
    const indDef = HEIZUNG_INDS.find((i) => i.key === ind) ?? HEIZUNG_INDS[0];

    const headKey = useHeizungHead();
    const setHead = useHeizungHeadStore((s) => s.setHead);
    const head = HEIZUNG_HEADS.find((h) => h.key === headKey) ?? HEIZUNG_HEADS[0];

    const [box, setBox] = useState<HzBox | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen: beim Zurückkommen wieder auf der Übersicht
    useEffect(() => {
        if (hidden) setBox(null);
    }, [hidden]);
    const sel = BOXES.find((b) => b.key === box) ?? null;
    const zoom = useHzSubStore((s) => s.zoom);
    const setZoom = useHzSubStore((s) => s.setZoom);

    const home = (
        <div className="hz-home">
            {/* Nur Dev-Vorschau, kein Teil des Entwurfs: Auswahl-Leisten, abgeschaltet über HZ_PICK */}
            {HZ_PICK && (
                <>
                    <div className="hz-sim" role="group" aria-label="Betrieb zeigen, nur Vorschau">
                        <span className="hz-sim-label">Betrieb</span>
                        {HEIZUNG_SCENES.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                className="hz-sim-btn"
                                data-sel={s.key === scene || undefined}
                                aria-pressed={s.key === scene}
                                onClick={() => setScene(s.key)}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <div
                        className="hz-sim"
                        role="group"
                        aria-label="Pumpe, Abtauen, Heizstab ein oder aus, nur Vorschau"
                    >
                        <span className="hz-sim-label">Aktiv</span>
                        {PARTS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                className="hz-sim-btn"
                                data-sel={m[p.key] || undefined}
                                aria-pressed={m[p.key]}
                                onClick={() => setPart(p.key, !m[p.key])}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="hz-sim" role="group" aria-label="Marken wählen, nur Vorschau">
                        <span className="hz-sim-label">Marken · {indDef.name}</span>
                        {HEIZUNG_INDS.map((i) => (
                            <button
                                key={i.key}
                                type="button"
                                className="hz-sim-btn"
                                data-sel={i.key === ind || undefined}
                                aria-pressed={i.key === ind}
                                title={i.name}
                                onClick={() => setInd(i.key)}
                            >
                                {i.label}
                            </button>
                        ))}
                    </div>
                    <div className="hz-sim hz-sim--wrap" role="group" aria-label="Kopf wählen, nur Vorschau">
                        <span className="hz-sim-label">
                            Kopf {head.key} · {head.name}
                        </span>
                        <div className="hz-sim-btns">
                            {HEIZUNG_HEADS.map((h) => (
                                <button
                                    key={h.key}
                                    type="button"
                                    className="hz-sim-btn"
                                    data-sel={h.key === head.key || undefined}
                                    aria-pressed={h.key === head.key}
                                    title={h.name}
                                    onClick={() => setHead(h.key)}
                                >
                                    {h.key}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
            <Section>
                <Head m={m} lay={head.lay} fill={head.fill} />
            </Section>
            <Section
                title="Aktuelle Werte"
                foot={
                    !HZ_PICK || scene === 'ECHT'
                        ? undefined
                        : 'Beispielwerte zum Ansehen, nur die Außentemperatur ist echt.'
                }
            >
                {draft === 'E' ? <ValuesList m={m} /> : draft === 'F' ? <ValuesTiles m={m} /> : <ValuesPlain m={m} />}
            </Section>
            <Section title="Auswertungen">
                <div className="aura-fl-card">
                    {BOXES.map((b) => (
                        <button
                            key={b.key}
                            type="button"
                            className="aura-fl-row aura-fl-row--nav hz-boxrow"
                            onClick={() => setBox(b.key)}
                        >
                            <span className="aura-fl-row-icon hz-ico">
                                <b.Icon size={20} />
                            </span>
                            <span className="aura-fl-row-main">
                                <span className="aura-fl-row-title hz-row-title">{b.title}</span>
                                <span className="aura-fl-row-sub">{b.sub}</span>
                            </span>
                            <ChevronRight size={18} className="aura-fl-chev" />
                        </button>
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
                              {/* Nur Dev-Vorschau: offene Gestaltungsfragen der Unterseiten (HZ_SUB_PICK) */}
                              {HZ_SUB_PICK && ZOOM_BOXES.has(sel.key) && (
                                  <PickBar label="Zoom" items={HZ_ZOOM} value={zoom} onPick={setZoom} />
                              )}
                              {/* Karte, Begleittext und Abschnitte baut die Auswertung selbst (HzDetailFrame) */}
                              <HzSubpageProvider value={{ foot: sel.foot, zoom }}>
                                  {details(sel.key)}
                              </HzSubpageProvider>
                          </div>
                      ),
                  },
              ]
            : []),
    ];
    return (
        <div
            className={`aura-fl-scope hz-page hz-page--${draft.toLowerCase()}`}
            data-hz-draft={draft}
            data-widget-interactive
        >
            <IosStack rootRef={rootRef} pages={pages} depth={sel ? 1 : 0} sizing="current" manageScroll bleed={6} />
        </div>
    );
}

// ── gemeinsame Teile ─────────────────────────────────────────────────────────

/** Gelbe Auswahl-Leiste (nur Dev-Vorschau, kein Teil des Entwurfs). */
function PickBar<T extends string>({
    label,
    items,
    value,
    onPick,
}: {
    label: string;
    items: { key: T; label: string; name: string }[];
    value: T;
    onPick: (v: T) => void;
}) {
    const cur = items.find((i) => i.key === value);
    return (
        <div className="hz-sim" role="group" aria-label={`${label} wählen, nur Vorschau`}>
            <span className="hz-sim-label">
                {label} · {cur?.name}
            </span>
            {items.map((i) => (
                <button
                    key={i.key}
                    type="button"
                    className="hz-sim-btn"
                    data-sel={i.key === value || undefined}
                    aria-pressed={i.key === value}
                    title={i.name}
                    onClick={() => onPick(i.key)}
                >
                    {i.label}
                </button>
            ))}
        </div>
    );
}

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
function StatusRow({ m, sub, right }: { m: HzModel; sub?: ReactNode; right?: ReactNode }) {
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
            {right}
        </div>
    );
}

/** Pumpe · Abtauen · Heizstab als kleine Marken (aktiv farbig, sonst blass) */
function Chips({ m }: { m: HzModel }) {
    const ind = useHeizungInd();
    const shown = ind === 'only' ? PARTS.filter((p) => m[p.key]) : PARTS;
    return (
        <div className="hz-chips" data-mode={m.mode} data-ind={ind}>
            {shown.map(({ key, label, Icon }) => (
                <span key={key} className="hz-chip" data-on={m[key] || undefined}>
                    {ind === 'dot' ? (
                        <span className="hz-chip-dot" aria-hidden />
                    ) : ind === 'round' ? (
                        <span className="hz-chip-round" aria-hidden>
                            <Icon size={17} />
                        </span>
                    ) : (
                        <Icon size={15} />
                    )}
                    <span className="hz-chip-label" data-label={label}>
                        {label}
                    </span>
                    {ind !== 'only' && <span className="hz-sr">{m[key] ? ' ein' : ' aus'}</span>}
                </span>
            ))}
            {shown.length === 0 && <span className="hz-chip hz-chip--none">Pumpe, Abtauen und Heizstab aus</span>}
        </div>
    );
}

/**
 * Kopf-Karte. `lay` ist der Aufbau, `fill` die Einfärbung; die Farbe kommt allein aus data-mode und
 * data-fill (HeizungFacelift.css), bei „Bereit" bleibt die Karte neutral.
 */
function Head({ m, lay, fill }: { m: HzModel; lay: HeizungHeadLay; fill: HeizungHeadFill }) {
    const Icon = MODE_ICON[m.mode];
    const on = PARTS.filter((p) => m[p.key]).map((p) => p.label);
    const cls = `aura-fl-card hz-head hz-head--${lay}`;
    const attrs = { 'data-mode': m.mode, 'data-fill': fill };
    if (lay === 'hero' || lay === 'mark')
        return (
            <div className={cls} {...attrs}>
                {lay === 'mark' && <Icon className="hz-head-mark" aria-hidden />}
                <span className="hz-hero-title">
                    {lay === 'hero' && <Icon size={24} />}
                    {m.modeLabel}
                </span>
                <span className="hz-hero-sub">{m.sinceText}</span>
                <Chips m={m} />
            </div>
        );
    if (lay === 'line')
        return (
            <div className={cls} {...attrs}>
                <StatusRow m={m} sub={`${m.sinceText}${on.length ? ` · ${on.join(', ')}` : ''}`} />
            </div>
        );
    if (lay === 'list')
        return (
            <div className={cls} {...attrs}>
                <StatusRow m={m} />
                {PARTS.map(({ key, label, Icon: PIcon }) => (
                    <div key={key} className="aura-fl-row hz-valrow">
                        <span className="aura-fl-row-icon hz-ico" data-on={m[key] || undefined}>
                            <PIcon size={20} />
                        </span>
                        <span className="aura-fl-row-main">
                            <span className="aura-fl-row-title hz-row-title">{label}</span>
                        </span>
                        <span className={`hz-row-val${m[key] ? '' : ' hz-row-val--off'}`}>
                            {m[key] ? 'Ein' : 'Aus'}
                        </span>
                    </div>
                ))}
            </div>
        );
    return (
        <div className={cls} {...attrs}>
            <StatusRow
                m={m}
                right={
                    lay === 'value' ? (
                        <span className="hz-head-big">
                            <span className="hz-head-big-val">{val(m.vorlauf, 1, '°C')}</span>
                            <span className="hz-head-big-label">Vorlauf</span>
                        </span>
                    ) : undefined
                }
            />
            <div className="hz-chiprow">
                <Chips m={m} />
            </div>
        </div>
    );
}

// ── Aktuelle Werte: drei Formen ──────────────────────────────────────────────

/** E: Liste mit Symbolen, Vorlauf und Rücklauf je eine Zeile */
function ValuesList({ m }: { m: HzModel }) {
    const rows: { key: string; label: string; text: string; Icon: LucideIcon }[] = [
        { key: 'vl', label: 'Vorlauf', text: val(m.vorlauf, 1, '°C'), Icon: ArrowUpFromLine },
        { key: 'rl', label: 'Rücklauf', text: val(m.ruecklauf, 1, '°C'), Icon: ArrowDownToLine },
        { key: 'sp', label: 'Spreizung', text: val(m.spreizung, 1, 'K'), Icon: Gauge },
        { key: 'vs', label: 'Volumenstrom', text: val(m.volumenstrom, 0, 'l/min'), Icon: Waves },
        { key: 'at', label: 'Außentemperatur', text: val(m.aussen, 1, '°C'), Icon: Thermometer },
    ];
    return (
        <div className="aura-fl-card">
            {rows.map((v) => (
                <div key={v.key} className="aura-fl-row hz-valrow">
                    <span className="aura-fl-row-icon hz-ico">
                        <v.Icon size={20} />
                    </span>
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title hz-row-title">{v.label}</span>
                    </span>
                    <span className="hz-row-val">{v.text}</span>
                </div>
            ))}
        </div>
    );
}

const four = (m: HzModel) => [
    { key: 'vlrl', label: 'Vorlauf / Rücklauf', text: vlrl(m) },
    { key: 'sp', label: 'Spreizung', text: val(m.spreizung, 1, 'K') },
    { key: 'vs', label: 'Volumenstrom', text: val(m.volumenstrom, 0, 'l/min') },
    { key: 'at', label: 'Außentemperatur', text: val(m.aussen, 1, '°C') },
];

/** F: vier Kacheln in einer Karte */
function ValuesTiles({ m }: { m: HzModel }) {
    return (
        <div className="aura-fl-card hz-grid">
            {four(m).map((t) => (
                <div key={t.key} className="hz-cell">
                    <span className="hz-cell-label">{t.label}</span>
                    <span className="hz-cell-val">{t.text}</span>
                </div>
            ))}
        </div>
    );
}

/** G: vier schlichte Zeilen ohne Symbol */
function ValuesPlain({ m }: { m: HzModel }) {
    return (
        <div className="aura-fl-card">
            {four(m).map((v) => (
                <div key={v.key} className="aura-fl-row hz-valrow hz-valrow--plain">
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title hz-row-title">{v.label}</span>
                    </span>
                    <span className="hz-row-val">{v.text}</span>
                </div>
            ))}
        </div>
    );
}
