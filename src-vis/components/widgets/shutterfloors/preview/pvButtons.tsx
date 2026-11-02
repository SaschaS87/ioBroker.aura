/**
 * Reihe A (Runde 41–65, 02.11.2026), nur Dev-Vorschau: die Auf/Zu-Tasten
 * rechts in der Zeile. Sascha hat 41 (Chevron-Kapsel) behalten, 42–50 sind
 * raus; 66–71 sind Farbfassungen derselben Kapsel. Farben nur aus dem Theme
 * (Akzent, Text, Rahmen) und die Farbe der Art aus den Symbolen.
 * Funktion in allen gleich: Auf und Zu fahren sofort ohne Bestaetigung,
 * waehrend der Fahrt steht nur Stopp. Klicks laufen nicht zur Zeile durch
 * (die oeffnet sonst den Feinregler).
 */
import type { MouseEvent, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
];

function StopGlyph({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
        </svg>
    );
}

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
    const btn = (what: 'up' | 'down' | 'stop', content: ReactNode) => (
        <button
            key={what}
            type="button"
            className={`pa-btn pa-btn--${what}`}
            onClick={fire(what === 'up' ? r.open : what === 'down' ? r.close : r.stop)}
            disabled={!connected}
            aria-label={`${label} ${what === 'up' ? 'öffnen' : what === 'down' ? 'schließen' : 'stoppen'}`}
            title={what === 'up' ? 'Auf' : what === 'down' ? 'Zu' : 'Stopp'}
        >
            {content}
        </button>
    );
    return (
        <span className={`pa pa--41 pa--${look} is-${kind}${r.busy ? ' is-busy' : ''}`}>
            {r.busy ? (
                btn(
                    'stop',
                    <>
                        <StopGlyph /> Stopp
                    </>,
                )
            ) : (
                <>
                    {btn('up', <ChevronUp size={20} strokeWidth={2.5} />)}
                    {btn('down', <ChevronDown size={20} strokeWidth={2.5} />)}
                </>
            )}
        </span>
    );
}
