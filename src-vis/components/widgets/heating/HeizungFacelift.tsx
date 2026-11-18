/**
 * UI-Facelift Heizung (Saschas Entscheidung vom 14.11.2026: Kopf 11, Marken b, Werte G).
 *
 * Die Seite ist ein einziges Widget (HeatingWidget). Es liest alle Datenpunkte wie bisher und übergibt hier
 * nur die fertigen Werte (HzModel) und eine Funktion, die den Inhalt einer Auswertung liefert (dieselbe
 * Komponente HeatingDetails wie in den heutigen Klappboxen).
 *
 * Aufbau: Kopf-Karte (großes Symbol im Hintergrund, Farbverlauf in der Betriebsfarbe, Marken als Kapseln),
 * „Aktuelle Werte" als schlichte Zeilen, „Auswertungen" als Unterseiten von rechts mit Begleittext unter dem
 * Diagramm. Die Entwurfs-Varianten stehen im Vault, Feature 31 „Heizung".
 *
 * Nur lesend: kein Schreibbefehl, kein Datenpunkt wird angelegt.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Activity,
    ChevronRight,
    Droplet,
    Flame,
    History,
    Power,
    RefreshCw,
    Snowflake,
    SunMedium,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { formatNum } from '../../../utils/formatValue';
import { IosNavBar, IosStack, useTabHidden } from '../../common/ios';
import { HzSubpageProvider } from './HzSubpage';
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

interface Ctx {
    m: HzModel;
    details: (b: HzBox) => ReactNode;
}

export function HeizungFacelift({ m, details }: Ctx) {
    const [box, setBox] = useState<HzBox | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const hidden = useTabHidden(rootRef);
    // Seite verlassen: beim Zurückkommen wieder auf der Übersicht
    useEffect(() => {
        if (hidden) setBox(null);
    }, [hidden]);
    const sel = BOXES.find((b) => b.key === box) ?? null;

    const home = (
        <div className="hz-home">
            <Section>
                <Head m={m} />
            </Section>
            <Section title="Aktuelle Werte">
                <ValuesPlain m={m} />
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
                              {/* Karte, Begleittext und Abschnitte baut die Auswertung selbst (HzDetailFrame) */}
                              <HzSubpageProvider value={{ foot: sel.foot }}>
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
            className="aura-fl-scope hz-page hz-page--g"
            data-hz-draft="G"
            data-widget-interactive
        >
            <IosStack rootRef={rootRef} pages={pages} depth={sel ? 1 : 0} sizing="current" manageScroll bleed={6} />
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

/** Pumpe · Abtauen · Heizstab als kleine Marken (aktiv farbig, sonst blass) */
function Chips({ m }: { m: HzModel }) {
    return (
        <div className="hz-chips" data-mode={m.mode} data-ind="pill">
            {PARTS.map(({ key, label, Icon }) => (
                <span key={key} className="hz-chip" data-on={m[key] || undefined}>
                    <Icon size={15} />
                    <span className="hz-chip-label" data-label={label}>
                        {label}
                    </span>
                    <span className="hz-sr">{m[key] ? ' ein' : ' aus'}</span>
                </span>
            ))}
        </div>
    );
}

/**
 * Kopf-Karte: großes Symbol im Hintergrund, Farbverlauf in der Betriebsfarbe (Kopf 11). Die Farbe kommt allein
 * aus data-mode und data-fill (HeizungFacelift.css), bei „Bereit" bleibt die Karte neutral.
 */
function Head({ m }: { m: HzModel }) {
    const Icon = MODE_ICON[m.mode];
    return (
        <div className="aura-fl-card hz-head hz-head--mark" data-mode={m.mode} data-fill="grad">
            <Icon className="hz-head-mark" aria-hidden />
            <span className="hz-hero-title">{m.modeLabel}</span>
            <span className="hz-hero-sub">{m.sinceText}</span>
            <Chips m={m} />
        </div>
    );
}

// ── Aktuelle Werte ───────────────────────────────────────────────────────────

const four = (m: HzModel) => [
    { key: 'vlrl', label: 'Vorlauf / Rücklauf', text: vlrl(m) },
    { key: 'sp', label: 'Spreizung', text: val(m.spreizung, 1, 'K') },
    { key: 'vs', label: 'Volumenstrom', text: val(m.volumenstrom, 0, 'l/min') },
    { key: 'at', label: 'Außentemperatur', text: val(m.aussen, 1, '°C') },
];

/** Vier schlichte Zeilen ohne Symbol */
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
