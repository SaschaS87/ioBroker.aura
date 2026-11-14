/**
 * UI-Facelift, Heizung: Aufbau einer Auswertungs-Unterseite (nur Dev-Vorschau, Variante „Neu").
 *
 * HeizungFacelift legt um den Inhalt einer Unterseite einen Kontext (HzSubpageProvider). Die Auswertungen
 * (HeatingDetails, SensorCheck, Energie) lesen ihn mit useHzSubpage(): ist er da, bauen sie sich aus den
 * Facelift-Bausteinen (Karte, Begleittext, Abschnitt mit Zeilen); ohne ihn bleibt alles wie auf der
 * heutigen Seite („Ist", „Alt", Pi-Build).
 *
 *   Karte      Zeitraum, Diagramm
 *   Text       Begleittext (aura-fl-foot)
 *   Abschnitt  „Im gewählten Zeitraum": Kennzahlen als Zeilen
 *   danach     weitere Abschnitte der Auswertung (z. B. Streudiagramm)
 *
 * Entschieden (Sascha, 14.11.2026): Kennzahlen als Zeilen unter dem Text (Variante A), Soll-Linie im
 * Heizkreis türkis. Offen als gelbe Auswahl über der Unterseite (HZ_SUB_PICK):
 *   Zoom  A Antippen (Ausschnitt um den Punkt) · B Schieber unter dem Diagramm · C Zeitabschnitte
 */
import { createContext, useContext, type ReactNode, type Ref } from 'react';
import { create } from 'zustand';

/** Gelbe Auswahl auf den Unterseiten zeigen (bis Sascha entschieden hat). */
export const HZ_SUB_PICK = true;

/** Wie man in ein Zeitdiagramm hineinzoomt (zwei Finger gehen bei allen). */
export type HzZoom = 'tap' | 'slider' | 'slices';
export const HZ_ZOOM: { key: HzZoom; label: string; name: string }[] = [
    { key: 'tap', label: 'A', name: 'Antippen' },
    { key: 'slider', label: 'B', name: 'Schieber' },
    { key: 'slices', label: 'C', name: 'Zeitabschnitte' },
];
const ZOOM_KEY = 'aura.heizung.zoom';
function readZoom(): HzZoom {
    try {
        const v = localStorage.getItem(ZOOM_KEY);
        return HZ_ZOOM.some((x) => x.key === v) ? (v as HzZoom) : 'tap';
    } catch {
        return 'tap';
    }
}
export const useHzSubStore = create<{ zoom: HzZoom; setZoom: (z: HzZoom) => void }>((set) => ({
    zoom: readZoom(),
    setZoom: (zoom) => {
        set({ zoom });
        try {
            localStorage.setItem(ZOOM_KEY, zoom);
        } catch {
            /* privater Modus */
        }
    },
}));

/** Soll-Linie im Heizkreis auf der Facelift-Unterseite (Sascha, 14.11.2026: türkis statt orange). */
export const HZ_SOLL_COLOR = '#2a9d8f';

export interface HzSubpage {
    /** Begleittext unter der Diagramm-Karte */
    foot: string;
    zoom: HzZoom;
}
const Ctx = createContext<HzSubpage | null>(null);
export const HzSubpageProvider = Ctx.Provider;

/** Kontext der Facelift-Unterseite; null auf der heutigen Seite. */
export function useHzSubpage(): HzSubpage | null {
    return useContext(Ctx);
}

/** Eine Kennzahl: Name, Wert, optional Zusatz (Zeitpunkt, Anzahl) und Farbe des Werts. */
export interface HzStat {
    label: string;
    value: string;
    sub?: string;
    color?: string;
}

/** Abschnitt mit Titel (Facelift-Baustein), optional Begleittext darunter. */
export function HzSection({ title, foot, children }: { title?: string; foot?: ReactNode; children: ReactNode }) {
    return (
        <section className={`aura-fl-section hz-section${title ? '' : ' hz-section--plain'}`}>
            {title && (
                <div className="aura-fl-section-head hz-section-head">
                    <h2 className="aura-fl-section-title">{title}</h2>
                </div>
            )}
            {children}
            {foot && <p className="aura-fl-foot hz-foot">{foot}</p>}
        </section>
    );
}

/** Kennzahlen als schlichte Zeilen in einer Karte (wie „Aktuelle Werte"). */
export function HzStatRows({ stats }: { stats: HzStat[] }) {
    return (
        <div className="aura-fl-card">
            {stats.map((s) => (
                <div key={s.label} className="aura-fl-row hz-valrow hz-valrow--plain">
                    <span className="aura-fl-row-main">
                        <span className="aura-fl-row-title hz-row-title">{s.label}</span>
                        {s.sub && <span className="aura-fl-row-sub">{s.sub}</span>}
                    </span>
                    <span className="hz-row-val" style={s.color ? { color: s.color } : undefined}>
                        {s.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

/**
 * Rahmen einer Auswertung. Ohne Unterseiten-Kontext genau der bisherige Aufbau (Spalte mit Abstand 8 px).
 * Im Facelift: Karte (Zeitraum, Diagramm) → Begleittext → Kennzahlen-Zeilen → after.
 */
export function HzDetailFrame({
    innerRef,
    nav,
    stats,
    statsTitle = 'Im gewählten Zeitraum',
    after,
    children,
}: {
    innerRef?: Ref<HTMLDivElement>;
    nav?: ReactNode;
    stats?: HzStat[] | null;
    statsTitle?: string;
    after?: ReactNode;
    children: ReactNode;
}) {
    const sub = useHzSubpage();
    if (!sub)
        return (
            <div ref={innerRef} className="flex flex-col gap-2 w-full">
                {nav}
                {children}
                {after}
            </div>
        );
    const has = !!stats && stats.length > 0;
    return (
        <>
            <div ref={innerRef} className="aura-fl-card hz-detail">
                <div className="flex flex-col gap-2 w-full">
                    {nav}
                    {children}
                </div>
            </div>
            {sub.foot && <p className="aura-fl-foot hz-foot">{sub.foot}</p>}
            {has && (
                <HzSection title={statsTitle}>
                    <HzStatRows stats={stats} />
                </HzSection>
            )}
            {after}
        </>
    );
}
