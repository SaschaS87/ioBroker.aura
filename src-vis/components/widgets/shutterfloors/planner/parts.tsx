/**
 * Gemeinsame Bausteine der Rolllaeden-Planer-Kachel (Produktion, Feature 23).
 *
 * Herkunft: gleichnamige Datei im inzwischen entfernten Entwurf. Uebernommen sind die reinen Anzeige-Bausteine
 * (Glyphen, Zeilen, Zeitstrahl, Toast); Szenen-/Zeitpunkt-Editor, SettingsCard
 * und das Popup-Geruest (PlanSheet) liegen in editors.tsx, weil sie eng an
 * SceneEditor/EntryEditor gekoppelt sind (siehe Kommentar dort zum
 * Typ-only-Import in Gegenrichtung).
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Flame, House, Moon, Play, Plus, Sun, Sunrise, Star, Sunset, Tv } from 'lucide-react';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { RaffstoreIcon, RoofWindowIcon, WindowIcon } from '../../../icons/ShutterTypeIcons';
import {
    dayLabel,
    daysText,
    hhmm,
    triggerMinutes,
    triggerShort,
    WD_LETTER,
    WEEKDAYS,
    type Occurrence,
    type PlanDevice,
    type PlanEntry,
    type PlanModel,
    type PlanTarget,
    type SceneIcon,
} from './planModel';
import type { SheetView } from './editors';

// ── Kleinteile ─────────────────────────────────────────────────────────

export const SCENE_ICONS: Record<SceneIcon, typeof Sun> = {
    sunrise: Sunrise,
    sun: Sun,
    sunset: Sunset,
    moon: Moon,
    home: House,
    heat: Flame,
    tv: Tv,
};

export function SceneGlyph({ icon, size = 18 }: { icon: SceneIcon; size?: number }) {
    const I = SCENE_ICONS[icon] ?? Sun;
    return <I size={size} strokeWidth={2} />;
}

export function DeviceGlyph({ kind, closed, size = 18 }: { kind: PlanDevice['kind']; closed: number | null; size?: number }) {
    const I = kind === 'dachfenster' ? RoofWindowIcon : kind === 'raffstore' ? RaffstoreIcon : WindowIcon;
    return <I size={size} closedFrac={closed} />;
}

export function Caption({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="rpp-caption">
            <span className="rpp-caption-text">{children}</span>
            <span className="rpp-caption-line" />
            {right}
        </div>
    );
}

export function Seg<T extends string>({
    value,
    options,
    onChange,
    size = 'md',
}: {
    value: T;
    options: { value: T; label: ReactNode }[];
    onChange: (v: T) => void;
    size?: 'sm' | 'md';
}) {
    return (
        <div className={`rpp-seg rpp-seg--${size}`} role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    className={`rpp-seg-btn${value === o.value ? ' is-active' : ''}`}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            className={`rpp-toggle${on ? ' is-on' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!on);
            }}
        >
            <span className="rpp-toggle-knob" />
        </button>
    );
}

export function DayLetters({ days, dim }: { days: boolean[]; dim?: boolean }) {
    return (
        <span className={`rpp-days${dim ? ' is-dim' : ''}`} aria-label={daysText(days)}>
            {WEEKDAYS.map((d) => (
                <span key={d} className={`rpp-day${days[d] ? ' is-on' : ''}`}>
                    {WD_LETTER[d]}
                </span>
            ))}
        </span>
    );
}

export function PlayBtn({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            className="rpp-round"
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <Play size={14} />
        </button>
    );
}

/** Favoriten-Stern: Umriss wie alle Aura-Icons, aktiv gelb. */
export function FavStar({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            className={`rpp-fav${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <Star size={18} strokeWidth={2} />
        </button>
    );
}

export function Toast({ model }: { model: PlanModel }) {
    const adminPortalTarget = usePortalTarget();
    if (!model.toast) return null;
    const target = document.querySelector('[data-aura-app="frontend"]') ?? adminPortalTarget ?? document.body;
    return createPortal(<div className="rpp-toast">{model.toast}</div>, target);
}

/** Zeile „06:30 · Guten Morgen · 7 Rollläden" */
export function OccRow({
    model,
    occ,
    past,
    onClick,
    showDate,
}: {
    model: PlanModel;
    occ: Occurrence;
    past?: boolean;
    onClick?: () => void;
    showDate?: Date;
}) {
    const tg = occ.entry.target;
    const scene = tg.kind === 'scene' ? model.sceneOf(tg.sceneId) : undefined;
    const dev = tg.kind === 'device' ? model.deviceOf(tg.key) : undefined;
    return (
        <button type="button" className={`rpp-row rpp-row--tap${past ? ' is-past' : ''}`} onClick={onClick}>
            <span className="rpp-time">{hhmm(occ.min)}</span>
            <span className="rpp-row-icon">
                {scene ? <SceneGlyph icon={scene.icon} /> : dev ? <DeviceGlyph kind={dev.kind} closed={tg.kind === 'device' ? tg.closed : null} /> : null}
            </span>
            <span className="rpp-row-main">
                <span className="rpp-title">{model.targetName(tg)}</span>
                <span className="rpp-sub rpp-ellipsis">
                    {showDate ? `${dayLabel(showDate, model.today)} · ` : ''}
                    {triggerShort(occ.entry.trigger)}
                    {tg.kind === 'scene' ? ` · ${model.targetCount(tg)} Rollläden` : ` · auf ${closedWord(tg.closed)}`}
                </span>
            </span>
            {onClick && <ChevronRight size={16} className="rpp-chev" />}
        </button>
    );
}

export function closedWord(v: number): string {
    if (v <= 0) return 'offen';
    if (v >= 100) return 'zu';
    return `${v} % zu`;
}

/** Tages-Zeitstrahl 0–24 Uhr mit Punkten je Ausführung und Jetzt-Strich. */
export function DayTrack({
    model,
    date,
    compact,
    onPick,
}: {
    model: PlanModel;
    date: Date;
    compact?: boolean;
    onPick?: (entry: PlanEntry) => void;
}) {
    const occ = model.occurrences(date);
    const sun = model.sunFor(date);
    const isToday = date.getDate() === model.today.getDate() && date.getMonth() === model.today.getMonth();
    const nowMin = model.now.getHours() * 60 + model.now.getMinutes();
    const pct = (m: number) => `${(m / 1440) * 100}%`;
    return (
        <div className={`rpp-track${compact ? ' is-compact' : ''}`}>
            <div className="rpp-track-night" style={{ left: 0, width: pct(sun.sunrise) }} />
            <div className="rpp-track-night" style={{ left: pct(sun.sunset), right: 0 }} />
            {isToday && <div className="rpp-track-now" style={{ left: pct(nowMin) }} />}
            {occ.map((o) => {
                const past = isToday && o.min <= nowMin;
                const up = isOpening(model, o.entry.target);
                const cls = `rpp-track-dot${past || (model.pausedToday && isToday) ? ' is-past' : ''}${up ? ' is-up' : ' is-down'}`;
                const title = `${hhmm(o.min)} ${model.targetName(o.entry.target)}`;
                // Nur antippbare Punkte sind Knöpfe - in einer Kachel, die selbst
                // ein Knopf ist, waere ein verschachtelter <button> ungueltig.
                if (!onPick) return <span key={o.entry.id} className={cls} style={{ left: pct(o.min) }} title={title} />;
                return (
                    <button
                        key={o.entry.id}
                        type="button"
                        className={cls}
                        style={{ left: pct(o.min) }}
                        title={title}
                        aria-label={title}
                        onClick={(e) => {
                            e.stopPropagation();
                            onPick(o.entry);
                        }}
                    />
                );
            })}
        </div>
    );
}

export function TrackScale() {
    return (
        <div className="rpp-track-scale">
            {['0', '6', '12', '18', '24'].map((h) => (
                <span key={h}>{h}</span>
            ))}
        </div>
    );
}

/** Öffnet die Szene überwiegend (für die Farbe des Punktes). */
export function isOpening(model: PlanModel, tg: PlanTarget): boolean {
    if (tg.kind === 'device') return tg.closed <= 50;
    const s = model.sceneOf(tg.sceneId);
    if (!s || !s.targets.length) return true;
    return s.targets.reduce((a, x) => a + x.closed, 0) / s.targets.length <= 50;
}

// ── Listen für die Startseite des Popups (Ansicht „kompakt" = A) ──────

export function SceneList({ model, setView, withTimes = true }: { model: PlanModel; setView: (v: SheetView) => void; withTimes?: boolean }) {
    return (
        <div className="rpp-card">
            {model.scenes.length === 0 && <div className="rpp-empty">Noch keine Szenen. Eine Szene fasst mehrere Rollläden mit ihrer Zielstellung zusammen.</div>}
            {model.scenes.map((s) => {
                const ent = model.entriesOfScene(s.id).filter((e) => e.enabled);
                return (
                    <div key={s.id} role="button" tabIndex={0} className="rpp-row rpp-row--tap" onClick={() => setView({ v: 'scene', id: s.id })}>
                        <span className="rpp-row-icon">
                            <SceneGlyph icon={s.icon} />
                        </span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">{s.name}</span>
                            <span className="rpp-sub">
                                {s.targets.length} Rollläden
                                {withTimes && (ent.length ? ` · ${ent.map((e) => `${daysText(e.days)} ${e.trigger.kind === 'time' ? e.trigger.time : e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'}`).join(', ')}` : ' · nur per Hand')}
                            </span>
                        </span>
                        <FavStar on={!!s.favorite} onClick={() => model.toggleFavorite(s.id)} label={s.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'} />
                        <PlayBtn onClick={() => model.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                    </div>
                );
            })}
            <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'scene', id: null })}>
                <Plus size={16} /> Szene anlegen
            </button>
        </div>
    );
}

export function EntryList({ model, setView, entries }: { model: PlanModel; setView: (v: SheetView) => void; entries?: PlanEntry[] }) {
    const sun = model.sunFor(model.today);
    const list = [...(entries ?? model.entries)].sort(
        (a, b) => triggerMinutes(a.trigger, sun).min - triggerMinutes(b.trigger, sun).min,
    );
    return (
        <div className="rpp-card">
            {list.length === 0 && <div className="rpp-empty">Noch keine Zeitpunkte im Wochenplan.</div>}
            {list.map((e) => (
                <div key={e.id} className={`rpp-row rpp-row--tap${e.enabled ? '' : ' is-past'}`} onClick={() => setView({ v: 'entry', id: e.id })} role="button" tabIndex={0}>
                    <span className="rpp-row-main">
                        <span className="rpp-title">
                            {e.trigger.kind === 'time' ? `${e.trigger.time}` : e.trigger.kind === 'sunrise' ? 'Aufgang' : 'Untergang'}
                            {e.trigger.kind !== 'time' && e.trigger.offset !== 0 && (
                                <span className="rpp-sub"> {e.trigger.offset > 0 ? '+' : '−'}{Math.abs(e.trigger.offset)} min</span>
                            )}
                            <span className="rpp-dot-sep">·</span>
                            {model.targetName(e.target)}
                        </span>
                        <span className="rpp-sub rpp-inline">
                            <DayLetters days={e.days} dim={!e.enabled} />
                            {e.trigger.earliest && <span>ab {e.trigger.earliest}</span>}
                            {e.trigger.latest && <span>bis {e.trigger.latest}</span>}
                        </span>
                    </span>
                    <Toggle on={e.enabled} onChange={() => model.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                </div>
            ))}
            <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => setView({ v: 'entry', id: null })}>
                <Plus size={16} /> Zeitpunkt hinzufügen
            </button>
        </div>
    );
}
