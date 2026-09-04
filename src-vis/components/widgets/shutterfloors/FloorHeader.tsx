import React from 'react';
import './FloorHeader.css';

interface FloorHeaderProps {
    name: string;
    connected?: boolean;
}

/**
 * Etagenkopf: Name + Trennlinie, im selben Stil wie die Abschnittsköpfe auf
 * dem Wohnklima-Tab (HeaderWidget, layout "minimal" – text-xs/font-semibold/
 * tracking-widest/uppercase in var(--text-secondary), plus eine bis zum
 * rechten Rand laufende 1px-Linie in var(--app-border)). Angeglichen
 * 01.09.2026 (Runde 7) auf Saschas Wunsch nach der Abnahme: vorher trug der
 * Etagenkopf eine eigene, davon abweichende Schrift (headVariant "b").
 *
 * Die Sammel-Auf/Ab/Stopp-Knöpfe pro Etage sind im selben Zug entfernt:
 * Sascha hat sie bewusst gestrichen, weil "alle Rollos einer Etage auf
 * einmal fahren" hier nicht gewollt ist. Sie hatten ohnehin noch keine
 * Funktion (TODO "Sammelbefehl folgt in Baustein 2" wurde nie eingelöst).
 */
export const FloorHeader: React.FC<FloorHeaderProps> = ({ name, connected = true }) => (
    <div className="floor-header" style={{ opacity: !connected ? 0.5 : 1 }}>
        <span className="floor-name">{name}</span>
        <div className="floor-name-line" />
    </div>
);
