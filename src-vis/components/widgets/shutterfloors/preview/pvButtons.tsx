/**
 * Reihe A (Runde 41–65, 02.11.2026): zehn Fassungen 41–50 der Auf/Zu-Tasten
 * rechts in der Zeile, nur Dev-Vorschau. Funktion in allen gleich: Auf und Zu
 * fahren sofort ohne Bestaetigung, waehrend der Fahrt steht nur Stopp. Klicks
 * laufen nicht zur Zeile durch (die oeffnet sonst den Feinregler).
 */
import type { MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { ShutterFloorDeviceDef } from '../types';
import type { RowControl } from './useRowControl';

type Kind = ShutterFloorDeviceDef['kind'];

export const ACT_LOOKS: { key: string; name: string; desc: string }[] = [
    {
        key: '41',
        name: 'Chevron-Kapsel',
        desc: 'Eine Kapsel wie der Plus/Minus-Regler am iPhone, mit feinen Winkeln ˄ ˅ statt Pfeilen mit Strich.',
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
];

function TriUp() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
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
function TriDown() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
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
function StopGlyph({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
        </svg>
    );
}
function BlindOpen() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="4" y="3.5" width="16" height="17" rx="2" />
            <path d="M4 7.5h16" />
            <path d="m9 15 3-3 3 3" />
        </svg>
    );
}
function BlindClosed() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="4" y="3.5" width="16" height="17" rx="2" />
            <path d="M4 7.5h16M4 11.5h16M4 15.5h16" />
        </svg>
    );
}

type Glyphs = { up: ReactNode; down: ReactNode; stop: ReactNode };
const chev: Glyphs = {
    up: <ChevronUp size={20} strokeWidth={2.5} />,
    down: <ChevronDown size={20} strokeWidth={2.5} />,
    stop: <StopGlyph />,
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
    const wrap = (children: ReactNode, cls = '') => (
        <span className={`pa pa--${look} is-${kind}${r.busy ? ' is-busy' : ''}${cls}`}>{children}</span>
    );

    let g: Glyphs = chev;
    let stopContent: ReactNode = g.stop;
    switch (look) {
        case '43':
            g = { up: 'Auf', down: 'Zu', stop: 'Stopp' };
            stopContent = 'Stopp';
            break;
        case '44':
            g = { up: <TriUp />, down: <TriDown />, stop: <StopGlyph size={15} /> };
            stopContent = g.stop;
            break;
        case '46':
        case '50':
            g = {
                up: <ArrowUp size={18} strokeWidth={2.5} />,
                down: <ArrowDown size={18} strokeWidth={2.5} />,
                stop: <StopGlyph />,
            };
            break;
        case '47':
            g = {
                up: <ChevronUp size={24} strokeWidth={2.4} />,
                down: <ChevronDown size={24} strokeWidth={2.4} />,
                stop: 'Stopp',
            };
            stopContent = 'Stopp';
            break;
        case '48':
            g = { up: 'Auf', down: 'Zu', stop: 'Stopp' };
            stopContent = (
                <>
                    <StopGlyph size={12} /> Stopp
                </>
            );
            break;
        case '49':
            g = { up: <BlindOpen />, down: <BlindClosed />, stop: <StopGlyph /> };
            break;
        case '41':
            stopContent = (
                <>
                    <StopGlyph size={12} /> Stopp
                </>
            );
            break;
        default:
            break;
    }

    if (r.busy) return wrap(btn('stop', stopContent));

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
    return wrap(
        <>
            {btn('up', g.up)}
            {btn('down', g.down)}
        </>,
    );
}
