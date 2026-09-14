/**
 * Datenpunkte und Aktionen eines einzelnen Bewaesserungskreises.
 *
 * Basis ist `<instance>.sprinkle.<sprinkleName>` — der Kanalname des Adapters
 * ist identisch mit dem `sprinkleName` aus dessen Konfiguration.
 *
 * Bewusst NICHT abonniert wird der Zustandstext-Datenpunkt des Kreises
 * (Fallstrick 4.4 des Masterplans): Er ist als `number` deklariert, der Adapter
 * schreibt aber Text hinein. Der js-controller meldet das bei jedem Wechsel als
 * Typfehler; ein Widget, das darauf baut, zeigt frueher oder spaeter Unsinn an.
 *
 * Nicht jeder Kreis hat jeden Datenpunkt (Rasen_Test2 hat weder `autoOn` noch
 * `valveOn` noch `extBreak`). Fehlende Datenpunkte fuehren deshalb zu
 * `mode: 'unknown'` bzw. `status: 'unknown'` — nie zu einer erfundenen Angabe.
 */
import { useDatapoint } from '../../../hooks/useDatapoint';
import { setStateDirect } from '../../../hooks/useIoBroker';
import { clampMinutes } from './gartenConstants';

export type CircleMode = 'evaporation' | 'schedule' | 'unknown';
export type CircleStatus = 'running' | 'waiting' | 'idle' | 'unknown';

export interface SprinkleCircleState {
    /** `<instance>.sprinkle.<sprinkleName>` */
    base: string;
    /** Datenpunkt, in den ein Termin die Dauer schreibt. */
    runningTimeDp: string;
    valveOn: boolean | null;
    countdown: string;
    runningTime: string;
    soilMoisture: number | null;
    lastOn: string;
    mode: CircleMode;
    status: CircleStatus;
    /** Hat der Kreis ueberhaupt einen `autoOn`-Datenpunkt? */
    hasAutoOn: boolean;
    startManual: (minutes: number) => void;
    stop: () => void;
    setMode: (next: 'evaporation' | 'schedule') => void;
}

/** Werte, die "es laeuft gerade nichts" bedeuten. `'-'` ist der Startwert
 *  (`common.def`) von runningTime, `'00:00'` der Ruhewert im Betrieb. */
const IDLE_RUNNING_TIME = new Set(['', '-', '0', '0:00', '00:00']);

function asText(val: unknown): string {
    if (val === null || val === undefined) return '';
    return String(val);
}

export function useSprinkleCircle(instance: string, sprinkleName: string): SprinkleCircleState {
    const base = `${instance}.sprinkle.${sprinkleName}`;

    const valveOnDp = useDatapoint(`${base}.valveOn`);
    const countdownDp = useDatapoint(`${base}.countdown`);
    const autoOnDp = useDatapoint(`${base}.autoOn`);
    const runningTimeDp = useDatapoint(`${base}.runningTime`);
    const soilMoistureDp = useDatapoint(`${base}.actualSoilMoisture`);
    const lastOnDp = useDatapoint(`${base}.history.lastOn`);

    const valveOn = typeof valveOnDp.value === 'boolean' ? valveOnDp.value : null;
    const countdown = asText(countdownDp.value);
    const runningTime = asText(runningTimeDp.value);
    const soilMoisture = typeof soilMoistureDp.value === 'number' ? soilMoistureDp.value : null;
    const lastOn = asText(lastOnDp.value);

    // `true` -> Verdunstungsautomatik, `false` -> fester Zeitplan. Fehlt der
    // Datenpunkt (oder hat er noch nicht geantwortet), bleibt es 'unknown' und
    // der Modusschalter wird gesperrt.
    const hasAutoOn = autoOnDp.state !== null;
    const mode: CircleMode =
        autoOnDp.state === null ? 'unknown' : autoOnDp.state.val === true ? 'evaporation' : 'schedule';

    // 'waiting': Der Kreis hat eine Laufzeit stehen, das Ventil ist aber noch
    // zu — der Adapter laesst wegen maximumParallelValves = 1 immer nur einen
    // Kreis gleichzeitig laufen und reiht die anderen ein.
    const running = valveOn === true;
    const hasPendingTime = runningTime !== '' && !IDLE_RUNNING_TIME.has(runningTime.trim());
    const status: CircleStatus = running
        ? 'running'
        : hasPendingTime
          ? 'waiting'
          : valveOnDp.state === null
            ? 'unknown'
            : 'idle';

    const startManual = (minutes: number) => {
        // runningTime ist als "type":"string" deklariert – als Zahl geschrieben
        // warnt js-controller (siehe Feature 20, Fallstrick "String/Zahl").
        setStateDirect(`${base}.runningTime`, String(clampMinutes(minutes)), false);
    };

    const stop = () => {
        setStateDirect(`${base}.runningTime`, '0', false);
    };

    /**
     * Die EINZIGE Stelle im ganzen Feature, die `autoOn` schreibt.
     *
     * Der Adapter ruft beim Moduswechsel `addList(wateringTime: 0)` — ein
     * blindes Zurueckschreiben desselben Wertes koennte also einen laufenden
     * Kreis abwuergen. Deshalb zwei Schranken: ohne bestaetigten Ist-Wert
     * (`ack !== true`) wird gar nicht geschrieben, und wenn sich der Modus
     * nicht aendert, ebenfalls nicht.
     */
    const setMode = (next: 'evaporation' | 'schedule') => {
        const cur = autoOnDp.state;
        if (!cur || cur.ack !== true) return;
        const want = next === 'evaporation';
        if (cur.val === want) return;
        setStateDirect(`${base}.autoOn`, want, false);
    };

    return {
        base,
        runningTimeDp: `${base}.runningTime`,
        valveOn,
        countdown,
        runningTime,
        soilMoisture,
        lastOn,
        mode,
        status,
        hasAutoOn,
        startManual,
        stop,
        setMode,
    };
}
