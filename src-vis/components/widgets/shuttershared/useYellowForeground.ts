import { useEffect, useState } from 'react';

/**
 * Berechnet die WCAG-Relativhelligkeit einer Farbe (sRGB-Linearisierung).
 * Rückgabewert 0 = schwarz, 1 = weiß.
 */
function getRelativeLuminance(color: string): number {
    let r = 0, g = 0, b = 0;

    // Hex-Format
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    } else if (color.startsWith('rgb')) {
        const match = color.match(/\d+/g);
        if (match && match.length >= 3) {
            r = parseInt(match[0], 10);
            g = parseInt(match[1], 10);
            b = parseInt(match[2], 10);
        }
    }

    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;

    const rLinear = rNorm <= 0.03928 ? rNorm / 12.92 : Math.pow((rNorm + 0.055) / 1.055, 2.4);
    const gLinear = gNorm <= 0.03928 ? gNorm / 12.92 : Math.pow((gNorm + 0.055) / 1.055, 2.4);
    const bLinear = bNorm <= 0.03928 ? bNorm / 12.92 : Math.pow((bNorm + 0.055) / 1.055, 2.4);

    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Berechnet WCAG-Kontrastverhältnis zwischen zwei Farben.
 * Nimmt die hellere als L1.
 */
function getContrastRatio(lum1: number, lum2: number): number {
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Hook: Berechnet die beste Vordergrundfarbe für --accent-yellow durch
 * Maximierung des Kontrastverhaeltnis gegen beide Kandidaten (#1c1917 und #ffffff).
 *
 * Beobachtet Themenwechsel und gibt den besten Farbwert zurück (kein setProperty).
 * Die Komponente setzt die Farbe inline via style-Prop.
 */
export const useYellowForeground = (): string => {
    const [fgColor, setFgColor] = useState('#1c1917');

    useEffect(() => {
        const updateColor = () => {
            const root = document.documentElement;
            const yellowValue = getComputedStyle(root).getPropertyValue('--accent-yellow').trim();

            if (!yellowValue) {
                setFgColor('#1c1917');
                return;
            }

            const lumYellow = getRelativeLuminance(yellowValue);
            const lumDark = getRelativeLuminance('#1c1917');
            const lumLight = getRelativeLuminance('#ffffff');

            const contrastDark = getContrastRatio(lumYellow, lumDark);
            const contrastLight = getContrastRatio(lumYellow, lumLight);

            // Waehle die Farbe mit dem hoeheren Kontrast
            const newFgColor = contrastDark > contrastLight ? '#1c1917' : '#ffffff';
            setFgColor(newFgColor);
        };

        // Initiale Berechnung
        updateColor();

        // Beobachte Themenwechsel (class/style-Aenderungen am <html>-Element).
        // Der Hook schreibt NICHT in style – also keine Endlosschleife.
        const observer = new MutationObserver(updateColor);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });

        return () => {
            observer.disconnect();
        };
    }, []);

    return fgColor;
};
