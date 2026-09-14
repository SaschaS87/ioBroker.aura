/**
 * Schalter im Stil des Planungs-Artefakts (Variante B): 34 x 19 px, blau wenn
 * ein, grau wenn aus.
 *
 * Bewusst blau und nicht gruen wie der Aura-Standardschalter — das Artefakt
 * zeigt ihn blau, und der Garten-Tab soll aussehen wie das Artefakt.
 *
 * Der sichtbare Schalter ist klein; die Tastflaeche wird per ::before auf ein
 * brauchbares Mass gezogen (siehe GartenCircleCard.css), damit er auf dem
 * iPhone trotzdem sicher zu treffen ist.
 */
interface Props {
    on: boolean;
    /** Vorlesetext — der Schalter traegt keine sichtbare Beschriftung. */
    label: string;
    onToggle?: () => void;
    disabled?: boolean;
    title?: string;
}

export function GartenSwitch({ on, label, onToggle, disabled, title }: Props) {
    return (
        <button
            type="button"
            className={`garten-sw${on ? ' is-on' : ''}`}
            onClick={disabled ? undefined : onToggle}
            disabled={disabled}
            role="switch"
            aria-checked={on}
            aria-label={label}
            title={title ?? label}
        >
            <span className="garten-sw-knob" />
        </button>
    );
}
