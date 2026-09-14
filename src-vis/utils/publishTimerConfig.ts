/**
 * Publish Zeitschaltuhr (timer) configuration to ioBroker states under
 * aura.0.timers.<widgetId>.*  so the adapter's backend scheduler can read and
 * fire the configured events.
 *
 * Two states per widget:
 *   - config  (string, JSON-serialized { events, holidaysDp?, vacationDp? })
 *   - enabled (boolean, master switch)
 *
 * The adapter pre-creates aura.0.timers as a channel; the per-widget channel +
 * states are created on-demand here. The adapter subscribes to timers.* and
 * rebuilds its in-memory schedule whenever a state changes.
 */
import { setStateDirect, getSocket, sendToDirect } from '../hooks/useIoBroker';
import type { TimerEvent } from '../types';
import { NS } from './namespace';
// Reine Konstanten/Funktionen ohne React — der Import zieht nichts vom Widget mit.
import { circleSlug, clampMinutes, DEFAULT_MANUAL_MINUTES } from '../components/widgets/garten/gartenConstants';

/** Promise wrapper around setObject so callers can await object creation
 *  before writing the corresponding state — otherwise iobroker logs
 *  "State has no existing object" warnings. */
function setObjectAsync(id: string, obj: object): Promise<void> {
    return new Promise((resolve) => {
        getSocket().emit('setObject', id, obj, () => resolve());
    });
}

const NAMESPACE = `${NS}.timers`;

export function timerChannelId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}`;
}

export function timerConfigStateId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}.config`;
}

export function timerEnabledStateId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}.enabled`;
}

export interface TimerConfigPayload {
    events: TimerEvent[];
    targetDp?: string; // widget-level: where to write when an event fires
    value?: string; // widget-level: what to write (parsed bool/number/string)
    allowEventValue?: boolean; // when true, backend honors per-event ev.value overrides
    holidaysDp?: string;
    vacationDp?: string;
    title?: string;
}

/** widgetId → pending object-creation promise. While the promise is unresolved,
 *  any state writes wait on it so they hit ioBroker after the object exists. */
const ensurePromises = new Map<string, Promise<void>>();

function ensureObjects(widgetId: string, title: string): Promise<void> {
    const existing = ensurePromises.get(widgetId);
    if (existing) return existing;
    const p = (async () => {
        await setObjectAsync(timerChannelId(widgetId), {
            type: 'channel',
            common: { name: title || 'Zeitschaltuhr' },
            native: {},
        });
        await setObjectAsync(timerConfigStateId(widgetId), {
            type: 'state',
            common: {
                name: `${title || 'Zeitschaltuhr'} — config`,
                type: 'string',
                role: 'json',
                read: true,
                write: true,
                def: '',
            },
            native: {},
        });
        await setObjectAsync(timerEnabledStateId(widgetId), {
            type: 'state',
            common: {
                name: `${title || 'Zeitschaltuhr'} — enabled`,
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
    })();
    ensurePromises.set(widgetId, p);
    return p;
}

export function publishTimerConfig(widgetId: string, title: string, payload: TimerConfigPayload): void {
    void ensureObjects(widgetId, title).then(() => {
        setStateDirect(timerConfigStateId(widgetId), JSON.stringify(payload), false);
    });
}

export function publishTimerEnabled(widgetId: string, title: string, enabled: boolean): void {
    void ensureObjects(widgetId, title).then(() => {
        setStateDirect(timerEnabledStateId(widgetId), enabled, false);
    });
}

export async function unpublishTimer(widgetId: string): Promise<void> {
    ensurePromises.delete(widgetId);
    // delObject over the web socket is permission-gated and silently dropped for
    // non-admin users. Route the cleanup through the adapter via sendTo so it
    // runs as the adapter instance (full permissions).
    const result = await sendToDirect<{ ok: boolean; error?: string; results?: Record<string, string> }>(
        NS,
        'deleteTimer',
        { widgetId },
    );
    console.info('[aura-timer] deleteTimer result', widgetId, result);
}

// ── Garten-Widget: ein Timer-Kanal je Bewässerungskreis ──────────────────────
// Das Garten-Widget bringt keinen eigenen Scheduler mit. Es spiegelt seinen
// Zeitplan pro Kreis in genau das Format, das der Adapter ohnehin liest —
// deshalb steht die Spiegelung hier und nicht im Widget-Ordner: useTimerOrphans
// importiert aus dieser Datei und soll nicht an einem Widget hängen.

/** Backend-Schlüssel eines Kreises: `<seg>-<slug>`, z. B. 'a1b2c3-rasen-kueche'. */
export function gartenCircleKey(seg: string, sprinkleName: string): string {
    return `${seg}-${circleSlug(sprinkleName)}`;
}

/** seg → Schlüssel, die in dieser Sitzung tatsächlich publiziert wurden.
 *  Ergänzt die aus den Optionen ableitbaren Schlüssel: ein neu erkannter Kreis
 *  ohne Anzeigename und ohne Termin stünde sonst als „verwaist“ da. */
const gartenPublished = new Map<string, Set<string>>();

/**
 * Alle Backend-Schlüssel, die ein Garten-Widget besitzt.
 *
 * Wichtig für den Verwaisten-Melder: ohne diese Liste hielte die Übersicht
 * jeden Kreis-Kanal für einen „Zeitschaltuhr-DP ohne Widget“ und der
 * „Aufräumen“-Knopf löschte den kompletten Bewässerungszeitplan.
 */
export function gartenBackendKeys(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): string[] {
    if (!widget || widget.type !== 'garten') return [];
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return [];
    const seg = stateBaseId.split('.').pop();
    if (!seg) return [];
    const o = widget.options ?? {};
    const hidden = new Set(Array.isArray(o.hiddenCircles) ? (o.hiddenCircles as string[]) : []);
    const names = new Set<string>();
    for (const map of [o.circleLabels, o.schedules, o.scheduleEnabled]) {
        if (map && typeof map === 'object') for (const n of Object.keys(map)) names.add(n);
    }
    const keys = new Set<string>();
    for (const n of names) if (!hidden.has(n)) keys.add(gartenCircleKey(seg, n));
    for (const k of gartenPublished.get(seg) ?? []) keys.add(k);
    return [...keys];
}

/**
 * Einen Kreis publizieren — nutzt intern publishTimerConfig/publishTimerEnabled.
 *
 * Das `.map(...)` über die Termine ist die dritte und letzte Schranke des
 * 59-Minuten-Deckels (nach Eingabefeld und Speichern-Knopf): Selbst ein von
 * Hand in aura.X.config.dashboard eingetragener Wert von 120 erreicht das
 * Backend als 59 — länger hält die Gardena-Box ohnehin nicht durch.
 */
export function publishGartenCircle(
    seg: string,
    sprinkleName: string,
    targetDp: string,
    events: TimerEvent[],
    enabled: boolean,
    title: string,
): void {
    const key = gartenCircleKey(seg, sprinkleName);
    let published = gartenPublished.get(seg);
    if (!published) {
        published = new Set<string>();
        gartenPublished.set(seg, published);
    }
    published.add(key);
    const payload: TimerConfigPayload = {
        events: events.map((e) => ({ ...e, value: String(clampMinutes(e.value)) })),
        targetDp,
        value: String(DEFAULT_MANUAL_MINUTES),
        allowEventValue: true,
        title,
    };
    publishTimerConfig(key, title, payload);
    publishTimerEnabled(key, title, enabled);
}

/** Kanäle eines Kreises abräumen (Kreis ausgeblendet / Widget gelöscht). */
export async function unpublishGartenCircle(seg: string, sprinkleName: string): Promise<void> {
    const key = gartenCircleKey(seg, sprinkleName);
    gartenPublished.get(seg)?.delete(key);
    await unpublishTimer(key);
}

/** Cleanup backend DPs for a widget about to be deleted. Safe to call for any
 *  widget type — only acts on type==='timer' with a stamped stateBaseId, or on
 *  type==='garten', where every circle channel goes. */
export function unpublishTimerForWidget(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    if (!widget) return;
    if (widget.type === 'garten') {
        for (const key of gartenBackendKeys(widget)) void unpublishTimer(key);
        return;
    }
    if (widget.type !== 'timer') return;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return;
    const backendKey = stateBaseId.split('.').pop();
    if (!backendKey) return;
    void unpublishTimer(backendKey);
}

/** Push a title change to ioBroker for a timer widget. Runs via sendTo so the
 *  adapter does the extendObject under full permissions. Caller is responsible
 *  for triggering this at the right moment (typically on an explicit save) —
 *  the AdminWidgets InlineEditForm calls onUpdate per keystroke, so calling
 *  this from there would spam the adapter. No-op for non-timer widgets /
 *  widgets without stateBaseId / when the title matches the last sent value. */
const lastRenameSent = new Map<string, string>();
export function renameTimerForWidget(
    widget: { type?: string; title?: string; options?: Record<string, unknown> } | null | undefined,
): void {
    if (!widget || widget.type !== 'timer') return;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return;
    const backendKey = stateBaseId.split('.').pop();
    if (!backendKey) return;
    const title = widget.title || 'Zeitschaltuhr';
    if (lastRenameSent.get(backendKey) === title) return;
    lastRenameSent.set(backendKey, title);
    void sendToDirect(NS, 'renameTimer', { widgetId: backendKey, title });
}

/** Walk a list of widgets and push rename for every timer. Cheap thanks to the
 *  lastRenameSent cache + the adapter's no-op-if-name-matches check. */
export function renameAllTimers(
    widgets: Array<{ type?: string; title?: string; options?: Record<string, unknown> }>,
): void {
    for (const w of widgets) renameTimerForWidget(w);
}

/** Ask the adapter which widgetIds currently have an aura.0.timers.<id>
 *  channel in ioBroker. Used by the orphan detector on the Übersicht page. */
export async function listTimerIds(): Promise<string[]> {
    const r = await sendToDirect<{ ok: boolean; widgetIds?: string[] }>(NS, 'listTimers', {});
    if (r && typeof r === 'object' && 'widgetIds' in r && Array.isArray((r as { widgetIds?: string[] }).widgetIds)) {
        return (r as { widgetIds: string[] }).widgetIds;
    }
    return [];
}

/** Extract the backendKey segment from a widget's stateBaseId, or null. */
export function timerBackendKey(
    widget: { type?: string; options?: Record<string, unknown> } | null | undefined,
): string | null {
    if (!widget || widget.type !== 'timer') return null;
    const stateBaseId = widget.options?.stateBaseId;
    if (typeof stateBaseId !== 'string') return null;
    const seg = stateBaseId.split('.').pop();
    return seg || null;
}
