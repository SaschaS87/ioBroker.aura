/**
 * Eine Etagen-Gruppe der Rollladen-Liste (Feature 27, Regel 203, Saschas
 * Wahl vom 02.11.2026): je Geschoss nur die Favoriten, die uebrigen blendet
 * der Pfeil rechts neben der Ueberschrift („ERDGESCHOSS") ein und aus.
 *
 * Regel ohne Favoriten: Hat ein Geschoss noch keinen Favoriten (oder nur
 * Favoriten, oder gibt es den Favoriten-Datenpunkt nicht), zeigt es alle
 * Antriebe und keinen Pfeil – so verschwindet nichts, bevor jemand einen
 * Stern gesetzt hat.
 *
 * row(d, firstRest) zeichnet die Zeile; firstRest markiert den ersten
 * eingeblendeten Nicht-Favoriten (Trennlinie ueber volle Breite).
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from './types';

export function FloorGroup({
    floor,
    isFav,
    row,
}: {
    floor: ShutterFloorDef;
    isFav: (key: string) => boolean;
    row: (d: ShutterFloorDeviceDef, firstRest: boolean) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const favs = floor.devices.filter((d) => isFav(d.key));
    const rest = floor.devices.filter((d) => !isFav(d.key));
    const title = floor.name.toUpperCase();

    if (favs.length === 0 || rest.length === 0) {
        return (
            <section>
                <div className="sf-group-head">{title}</div>
                <div className="sf-group">{floor.devices.map((d) => row(d, false))}</div>
            </section>
        );
    }

    const toggle = () => setOpen((v) => !v);
    const label = open ? 'weniger' : `${rest.length} weitere`;
    return (
        <section>
            <button type="button" className="sf-group-head sf-group-head--fold" onClick={toggle} aria-expanded={open}>
                <span>{title}</span>
                <span className="sf-group-more">{label}</span>
                <ChevronDown size={18} className={`sf-group-chev${open ? ' is-open' : ''}`} />
            </button>
            <div className="sf-group">
                {favs.map((d) => row(d, false))}
                {open && rest.map((d, i) => row(d, i === 0))}
            </div>
        </section>
    );
}
