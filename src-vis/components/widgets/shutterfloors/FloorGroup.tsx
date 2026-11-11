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
 *
 * Facelift (nur Dev-Vorschau, useFaceliftVariant): gleiche Regel, eigener
 * Aufbau aus den gemeinsamen Bausteinen. Der Aufklapp-Knopf sitzt je nach
 * Regler „x weitere" rechts im Titel oder als Zeile am Kartenende.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFaceliftOptions, useFaceliftVariant } from '../../layout/facelift/faceliftVariant';
import type { ShutterFloorDef, ShutterFloorDeviceDef } from './types';

interface FloorGroupProps {
    floor: ShutterFloorDef;
    isFav: (key: string) => boolean;
    row: (d: ShutterFloorDeviceDef, firstRest: boolean) => ReactNode;
}

function FaceliftFloorGroup({ floor, isFav, row }: FloorGroupProps) {
    const [open, setOpen] = useState(false);
    const asRow = useFaceliftOptions().more === 'row';
    const favs = floor.devices.filter((d) => isFav(d.key));
    const rest = floor.devices.filter((d) => !isFav(d.key));
    const hasFold = favs.length > 0 && rest.length > 0;
    const toggle = () => setOpen((x) => !x);

    const rows = hasFold
        ? [...favs.map((d) => row(d, false)), ...(open ? rest.map((d, i) => row(d, i === 0)) : [])]
        : floor.devices.map((d) => row(d, false));
    const title = <h2 className="aura-fl-section-title sf-floor-title">{floor.name}</h2>;
    const label = asRow
        ? open
            ? 'Weniger anzeigen'
            : `${rest.length} weitere anzeigen`
        : open
          ? 'weniger'
          : `${rest.length} weitere`;
    const fold = (
        <>
            <span className="aura-fl-fold-label sf-floor-fold-label">{label}</span>
            <ChevronDown size={18} className={`aura-fl-fold-chev sf-floor-fold-chev${open ? ' is-open' : ''}`} />
        </>
    );

    return (
        <section className="aura-fl-section sf-floor">
            {hasFold && !asRow ? (
                <button
                    type="button"
                    className="aura-fl-section-head aura-fl-section-head--fold sf-floor-head"
                    onClick={toggle}
                    aria-expanded={open}
                >
                    {title}
                    <span className="aura-fl-fold sf-floor-fold">{fold}</span>
                </button>
            ) : (
                <div className="aura-fl-section-head sf-floor-head">{title}</div>
            )}
            <div className="aura-fl-card sf-group sf-floor-card">
                {rows}
                {hasFold && asRow && (
                    <button
                        type="button"
                        className="aura-fl-fold aura-fl-fold--row sf-floor-fold"
                        onClick={toggle}
                        aria-expanded={open}
                    >
                        {fold}
                    </button>
                )}
            </div>
        </section>
    );
}

function ClassicFloorGroup({ floor, isFav, row }: FloorGroupProps) {
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

export function FloorGroup(props: FloorGroupProps) {
    const v = useFaceliftVariant();
    return v ? <FaceliftFloorGroup {...props} /> : <ClassicFloorGroup {...props} />;
}
