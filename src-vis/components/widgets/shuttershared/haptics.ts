/**
 * Spuerbare Rueckmeldung beim Antippen – so weit die Geraete mitspielen.
 *
 * Android/Chrome kann navigator.vibrate(); dort funktioniert das zuverlaessig.
 * iOS Safari kann es nicht. Seit iOS 18 gibt es einen Umweg: Ein Schalter in
 * Apples eigener Bauform (<input type="checkbox" switch>) loest beim Umlegen
 * ein System-Tippen aus.
 *
 * WICHTIG zur Erwartung: Dieser Umweg ist hier nur programmatisch angestossen
 * (versteckter Schalter, per Klick umgelegt). Sehr wahrscheinlich verlangt iOS
 * eine echte Beruehrung DES SCHALTERS und quittiert einen simulierten Klick
 * nicht. Der Versuch kostet nichts und ist strikt folgenlos – die Taste
 * funktioniert unabhaengig davon. Bleibt das iPhone stumm, waere der naechste
 * Schritt, den Schalter unsichtbar ueber eine einzelne Taste zu legen, sodass
 * der Finger ihn wirklich trifft. Das fasst aber das Bedienelement selbst an
 * und geschieht nur nach Absprache.
 */

let hapticSwitch: HTMLLabelElement | null = null;

const buildSwitch = (): HTMLLabelElement | null => {
    if (typeof document === 'undefined') return null;

    const label = document.createElement('label');
    // Weder display:none noch visibility:hidden – beides nimmt dem Schalter
    // die Faehigkeit, ueberhaupt umzuschalten.
    label.setAttribute(
        'style',
        'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;',
    );
    label.setAttribute('aria-hidden', 'true');

    const input = document.createElement('input');
    input.type = 'checkbox';
    // 'switch' ist Safaris eigenes Attribut; andere Browser ignorieren es,
    // dort bleibt es eine gewoehnliche unsichtbare Checkbox ohne Wirkung.
    input.setAttribute('switch', '');
    input.tabIndex = -1;

    label.appendChild(input);
    document.body.appendChild(label);
    return label;
};

/**
 * Einmal antippen quittieren. Muss synchron aus einem echten Klick-Handler
 * aufgerufen werden, sonst verwirft iOS die Geste in jedem Fall.
 */
export const tapFeedback = (): void => {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(8);
        }

        if (!hapticSwitch) {
            hapticSwitch = buildSwitch();
        }
        // ueber das Label klicken – das ist der Weg, der einer echten
        // Beruehrung am naechsten kommt.
        hapticSwitch?.click();
    } catch {
        // Rueckmeldung ist Beiwerk – ein Fehler hier darf die Steuerung nie stoppen.
    }
};
