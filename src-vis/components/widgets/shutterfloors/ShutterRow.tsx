/**
 * Eine Zeile der Rollladen-Liste (Feature 27, „35 neu" mit Tasten 47 und
 * Symbol 52, Saschas Wahl vom 03.11.2026): farbiges Symbol je Art mit dem
 * Stand des Behangs, Name, Status, rechts zwei Winkel fuer Auf und Zu –
 * waehrend der Fahrt nur „Stopp". Antippen der Zeile oeffnet den Feinregler.
 * Die Bedien-Logik steckt in useShutterControl.ts.
 */
import React from 'react';
import { ChevronDown, ChevronUp, RadioOff } from 'lucide-react';
import { HapticButton } from '../shuttershared/HapticButton';
import { ShutterKindIcon } from './ShutterKindIcon';
import { useShutterControl, type ShutterControl } from './useShutterControl';
import type { ShutterFloorDeviceDef } from './types';
import './ShutterRow.css';

interface ShutterRowProps {
    device: ShutterFloorDeviceDef;
    connected: boolean;
    /** Erster eingeblendeter Nicht-Favorit: Trennlinie ueber volle Breite */
    firstRest?: boolean;
    onOpenSheet: (device: ShutterFloorDeviceDef) => void;
}

/** Durchgestrichenes Funksymbol unten rechts am Art-Symbol (kein Funkkontakt). */
function RadioBadge({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <span className="sf-radio-badge" title="Kein Funkkontakt" aria-label="Kein Funkkontakt">
            <RadioOff size={11} strokeWidth={2.2} />
        </span>
    );
}

/** Auf und Zu, waehrend der Fahrt nur Stopp. Klicks laufen nicht zur Zeile durch. */
function RowButtons({
    c,
    label,
    connected,
    kind,
}: {
    c: ShutterControl;
    label: string;
    connected: boolean;
    kind: ShutterFloorDeviceDef['kind'];
}) {
    const fire = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation();
        fn();
    };
    return (
        <span className={`sf-btns is-${kind}${c.busy ? ' is-busy' : ''}`}>
            {c.busy ? (
                <HapticButton
                    className="sf-btn sf-btn--stop nodrag"
                    onPress={c.stop}
                    disabled={!connected}
                    title="Stopp"
                    label={`${label} stoppen`}
                    stopPropagation
                >
                    Stopp
                </HapticButton>
            ) : (
                <>
                    <button
                        type="button"
                        className="sf-btn sf-btn--up nodrag"
                        onClick={fire(c.open)}
                        disabled={!connected}
                        aria-label={`${label} öffnen`}
                        title="Auf"
                    >
                        <ChevronUp size={24} strokeWidth={2.4} />
                    </button>
                    <button
                        type="button"
                        className="sf-btn sf-btn--down nodrag"
                        onClick={fire(c.close)}
                        disabled={!connected}
                        aria-label={`${label} schließen`}
                        title="Zu"
                    >
                        <ChevronDown size={24} strokeWidth={2.4} />
                    </button>
                </>
            )}
        </span>
    );
}

export const ShutterRow: React.FC<ShutterRowProps> = ({ device, connected, firstRest, onOpenSheet }) => {
    const c = useShutterControl(device);

    const open = () => onOpenSheet(device);
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
        }
    };

    return (
        <div
            className={`sf-row sf-row--dev${c.busy ? ' is-busy' : ''}${firstRest ? ' sf-row--rest-first' : ''}`}
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={onKeyDown}
            // Der Status steht als Text in der Zeile, lebt aber auch hier
            // weiter – fuer Screenreader, die sonst nur den Namen vorlesen.
            aria-label={`${device.label}, ${c.status}`}
        >
            {/* Symbol: zeigt auch den Stand (der Behang faellt so weit herunter,
                wie der Rollladen zu ist) und pulsiert waehrend der Fahrt.
                Funk-Ausfall: durchgestrichenes Funksymbol unten rechts. */}
            <span className={`sf-ico is-${device.kind}`}>
                <ShutterKindIcon kind={device.kind} closed={c.closed} busy={c.busy} />
                <RadioBadge show={c.offline} />
            </span>
            <span className="sf-main">
                <span className="sf-name">{device.label}</span>
                <span className={`sf-val${c.busy ? ' is-busy' : ''}`}>{c.status}</span>
            </span>
            <RowButtons c={c} label={device.label} connected={connected} kind={device.kind} />
        </div>
    );
};
