/**
 * Dev-only write guard ("Schreibsperre") for the Vite dev preview.
 *
 * The dev preview is NOT offline: vite.config.ts proxies /socket.io to the real
 * ioBroker (see .iobroker-url), so a click on a shutter control in `npm run dev`
 * moves the real shutter in the house. `?shot=1` (the screenshot harness) is the
 * only mode with fabricated values, and it does not protect devices either —
 * screenshotMode never reaches this socket layer.
 *
 * This guard sits directly on the socket, wrapping the object returned by
 * io.connect(). Everything the frontend sends goes through getSocket().emit(),
 * including the two call sites that bypass the setStateDirect/setObjectDirect
 * helpers (CalendarWidget, publishTimerConfig) — so there is no way around it.
 *
 * Rules:
 *  - reads (getState, getHistory, subscribe, readFile, …) pass untouched;
 *  - writes are allowed only inside our own namespace (NS.*), otherwise the
 *    dev preview could not even save its own dashboard config;
 *  - sendTo is checked against a positive list, because most of its commands
 *    target our own instance (and would pass the namespace rule) while doing
 *    real system work: restartAdapter, upgradeAdapter, setScriptEnabled,
 *    notify… all reach past the frontend into the running system;
 *  - a blocked call is logged with everything it would have sent and then
 *    answered with a fake "ok" callback, so the widget behaves normally.
 *
 * Deliberately NOT covered: timers. Their configuration lives inside our own
 * namespace (allowed above), but the adapter process — not the browser — fires
 * them. A timer created in the dev environment therefore switches real devices
 * past this guard. See "Umsetzung - Zweite Aura-Instanz (Weg C)".
 *
 * Off in production builds (import.meta.env.DEV is false and the call site is
 * eliminated), and switchable off in dev via VITE_AURA_ALLOW_WRITES=1 when a
 * real device is to be tested on purpose.
 */
import { NS } from './namespace';

/** Structural copy of useIoBroker's internal IoBrokerSocket — kept local to avoid an import cycle. */
export interface WritableSocket {
    connected: boolean;
    on(event: string, callback: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    disconnect(): void;
}

/** Socket commands whose first argument is a state/object ID. */
const ID_WRITE_COMMANDS = new Set([
    'setState',
    'setStates',
    'setObject',
    'extendObject',
    'delObject',
    'delObjects',
    'delState',
]);

/** Socket commands whose first argument is an adapter namespace (files live under <namespace>/<file>). */
const FILE_WRITE_COMMANDS = new Set([
    'writeFile',
    'writeFile64',
    'deleteFile',
    'deleteFolder',
    'unlink',
    'rename',
    'renameFile',
    'mkdir',
    'chmodFile',
    'chownFile',
]);

/**
 * sendTo commands that only read, or that only touch our own bookkeeping
 * states. Everything else is blocked — notably restartAdapter, upgradeAdapter,
 * setScriptEnabled, notify/notifyAck, generateMcpToken and the delete*
 * cleanups, which all act on the running production system.
 */
const SAFE_SEND_TO = new Set([
    'ping',
    'auraPing',
    'perfLog',
    'perfBreakdown',
    'getPerfBreakdown',
    'getLoadHistory',
    'getRecentLogs',
    'listTimers',
    'listLists',
    'listPanels',
    'checkDps',
    'renameTimer',
]);

/** Known read-only commands. Only used to notice a command nobody classified yet. */
const KNOWN_READ_COMMANDS = new Set([
    'getState',
    'getStates',
    'getObject',
    'getObjects',
    'getObjectView',
    'getObjectList',
    'getHistory',
    'readFile',
    'readFile64',
    'readDir',
    'subscribe',
    'unsubscribe',
    'subscribeObjects',
    'unsubscribeObjects',
    'authenticate',
    'requireLog',
    'getVersion',
    'getAdapterInstances',
    'getCurrentUser',
    'getUserPermissions',
    'listPermissions',
    'checkFeatureSupported',
    'error',
    'log',
    'name',
]);

export interface BlockedCall {
    ts: number;
    command: string;
    target: string;
    reason: string;
    args: unknown[];
}

const blocked: BlockedCall[] = [];
const unknownSeen = new Set<string>();
// The socket is rebuilt on every reconnect and on every resume-bounce, so the
// banner would otherwise repeat all day. Once per page load is enough.
let bannerShown = false;

function isOwnNamespace(id: unknown): boolean {
    return typeof id === 'string' && (id === NS || id.startsWith(`${NS}.`));
}

/** null = let it through, string = why it is being stopped. */
function blockReason(command: string, args: unknown[]): string | null {
    if (ID_WRITE_COMMANDS.has(command) || FILE_WRITE_COMMANDS.has(command)) {
        if (isOwnNamespace(args[0])) return null;
        return `Schreiben ausserhalb von ${NS}.*`;
    }
    if (command === 'sendTo') {
        const cmd = typeof args[1] === 'string' ? args[1] : '';
        if (SAFE_SEND_TO.has(cmd)) return null;
        return `sendTo "${cmd || '?'}" steht nicht auf der Positivliste`;
    }
    if (!KNOWN_READ_COMMANDS.has(command) && !unknownSeen.has(command)) {
        unknownSeen.add(command);
        console.warn(
            `[Aura Dev-Schreibsperre] Unbekanntes Socket-Kommando "${command}" durchgelassen — ` +
                'falls es etwas schreibt, gehoert es in devWriteGuard.ts eingetragen.',
        );
    }
    return null;
}

function describeTarget(command: string, args: unknown[]): string {
    if (command === 'sendTo') return `${String(args[0] ?? '?')} → ${String(args[1] ?? '?')}`;
    if (FILE_WRITE_COMMANDS.has(command)) return `${String(args[0] ?? '?')}/${String(args[1] ?? '?')}`;
    return String(args[0] ?? '?');
}

/**
 * Wrap a socket so foreign writes are logged instead of sent. Returns the
 * socket unchanged in production and when VITE_AURA_ALLOW_WRITES=1.
 */
export function guardDevWrites(socket: WritableSocket): WritableSocket {
    if (!import.meta.env.DEV) return socket;
    if (import.meta.env.VITE_AURA_ALLOW_WRITES === '1') {
        if (!bannerShown) {
            bannerShown = true;
            console.warn(
                '[Aura Dev-Schreibsperre] AUS (VITE_AURA_ALLOW_WRITES=1) — ' +
                    'diese Vorschau schaltet echte Geraete im Haus.',
            );
        }
        return socket;
    }

    if (!bannerShown) {
        bannerShown = true;
        console.info(
            `[Aura Dev-Schreibsperre] aktiv — Schreiben nur auf ${NS}.*, ` +
                'alles andere wird protokolliert statt gesendet. ' +
                'Blockiertes ansehen: window.__auraDevGuard.blocked',
        );
    }

    (window as unknown as Record<string, unknown>)['__auraDevGuard'] = {
        namespace: NS,
        blocked,
        /** Convenience for the console: clears the list before a test run. */
        clear: () => {
            blocked.length = 0;
        },
    };

    return {
        get connected() {
            return socket.connected;
        },
        on: (event, callback) => socket.on(event, callback),
        disconnect: () => socket.disconnect(),
        emit: (event, ...args) => {
            const reason = blockReason(event, args);
            if (!reason) {
                socket.emit(event, ...args);
                return;
            }

            const entry: BlockedCall = {
                ts: Date.now(),
                command: event,
                target: describeTarget(event, args),
                reason,
                args: args.filter((a) => typeof a !== 'function'),
            };
            blocked.push(entry);
            console.warn(`[Aura Dev-Schreibsperre] GESTOPPT: ${event} → ${entry.target} (${reason})`, ...entry.args);

            // Answer like a successful round-trip so nothing hangs on the callback.
            // Async on purpose: a real socket never calls back synchronously.
            const cb = args[args.length - 1];
            if (typeof cb === 'function') {
                globalThis.setTimeout(() => (cb as (...cbArgs: unknown[]) => void)(null), 0);
            }
        },
    };
}
