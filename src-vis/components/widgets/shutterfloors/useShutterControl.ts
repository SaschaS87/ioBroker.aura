/**
 * Bedien-Logik eines Rollladen-Antriebs fuer Zeile und Feinregler
 * (Feature 27, Rolllaeden modern, Einbau 03.11.2026).
 *
 * Auf/Zu sofort ohne Bestaetigung, Stopp nur waehrend der Fahrt,
 * 6-Sekunden-Stoppfenster gegen Nachflackern, „unbekannt" statt geschaetzter
 * Werte. Die Logik stammt unveraendert aus der frueheren Zeile (Feature 17,
 * Ziel C); die Begruendungen stehen unten an den jeweiligen Stellen.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore } from '../shuttershared/useShutterDevice';
import { radioDpsFromPosDp, isRadioOffline } from '../shuttershared/tahomaRadio';
import type { ShutterFloorDeviceDef } from './types';

// Stopp-Fenster gegen Flackern und Nachhaengen (Feature 17, Ziel C).
// Der Adapter tahoma.1 laeuft im Polling-Modus: system.adapter.tahoma.1,
// common.dataSource: "poll", native.pollinterval: 5000. core:MovingState wird
// nur alle ~5,0 s auf einem festen globalen Raster aktualisiert, nicht an den
// Tastendruck gekoppelt.
// Gemessen am 03.09.2026 an Wohnz_gross (Kommandos befristet historisiert,
// danach wieder auf enabled: false): Stopp 07:27:41.917 -> Poll bestaetigt
// "steht" 07:27:47.184 = 5,27 s Verzug (Worst Case dieser Messreihe); zweiter
// Fall 07:27:57.517 -> 07:28:02.19 = 4,67 s. Poll-Zeitpunkte lagen 5,00-5,03 s
// auseinander.
// Daraus: 6000 ms = ein Poll-Intervall plus Marge, deckt den gemessenen Worst
// Case von 5,27 s mit ~0,7 s Reserve ab.
// Verweis auf PENDING_MAX_AGE_MS = 45000 in useShutterDevice.ts: Das
// Stopp-Fenster liegt bewusst weit darunter, kann mit der
// Auftrags-Altersgrenze nicht kollidieren.
const STOP_IGNORE_MOVING_MS = 6000;

export interface ShutterControl {
    /** Prozent zu (0 = offen, 100 = zu), null = unbekannt */
    closed: number | null;
    /** „Offen", „40 % zu", „fährt zu", „unbekannt" … */
    status: string;
    busy: boolean;
    unknown: boolean;
    /** Stellung ohne Quittung der Box (Vermutung) */
    estimate: boolean;
    /** Kein Funkkontakt zum Antrieb */
    offline: boolean;
    open: () => void;
    stop: () => void;
    close: () => void;
}

export function useShutterControl(device: ShutterFloorDeviceDef): ShutterControl {
    const { setState } = useIoBroker();
    const state = useShutterDevice(device);
    const { markPending, clearPending } = usePendingStore();

    // Merker fuer das Stopp-Fenster (Feature 17, Ziel C). Bewusst useState,
    // nicht useRef: Ein useRef loest kein Neuzeichnen aus. Laeuft nach dem
    // Fensterende noch eine echte Fremdfahrt (Wandschalter), muesste die
    // Zeile beim Ablauf des Fensters von selbst wieder auf busy umschalten -
    // ohne Neuzeichnen bliebe die Stopp-Taste unsichtbar, bis zufaellig eine
    // andere Datenpunktmeldung eintrifft. Ob der Adapter bei unveraendertem
    // Poll-Wert ueberhaupt erneut ein stateChange sendet, ist nicht belegt.
    const [stoppedAt, setStoppedAt] = useState<number | null>(null);

    // Funk-Ausfall (Zeichen in der Zeile, umgesetzt 02.09.2026). Nur der
    // Status-Datenpunkt wird gebraucht, RSSI/Discrete bleiben dem Feinregler
    // und der Signalstaerke-Box vorbehalten.
    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: radioStatusState } = useDatapoint(radioDps?.statusDp ?? '');
    const offline = isRadioOffline(radioStatusState?.val);

    // Geschlossener Anteil fuer den Statustext
    const closed = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Stopp-Fenster aktiv? Dieselbe Lehre wie bei PENDING_MAX_AGE_MS
    // (useShutterDevice.ts): iOS friert Timer ein, sobald die App in den
    // Hintergrund wandert. Ein Fenster, das nur per setTimeout endet, bliebe
    // nach Rueckkehr aus dem Hintergrund unbegrenzt offen und wuerde echte
    // Bewegungsmeldungen dauerhaft schlucken. Der Zeitstempelvergleich beim
    // Rendern ist die massgebliche Pruefung, der Timer weiter unten sorgt nur
    // fuer das Neuzeichnen.
    const inStopWindow = stoppedAt !== null && Date.now() - stoppedAt < STOP_IGNORE_MOVING_MS;

    // Bewegungs-Zustand: laeuft, solange die Box Bewegung meldet ODER ein von
    // hier abgeschickter Befehl noch nicht am Ziel angekommen ist.
    // state.isActing steht bewusst ausserhalb der Fenster-Bedingung: Ein
    // bewusster neuer Auf/Zu-Tipp ruft markPending() synchron auf und setzt
    // damit sofort isActing = true - die Stopp-Taste erscheint sofort wieder,
    // unabhaengig davon, ob das Stopp-Fenster noch laeuft. Das Fenster
    // daempft ausschliesslich das rohe, um bis zu ein Poll-Intervall
    // verspaetete isMoving, niemals ein selbst ausgeloestes Fahrsignal.
    //
    // Wahrheitstabelle:
    // isActing | isMoving | inStopWindow | alt   | neu
    // false    | false    | -            | false | false
    // false    | true     | false        | true  | true
    // false    | true     | true         | true  | false  <- einziger Unterschied
    // true     | -        | -            | true  | true
    // "neu" ist nie true, wo "alt" false war.
    const busy = state.isActing || (state.isMoving && !inStopWindow);

    // Der Timer beendet das Stopp-Fenster nicht fachlich - das tut der
    // Zeitstempelvergleich in inStopWindow weiter oben. Er sorgt nur dafuer,
    // dass die Zeile beim Fensterende einmal neu zeichnet.
    useEffect(() => {
        if (stoppedAt === null) return;
        const rest = STOP_IGNORE_MOVING_MS - (Date.now() - stoppedAt);
        if (rest <= 0) {
            setStoppedAt(null);
            return;
        }
        const t = window.setTimeout(() => setStoppedAt(null), rest);
        return () => window.clearTimeout(t);
    }, [stoppedAt]);

    // Statustext
    let status: string;
    if (busy) {
        status = state.direction === 'up' ? 'fährt auf' : state.direction === 'down' ? 'fährt zu' : 'fährt';
    } else if (closed === null) {
        status = 'unbekannt';
    } else if (state.isEstimate) {
        // Ohne Quittung der Box ist die Zahl eine Vermutung. Dann bewusst die
        // Prozentform mit Tilde: "~ 40 % zu" traegt die Unsicherheit sichtbar,
        // ein blankes "Geschlossen" waere eine Behauptung.
        status = `~ ${Math.round(closed)} % zu`;
    } else if (closed <= 3) {
        status = 'Offen';
    } else if (closed >= 97) {
        status = 'Geschlossen';
    } else {
        status = `${Math.round(closed)} % zu`;
    }

    // Bei Raffstore: Lamellenwinkel anhaengen
    const slat = device.slatDp && state.slatAckedPos !== null ? state.slatAckedPos : null;
    if (slat !== null && !busy) status += ` · ${slat}°`;

    // Knopf-Handler mit Pending-Logik
    const open = () => {
        if (!device.upDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Auf" muss also 0 setzen.
        const targetRaw = device.invertPosition ? 0 : 100;
        setState(device.upDp, true, { diag: true }); // Diagnose 12.09.2026, siehe useIoBroker.ts
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
        // Stopp-Fenster sofort verwerfen: Solange der Auftrag laeuft, traegt
        // isActing die Anzeige. Der Auftrag endet aber vorzeitig, sobald die
        // Box die Zielposition im Toleranzband ±3 quittiert
        // (useShutterDevice.ts) - bei einer kurzen Fahrt kann das noch
        // innerhalb der 6 Sekunden passieren. Danach traegt allein isMoving.
        // Ein noch offenes Stopp-Fenster wuerde die Anzeige in diesem Moment
        // faelschlich abschalten. Deshalb wird das Fenster bei jedem
        // bewussten Auf/Zu-Tipp sofort verworfen.
        setStoppedAt(null);
    };

    const stop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true, { diag: true }); // Diagnose 12.09.2026, siehe useIoBroker.ts
        clearPending(device.key);
        // Stopp-Fenster setzen (Feature 17, Ziel C). Deckt zwei Symptome mit
        // einem Mechanismus ab:
        // "Haengt nach": isActing war schon sofort weg, isMoving stand bis
        // zum naechsten Poll-Tick noch auf true (gemessen 4,67-5,27 s). Das
        // Fenster blendet diesen Rest aus.
        // "Flackern": Wurde Stopp gedrueckt, bevor der erste Poll die Fahrt
        // ueberhaupt als true bestaetigt hatte, fielen isActing und isMoving
        // gleichzeitig weg, der naechste Poll holte die kurze reale Fahrt
        // nach, der uebernaechste meldete false. Das Fenster deckt diese
        // Nachzuegler ab.
        setStoppedAt(Date.now());
    };

    const close = () => {
        if (!device.downDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Zu" muss also 100 setzen.
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.downDp, true, { diag: true }); // Diagnose 12.09.2026, siehe useIoBroker.ts
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
        // Stopp-Fenster sofort verwerfen - Begruendung siehe open.
        setStoppedAt(null);
    };

    return {
        closed,
        status,
        busy,
        unknown: closed === null,
        estimate: state.isEstimate,
        offline,
        open,
        stop,
        close,
    };
}
