import { useEffect, useState } from 'react';

/**
 * Reads a CSS custom property off <html> and keeps it up to date across theme
 * switches.
 *
 * Needed wherever a colour cannot stay a CSS variable: canvas renderers
 * (echarts) resolve nothing themselves and want a literal value. DOM styles do
 * NOT need this — give them `var(--x, fallback)` directly.
 *
 * ThemeProvider writes the active theme onto `document.documentElement.style`,
 * so watching that attribute catches every theme and custom-var change. The
 * hook only reads, so the observer cannot loop.
 */
export function useCssVar(name: string, fallback: string): string {
    const [value, setValue] = useState(fallback);

    useEffect(() => {
        const read = () => {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            setValue(v || fallback);
        };
        read();
        const observer = new MutationObserver(read);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        return () => observer.disconnect();
    }, [name, fallback]);

    return value;
}
