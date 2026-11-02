/**
 * Runde 201+ (02.11.2026), nur Dev-Vorschau. Zwei neue Reihen in der Leiste:
 *   D 201–219  Feinregler „schlicht" (PvSheetSlim), Fassungen in sheetLooks.ts
 *   E 203      Favoriten je Geschoss, Rest hinter einem Pfeil in der
 *              Ueberschrift (Saschas Wahl vom 02.11.2026; 204 „Zeile
 *              weitere am Ende" ist entfallen)
 * „35" zeigt jeweils den Stand vor dieser Runde (voller Feinregler PvSheet,
 * alle Antriebe sichtbar).
 *
 * Regel ohne Favoriten: Hat ein Geschoss noch keinen Favoriten, zeigt es wie
 * bisher alle Antriebe und keinen Pfeil – so verschwindet nichts, bevor
 * jemand einen Stern gesetzt hat.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from '../types';

export { SHEET_LOOKS } from './sheetLooks';

export const LIST_LOOKS = [
    {
        key: '203',
        name: 'Pfeil in der Überschrift',
        desc: 'Je Geschoss nur die Favoriten. Der Pfeil rechts neben „ERDGESCHOSS" blendet die übrigen ein und aus. Ohne Favorit im Geschoss: alle sichtbar.',
    },
];

/**
 * Eine Etagen-Gruppe. look '35' = alle Antriebe wie bisher.
 * row(d, firstRest) zeichnet die Zeile; firstRest markiert den ersten
 * eingeblendeten Nicht-Favoriten (Trennlinie ueber volle Breite).
 */
export function FloorGroup({
    floor,
    look,
    isFav,
    row,
}: {
    floor: ShutterFloorDef;
    look: string;
    isFav: (key: string) => boolean;
    row: (d: ShutterFloorDeviceDef, firstRest: boolean) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const favs = floor.devices.filter((d) => isFav(d.key));
    const rest = floor.devices.filter((d) => !isFav(d.key));
    const title = floor.name.toUpperCase();

    if (look === '35' || favs.length === 0 || rest.length === 0) {
        return (
            <section>
                <div className="v35-group-head">{title}</div>
                <div className="v35-group">{floor.devices.map((d) => row(d, false))}</div>
            </section>
        );
    }

    const toggle = () => setOpen((v) => !v);
    const label = open ? 'weniger' : `${rest.length} weitere`;
    return (
        <section>
            <button type="button" className="v35-group-head vf-head" onClick={toggle} aria-expanded={open}>
                <span>{title}</span>
                <span className="vf-head-more">{label}</span>
                <ChevronDown size={18} className={`vf-chev${open ? ' is-open' : ''}`} />
            </button>
            <div className="v35-group">
                {favs.map((d) => row(d, false))}
                {open && rest.map((d, i) => row(d, i === 0))}
            </div>
        </section>
    );
}
