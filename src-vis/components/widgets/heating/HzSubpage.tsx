/**
 * UI-Facelift, Heizung: Aufbau einer Auswertungs-Unterseite (nur Dev-Vorschau, Variante „Neu").
 *
 * HeizungFacelift legt um den Inhalt einer Unterseite einen Kontext (HzSubpageProvider). Die Auswertungen
 * (HeatingDetails, SensorCheck, Energie) lesen ihn mit useHzSubpage(): ist er da, bauen sie sich aus den
 * Facelift-Bausteinen (Karte, Begleittext, Abschnitt mit Zeilen); ohne ihn bleibt alles wie auf der
 * heutigen Seite („Ist", „Alt", Pi-Build).
 *
 *   Karte      Zeitraum, (Kennzahlen als Raster), Diagramm
 *   Text       Begleittext (aura-fl-foot)
 *   Abschnitt  „Im gewählten Zeitraum": Kennzahlen als Zeilen
 *   danach     weitere Abschnitte der Auswertung (z. B. Streudiagramm)
 *
 * Offene Gestaltungsfragen an Sascha (14.11.2026) als gelbe Auswahl über der Unterseite (HZ_SUB_PICK):
 *   Kennzahlen  A Zeilen unter dem Text · B Raster in der Karte · C ohne
 *   Soll-Linie  a orange (bisher) · b grau · c türkis   (nur Heizkreis)
 */
import { createContext, useContext, type ReactNode, type Ref } from 'react';
import { create } from 'zustand';

/** Gelbe Auswahl auf den Unterseiten zeigen (bis Sascha entschieden hat). */
export const HZ_SUB_PICK = true;

export type HzKz = 'rows' | 'card' | 'none';
export type HzSoll = 'a' | 'b' | 'c';
export const HZ_KZ: { key: HzKz; label: string; name: string }[] = [
    { key: 'rows', label: 'A', name: 'Zeilen unter dem Text' },
    { key: 'card', label: 'B', name: 'Raster in der Karte' },
    { key: 'none', label: 'C', name: 'ohne Kennzahlen' },
];
export const HZ_SOLL: { key: HzSoll; label: string; name: string }[] = [
    { key: 'a', label: 'a', name: 'orange (bisher)' },
    { key: 'b', label: 'b', name: 'grau' },
    { key: 'c', label: 'c', name: 'türkis' },
];
const KZ_KEY = 'aura.heizung.kennzahlen';
const SOLL_KEY = 'aura.heizung.soll';
function readKey<T extends string>(key: string, all: { key: T }[], fb: T): T {
    try {
        const v = localStorage.getItem(key);
        return all.some((x) => x.key === v) ? (v as T) : fb;
    } catch {
        return fb;
    }
}
function writeKey(key: string, v: string) {
    try {
        localStorage.setItem(key, v);
    } catch {
        /* privater Modus */
    }
}
export const useHzSubStore = create<{ kz: HzKz; soll: HzSoll; setKz: (k: HzKz) => void; setSoll: (s: HzSoll) => void }>(
    (set) => ({
        kz: readKey(KZ_KEY, HZ_KZ, 'rows'),
        soll: readKey(SOLL_KEY, HZ_SOLL, 'a'),
        setKz: (kz) => {
            set({ kz });
            writeKey(KZ_KEY, kz);
        },
        setSoll: (soll) => {
            set({ soll });
            writeKey(SOLL_KEY, soll);
        },
    }),
);

export interface HzSubpage {
    /** Begleittext unter der Diagramm-Karte */
    foot: string;
    kz: HzKz;
    soll: HzSoll;
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

/** Kennzahlen als Raster in der Diagramm-Karte (zwei Spalten). */
function HzStatGrid({ stats }: { stats: HzStat[] }) {
    return (
        <div className="hz-kz">
            {stats.map((s) => (
                <div key={s.label} className="hz-kz-cell">
                    <span className="hz-kz-label">{s.label}</span>
                    <span className="hz-kz-val" style={s.color ? { color: s.color } : undefined}>
                        {s.value}
                    </span>
                    {s.sub && <span className="hz-kz-sub">{s.sub}</span>}
                </div>
            ))}
        </div>
    );
}

/**
 * Rahmen einer Auswertung. Ohne Unterseiten-Kontext genau der bisherige Aufbau (Spalte mit Abstand 8 px).
 * Im Facelift: Karte (Zeitraum, ggf. Kennzahlen-Raster, Diagramm) → Begleittext → Kennzahlen-Zeilen → after.
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
                    {sub.kz === 'card' && has && <HzStatGrid stats={stats} />}
                    {children}
                </div>
            </div>
            {sub.foot && <p className="aura-fl-foot hz-foot">{sub.foot}</p>}
            {sub.kz === 'rows' && has && (
                <HzSection title={statsTitle}>
                    <HzStatRows stats={stats} />
                </HzSection>
            )}
            {after}
        </>
    );
}
