import React from 'react';
import { ChevronUp, Square, ChevronDown } from 'lucide-react';
import { HapticButton } from '../shutterrooms/HapticButton';
import './FloorHeader.css';

interface FloorHeaderProps {
    name: string;
    connected?: boolean;
    variant?: 'a' | 'b' | 'c';
}

/**
 * Etagenkopf mit Name und Sammelknöpfen.
 * Die Knöpfe führen in diesem Baustein noch keine Aktion aus.
 * TODO: Sammelbefehl wird in Baustein 2 verdrahtet.
 */
export const FloorHeader: React.FC<FloorHeaderProps> = ({ name, connected = true, variant = 'a' }) => {
    // Knöpfe tun vorerst nichts – nur für Optik
    const handleAllOpen = () => {
        // TODO: Sammelbefehl folgt in Baustein 2
    };

    const handleAllStop = () => {
        // TODO: Sammelbefehl folgt in Baustein 2
    };

    const handleAllClose = () => {
        // TODO: Sammelbefehl folgt in Baustein 2
    };

    return (
        <div className={`floor-header floor-head--${variant}`} style={{ opacity: !connected ? 0.5 : 1 }}>
            <div className="floor-name">{name}</div>
            <div className="floor-actions">
                <HapticButton
                    className="nodrag"
                    onPress={handleAllOpen}
                    disabled={!connected}
                    title="Alle öffnen"
                    label={`${name}: Alle öffnen`}
                    stopPropagation
                >
                    <ChevronUp size={14} />
                </HapticButton>
                <HapticButton
                    className="nodrag"
                    onPress={handleAllStop}
                    disabled={!connected}
                    title="Alle stoppen"
                    label={`${name}: Alle stoppen`}
                    stopPropagation
                >
                    <Square size={12} />
                </HapticButton>
                <HapticButton
                    className="nodrag"
                    onPress={handleAllClose}
                    disabled={!connected}
                    title="Alle schließen"
                    label={`${name}: Alle schließen`}
                    stopPropagation
                >
                    <ChevronDown size={14} />
                </HapticButton>
            </div>
        </div>
    );
};
