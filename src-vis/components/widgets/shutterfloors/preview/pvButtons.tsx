/**
 * Reihe A (Runde 41–65, 02.11.2026), nur Dev-Vorschau: die Auf/Zu-Tasten
 * rechts in der Zeile. Drei Gruppen:
 *   41–50  die erste Runde (42–50 waren mit 4b2be753 kurz raus, wieder da)
 *   66–71  Farbfassungen der Chevron-Kapsel 41
 *   81–100 Runde „mehr Auswahl" (andere Symbole, Formen, Rahmen, Abstand)
 * Farben nur aus dem Theme (Akzent, Text, Rahmen) und die Farbe der Art aus
 * den Symbolen. Funktion in allen gleich: Auf und Zu fahren sofort ohne
 * Bestaetigung, waehrend der Fahrt steht nur Stopp. Klicks laufen nicht zur
 * Zeile durch (die oeffnet sonst den Feinregler).
 */
import type { MouseEvent, ReactNode } from 'react';
import {
    ArrowBigDown,
    ArrowBigUp,
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    ArrowUpToLine,
    ChevronDown,
    ChevronsDown,
    ChevronsUp,
    ChevronUp,
    CircleArrowDown,
    CircleArrowUp,
    Moon,
    Sun,
} from 'lucide-react';
import type { ShutterFloorDeviceDef } from '../types';
import type { RowControl } from './useRowControl';

type Kind = ShutterFloorDeviceDef['kind'];

export const ACT_LOOKS: { key: string; name: string; desc: string }[] = [
    {
        key: '41',
        name: 'Chevron-Kapsel, grau',
        desc: 'Eine Kapsel wie der Plus/Minus-Regler am iPhone, mit feinen Winkeln ˄ ˅. Grau getönt, Winkel in Textfarbe.',
    },
    {
        key: '42',
        name: 'Zwei Kreise',
        desc: 'Zwei runde Knöpfe mit Winkeln, getrennt. Größer zum Treffen, wirkt luftiger.',
    },
    { key: '43', name: 'Wörter', desc: '„Auf" und „Zu" als Wörter in getönten Kapseln. Kein Symbol zum Deuten.' },
    {
        key: '44',
        name: 'Fernbedienung',
        desc: 'Volle Dreiecke ▲ ▼ wie auf der Somfy-Fernbedienung an der Wand, Stopp als Quadrat.',
    },
    {
        key: '45',
        name: 'Wippe',
        desc: 'Ein senkrechter Wippschalter: oben Auf, unten Zu. Spart Breite, der Name hat mehr Platz.',
    },
    {
        key: '46',
        name: 'Ton in Ton',
        desc: 'Runde Knöpfe in der Farbe der Art (Fenster blau, Dachfenster violett, Raffstore türkis), passend zum Symbol links.',
    },
    {
        key: '47',
        name: 'Nur Winkel',
        desc: 'Ohne Fläche, nur die Winkel in der Akzentfarbe, wie Knöpfe in Apple-Listen. Die Trefffläche bleibt groß.',
    },
    {
        key: '48',
        name: 'Zustands-Schalter',
        desc: 'Umschalter „Auf | Zu": Die Seite, in der der Rollladen gerade steht, ist hervorgehoben. Die andere antippen fährt.',
    },
    {
        key: '49',
        name: 'Behang-Symbole',
        desc: 'Statt Pfeilen ein freies und ein verdecktes Fenster. Zeigt, was danach ist, nicht wohin es geht.',
    },
    {
        key: '50',
        name: 'Betont, was passt',
        desc: 'Zwei Pfeil-Knöpfe, der naheliegende ist voll gefärbt: bei offenem Rollladen Zu, bei geschlossenem Auf.',
    },
    {
        key: '66',
        name: 'Akzent getönt',
        desc: 'Dieselbe Kapsel, leicht in der Akzentfarbe getönt, die Winkel in Akzentfarbe. Wirkt wie ein Knopf in Apple-Apps.',
    },
    {
        key: '67',
        name: 'Farbe der Art, getönt',
        desc: 'Getönt in der Farbe der Art (Fenster blau, Dachfenster violett, Raffstore türkis), passend zum Symbol links.',
    },
    {
        key: '68',
        name: 'Akzent kräftig',
        desc: 'Kapsel voll in der Akzentfarbe, Winkel weiß. Die Tasten springen sofort ins Auge.',
    },
    {
        key: '69',
        name: 'Farbe der Art, kräftig',
        desc: 'Kapsel voll in der Farbe der Art, Winkel weiß. Symbol und Tasten bilden ein Paar.',
    },
    {
        key: '70',
        name: 'Umriss',
        desc: 'Ohne Fläche, nur ein feiner Rand in der Rahmenfarbe des Themes, Winkel grau. Am ruhigsten.',
    },
    {
        key: '71',
        name: 'Zu betont',
        desc: 'Auf zurückhaltend grau, Zu kräftig in der Textfarbe gefüllt: im Hell-Modus dunkel, im Dunkel-Modus hell.',
    },
    {
        key: '81',
        name: 'Bis zum Anschlag',
        desc: 'Pfeil mit Querstrich ⤒ ⤓: „ganz auf" und „ganz zu". Zwei getrennte, abgerundete Quadrate.',
    },
    {
        key: '82',
        name: 'Doppel-Winkel',
        desc: 'Doppelte Winkel ︽ ︾ ohne Fläche in der Akzentfarbe, dazwischen ein feiner Strich. Sehr leicht.',
    },
    {
        key: '83',
        name: 'AUF | ZU',
        desc: 'Großbuchstaben in einer Kapsel mit Rand in Textfarbe, wie die Beschriftung an einem Schalter.',
    },
    {
        key: '84',
        name: 'Pfeil und Wort',
        desc: 'Zwei getönte Pillen „↑ Auf" und „↓ Zu" in der Akzentfarbe. Symbol und Wort zusammen, am deutlichsten.',
    },
    {
        key: '85',
        name: 'Erhabene Tasten',
        desc: 'Zwei helle Tasten mit leichtem Schatten auf grauer Schiene, wie der Umschalter in iPhone-Apps.',
    },
    {
        key: '86',
        name: 'Ringe',
        desc: 'Zwei Kreise ohne Fläche mit Rand und Winkeln in der Akzentfarbe. Luftig, aber klar als Knopf erkennbar.',
    },
    {
        key: '87',
        name: 'Übereinander',
        desc: 'Zwei kleine getrennte Tasten übereinander: oben Auf, unten Zu. Am schmalsten, der Name hat viel Platz.',
    },
    {
        key: '88',
        name: 'Ganzflächig rechts',
        desc: 'Die Tasten füllen die Zeile rechts bis zum Rand, volle Höhe, wie die Wisch-Knöpfe in Mail. Große Trefffläche.',
    },
    {
        key: '89',
        name: 'Rollladen-Glyphe',
        desc: 'Eigenes Symbol: Auf = Pfeil hinein in den Rollladenkasten, Zu = Behang mit Lamellen unter dem Kasten.',
    },
    {
        key: '90',
        name: 'Sonne und Mond',
        desc: 'Auf als Sonne, Zu als Mond in getönten Kreisen. Spricht die Tageszeit an statt die Richtung.',
    },
    {
        key: '91',
        name: 'Dunkle Pille',
        desc: 'Kapsel in Textfarbe gefüllt (Hell: dunkel, Dunkel: hell) mit kleinen vollen Dreiecken. Kräftig und kompakt.',
    },
    {
        key: '92',
        name: 'Nur Text',
        desc: '„Auf · Zu" als Wörter in der Akzentfarbe, ohne Fläche und Rahmen, wie „Bearbeiten" in Apple-Listen.',
    },
    {
        key: '93',
        name: 'Kreis-Pfeile',
        desc: 'Pfeile im Kreis als reines Symbol, grau, ohne Fläche dahinter. Größe wie die Symbole links.',
    },
    {
        key: '94',
        name: 'Quadrate in Farbe der Art',
        desc: 'Zwei kleine Quadrate in der Farbe der Art mit dicken weißen Pfeilen. Passt in Form und Farbe zum Symbol links.',
    },
    {
        key: '95',
        name: 'Kapsel mit Stand',
        desc: 'Kapsel wie 41, unten ein feiner Strich in Akzentfarbe, der zeigt, wie weit der Rollladen zu ist.',
    },
    {
        key: '96',
        name: 'Tastenkappe',
        desc: 'Tasten mit sichtbarer Unterkante wie auf einer Tastatur. Beim Antippen gehen sie ein Stück nach unten.',
    },
    {
        key: '97',
        name: 'Geteilter Kreis',
        desc: 'Ein runder Knopf, waagerecht geteilt: obere Hälfte Auf, untere Zu. Sehr kompakt, kleinere Trefffläche.',
    },
    {
        key: '98',
        name: 'Klein mit Rand',
        desc: 'Eine schmale, niedrige Kapsel mit feinem Rand und kleinen Winkeln. Nimmt am wenigsten Raum ein.',
    },
    {
        key: '99',
        name: 'Groß',
        desc: 'Breite, hohe Kapsel mit großen Winkeln. Am leichtesten zu treffen, auch mit dem Daumen im Vorbeigehen.',
    },
    {
        key: '100',
        name: 'Ganzflächig übereinander',
        desc: 'Ein Block rechts in voller Zeilenhöhe bis zum Rand, oben Auf, unten Zu, getrennt durch eine feine Linie.',
    },
];

/** 41 und ihre Farbfassungen teilen die Kapsel-Grundform `.pa--41`. */
const CAPSULE = new Set(['41', '66', '67', '68', '69', '70', '71']);

function StopGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
        </svg>
    );
}
function TriUp({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 5.5 20 18H4Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinejoin="round"
            />
        </svg>
    );
}
function TriDown({ size = 16 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M12 18.5 20 6H4Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinejoin="round"
            />
        </svg>
    );
}
function Line({ children, size = 20 }: { children: ReactNode; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}
const BlindOpen = () => (
    <Line>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M4 7.5h16" />
        <path d="m9 15 3-3 3 3" />
    </Line>
);
const BlindClosed = () => (
    <Line>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M4 7.5h16M4 11.5h16M4 15.5h16" />
    </Line>
);
/** 89: Kasten oben; Auf = Pfeil in den Kasten, Zu = Behang mit Lamellen. */
const ShutterUp = () => (
    <Line size={21}>
        <rect x="3.5" y="3" width="17" height="4.5" rx="1.5" />
        <path d="M12 20.5V11M8 14.5 12 10.5l4 4" />
    </Line>
);
const ShutterDown = () => (
    <Line size={21}>
        <rect x="3.5" y="3" width="17" height="4.5" rx="1.5" />
        <path d="M5.5 11h13M5.5 14.5h13M5.5 18h13" />
    </Line>
);

type Glyphs = { up: ReactNode; down: ReactNode; stop: ReactNode };
const stopWord = (size = 12) => (
    <>
        <StopGlyph size={size} /> Stopp
    </>
);
const arrows = (size: number, sw = 2.5): Glyphs => ({
    up: <ArrowUp size={size} strokeWidth={sw} />,
    down: <ArrowDown size={size} strokeWidth={sw} />,
    stop: <StopGlyph />,
});
const chevrons = (size: number, sw = 2.5, stop: ReactNode = stopWord()): Glyphs => ({
    up: <ChevronUp size={size} strokeWidth={sw} />,
    down: <ChevronDown size={size} strokeWidth={sw} />,
    stop,
});
const words: Glyphs = { up: 'Auf', down: 'Zu', stop: 'Stopp' };

/** Inhalt je Fassung; was fehlt, nimmt die Chevrons von 41. */
const GLYPHS: Record<string, Glyphs> = {
    42: chevrons(20, 2.5, <StopGlyph />),
    43: words,
    44: { up: <TriUp />, down: <TriDown />, stop: <StopGlyph size={15} /> },
    45: chevrons(18, 2.5, <StopGlyph />),
    46: arrows(18),
    47: chevrons(24, 2.4, 'Stopp'),
    48: { ...words, stop: stopWord() },
    49: { up: <BlindOpen />, down: <BlindClosed />, stop: <StopGlyph /> },
    50: arrows(18),
    81: {
        up: <ArrowUpToLine size={19} strokeWidth={2.3} />,
        down: <ArrowDownToLine size={19} strokeWidth={2.3} />,
        stop: stopWord(),
    },
    82: {
        up: <ChevronsUp size={22} strokeWidth={2.2} />,
        down: <ChevronsDown size={22} strokeWidth={2.2} />,
        stop: 'Stopp',
    },
    83: { up: 'AUF', down: 'ZU', stop: 'STOPP' },
    84: {
        up: (
            <>
                <ArrowUp size={15} strokeWidth={2.6} /> Auf
            </>
        ),
        down: (
            <>
                <ArrowDown size={15} strokeWidth={2.6} /> Zu
            </>
        ),
        stop: stopWord(),
    },
    86: chevrons(19, 2.5, <StopGlyph />),
    87: chevrons(16, 2.6),
    88: chevrons(22, 2.4, stopWord(13)),
    89: { up: <ShutterUp />, down: <ShutterDown />, stop: stopWord() },
    90: { up: <Sun size={19} strokeWidth={2.2} />, down: <Moon size={18} strokeWidth={2.2} />, stop: <StopGlyph /> },
    91: { up: <TriUp size={13} />, down: <TriDown size={13} />, stop: stopWord() },
    92: { ...words, stop: 'Stopp' },
    93: {
        up: <CircleArrowUp size={27} strokeWidth={1.8} />,
        down: <CircleArrowDown size={27} strokeWidth={1.8} />,
        stop: stopWord(),
    },
    94: {
        up: <ArrowBigUp size={20} strokeWidth={2} fill="currentColor" />,
        down: <ArrowBigDown size={20} strokeWidth={2} fill="currentColor" />,
        stop: <StopGlyph size={14} />,
    },
    96: chevrons(19, 2.6),
    97: chevrons(17, 2.8, <StopGlyph size={15} />),
    98: chevrons(15, 2.6, stopWord(10)),
    99: chevrons(25, 2.6, stopWord(14)),
    100: chevrons(19, 2.6, <StopGlyph size={16} />),
};

export function ActA({
    look,
    r,
    label,
    connected,
    kind,
}: {
    look: string;
    r: RowControl;
    label: string;
    connected: boolean;
    kind: Kind;
}) {
    const fire = (fn: () => void) => (e: MouseEvent) => {
        e.stopPropagation();
        fn();
    };
    const btn = (what: 'up' | 'down' | 'stop', content: ReactNode, extra = '') => (
        <button
            key={what}
            type="button"
            className={`pa-btn pa-btn--${what}${extra}`}
            onClick={fire(what === 'up' ? r.open : what === 'down' ? r.close : r.stop)}
            disabled={!connected}
            aria-label={`${label} ${what === 'up' ? 'öffnen' : what === 'down' ? 'schließen' : 'stoppen'}`}
            title={what === 'up' ? 'Auf' : what === 'down' ? 'Zu' : 'Stopp'}
        >
            {content}
        </button>
    );
    const base = CAPSULE.has(look) ? `pa--41 pa--${look}` : `pa--${look}`;
    const wrap = (children: ReactNode, cls = '') => (
        <span className={`pa ${base} is-${kind}${r.busy ? ' is-busy' : ''}${cls}`}>{children}</span>
    );
    const g = GLYPHS[look] ?? chevrons(20);

    if (r.busy) return wrap(btn('stop', g.stop));

    if (look === '48') {
        const at = r.closed === null ? null : r.closed <= 3 ? 'up' : r.closed >= 97 ? 'down' : null;
        return wrap(
            <>
                {btn('up', g.up, at === 'up' ? ' is-here' : '')}
                {btn('down', g.down, at === 'down' ? ' is-here' : '')}
            </>,
            at ? ` at-${at}` : ' at-none',
        );
    }
    if (look === '50') {
        const hint = r.closed === null ? null : r.closed < 50 ? 'down' : 'up';
        return wrap(
            <>
                {btn('up', g.up, hint === 'up' ? ' is-hint' : '')}
                {btn('down', g.down, hint === 'down' ? ' is-hint' : '')}
            </>,
        );
    }
    if (look === '92') {
        return wrap(
            <>
                {btn('up', g.up)}
                <span className="pa-dot" aria-hidden="true">
                    ·
                </span>
                {btn('down', g.down)}
            </>,
        );
    }
    if (look === '95') {
        return wrap(
            <>
                {btn('up', g.up)}
                {btn('down', g.down)}
                {r.closed !== null && (
                    <i className="pa-stand" aria-hidden="true">
                        <b style={{ width: `${Math.max(0, Math.min(100, r.closed))}%` }} />
                    </i>
                )}
            </>,
        );
    }
    return wrap(
        <>
            {btn('up', g.up)}
            {btn('down', g.down)}
        </>,
    );
}
