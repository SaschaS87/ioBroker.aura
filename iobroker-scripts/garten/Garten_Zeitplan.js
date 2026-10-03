// Script: script.js.SprinkleControl.Garten_Zeitplan_Dev (Dev/Trockenlauf) bzw.
//         script.js.SprinkleControl.Garten_Zeitplan (Live, Phase 2)
// Engine: Javascript/js
//
// Feature 24 (Garten-Zeitplan in ioBroker). Diese Datei ist die gemeinsame
// Master-Quelle fuer BEIDE Skripte (Dev/Trockenlauf und Live): nur ROOT,
// TROCKENLAUF und VERSION unten unterscheiden sich. TROCKENLAUF=true erzwingt
// per Code (nicht nur per Kommentar), dass NIE auf sprinklecontrol.0.* oder
// aura.*.timers.* geschrieben wird - es wird nur protokolliert, was JETZT SO
// passieren wuerde.
//
// Was das Skript tut: Es ist der einzige Ausloeser der Garten-Termine. Die
// Termine liegen als JSON in ROOT.Zeitplan (Datenmodell siehe
// src-vis/components/widgets/garten2/gartenPlanModel.ts). Jede Minute prueft
// das Skript, ob ein Termin zu Wochentag und Uhrzeit passt, und startet dann
// den Kreis, indem es die Dauer in Minuten nach
// sprinklecontrol.0.sprinkle.<Kreis>.runningTime schreibt (ack=false, wie ein
// Handstart - sprinklecontrol-Regensperre und maxParallel greifen weiter).
//
// Betriebsarten:
//  - Termine laufen nur im Zeitplan-Modus (autoOn=false). Ist autoOn=true
//    (Verdunstungsmodus), wird uebersprungen - AUSSER Einstellungen.ansaat[Kreis]
//    ist true (Neuansaat: Termine gelten dann auch im Verdunstungsmodus).
//  - Das Skript SCHREIBT autoOn NIE. Es liest ihn nur. Ausserdem schreibt es
//    nichts unter sprinklecontrol.0.* ausser runningTime.
//  - Einstellungen.scharf[Kreis]===false schaltet den Zeitplan eines Kreises ab.
//  - Einstellungen.aktiv ist der technische Hauptschalter: live nur bei true
//    wird tatsaechlich geschrieben. (Der Trockenlauf schreibt nie.)
//  - Dauer wird hart auf 1-59 Minuten begrenzt (Gardena-Box schliesst nach
//    59 min von selbst, 0 waere ein Abschaltbefehl).
//
// Doppelschutz: Schluessel "<id>|<Datum>|<HH:MM>" im Speicher; beim Start
// zusaetzlich Status.letzteAusloesung beachten, damit ein Skript-Neustart in
// derselben Minute nicht ein zweites Mal ausloest. Eine verpasste Minute wird
// NICHT nachgeholt (bewusst, wie beim Rollladen-Wochenplan).
//
// Waechter (F8): alte Aura-Timer (aura.<n>.timers.<kanal>) mit Ziel
// sprinklecontrol.0.sprinkle.* duerfen nicht mehr ausloesen, sonst giessen zwei
// Ausfuehrer doppelt. Das Skript erkennt solche Kanaele beim Start und bei jeder
// Aenderung von .config/.enabled und traegt sie in Status.waechter ein. Im
// Trockenlauf wird nur gemeldet ("erkannt (nur Meldung)"); live und bei
// Einstellungen.aktiv=true wird .enabled auf false gesetzt.
//
// Datenmodell-Parser (normalizeEntry/parseZeitplan/parseEinstellungen) sind ein
// bewusster, eigenstaendiger Nachbau von gartenPlanModel.ts - ein JavaScript-
// Adapter-Skript kann das TypeScript-Repo nicht importieren. Bei Aenderungen an
// gartenPlanModel.ts IMMER auch hier nachziehen (und umgekehrt).

// ── Konstanten (Dev/Live-Unterschied nur hier) ─────────────────────────────

const ROOT = '0_userdata.0.Garten_Dev';
const TROCKENLAUF = true;
const VERSION = '0.1.0-dev';
const INSTANZ = 'sprinklecontrol.0';
const TZ = 'Europe/Berlin';
const LOGPRAEFIX = '[Garten_Zeitplan]';

const MIN_MINUTEN = 1;
const MAX_MINUTEN = 59;
const WOCHENTAGE = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Kreisnamen sind sprinkleName wie "Rasen_Küche" - keine Punkte/Leerzeichen,
// damit daraus nie ein fremder Datenpunkt-Pfad gebaut werden kann.
const KREIS_MUSTER = /^[A-Za-z0-9_ÄÖÜäöüß-]+$/;

const DEFAULT_EINSTELLUNGEN = { aktiv: false, scharf: {}, ansaat: {} };

// ── Skript-Speicher ────────────────────────────────────────────────────────

let zeitplan = [];
let einstellungen = { aktiv: false, scharf: {}, ansaat: {} };
const ausgeloest = {}; // Doppelschutz: "<id>|<Datum>|<HH:MM>" -> true
const waechterListe = {}; // Kanal (Basis-ID) -> Eintrag

// Fehler getrennt pro Quelle, damit eine reparierte Quelle ihren eigenen Fehler
// wieder loeschen kann. Status.letzterFehler zeigt den zuletzt aufgetretenen.
const fehlerQuelle = { Zeitplan: null, Einstellungen: null, Ausloesung: null, Waechter: null };

const status = {
    version: VERSION,
    trockenlauf: TROCKENLAUF,
    aktiv: false,
    gestartet: null,
    letzterTick: null,
    letzteAusloesung: null,
    letzterFehler: null,
    waechter: [],
};

// ── Zeit-Helfer (Europe/Berlin, unabhaengig von der Systemzeitzone) ────────

function isoJetzt() {
    return new Date().toISOString();
}

function berlinTeile(d) {
    const teile = new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
    }).formatToParts(d);
    const o = {};
    for (const t of teile) o[t.type] = t.value;
    return {
        datum: `${o.year}-${o.month}-${o.day}`,
        hhmm: `${o.hour}:${o.minute}`,
        hour: Number(o.hour),
        minute: Number(o.minute),
        wochentag: String(o.weekday).slice(0, 3).toLowerCase(), // mon..sun
    };
}

function zweistellig(n) {
    return String(n).padStart(2, '0');
}

// ── Parser (Nachbau von gartenPlanModel.ts) ───────────────────────────────

function istObjekt(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function minutenBegrenzen(roh) {
    const text = String(roh === null || roh === undefined ? '' : roh).replace(',', '.');
    const n = typeof roh === 'number' ? roh : Number(text.trim());
    if (!Number.isFinite(n)) return MIN_MINUTEN;
    const gerundet = Math.round(n);
    if (gerundet < MIN_MINUTEN) return MIN_MINUTEN;
    if (gerundet > MAX_MINUTEN) return MAX_MINUTEN;
    return gerundet;
}

function normalisiereTermin(v) {
    if (!istObjekt(v)) return null;
    if (typeof v.id !== 'string' || !v.id) return null;
    if (typeof v.kreis !== 'string' || !v.kreis) return null;
    if (!istObjekt(v.trigger) || v.trigger.kind !== 'time') return null;
    const hour = Number(v.trigger.hour);
    const minute = Number(v.trigger.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (typeof v.value !== 'string' && typeof v.value !== 'number') return null;
    if (!Array.isArray(v.weekdays)) return null;
    const weekdays = WOCHENTAGE.filter((d) => v.weekdays.includes(d));
    const out = {
        id: v.id,
        kreis: v.kreis,
        enabled: v.enabled === true,
        weekdays,
        trigger: { kind: 'time', hour, minute },
        filter: 'all-days',
        value: String(minutenBegrenzen(v.value)),
    };
    if (typeof v.label === 'string' && v.label) out.label = v.label;
    return out;
}

function parseZeitplan(roh) {
    const text = (roh === null || roh === undefined ? '' : String(roh)).trim();
    if (!text) return { werte: [], fehler: null, schwer: false };
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { fehler: `Ungueltiges JSON: ${e.message}`, schwer: true };
    }
    if (!Array.isArray(parsed)) return { fehler: 'Erwartete eine JSON-Liste (Array)', schwer: true };
    const werte = parsed.map(normalisiereTermin).filter((t) => t !== null);
    const uebersprungen = parsed.length - werte.length;
    return { werte, fehler: uebersprungen > 0 ? `${uebersprungen} Termin(e) uebersprungen (falsches Format)` : null, schwer: false };
}

function boolKarte(v) {
    const out = {};
    if (!istObjekt(v)) return out;
    for (const k of Object.keys(v)) if (typeof v[k] === 'boolean') out[k] = v[k];
    return out;
}

function parseEinstellungen(roh) {
    const text = (roh === null || roh === undefined ? '' : String(roh)).trim();
    if (!text) return { werte: Object.assign({}, DEFAULT_EINSTELLUNGEN), fehler: null, schwer: false };
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { fehler: `Ungueltiges JSON: ${e.message}`, schwer: true };
    }
    if (!istObjekt(parsed)) return { fehler: 'Erwartete ein JSON-Objekt', schwer: true };
    return {
        werte: { aktiv: parsed.aktiv === true, scharf: boolKarte(parsed.scharf), ansaat: boolKarte(parsed.ansaat) },
        fehler: null,
        schwer: false,
    };
}

// ── Fehler-Buchhaltung (pro Quelle) ────────────────────────────────────────

function aktualisiereLetzterFehler() {
    const alle = Object.keys(fehlerQuelle).map((k) => fehlerQuelle[k]).filter(Boolean);
    if (!alle.length) { status.letzterFehler = null; return; }
    alle.sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
    status.letzterFehler = alle[0];
}

function setzeQuellenFehler(quelle, meldung, zusatz) {
    const alt = fehlerQuelle[quelle];
    fehlerQuelle[quelle] = { zeit: isoJetzt(), quelle, meldung };
    aktualisiereLetzterFehler();
    // Nur beim ersten Auftreten bzw. geaenderter Meldung ins Log, sonst Flut.
    if (!alt || alt.meldung !== meldung) log(`${LOGPRAEFIX} ${quelle}: ${meldung}${zusatz ? ' - ' + zusatz : ''}`, 'warn');
}

function loescheQuellenFehler(quelle) {
    if (fehlerQuelle[quelle]) {
        fehlerQuelle[quelle] = null;
        aktualisiereLetzterFehler();
    }
}

function statusSchreiben() {
    status.aktiv = einstellungen.aktiv === true;
    setState(`${ROOT}.Status`, JSON.stringify(status), true);
}

// ── Laden der beiden Datenpunkte (bei hartem Fehler bleibt die alte Fassung) ─

function rohwertVon(id) {
    const s = getState(id);
    return s && typeof s.val === 'string' ? s.val : '';
}

function ladeZeitplan() {
    const r = parseZeitplan(rohwertVon(`${ROOT}.Zeitplan`));
    if (r.schwer) { setzeQuellenFehler('Zeitplan', r.fehler, 'alte gueltige Fassung bleibt aktiv'); return; }
    zeitplan = r.werte;
    if (r.fehler) setzeQuellenFehler('Zeitplan', r.fehler);
    else loescheQuellenFehler('Zeitplan');
}

function ladeEinstellungen() {
    const r = parseEinstellungen(rohwertVon(`${ROOT}.Einstellungen`));
    if (r.schwer) { setzeQuellenFehler('Einstellungen', r.fehler, 'alte gueltige Fassung bleibt aktiv'); return; }
    einstellungen = r.werte;
    loescheQuellenFehler('Einstellungen');
}

// ── Ausloesen ──────────────────────────────────────────────────────────────

function runningTimeDp(kreis) {
    return `${INSTANZ}.sprinkle.${kreis}.runningTime`;
}

function ausloesenZuTermin(termin, jetzt, kreisGestartetInDieserMinute) {
    return (async () => {
        const kreis = termin.kreis;
        if (!KREIS_MUSTER.test(kreis)) {
            setzeQuellenFehler('Ausloesung', `Termin ${termin.id}: ungueltiger Kreisname "${kreis}"`);
            return;
        }
        const schluessel = `${termin.id}|${jetzt.datum}|${jetzt.hhmm}`;
        if (ausgeloest[schluessel]) return;
        ausgeloest[schluessel] = true;

        const ansaat = einstellungen.ansaat[kreis] === true;
        const modus = await getStateAsync(`${INSTANZ}.sprinkle.${kreis}.autoOn`);
        const verdunstung = !!modus && modus.val === true;
        if (verdunstung && !ansaat) {
            log(`${LOGPRAEFIX} uebersprungen: Verdunstungsmodus ${termin.id} ${kreis} (autoOn=true, keine Neuansaat)`, 'info');
            return;
        }

        if (kreisGestartetInDieserMinute[kreis]) {
            log(`${LOGPRAEFIX} uebersprungen: ${termin.id} ${kreis} - in dieser Minute startet schon ein anderer Termin dieses Kreises`, 'warn');
            return;
        }

        const dp = runningTimeDp(kreis);
        if (!existsObject(dp)) {
            setzeQuellenFehler('Ausloesung', `Termin ${termin.id}: ${dp} existiert nicht`);
            return;
        }

        const minuten = minutenBegrenzen(termin.value);
        const vermerk = ansaat ? ' (Neuansaat)' : '';
        kreisGestartetInDieserMinute[kreis] = true;

        if (TROCKENLAUF) {
            log(`${LOGPRAEFIX} TROCKENLAUF würde ${dp} ← "${minuten}" schreiben${vermerk}`, 'info');
        } else if (einstellungen.aktiv === true) {
            // Die einzige Stelle, an der das Skript auf sprinklecontrol.0.* schreibt.
            setState(dp, String(minuten), false);
            log(`${LOGPRAEFIX} fired ${termin.id} ${kreis}: ${dp} ← "${minuten}"${vermerk}`, 'info');
        } else {
            log(`${LOGPRAEFIX} Ausfuehrung aus (Einstellungen.aktiv=false): ${termin.id} ${kreis} ← "${minuten}" nicht geschrieben${vermerk}`, 'info');
            return;
        }
        loescheQuellenFehler('Ausloesung');
        status.letzteAusloesung = { kreis, id: termin.id, minuten, ts: isoJetzt(), trocken: TROCKENLAUF };
        if (ansaat) status.letzteAusloesung.ansaat = true;
    })();
}

async function minutenTakt() {
    try {
        const jetzt = berlinTeile(new Date());
        status.letzterTick = isoJetzt();
        // Alte Doppelschutz-Schluessel (anderer Tag) wegraeumen.
        for (const k of Object.keys(ausgeloest)) if (k.split('|')[1] !== jetzt.datum) delete ausgeloest[k];

        const kreisGestartet = {};
        for (const termin of zeitplan) {
            if (!termin.enabled) continue;
            if (einstellungen.scharf[termin.kreis] === false) continue;
            if (!termin.weekdays.includes(jetzt.wochentag)) continue;
            if (termin.trigger.hour !== jetzt.hour || termin.trigger.minute !== jetzt.minute) continue;
            await ausloesenZuTermin(termin, jetzt, kreisGestartet);
        }
    } catch (e) {
        setzeQuellenFehler('Ausloesung', `Takt fehlgeschlagen: ${e.message}`);
    }
    statusSchreiben();
}

// ── Waechter (F8) ──────────────────────────────────────────────────────────

function kanalBasisVon(id) {
    const m = /^(aura\.\d+\.timers\.[^.]+)\.(config|enabled)$/.exec(id);
    return m ? m[1] : null;
}

async function pruefeKanal(basis) {
    try {
        const cfgState = await getStateAsync(`${basis}.config`);
        const enState = await getStateAsync(`${basis}.enabled`);
        let cfg = cfgState ? cfgState.val : null;
        if (typeof cfg === 'string') {
            try { cfg = JSON.parse(cfg); } catch (e) { cfg = null; }
        }
        const ziel = istObjekt(cfg) && typeof cfg.targetDp === 'string' ? cfg.targetDp : '';
        const zielt = ziel.startsWith(`${INSTANZ}.sprinkle.`);
        const an = !enState || enState.val !== false;
        const alt = waechterListe[basis];

        if (!zielt || !an) {
            // Schon abgeschaltete Eintraege bleiben als Beleg stehen, der Rest verschwindet.
            if (alt && alt.aktion !== 'abgeschaltet') delete waechterListe[basis];
            return;
        }

        const termine = istObjekt(cfg) && Array.isArray(cfg.events)
            ? cfg.events.filter((e) => istObjekt(e) && e.enabled === true).length
            : 0;
        const eintrag = { kanal: basis, targetDp: ziel, termine, ts: isoJetzt() };

        if (TROCKENLAUF) {
            eintrag.aktion = 'erkannt (nur Meldung)';
        } else if (einstellungen.aktiv === true) {
            setState(`${basis}.enabled`, false, false);
            eintrag.aktion = 'abgeschaltet';
            log(`${LOGPRAEFIX} Waechter: ${basis} abgeschaltet (Ziel ${ziel}, ${termine} aktive Termine)`, 'warn');
        } else {
            eintrag.aktion = 'erkannt (aktiv=false, keine Aktion)';
        }
        waechterListe[basis] = eintrag;
        if (!alt || alt.aktion !== eintrag.aktion || alt.termine !== eintrag.termine) {
            log(`${LOGPRAEFIX} Waechter: ${basis} ${eintrag.aktion} (Ziel ${ziel}, ${termine} aktive Termine)`, 'info');
        }
    } catch (e) {
        setzeQuellenFehler('Waechter', `${basis}: ${e.message}`);
    }
}

function waechterInStatus() {
    status.waechter = Object.keys(waechterListe).sort().map((k) => waechterListe[k]);
}

async function waechterVollstaendig() {
    const basen = {};
    $('state[id=aura.*.timers.*.config]').each((id) => {
        const b = kanalBasisVon(id);
        if (b) basen[b] = true;
    });
    for (const b of Object.keys(basen)) await pruefeKanal(b);
    waechterInStatus();
}

// ── Datenpunkte anlegen (idempotent) ──────────────────────────────────────

async function sicherstellenObjekte() {
    const ordnerName = TROCKENLAUF ? 'Garten-Zeitplan (Dev/Trockenlauf)' : 'Garten-Zeitplan';
    if (!existsObject(ROOT)) {
        await setObjectAsync(ROOT, { type: 'folder', common: { name: ordnerName }, native: {} });
    } else {
        await extendObjectAsync(ROOT, { common: { name: ordnerName } });
    }
    // Dev: aktiv=true (Trockenlauf schreibt ohnehin nie), live: aktiv=false bis zur Freigabe.
    const startEinstellungen = { aktiv: TROCKENLAUF, scharf: {}, ansaat: {} };
    const anlegen = [
        { id: `${ROOT}.Zeitplan`, wert: '[]', common: { name: 'Zeitplan', type: 'string', role: 'json', read: true, write: true, desc: 'GartenPlanEntry[] als JSON, siehe gartenPlanModel.ts' } },
        { id: `${ROOT}.Einstellungen`, wert: JSON.stringify(startEinstellungen), common: { name: 'Einstellungen', type: 'string', role: 'json', read: true, write: true, desc: 'aktiv / scharf je Kreis / ansaat je Kreis als JSON' } },
        { id: `${ROOT}.Status`, wert: JSON.stringify(status), common: { name: 'Status', type: 'string', role: 'json', read: true, write: false, desc: 'Status des Skripts als JSON, siehe Skriptkopf' } },
    ];
    for (const a of anlegen) {
        if (!existsState(a.id)) await createStateAsync(a.id, a.wert, a.common);
    }
}

// ── Start ──────────────────────────────────────────────────────────────────
// sicherstellenObjekte() muss ABGEWARTET werden, bevor irgendetwas auf ROOT.*
// liest/schreibt (Race Condition C1, Lehre aus Feature 23). Abos und Takt
// werden deshalb erst NACH dem await angemeldet.

(async () => {
    try {
        await sicherstellenObjekte();

        // Doppelschutz nach Neustart: Status der letzten Ausloesung vor dem Ueberschreiben lesen.
        try {
            const alterStatus = JSON.parse(rohwertVon(`${ROOT}.Status`) || '{}');
            const l = alterStatus && alterStatus.letzteAusloesung;
            if (l && typeof l.id === 'string' && typeof l.ts === 'string' && !Number.isNaN(Date.parse(l.ts))) {
                const t = berlinTeile(new Date(l.ts));
                ausgeloest[`${l.id}|${t.datum}|${t.hhmm}`] = true;
                status.letzteAusloesung = l;
            }
        } catch (e) {
            // Alter Status unlesbar: kein Doppelschutz aus dem Status, sonst unkritisch.
        }

        status.gestartet = isoJetzt();
        status.version = VERSION;
        status.trockenlauf = TROCKENLAUF;

        ladeZeitplan();
        ladeEinstellungen();
        await waechterVollstaendig();
        statusSchreiben();

        on({ id: `${ROOT}.Zeitplan`, change: 'ne' }, () => { ladeZeitplan(); statusSchreiben(); });
        on({ id: `${ROOT}.Einstellungen`, change: 'ne' }, async () => {
            ladeEinstellungen();
            await waechterVollstaendig();
            statusSchreiben();
        });
        on({ id: /^aura\.\d+\.timers\.[^.]+\.(config|enabled)$/, change: 'any' }, async (obj) => {
            const basis = kanalBasisVon(obj.id);
            if (!basis) return;
            await pruefeKanal(basis);
            waechterInStatus();
            statusSchreiben();
        });

        schedule('* * * * *', minutenTakt);

        log(`${LOGPRAEFIX} gestartet (Version ${VERSION}, Trockenlauf=${TROCKENLAUF}, ${zeitplan.length} Termine, aktiv=${einstellungen.aktiv})`, 'info');
    } catch (e) {
        log(`${LOGPRAEFIX} Start fehlgeschlagen (${e.message})`, 'error');
    }
})();
