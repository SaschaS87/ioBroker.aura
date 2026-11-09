/**
 * Bedien-Logik eines Rollladen-Antriebs fuer Zeile und Feinregler
 * (Feature 27, Rolllaeden modern, Einbau 03.11.2026).
 *
 * Auf/Zu sofort ohne Bestaetigung, Stopp nur waehrend der Fahrt,
 * nach Stopp Sperre bis zur Stillstands-Meldung der Box, „unbekannt" statt geschaetzter
 * Werte. Die Logik stammt unveraendert aus der frueheren Zeile (Feature 17,
 * Ziel C); die Begruendungen stehen unten an den jeweiligen Stellen.
 */
import { useEffect, useMemo, useState } from 'react';
import { useIoBroker } from '../../../hooks/useIoBroker';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useShutterDevice, usePendingStore } from '../shuttershared/useShutterDevice';
import { radioDpsFromPosDp, isRadioOffline } from '../shuttershared/tahomaRadio';
import type { ShutterFloorDeviceDef } from './types';

// Nach einem Stopp: MovingState erst wieder glauben, wenn die Box den Stillstand
// bestaetigt hat (Neufassung 09.11.2026, ersetzt das 6-Sekunden-Fenster aus
// Feature 17, Ziel C).
//
// Hintergrund: tahoma.1 laeuft im Polling-Modus (pollinterval 5000).
// core:MovingState kommt nur alle ~5 s und hinkt der Wirklichkeit hinterher.
// Nach einem Stopp meldet der naechste Poll oft noch "faehrt" (der Motor lief
// beim Abfragen noch an oder aus), "steht" kommt einen Poll spaeter.
// Das alte Fenster nahm dafuer pauschal 6 s an (Messung 03.09.2026: 4,67-5,27 s).
// Echte Fahrten am 09.11.2026 widerlegen das:
//   Kinderzimmer_2: Stopp 15:17:17.797Z, "faehrt" 15:17:19.777Z, "steht" erst
//   15:17:24.789Z = 7,0 s nach dem Stopp. Bad: Stopp 15:19:38.273Z, "steht"
//   15:19:44.845Z = 6,6 s. In der Luecke zwischen Fensterende und "steht" kam
//   die Stopp-Taste zurueck, ohne dass jemand etwas gedrueckt hatte.
// Ausserdem schreibt der Adapter innerhalb eines Polls widerspruechliche
// Werte kurz hintereinander, z. B. Kinderzimmer 15:17:14.849Z "steht",
// 15:17:14.850Z "faehrt", 15:17:19.776Z "steht".
//
// Deshalb kein geschaetztes Zeitfenster mehr, sondern die Bestaetigung selbst:
// Nach einem Stopp gehoert jedes "faehrt" zur gestoppten Fahrt, bis die Box
// "steht" meldet - eine Meldung, die NACH dem Stopp geschrieben wurde
// (Pi-Zeitstempel gegen Pi-Zeitstempel, kein Uhrenversatz zum Handy) und
// nicht im selben Poll von einem "faehrt" ueberholt wird. STOP_SETTLE_MS ist
// dafuer nur die Ruhezeit nach diesem "steht": alle Werte eines Polls kamen
// in den Messungen innerhalb von 0,1 s.
// Endet die Sperre auch ohne Bestaetigung: bei einem neuen Auf/Zu von hier
// (sofort) und als Sicherheitsnetz nach STOP_GUARD_MAX_MS. Das Netz greift
// nur, wenn nach dem Stopp nie ein "steht" kommt (Box meldete die Fahrt gar
// nicht erst) - dann soll eine spaetere echte Fremdfahrt (Wandschalter,
// Zeitplan) nicht dauerhaft unsichtbar bleiben.
export const STOP_SETTLE_MS = 1500;
export const STOP_GUARD_MAX_MS = 45000;

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

    // Sperre nach einem Stopp (siehe STOP_SETTLE_MS oben). `at` = Handy-Zeit
    // fuer das Sicherheitsnetz, `ts` = Pi-Zeitstempel der MovingState-Meldung,
    // die beim Stopp galt. Bewusst useState: das Ende der Sperre muss neu
    // zeichnen, falls dann eine echte Fremdfahrt laeuft.
    const [stopGuard, setStopGuard] = useState<{ at: number; ts: number | null } | null>(null);

    // Funk-Ausfall (Zeichen in der Zeile, umgesetzt 02.09.2026). Nur der
    // Status-Datenpunkt wird gebraucht, RSSI/Discrete bleiben dem Feinregler
    // und der Signalstaerke-Box vorbehalten.
    const radioDps = useMemo(() => radioDpsFromPosDp(device.posDp), [device.posDp]);
    const { state: radioStatusState } = useDatapoint(radioDps?.statusDp ?? '');
    const offline = isRadioOffline(radioStatusState?.val);

    // Geschlossener Anteil fuer den Statustext
    const closed = state.isUnknown ? null : 100 - (state.posOpen ?? 0);

    // Sperre aktiv? Das Sicherheitsnetz per Zeitstempelvergleich beim Rendern,
    // nicht per Timer: iOS friert Timer im Hintergrund ein (dieselbe Lehre wie
    // PENDING_MAX_AGE_MS in useShutterDevice.ts).
    const inStopGuard = stopGuard !== null && Date.now() - stopGuard.at < STOP_GUARD_MAX_MS;

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
    // isActing | isMoving | inStopGuard | busy
    // false    | false    | -           | false
    // false    | true     | false       | true
    // false    | true     | true        | false  <- "faehrt" der gestoppten Fahrt
    // true     | -        | -           | true
    const busy = state.isActing || (state.isMoving && !inStopGuard);

    // Ende der Sperre: Die Box meldet "steht", geschrieben nach dem Stopp, und
    // im selben Poll kommt kein "faehrt" mehr hinterher. Trifft innerhalb von
    // STOP_SETTLE_MS ein neues "faehrt" ein, aendern sich die Abhaengigkeiten,
    // der Timer wird verworfen und die Sperre bleibt.
    const { movingRaw, movingTs } = state;
    useEffect(() => {
        if (stopGuard === null) return;
        const guardAge = Date.now() - stopGuard.at;
        if (guardAge >= STOP_GUARD_MAX_MS) {
            setStopGuard(null);
            return;
        }
        const confirmed =
            movingRaw === false && movingTs !== null && (stopGuard.ts === null || movingTs > stopGuard.ts);
        const wait = confirmed ? STOP_SETTLE_MS : STOP_GUARD_MAX_MS - guardAge;
        const t = window.setTimeout(() => setStopGuard(null), wait);
        return () => window.clearTimeout(t);
    }, [stopGuard, movingRaw, movingTs]);

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
        // Sperre sofort verwerfen: Das ist eine neue Fahrt. Solange der Auftrag
        // laeuft, traegt isActing die Anzeige; er endet aber vorzeitig, sobald
        // die Box die Zielposition (±3) quittiert. Danach traegt allein
        // isMoving - eine noch offene Sperre wuerde die Anzeige faelschlich
        // abschalten.
        setStopGuard(null);
    };

    const stop = () => {
        if (!device.stopDp) return;
        setState(device.stopDp, true, { diag: true }); // Diagnose 12.09.2026, siehe useIoBroker.ts
        clearPending(device.key);
        // Sperre setzen. Deckt beide Symptome ab, ohne Zeitannahme:
        // "Haengt nach": isMoving steht bis zum naechsten Poll noch auf true.
        // "Kommt zurueck": Der erste Poll nach dem Stopp holt die Fahrt erst
        // nach ("faehrt"), "steht" folgt einen Poll spaeter.
        // Gemerkt wird der Pi-Zeitstempel der jetzt gueltigen Meldung: nur ein
        // "steht", das danach geschrieben wurde, bestaetigt den Stillstand.
        setStopGuard({ at: Date.now(), ts: state.movingTs });
    };

    const close = () => {
        if (!device.downDp) return;
        // Ziel als Rohwert: 0 = ganz offen, 100 = ganz zu. Der Hook rechnet
        // daraus targetOpen = 100 - targetRaw; "Zu" muss also 100 setzen.
        const targetRaw = device.invertPosition ? 100 : 0;
        setState(device.downDp, true, { diag: true }); // Diagnose 12.09.2026, siehe useIoBroker.ts
        markPending(device.key, targetRaw, state.lastKnownAckedPos);
        // Sperre sofort verwerfen - Begruendung siehe open.
        setStopGuard(null);
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
