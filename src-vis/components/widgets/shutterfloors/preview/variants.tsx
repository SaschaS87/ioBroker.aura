/**
 * Planer-Entwuerfe A–E fuer den Rolllaeden-Tab (nur Dev-Vorschau).
 * Jeder Entwurf = eine Einstiegskachel ueber der Etagenliste + die
 * Startseite des grossen Popups. Szenen- und Zeitpunkt-Editor sind bei allen
 * gleich (parts.tsx), damit nur die Bedienidee verglichen wird.
 */
import { useState, type ComponentType } from 'react';
import { CalendarClock, ChevronRight, Pause, Plus } from 'lucide-react';
import {
    addDays,
    dayLabel,
    fmtDateLong,
    hhmm,
    holidayName,
    nextHoliday,
    fmtDate,
    triggerShort,
    triggerText,
    WD_SHORT,
    WEEKDAYS,
    weekdayOf,
    type PlanModel,
} from './planModel';
import {
    Agenda,
    Caption,
    DayLetters,
    DayTrack,
    EntryList,
    OccRow,
    PlanSheet,
    PlayBtn,
    SceneGlyph,
    SceneList,
    Seg,
    SettingsCard,
    Toast,
    Toggle,
    TrackScale,
    type SheetView,
} from './parts';

function useSheet() {
    const [open, setOpen] = useState(false);
    const [seq, setSeq] = useState(0);
    const [view, setView] = useState<SheetView>({ v: 'home' });
    return {
        open,
        seq,
        view,
        setView,
        show: (v: SheetView = { v: 'home' }) => {
            setSeq((n) => n + 1);
            setView(v);
            setOpen(true);
        },
        close: () => setOpen(false),
    };
}

type Sheet = ReturnType<typeof useSheet>;

function statusText(m: PlanModel): string {
    if (!m.master) return 'Plan aus';
    if (m.pausedToday) return 'heute ausgesetzt';
    return 'Plan aktiv';
}

function nowMin(m: PlanModel) {
    return m.now.getHours() * 60 + m.now.getMinutes();
}

// ═════════════════════════════════════════════════════════════════════
// A · Nächste Fahrt — eine Aussage groß, darunter der Tag als Zeitstrahl
// ═════════════════════════════════════════════════════════════════════

function VariantA({ model }: { model: PlanModel }) {
    const sh = useSheet();
    const [tab, setTab] = useState<'plan' | 'scenes' | 'opts'>('plan');
    const next = model.upcoming(1)[0];
    const restToday = model.occurrences(model.today).filter((o) => o.min > nowMin(model)).length;
    const scene = next && next.occ.entry.target.kind === 'scene' ? model.sceneOf(next.occ.entry.target.sceneId) : undefined;
    return (
        <>
            <button type="button" className="rpp-card rpp-entry rpp-a" onClick={() => sh.show()}>
                <div className="rpp-a-top">
                    <span className="rpp-label-caps">Als Nächstes</span>
                    <span className={`rpp-pill${model.master && !model.pausedToday ? '' : ' is-off'}`}>{statusText(model)}</span>
                </div>
                {next ? (
                    <div className="rpp-a-main">
                        <span className="rpp-a-icon">{scene ? <SceneGlyph icon={scene.icon} size={22} /> : <CalendarClock size={22} />}</span>
                        <span className="rpp-a-time">{hhmm(next.occ.min)}</span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">{model.targetName(next.occ.entry.target)}</span>
                            <span className="rpp-sub">
                                {dayLabel(next.date, model.today)} · {triggerShort(next.occ.entry.trigger)}
                            </span>
                        </span>
                        <ChevronRight size={18} className="rpp-chev" />
                    </div>
                ) : (
                    <div className="rpp-a-main">
                        <span className="rpp-a-icon">
                            <CalendarClock size={22} />
                        </span>
                        <span className="rpp-row-main">
                            <span className="rpp-title">{model.entries.length ? 'Nichts mehr geplant' : 'Szenen & Wochenplan einrichten'}</span>
                            <span className="rpp-sub">Rollläden automatisch fahren lassen</span>
                        </span>
                        <ChevronRight size={18} className="rpp-chev" />
                    </div>
                )}
                <div className="rpp-a-track">
                    <DayTrack model={model} date={model.today} />
                    <TrackScale />
                </div>
                <div className="rpp-sub rpp-a-foot">
                    Heute noch {restToday} {restToday === 1 ? 'Fahrt' : 'Fahrten'} · {model.scenes.length} Szenen · {model.entries.filter((e) => e.enabled).length} Zeitpunkte
                </div>
            </button>
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title="Szenen & Wochenplan"
                    subtitle={statusText(model)}
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={model}
                    home={
                        <div className="rpp-home">
                            <Seg
                                value={tab}
                                onChange={setTab}
                                options={[
                                    { value: 'plan', label: 'Wochenplan' },
                                    { value: 'scenes', label: 'Szenen' },
                                    { value: 'opts', label: 'Einstellungen' },
                                ]}
                            />
                            {tab === 'plan' && <EntryList model={model} setView={sh.setView} />}
                            {tab === 'scenes' && <SceneList model={model} setView={sh.setView} />}
                            {tab === 'opts' && <SettingsCard model={model} />}
                        </div>
                    }
                />
            )}
            <Toast model={model} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// B · Tagesliste — die Kachel zeigt den ganzen heutigen Tag als Liste
// ═════════════════════════════════════════════════════════════════════

function VariantB({ model }: { model: PlanModel }) {
    const sh = useSheet();
    const occ = model.occurrences(model.today);
    const nm = nowMin(model);
    const skip = !model.master || model.pausedToday;
    return (
        <>
            <div className="rpp-b">
                <Caption right={<Toggle on={model.master} onChange={model.setMaster} label="Wochenplan aktiv" />}>
                    Heute · {WD_SHORT[weekdayOf(model.today)]} {fmtDate(model.today)}
                </Caption>
                <div className="rpp-card">
                    {occ.length === 0 && <div className="rpp-empty">Heute ist nichts geplant.</div>}
                    {occ.map((o) => (
                        <OccRow key={o.entry.id} model={model} occ={o} past={skip || o.min <= nm} onClick={() => sh.show({ v: 'entry', id: o.entry.id })} />
                    ))}
                    <button type="button" className="rpp-row rpp-row--tap rpp-row--add" onClick={() => sh.show()}>
                        <CalendarClock size={16} /> Szenen & Wochenplan
                        <ChevronRight size={16} className="rpp-chev" style={{ marginLeft: 'auto' }} />
                    </button>
                </div>
            </div>
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title="Szenen & Wochenplan"
                    subtitle={statusText(model)}
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={model}
                    home={
                        <div className="rpp-home">
                            <Caption>Szenen</Caption>
                            <div className="rpp-tiles">
                                {model.scenes.map((s) => (
                                    <div key={s.id} role="button" tabIndex={0} className="rpp-card rpp-tile" onClick={() => sh.setView({ v: 'scene', id: s.id })}>
                                        <span className="rpp-tile-top">
                                            <SceneGlyph icon={s.icon} size={20} />
                                            <PlayBtn onClick={() => model.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                                        </span>
                                        <span className="rpp-title">{s.name}</span>
                                        <span className="rpp-sub">{s.targets.length} Rollläden</span>
                                    </div>
                                ))}
                                <button type="button" className="rpp-card rpp-tile rpp-tile--add" onClick={() => sh.setView({ v: 'scene', id: null })}>
                                    <Plus size={20} />
                                    <span className="rpp-sub">Neue Szene</span>
                                </button>
                            </div>
                            {WEEKDAYS.map((d) => {
                                const list = model.entries.filter((e) => e.days[d]);
                                return (
                                    <div key={d}>
                                        <Caption>{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][d]}</Caption>
                                        <EntryListCompact model={model} setView={sh.setView} entries={list} day={d} />
                                    </div>
                                );
                            })}
                            <Caption>Einstellungen</Caption>
                            <SettingsCard model={model} />
                        </div>
                    }
                />
            )}
            <Toast model={model} />
        </>
    );
}

/** Wochentags-Block in B: kompakte Zeilen ohne Tagesbuchstaben. */
function EntryListCompact({
    model,
    setView,
    entries,
    day,
}: {
    model: PlanModel;
    setView: (v: SheetView) => void;
    entries: PlanModel['entries'];
    day: number;
}) {
    const date = addDays(model.today, (day - weekdayOf(model.today) + 7) % 7);
    const sun = model.sunFor(date);
    const sorted = [...entries]
        .map((e) => ({ e, min: e.trigger.kind === 'time' ? (Number(e.trigger.time.slice(0, 2)) * 60 + Number(e.trigger.time.slice(3))) : (e.trigger.kind === 'sunrise' ? sun.sunrise : sun.sunset) + e.trigger.offset }))
        .sort((a, b) => a.min - b.min);
    return (
        <div className="rpp-card">
            {sorted.length === 0 && <div className="rpp-empty">Nichts geplant</div>}
            {sorted.map(({ e, min }) => (
                <div key={e.id} className={`rpp-row rpp-row--tap${e.enabled ? '' : ' is-past'}`} role="button" tabIndex={0} onClick={() => setView({ v: 'entry', id: e.id })}>
                    <span className="rpp-time">{hhmm(min)}</span>
                    <span className="rpp-row-main">
                        <span className="rpp-title">{model.targetName(e.target)}</span>
                        <span className="rpp-sub">{triggerShort(e.trigger)}</span>
                    </span>
                    <Toggle on={e.enabled} onChange={() => model.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                </div>
            ))}
            <button
                type="button"
                className="rpp-row rpp-row--tap rpp-row--add"
                onClick={() => setView({ v: 'entry', id: null, preset: { days: WEEKDAYS.map((x) => x === day) } })}
            >
                <Plus size={16} /> Zeitpunkt am {WD_SHORT[day]}
            </button>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════
// C · Wochenraster — sieben Zeitstrahlen untereinander
// ═════════════════════════════════════════════════════════════════════

function WeekGrid({ model, big, onPick }: { model: PlanModel; big?: boolean; onPick?: (id: string) => void }) {
    return (
        <div className={`rpp-week${big ? ' is-big' : ''}`}>
            {Array.from({ length: 7 }, (_, i) => addDays(model.today, i)).map((d, i) => {
                const hol = holidayName(d);
                return (
                    <div key={i} className={`rpp-week-row${i === 0 ? ' is-today' : ''}`}>
                        <span className="rpp-week-day">
                            {WD_SHORT[weekdayOf(d)]}
                            {hol && <span className="rpp-week-hol" title={hol}>•</span>}
                        </span>
                        <DayTrack model={model} date={d} compact={!big} onPick={onPick ? (e) => onPick(e.id) : undefined} />
                    </div>
                );
            })}
            <div className="rpp-week-row">
                <span className="rpp-week-day" />
                <TrackScale />
            </div>
        </div>
    );
}

function VariantC({ model }: { model: PlanModel }) {
    const sh = useSheet();
    const next = model.upcoming(1)[0];
    return (
        <>
            <button type="button" className="rpp-card rpp-entry rpp-pad" onClick={() => sh.show()}>
                <div className="rpp-a-top">
                    <span className="rpp-label-caps">Wochenplan Rollläden</span>
                    <span className={`rpp-pill${model.master && !model.pausedToday ? '' : ' is-off'}`}>{statusText(model)}</span>
                </div>
                <WeekGrid model={model} />
                <div className="rpp-legend">
                    <span>
                        <i className="rpp-legend-dot is-up" /> öffnet
                    </span>
                    <span>
                        <i className="rpp-legend-dot is-down" /> schließt
                    </span>
                    <span className="rpp-sub" style={{ marginLeft: 'auto' }}>
                        {next ? `als Nächstes ${hhmm(next.occ.min)} ${model.targetName(next.occ.entry.target)}` : 'nichts geplant'}
                    </span>
                </div>
            </button>
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title="Wochenplan"
                    subtitle="Punkt antippen zum Bearbeiten"
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={model}
                    home={
                        <div className="rpp-home">
                            <div className="rpp-card rpp-pad">
                                <WeekGrid model={model} big onPick={(id) => sh.setView({ v: 'entry', id })} />
                            </div>
                            <Caption>Zeitpunkte</Caption>
                            <EntryList model={model} setView={sh.setView} />
                            <Caption>Szenen</Caption>
                            <SceneList model={model} setView={sh.setView} withTimes={false} />
                            <Caption>Einstellungen</Caption>
                            <SettingsCard model={model} />
                        </div>
                    }
                />
            )}
            <Toast model={model} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// D · Szenen zuerst — Szenen als Knöpfe, jede Szene trägt ihre Zeiten
// ═════════════════════════════════════════════════════════════════════

function VariantD({ model }: { model: PlanModel }) {
    const sh = useSheet();
    const next = model.upcoming(1)[0];
    const deviceEntries = model.entries.filter((e) => e.target.kind === 'device');
    return (
        <>
            <div className="rpp-d">
                <Caption right={<button type="button" className="rpp-textbtn" onClick={() => sh.show()}>Planen</button>}>Szenen</Caption>
                <div className="rpp-tiles rpp-tiles--grid">
                    {model.scenes.map((s) => {
                        const nx = model
                            .entriesOfScene(s.id)
                            .filter((e) => e.enabled)
                            .map((e) => model.nextRunOf(e))
                            .filter((x): x is NonNullable<typeof x> => !!x)
                            .sort((a, b) => a.date.getTime() - b.date.getTime() || a.min - b.min)[0];
                        return (
                            <div key={s.id} role="button" tabIndex={0} className="rpp-card rpp-tile" onClick={() => sh.show({ v: 'scene', id: s.id })}>
                                <span className="rpp-tile-top">
                                    <SceneGlyph icon={s.icon} size={20} />
                                    <PlayBtn onClick={() => model.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                                </span>
                                <span className="rpp-title">{s.name}</span>
                                <span className="rpp-sub">{nx && model.master ? `${dayLabel(nx.date, model.today)} ${hhmm(nx.min)}` : 'per Hand'}</span>
                            </div>
                        );
                    })}
                    <button type="button" className="rpp-card rpp-tile rpp-tile--add" onClick={() => sh.show({ v: 'scene', id: null })}>
                        <Plus size={20} />
                        <span className="rpp-sub">Neue Szene</span>
                    </button>
                </div>
                <button type="button" className="rpp-card rpp-card--row rpp-row rpp-row--tap" onClick={() => sh.show()}>
                    <CalendarClock size={18} className="rpp-row-icon" />
                    <span className="rpp-row-main">
                        <span className="rpp-title">Wochenplan</span>
                        <span className="rpp-sub">{next ? `Als Nächstes ${dayLabel(next.date, model.today).toLowerCase()} ${hhmm(next.occ.min)} · ${model.targetName(next.occ.entry.target)}` : statusText(model)}</span>
                    </span>
                    <ChevronRight size={16} className="rpp-chev" />
                </button>
            </div>
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title="Szenen & Zeiten"
                    subtitle="Jede Szene trägt ihre eigenen Zeitpunkte"
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={model}
                    home={
                        <div className="rpp-home">
                            {model.scenes.map((s) => (
                                <div key={s.id}>
                                    <Caption
                                        right={
                                            <button type="button" className="rpp-textbtn" onClick={() => sh.setView({ v: 'scene', id: s.id })}>
                                                Bearbeiten
                                            </button>
                                        }
                                    >
                                        {s.name}
                                    </Caption>
                                    <div className="rpp-card">
                                        <div className="rpp-row">
                                            <span className="rpp-row-icon">
                                                <SceneGlyph icon={s.icon} />
                                            </span>
                                            <span className="rpp-row-main">
                                                <span className="rpp-sub">
                                                    {s.targets
                                                        .map((t) => model.deviceOf(t.key)?.label)
                                                        .filter(Boolean)
                                                        .slice(0, 4)
                                                        .join(', ')}
                                                    {s.targets.length > 4 ? ` +${s.targets.length - 4}` : ''}
                                                </span>
                                            </span>
                                            <PlayBtn onClick={() => model.runScene(s.id)} label={`${s.name} jetzt fahren`} />
                                        </div>
                                        {model.entriesOfScene(s.id).map((e) => (
                                            <div key={e.id} className={`rpp-row rpp-row--tap${e.enabled ? '' : ' is-past'}`} role="button" tabIndex={0} onClick={() => sh.setView({ v: 'entry', id: e.id })}>
                                                <span className="rpp-row-main">
                                                    <span className="rpp-title">{triggerText(e.trigger)}</span>
                                                    <DayLetters days={e.days} dim={!e.enabled} />
                                                </span>
                                                <Toggle on={e.enabled} onChange={() => model.toggleEntry(e.id)} label="Zeitpunkt aktiv" />
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="rpp-row rpp-row--tap rpp-row--add"
                                            onClick={() => sh.setView({ v: 'entry', id: null, preset: { target: { kind: 'scene', sceneId: s.id } } })}
                                        >
                                            <Plus size={16} /> Zeit hinzufügen
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <Caption>Einzelne Rollläden</Caption>
                            <EntryList model={model} setView={sh.setView} entries={deviceEntries} />
                            <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => sh.setView({ v: 'scene', id: null })}>
                                <Plus size={15} /> Neue Szene
                            </button>
                            <Caption>Einstellungen</Caption>
                            <SettingsCard model={model} />
                        </div>
                    }
                />
            )}
            <Toast model={model} />
        </>
    );
}

// ═════════════════════════════════════════════════════════════════════
// E · Kalenderblatt — Datum, Sonne, Feiertag, die nächsten Fahrten
// ═════════════════════════════════════════════════════════════════════

function VariantE({ model }: { model: PlanModel }) {
    const sh = useSheet();
    const [tab, setTab] = useState<'agenda' | 'scenes' | 'opts'>('agenda');
    const sun = model.sunFor(model.today);
    const up = model.upcoming(3);
    const holToday = holidayName(model.today);
    const nh = nextHoliday(addDays(model.today, 1));
    const daysToHol = Math.round((nh.date.getTime() - model.today.getTime()) / 864e5);
    return (
        <>
            <div className="rpp-card rpp-e">
                <button type="button" className="rpp-e-head" onClick={() => sh.show()}>
                    <span className="rpp-row-main">
                        <span className="rpp-e-date">{fmtDateLong(model.today)}</span>
                        <span className="rpp-sub rpp-inline">
                            <span>↑ {hhmm(sun.sunrise)}</span>
                            <span>↓ {hhmm(sun.sunset)}</span>
                            <span>
                                {holToday
                                    ? `Feiertag: ${holToday}`
                                    : daysToHol <= 14
                                      ? `${nh.name} in ${daysToHol} ${daysToHol === 1 ? 'Tag' : 'Tagen'}`
                                      : `nächster Feiertag ${fmtDate(nh.date)}`}
                            </span>
                        </span>
                    </span>
                    <ChevronRight size={18} className="rpp-chev" />
                </button>
                {up.length === 0 && <div className="rpp-empty">{model.master ? 'Keine Fahrten geplant.' : 'Wochenplan ist ausgeschaltet.'}</div>}
                {up.map(({ date, occ }) => (
                    <OccRow
                        key={`${date.toDateString()}-${occ.entry.id}`}
                        model={model}
                        occ={occ}
                        showDate={date}
                        onClick={() => sh.show({ v: 'entry', id: occ.entry.id })}
                    />
                ))}
                <div className="rpp-e-foot">
                    <button type="button" className={`rpp-btn rpp-btn--soft${model.pausedToday ? ' is-on' : ''}`} onClick={() => model.setPausedToday(!model.pausedToday)}>
                        <Pause size={14} /> {model.pausedToday ? 'Heute ausgesetzt' : 'Heute aussetzen'}
                    </button>
                    <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => sh.show()}>
                        <CalendarClock size={14} /> Planen
                    </button>
                </div>
            </div>
            {sh.open && (
                <PlanSheet
                    key={sh.seq}
                    title="Rollladen-Kalender"
                    subtitle={statusText(model)}
                    view={sh.view}
                    setView={sh.setView}
                    onClose={sh.close}
                    model={model}
                    home={
                        <div className="rpp-home">
                            <Seg
                                value={tab}
                                onChange={setTab}
                                options={[
                                    { value: 'agenda', label: '7 Tage' },
                                    { value: 'scenes', label: 'Szenen' },
                                    { value: 'opts', label: 'Einstellungen' },
                                ]}
                            />
                            {tab === 'agenda' && (
                                <>
                                    <button type="button" className="rpp-btn rpp-btn--soft" onClick={() => sh.setView({ v: 'entry', id: null })}>
                                        <Plus size={15} /> Zeitpunkt hinzufügen
                                    </button>
                                    <Agenda model={model} days={7} setView={sh.setView} />
                                </>
                            )}
                            {tab === 'scenes' && <SceneList model={model} setView={sh.setView} />}
                            {tab === 'opts' && <SettingsCard model={model} />}
                        </div>
                    }
                />
            )}
            <Toast model={model} />
        </>
    );
}

export const VARIANTS: { key: string; name: string; C: ComponentType<{ model: PlanModel }> }[] = [
    { key: 'A', name: 'Nächste Fahrt + Tagesstrahl', C: VariantA },
    { key: 'B', name: 'Heute als Liste', C: VariantB },
    { key: 'C', name: 'Wochenraster', C: VariantC },
    { key: 'D', name: 'Szenen zuerst', C: VariantD },
    { key: 'E', name: 'Kalenderblatt', C: VariantE },
];

export type { Sheet };
