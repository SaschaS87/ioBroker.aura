// Script: script.js.Tahoma.Rollladen_Wochenplan_Dev (Dev/Trockenlauf) bzw.
//         script.js.Tahoma.Rollladen_Wochenplan (Live, spaeterer Durchgang)
// Engine: Javascript/js
//
// Feature 23 (Rollläden – Szenen und Wochenplan). Diese Datei ist die
// gemeinsame Master-Quelle fuer BEIDE Skripte (Dev/Trockenlauf und Live):
// nur ROOT und TROCKENLAUF unten unterscheiden sich. TROCKENLAUF=true
// erzwingt per Code (nicht nur per Kommentar), dass NIE setState auf
// tahoma.1.* aufgerufen wird — es wird nur protokolliert, was JETZT SO
// passieren wuerde.
//
// Leise fahren (Durchgang 3, C1-C3): ein PlanEntry kann quiet:true tragen
// (siehe planModel.ts/Frontend-Editor "Leise fahren"). Ist das Zielgeraet
// eines von 10 leisefaehigen Rollläden (GERAETE.*.slowPosDp gesetzt), faehrt
// die Position dann auf den slow-Zieldatenpunkt (core:TargetClosureState:
// slow) statt auf den normalen posDp - an der Lamelle aendert sich dabei
// nichts. quiet gilt NUR fuer den Minutentakt (Wochenplan), Sofort-Befehle
// fahren immer normal.
//
// Race Condition beim allerersten Start (C1): sicherstellenObjekte() wird
// jetzt abgewartet (await createStateAsync/setObjectAsync), bevor Abos und
// Zeitplaene angemeldet werden - vorher konnte kalenderAktualisieren() auf
// ein noch nicht existierendes .Kalender-Objekt schreiben.
//
// Wiederholen bei Verbindungsfehlern (C2): sendeMitWiederholung() probiert
// einen Fahrbefehl im Live-Betrieb bis zu 3x (Pause dazwischen), wartet je
// Versuch bis zu 15s auf eine Reaktion (ack auf dem DP, MovingState oder
// ack auf dem Istwert-DP). Schlaegt das fehl, landet der Fehler getrennt
// unter fehlerQuelle.Fahrt (Status.letzterFehler), die naechste erfolgreiche
// Fahrt loescht ihn wieder. Im Trockenlauf ungenutzt.
//
// Verpasste Fahrt verfaellt (C3): der Minutentakt prueft nur die aktuelle
// Minute (r.min !== nowMin -> continue) - ein verpasster Trigger wird NICHT
// nachgeholt, das ist bewusst so gebaut.
//
// Datenmodell (Szenen/Wochenplan/Einstellungen) ist eine bewusste, eigen-
// staendige Nachbildung von src-vis/components/widgets/shutterfloors/planner/
// planModel.ts (parseScenes/parsePlan/parseSettings) - ein JavaScript-Adapter-
// Skript kann das TypeScript-Repo nicht importieren, siehe Auftrag. Bei
// Aenderungen an planModel.ts IMMER auch hier nachziehen, sonst laufen
// Frontend-Parser und Skript-Parser auseinander.
//
// Fahrlogik (Position + Lamelle als direkter Zielwert, kein tiltUp/tiltDown):
// exakt uebernommen aus ShutterSheet.tsx (siehe Auftrag, Abschnitt
// "Fahrlogik-Fund"). setClosureAndOrientation existiert nicht und wird nicht
// benutzt.
//
// Feiertage: feiertage.0 laeuft im mode:"schedule" (Cron "0 0 * * *", einmal
// taeglich um Mitternacht) - "alive" ist zwischen den Laeufen NORMAL false,
// kein Zeichen von "abgeschaltet". Ein alive-Gate wuerde die Feiertagslogik
// deshalb fast immer auf "kein Feiertag" zwingen. Fuer die eine Entscheidung,
// die die Plan-Auswertung wirklich braucht (ist HEUTE ein Feiertag?), wird
// darum direkt feiertage.0.today.boolean/.name gelesen, ohne alive-Check.
// Fehlt der State ganz (Adapter deinstalliert), wird "kein Feiertag"
// angenommen und das in Status.feiertage vermerkt - genau wie im Auftrag
// verlangt, das Skript darf dabei nicht abstuerzen. Fuer den 8-Tage-Kalender
// (Punkt 4) braucht es zusaetzlich
// Feiertage der naechsten 7 Tage, die feiertage.0 grundsaetzlich NICHT
// liefern kann (der Adapter kennt nur heute/morgen/uebermorgen + naechsten
// Feiertag insgesamt) - dafuer rechnet dieses Skript den baden-wuerttember-
// gischen Feiertagskalender selbst nach (gleicher Oster-Algorithmus wie
// planModel.ts::holidaysOf), rein fuer die Kalender-ANZEIGE der Tage 1-7.
// Tag 0 im Kalender uebernimmt den obigen feiertage.0-Wert (bzw. dessen
// Fallback), damit Kalender und Plan-Auswertung fuer "heute" konsistent
// sind.
//
// Sonnenzeiten: anders als im Frontend (das nur die heutigen Pi-Werte kennt
// und fuer andere Wochentage selbst rechnet) hat dieses Skript direkten
// Zugriff auf getAstroDate(...) fuer JEDEN Tag - deshalb kein Nachbau der
// SunCalc-Formel aus planModel.ts noetig, getAstroDate('sunrise'|'sunset', d)
// liefert fuer jeden Tag exakt das, was auch javascript.0.variables.astro.*
// fuer heute zeigt.

// ── Konstanten (Dev/Live-Unterschied nur hier) ─────────────────────────────

const ROOT = '0_userdata.0.Rollladen_Dev';
const TROCKENLAUF = true;
const VERSION = '0.1.0-dev';
const TZ = 'Europe/Berlin';
const SKRIPTNAME = TROCKENLAUF ? 'Rollladen_Wochenplan_Dev' : 'Rollladen_Wochenplan';

// ── Geraete-Konfiguration (Live-Bestandsaufnahme aus aura.*.config.dashboard,
//    identisch auf aura.0 und aura.1; alle Geraete invertPosition:true - die
//    Umrechnung offen/zu-Anzeige <-> Rohwert passiert NUR im Frontend, dieses
//    Skript arbeitet ausschliesslich mit dem Rohwert 0=offen/100=zu, genauso
//    wie SceneTarget.closed/PlanTarget.closed in planModel.ts) ────────────

const GERAETE = {
    'Wohnz_gross': {
        posDp: 'tahoma.1.devices.Wohnz_gross.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Wohnz_gross.states.core:TargetClosureState:slow',
    },
    'Wohnz_klein': {
        posDp: 'tahoma.1.devices.Wohnz_klein.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Wohnz_klein.states.core:TargetClosureState:slow',
    },
    'Raffstore_(Nachbar)': {
        posDp: 'tahoma.1.devices.Raffstore_(Nachbar).states.core:ClosureState',
        slatDp: 'tahoma.1.devices.Raffstore_(Nachbar).states.core:SlateOrientationState',
    },
    'Raffstore_(Garten)': {
        posDp: 'tahoma.1.devices.Raffstore_(Garten).states.core:ClosureState',
        slatDp: 'tahoma.1.devices.Raffstore_(Garten).states.core:SlateOrientationState',
    },
    'Küchenfenster': {
        posDp: 'tahoma.1.devices.Küchenfenster.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Küchenfenster.states.core:TargetClosureState:slow',
    },
    'Gäste_WC': {
        posDp: 'tahoma.1.devices.Gäste_WC.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Gäste_WC.states.core:TargetClosureState:slow',
    },
    'SPK': {
        posDp: 'tahoma.1.devices.SPK.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.SPK.states.core:TargetClosureState:slow',
    },
    'Eltern_links': {
        posDp: 'tahoma.1.devices.Eltern_links.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Eltern_links.states.core:TargetClosureState:slow',
    },
    'Eltern_rechts': {
        posDp: 'tahoma.1.devices.Eltern_rechts.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Eltern_rechts.states.core:TargetClosureState:slow',
    },
    'Ankleide': { posDp: 'tahoma.1.devices.Ankleide.states.core:ClosureState' },
    'Bad': {
        posDp: 'tahoma.1.devices.Bad.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Bad.states.core:TargetClosureState:slow',
    },
    'Bad_Dachfenster': { posDp: 'tahoma.1.devices.Bad_Dachfenster.states.core:ClosureState' },
    'Kinderzimmer': {
        posDp: 'tahoma.1.devices.Kinderzimmer.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Kinderzimmer.states.core:TargetClosureState:slow',
    },
    'Kinderzimmer_2': {
        posDp: 'tahoma.1.devices.Kinderzimmer_2.states.core:ClosureState',
        slowPosDp: 'tahoma.1.devices.Kinderzimmer_2.states.core:TargetClosureState:slow',
    },
    'Flur_DG': { posDp: 'tahoma.1.devices.Flur_DG.states.core:ClosureState' },
};

const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const DEFAULT_SETTINGS = {
    master: false,
    pausedTodayDate: null,
    holidayMode: 'sunday',
};

// ── Skript-Speicher (in-memory, siehe Auftrag Punkt 6/Winterzeit-Hinweis) ──

let scenes = [];
let entries = [];
let settings = Object.assign({}, DEFAULT_SETTINGS);
// Merker "hat entry.id an diesem Kalendertag schon ausgefuehrt" - bewusst
// NICHT persistent (Auftrag: bei Skript-Neustart darf ein Eintrag im Zweifel
// einmal doppelt oder einmal gar nicht laufen, im Trockenlauf tolerierbar).
// WINTERZEIT-HINWEIS: der Schluessel ist EintragsID + Kalendertag (nicht
// Uhrzeit). In der Nacht 24./25.10.2026 (Sommer- auf Winterzeit) kommt die
// Stunde 02:00-03:00 doppelt vor - ein zeitbasierter Merker wuerde einen
// Eintrag in dieser Stunde zweimal ausloesen. Weil hier nur EINMAL pro Tag
// pro Eintrag gemerkt wird (unabhaengig davon, wie oft die Uhrzeit selbst
// vorkommt), verhindert der Merker die doppelte Ausfuehrung trotzdem.
const heuteAusgefuehrt = {};

// Fehler getrennt pro Quelle, damit eine reparierte Quelle ihren eigenen
// Fehler wieder loeschen kann, ohne den Fehler einer anderen Quelle mit
// wegzuwischen. Status.letzterFehler zeigt den zuletzt aufgetretenen.
const fehlerQuelle = { Szenen: null, Wochenplan: null, Einstellungen: null, Fahrt: null };

let status = {
    läuftSeit: null,
    version: VERSION,
    naechsteFahrten: [], // Startwert wie im Auftrag; wird durch naechsteFahrtenAktualisieren() sofort auf {heute,naechste3} umgestellt
    letzte30: [],
    letzterFehler: null,
    trockenlauf: TROCKENLAUF,
    feiertage: null, // wird von istHeuteFeiertag() befuellt
};

// ── Zeit-/Datums-Helfer (Ortszeit Europe/Berlin, Mittag als Ankerstunde wie
//    in planModel.ts, damit DST-Sprünge das Datum nicht verschieben) ──────

function heuteMitternachtsanker() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12);
}

function addTage(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

function gleicherTag(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function wochentagVon(d) {
    // Montag = 0 ... Sonntag = 6 (d.getDay(): Sonntag = 0 ... Samstag = 6)
    return (d.getDay() + 6) % 7;
}

function datumStr(d) {
    const teile = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const o = {};
    for (const t of teile) o[t.type] = t.value;
    return `${o.year}-${o.month}-${o.day}`;
}

function isoJetzt() {
    return new Date().toISOString();
}

function hhmm(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function parseHhmm(s) {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(s);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

// ── Sonnenzeiten ueber getAstroDate (fuer jeden beliebigen Tag, siehe oben) ─

function sonnenzeitenMinuten(d) {
    const auf = getDateObject(getAstroDate('sunrise', d));
    const unter = getDateObject(getAstroDate('sunset', d));
    return { sunrise: auf.getHours() * 60 + auf.getMinutes(), sunset: unter.getHours() * 60 + unter.getMinutes() };
}

function triggerMinuten(trigger, sun) {
    let min;
    if (trigger.kind === 'time') min = parseHhmm(trigger.time) ?? 0;
    else min = (trigger.kind === 'sunrise' ? sun.sunrise : sun.sunset) + trigger.offset;
    let geklemmt = false;
    const lo = parseHhmm(trigger.earliest);
    const hi = parseHhmm(trigger.latest);
    if (trigger.kind !== 'time' && lo !== null && min < lo) { min = lo; geklemmt = true; }
    if (trigger.kind !== 'time' && hi !== null && min > hi) { min = hi; geklemmt = true; }
    return { min: Math.round(min), geklemmt };
}

// ── Feiertage: lokale BW-Berechnung NUR fuer die Kalender-Anzeige Tag 1-7
//    (gleicher Algorithmus wie planModel.ts::easter/holidaysOf) ───────────

function ostern(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const monat = Math.floor((h + l - 7 * m + 114) / 31);
    const tag = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, monat - 1, tag, 12);
}

function feiertageVon(y) {
    const e = ostern(y);
    const fix = (m, d, name) => ({ date: new Date(y, m - 1, d, 12), name });
    const rel = (n, name) => ({ date: addTage(e, n), name });
    return [
        fix(1, 1, 'Neujahr'), fix(1, 6, 'Heilige Drei Könige'), rel(-2, 'Karfreitag'), rel(1, 'Ostermontag'),
        fix(5, 1, 'Tag der Arbeit'), rel(39, 'Christi Himmelfahrt'), rel(50, 'Pfingstmontag'), rel(60, 'Fronleichnam'),
        fix(10, 3, 'Tag der Deutschen Einheit'), fix(11, 1, 'Allerheiligen'), fix(12, 24, 'Heiligabend'),
        fix(12, 25, '1. Weihnachtstag'), fix(12, 26, '2. Weihnachtstag'), fix(12, 31, 'Silvester'),
    ];
}

function feiertagsNameLokal(d) {
    const liste = feiertageVon(d.getFullYear());
    const treffer = liste.find((h) => gleicherTag(h.date, d));
    return treffer ? treffer.name : null;
}

// Einzige Stelle, die entscheidet, ob HEUTE ein Feiertag ist - fuer die
// Plan-Auswertung (Punkt 5). Liest feiertage.0 direkt (KEIN alive-Gate, siehe
// Skriptkopf), faellt sonst auf "kein Feiertag" zurueck und vermerkt das in
// status.feiertage.
function istHeuteFeiertag() {
    try {
        if (existsState('feiertage.0.today.boolean')) {
            const b = getState('feiertage.0.today.boolean');
            const n = existsState('feiertage.0.today.name') ? getState('feiertage.0.today.name') : null;
            return { istFeiertag: !!(b && b.val), name: n && typeof n.val === 'string' && n.val ? n.val : null, quelle: 'feiertage.0' };
        }
    } catch (e) {
        log(`${SKRIPTNAME}: feiertage.0 nicht lesbar (${e.message}) - Annahme "kein Feiertag"`, 'warn');
    }
    return { istFeiertag: false, name: null, quelle: 'feiertage.0 nicht verfuegbar - Annahme "kein Feiertag"' };
}

// wd = Montag..Sonntag (0..6) oder null (Feiertagsmodus 'skip': heute faehrt nichts).
// i = 0 -> heute (nutzt feiertage.0/Fallback), i > 0 -> lokale BW-Berechnung
// (feiertage.0 kennt keine Tage so weit voraus).
function effektiverWochentag(d, i, mode) {
    const feiertag = i === 0 ? istHeuteFeiertag().istFeiertag : !!feiertagsNameLokal(d);
    if (feiertag && mode === 'skip') return null;
    if (feiertag && mode === 'sunday') return 6;
    return wochentagVon(d);
}

// ── Tolerante Parser (Nachbau von planModel.ts::parseScenes/parsePlan/
//    parseSettings). schwer=true heisst: Datenpunkt komplett kaputt, alte
//    Fassung im Skript-Speicher bleibt aktiv. schwer=false + fehler!=null
//    heisst: einzelne Eintraege uebersprungen, der Rest gilt trotzdem. ────

function istObjekt(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseJsonListe(roh) {
    const trimmed = (roh ?? '').trim();
    if (!trimmed) return { liste: [], schwer: false };
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        return { fehler: `Ungueltiges JSON: ${e.message}`, schwer: true };
    }
    if (!Array.isArray(parsed)) return { fehler: 'Erwartete eine JSON-Liste (Array)', schwer: true };
    return { liste: parsed, schwer: false };
}

function zuSzenenZiel(v) {
    if (!istObjekt(v) || typeof v.key !== 'string' || typeof v.closed !== 'number') return null;
    const out = { key: v.key, closed: v.closed };
    if (typeof v.slat === 'number') out.slat = v.slat;
    return out;
}

const SCENE_ICONS = ['sunrise', 'sun', 'sunset', 'moon', 'home', 'heat', 'tv'];

function zuSzene(v) {
    if (!istObjekt(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.targets)) return null;
    const targets = v.targets.map(zuSzenenZiel).filter((t) => t !== null);
    const icon = SCENE_ICONS.includes(v.icon) ? v.icon : 'home';
    const s = { id: v.id, name: v.name, icon, targets };
    if (typeof v.favorite === 'boolean') s.favorite = v.favorite;
    return s;
}

function parseSzenenJson(roh) {
    const r = parseJsonListe(roh);
    if (r.schwer) return { fehler: r.fehler, schwer: true };
    const werte = r.liste.map(zuSzene).filter((s) => s !== null);
    const uebersprungen = r.liste.length - werte.length;
    return { werte, fehler: uebersprungen > 0 ? `${uebersprungen} Szene(n) uebersprungen (falsches Format)` : null, schwer: false };
}

function zuTrigger(v) {
    if (!istObjekt(v)) return null;
    if (v.kind !== 'time' && v.kind !== 'sunrise' && v.kind !== 'sunset') return null;
    if (typeof v.time !== 'string' || typeof v.offset !== 'number') return null;
    return {
        kind: v.kind,
        time: v.time,
        offset: v.offset,
        earliest: typeof v.earliest === 'string' ? v.earliest : null,
        latest: typeof v.latest === 'string' ? v.latest : null,
    };
}

function zuPlanZiel(v) {
    if (!istObjekt(v)) return null;
    if (v.kind === 'scene' && typeof v.sceneId === 'string') return { kind: 'scene', sceneId: v.sceneId };
    if (v.kind === 'device' && typeof v.key === 'string' && typeof v.closed === 'number') return { kind: 'device', key: v.key, closed: v.closed };
    return null;
}

function zuPlanEintrag(v) {
    if (!istObjekt(v) || typeof v.id !== 'string' || typeof v.enabled !== 'boolean') return null;
    if (!Array.isArray(v.days) || v.days.length !== 7 || !v.days.every((d) => typeof d === 'boolean')) return null;
    const trigger = zuTrigger(v.trigger);
    const target = zuPlanZiel(v.target);
    if (!trigger || !target) return null;
    const out = { id: v.id, days: v.days, trigger, target, enabled: v.enabled };
    if (v.quiet === true) out.quiet = true;
    return out;
}

function parseWochenplanJson(roh) {
    const r = parseJsonListe(roh);
    if (r.schwer) return { fehler: r.fehler, schwer: true };
    const werte = r.liste.map(zuPlanEintrag).filter((e) => e !== null);
    const uebersprungen = r.liste.length - werte.length;
    return { werte, fehler: uebersprungen > 0 ? `${uebersprungen} Eintrag/Eintraege uebersprungen (falsches Format)` : null, schwer: false };
}

const HOLIDAY_MODES = ['sunday', 'normal', 'skip'];

function parseEinstellungenJson(roh) {
    const trimmed = (roh ?? '').trim();
    if (!trimmed) return { werte: Object.assign({}, DEFAULT_SETTINGS), fehler: null, schwer: false };
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        return { fehler: `Ungueltiges JSON: ${e.message}`, schwer: true };
    }
    if (!istObjekt(parsed)) return { fehler: 'Erwartete ein JSON-Objekt', schwer: true };
    const werte = {
        master: typeof parsed.master === 'boolean' ? parsed.master : DEFAULT_SETTINGS.master,
        pausedTodayDate: typeof parsed.pausedTodayDate === 'string' ? parsed.pausedTodayDate : null,
        holidayMode: HOLIDAY_MODES.includes(parsed.holidayMode) ? parsed.holidayMode : DEFAULT_SETTINGS.holidayMode,
    };
    return { werte, fehler: null, schwer: false };
}

// ── Fehler-Buchhaltung (pro Quelle, siehe oben) ───────────────────────────

function aktualisiereLetzterFehler() {
    const alle = Object.keys(fehlerQuelle).map((k) => fehlerQuelle[k]).filter(Boolean);
    if (!alle.length) { status.letzterFehler = null; return; }
    alle.sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
    status.letzterFehler = alle[0];
}

function setzeQuellenFehler(quelle, meldung) {
    fehlerQuelle[quelle] = { zeit: isoJetzt(), quelle, meldung };
    aktualisiereLetzterFehler();
    const zusatz = quelle === 'Fahrt' ? 'Fahrbefehl fehlgeschlagen' : 'alte gueltige Fassung bleibt aktiv';
    log(`${SKRIPTNAME}: ${quelle}: ${meldung} - ${zusatz}`, 'warn');
}

function loescheQuellenFehler(quelle) {
    if (fehlerQuelle[quelle]) {
        fehlerQuelle[quelle] = null;
        aktualisiereLetzterFehler();
    }
}

// ── Laden der drei Datenpunkte (behaelt bei hartem Fehler die alte Fassung) ─

function rohwertVon(id) {
    const s = getState(id);
    return s && typeof s.val === 'string' ? s.val : '';
}

function ladeSzenen() {
    const r = parseSzenenJson(rohwertVon(`${ROOT}.Szenen`));
    if (r.schwer) { setzeQuellenFehler('Szenen', r.fehler); return; }
    scenes = r.werte;
    if (r.fehler) setzeQuellenFehler('Szenen', r.fehler);
    else loescheQuellenFehler('Szenen');
}

function ladeWochenplan() {
    const r = parseWochenplanJson(rohwertVon(`${ROOT}.Wochenplan`));
    if (r.schwer) { setzeQuellenFehler('Wochenplan', r.fehler); return; }
    entries = r.werte;
    if (r.fehler) setzeQuellenFehler('Wochenplan', r.fehler);
    else loescheQuellenFehler('Wochenplan');
}

function ladeEinstellungen() {
    const r = parseEinstellungenJson(rohwertVon(`${ROOT}.Einstellungen`));
    if (r.schwer) { setzeQuellenFehler('Einstellungen', r.fehler); return; }
    settings = r.werte;
    loescheQuellenFehler('Einstellungen');
}

// ── Kalender (heute + 7 Tage, Punkt 4) ────────────────────────────────────

function kalenderAktualisieren() {
    const heute = heuteMitternachtsanker();
    const heuteFeiertag = istHeuteFeiertag();
    status.feiertage = heuteFeiertag;
    const eintraege = [];
    for (let i = 0; i < 8; i++) {
        const d = addTage(heute, i);
        const sun = sonnenzeitenMinuten(d);
        const name = i === 0 ? (heuteFeiertag.name || (heuteFeiertag.istFeiertag ? feiertagsNameLokal(d) : null)) : feiertagsNameLokal(d);
        const istFeiertag = i === 0 ? heuteFeiertag.istFeiertag : !!name;
        eintraege.push({
            datum: datumStr(d),
            wochentag: WD_SHORT[wochentagVon(d)],
            sonnenaufgang: hhmm(sun.sunrise),
            sonnenuntergang: hhmm(sun.sunset),
            istFeiertag,
            feiertagName: name || null,
            feiertagsQuelle: i === 0 ? heuteFeiertag.quelle : 'lokal berechnet (Baden-Württemberg, wie planModel.ts) - feiertage.0 kennt keine Tage so weit voraus',
        });
    }
    setState(`${ROOT}.Kalender`, JSON.stringify(eintraege), true);
}

// ── Vorschau "als Naechstes" fuer die Kachel (Punkt 8) ────────────────────

function vorkommenAmTag(d, i) {
    const wd = effektiverWochentag(d, i, settings.holidayMode);
    if (wd === null) return [];
    const sun = sonnenzeitenMinuten(d);
    const out = [];
    for (const e of entries) {
        if (!e.enabled || !e.days[wd]) continue;
        const r = triggerMinuten(e.trigger, sun);
        out.push({ min: r.min, geklemmt: r.geklemmt, eintrag: e });
    }
    out.sort((a, b) => a.min - b.min);
    return out;
}

function zielBeschreibung(target) {
    return target.kind === 'scene' ? `Szene "${target.sceneId}"` : `Gerät "${target.key}"`;
}

function naechsteFahrtenAktualisieren() {
    const heute = heuteMitternachtsanker();
    const jetzt = new Date();
    const nowMin = jetzt.getHours() * 60 + jetzt.getMinutes();
    const heuteStr = datumStr(heute);

    let heuteListe = [];
    if (settings.master && settings.pausedTodayDate !== heuteStr) {
        heuteListe = vorkommenAmTag(heute, 0)
            .filter((o) => o.min > nowMin)
            .map((o) => ({ datum: heuteStr, uhrzeit: hhmm(o.min), geklemmt: o.geklemmt, eintragId: o.eintrag.id, ziel: zielBeschreibung(o.eintrag.target) }));
    }

    const naechste3 = [];
    if (settings.master) {
        for (let i = 1; i < 8 && naechste3.length < 3; i++) {
            const d = addTage(heute, i);
            for (const o of vorkommenAmTag(d, i)) {
                if (naechste3.length >= 3) break;
                naechste3.push({ datum: datumStr(d), uhrzeit: hhmm(o.min), geklemmt: o.geklemmt, eintragId: o.eintrag.id, ziel: zielBeschreibung(o.eintrag.target) });
            }
        }
    }

    status.naechsteFahrten = { heute: heuteListe, naechste3 };
    statusSchreiben();
}

// ── Fahren (Punkt 6/7) - im Trockenlauf NUR protokollieren, NIE setState auf
//    tahoma.1.* (siehe TROCKENLAUF-Check unten, das ist die echte Sperre,
//    nicht nur ein Kommentar) ──────────────────────────────────────────────

function zieleAusTarget(target, quiet) {
    const q = !!quiet;
    if (target.kind === 'device') return [{ key: target.key, closed: target.closed, quiet: q }];
    const scene = scenes.find((s) => s.id === target.sceneId);
    if (!scene) return [];
    return scene.targets.map((t) => ({ key: t.key, closed: t.closed, slat: t.slat, quiet: q }));
}

async function wartenAufStillstand(geraet, timeoutMs) {
    // Nur im Live-Betrieb (TROCKENLAUF=false) tatsaechlich genutzt.
    const movingDp = geraet.posDp.replace(/states\.core:ClosureState$/, 'states.core:MovingState');
    const start = Date.now();
    while (true) {
        if (!existsState(movingDp)) return;
        const moving = getState(movingDp);
        if (!moving || moving.val === false || Date.now() - start > timeoutMs) return;
        await new Promise((r) => setTimeout(r, 1000));
    }
}

// ── Wiederholen bei Verbindungsfehlern (C2) - NUR im Live-Betrieb genutzt.
//    Bis zu VERSUCHE Sendeversuche, je Versuch bis zu REAKTION_MS auf eine
//    Reaktion warten (ack auf dem beschriebenen DP, MovingState oder ack auf
//    dem Istwert-DP), dazwischen PAUSE_MS Pause. ───────────────────────────

const VERSUCHE = 3;
const PAUSE_MS = 2000;
const REAKTION_MS = 15000;

function reaktionVorhanden(dp, movingDp, istDp, t0) {
    const gesendet = getState(dp);
    if (gesendet && gesendet.ack === true && gesendet.ts > t0) return true;
    if (movingDp && existsState(movingDp)) {
        const moving = getState(movingDp);
        if (moving && moving.lc > t0) return true;
    }
    const ist = getState(istDp);
    if (ist && ist.ack === true && ist.ts > t0) return true;
    return false;
}

async function wartetAufReaktion(dp, movingDp, istDp, t0) {
    const start = Date.now();
    while (Date.now() - start < REAKTION_MS) {
        if (reaktionVorhanden(dp, movingDp, istDp, t0)) return true;
        await new Promise((r) => setTimeout(r, 1000));
    }
    return reaktionVorhanden(dp, movingDp, istDp, t0);
}

async function sendeMitWiederholung(geraet, dp, wert, istDp) {
    const movingDp = istDp.replace(/states\.core:(ClosureState|SlateOrientationState)$/, 'states.core:MovingState');
    let letzteMeldung = '';
    for (let n = 1; n <= VERSUCHE; n++) {
        const verbindung = existsState('tahoma.1.info.connection') ? getState('tahoma.1.info.connection') : null;
        const verbunden = !!(verbindung && verbindung.val === true);
        if (!verbunden) {
            letzteMeldung = 'tahoma.1 getrennt';
        } else {
            try {
                const t0 = Date.now();
                await setStateAsync(dp, wert);
                const reagiert = await wartetAufReaktion(dp, movingDp, istDp, t0);
                if (reagiert) return { ok: true, versuche: n };
                letzteMeldung = 'keine Reaktion';
            } catch (e) {
                letzteMeldung = `Fehler beim Senden: ${e.message}`;
            }
        }
        if (n < VERSUCHE) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    return { ok: false, versuche: VERSUCHE, meldung: letzteMeldung };
}

// Direkter Zielwert-Vergleich wie im Rollladen-Popup (ShutterSheet.tsx):
// nicht (protokollieren als) schreiben, wenn der Ist-Wert schon (±3) am Ziel
// liegt - sonst haenge der Datenpunkt dauerhaft auf ack:false, siehe Auftrag.
// "Leise fahren" (ziel.quiet + Geraet hat slowPosDp): Position geht auf den
// slow-Zieldatenpunkt statt auf posDp - die Pruefung "bereits am Ziel" liest
// trotzdem weiter geraet.posDp, weil das der einzige Istwert ist.
async function fahreEinzelgeraet(ziel) {
    const geraet = GERAETE[ziel.key];
    if (!geraet) return { key: ziel.key, fehler: 'unbekanntes Geraet (nicht in GERAETE-Tabelle)' };

    const leise = ziel.quiet && !!geraet.slowPosDp;
    const posZielDp = leise ? geraet.slowPosDp : geraet.posDp;

    const posState = getState(geraet.posDp);
    const istPos = posState && posState.ack ? posState.val : null;
    const posAmZiel = istPos !== null && Math.abs(Math.round(istPos) - Math.round(ziel.closed)) <= 3;

    let posErgebnis;
    let posGesendet = false;
    if (posAmZiel) {
        posErgebnis = { aktion: 'position', ziel: ziel.closed, ist: istPos, ergebnis: 'bereits am Ziel', leise, dp: posZielDp };
    } else if (TROCKENLAUF) {
        const text = leise ? 'würde leise fahren (Trockenlauf)' : 'würde fahren (Trockenlauf)';
        posErgebnis = { aktion: 'position', ziel: ziel.closed, ist: istPos, ergebnis: text, leise, dp: posZielDp };
    } else {
        const r = await sendeMitWiederholung(geraet, posZielDp, ziel.closed, geraet.posDp);
        if (r.ok) {
            posGesendet = true;
            posErgebnis = { aktion: 'position', ziel: ziel.closed, ist: istPos, ergebnis: `gesendet (Versuch ${r.versuche})`, leise, dp: posZielDp };
            loescheQuellenFehler('Fahrt');
        } else {
            posErgebnis = { aktion: 'position', ziel: ziel.closed, ist: istPos, ergebnis: `fehlgeschlagen nach 3 Versuchen: ${r.meldung}`, leise, dp: posZielDp };
            setzeQuellenFehler('Fahrt', `${ziel.key}: ${r.meldung}`);
        }
    }

    if (posGesendet && geraet.slatDp && typeof ziel.slat === 'number') {
        await wartenAufStillstand(geraet, 90000);
    }

    let lamelleErgebnis = null;
    if (geraet.slatDp && typeof ziel.slat === 'number') {
        const slatState = getState(geraet.slatDp);
        const istSlat = slatState && slatState.ack ? slatState.val : null;
        const slatAmZiel = istSlat !== null && Math.abs(Math.round(istSlat) - Math.round(ziel.slat)) <= 3;
        if (slatAmZiel) {
            lamelleErgebnis = { aktion: 'lamelle', ziel: ziel.slat, ist: istSlat, ergebnis: 'bereits am Ziel' };
        } else if (TROCKENLAUF) {
            lamelleErgebnis = { aktion: 'lamelle', ziel: ziel.slat, ist: istSlat, ergebnis: 'würde fahren (Trockenlauf)' };
        } else {
            const r = await sendeMitWiederholung(geraet, geraet.slatDp, ziel.slat, geraet.slatDp);
            if (r.ok) {
                lamelleErgebnis = { aktion: 'lamelle', ziel: ziel.slat, ist: istSlat, ergebnis: `gesendet (Versuch ${r.versuche})` };
                loescheQuellenFehler('Fahrt');
            } else {
                lamelleErgebnis = { aktion: 'lamelle', ziel: ziel.slat, ist: istSlat, ergebnis: `fehlgeschlagen nach 3 Versuchen: ${r.meldung}` };
                setzeQuellenFehler('Fahrt', `${ziel.key}: ${r.meldung}`);
            }
        }
    }

    return { key: ziel.key, position: posErgebnis, lamelle: lamelleErgebnis };
}

// Alle Ziele einer Szene gleichzeitig senden, ohne Versatz. Verlorene Befehle
// fängt sendeMitWiederholung je Gerät ab (Bestätigung prüfen, bis zu 3 Versuche,
// danach Fehlermeldung über setzeQuellenFehler).
async function fahreZiele(ziele) {
    return Promise.all(ziele.map((ziel) => fahreEinzelgeraet(ziel)));
}

function letzte30Hinzufuegen(eintrag) {
    status.letzte30.unshift(eintrag);
    if (status.letzte30.length > 30) status.letzte30.length = 30;
}

async function fuehreAus(auslöser, target, callback, quiet = false) {
    const ziele = zieleAusTarget(target, quiet);
    if (!ziele.length) {
        const eintrag = { zeit: isoJetzt(), auslöser, ziele: [], hinweis: 'Keine Ziel-Geräte (Szene leer oder unbekannt)', trockenlauf: TROCKENLAUF };
        letzte30Hinzufuegen(eintrag);
        statusSchreiben();
        if (callback) callback(eintrag);
        return eintrag;
    }
    const ergebnisse = await fahreZiele(ziele);
    const eintrag = { zeit: isoJetzt(), auslöser, ziele: ergebnisse, trockenlauf: TROCKENLAUF };
    letzte30Hinzufuegen(eintrag);
    statusSchreiben();
    if (callback) callback(eintrag);
    return eintrag;
}

// ── Minuetlicher Takt (Punkt 5) ────────────────────────────────────────────

function minuetlicherTakt() {
    naechsteFahrtenAktualisieren();

    const heute = heuteMitternachtsanker();
    const heuteStr = datumStr(heute);
    const wd = effektiverWochentag(heute, 0, settings.holidayMode);
    if (wd === null) return; // Feiertagsmodus 'skip': heute faehrt gar nichts
    if (!settings.master) return;
    if (settings.pausedTodayDate === heuteStr) return;

    const jetzt = new Date();
    const nowMin = jetzt.getHours() * 60 + jetzt.getMinutes();
    const sun = sonnenzeitenMinuten(heute);

    for (const entry of entries) {
        if (!entry.enabled || !entry.days[wd]) continue;
        const r = triggerMinuten(entry.trigger, sun);
        if (r.min !== nowMin) continue;

        const merkerId = `${entry.id}@${heuteStr}`;
        if (heuteAusgefuehrt[merkerId]) continue;
        heuteAusgefuehrt[merkerId] = true;

        fuehreAus(`Plan ${entry.id} → ${zielBeschreibung(entry.target)}`, entry.target, () => naechsteFahrtenAktualisieren(), entry.quiet === true);
    }
}

// ── Sofort-Befehl (Punkt 7) - UNABHAENGIG vom Hauptschalter (S4-Entscheidung
//    Sascha) ─────────────────────────────────────────────────────────────

function sofortBefehl(obj) {
    const wert = obj.state.val;
    let sceneId = null;
    if (typeof wert === 'string') {
        const trimmed = wert.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed.sceneId === 'string') sceneId = parsed.sceneId;
            } catch (e) {
                // faellt unten auf "keine gueltige sceneId"
            }
        } else if (trimmed) {
            sceneId = trimmed;
        }
    }

    if (!sceneId) {
        log(`${SKRIPTNAME}: Befehl ohne gueltige sceneId ignoriert: ${JSON.stringify(wert)}`, 'warn');
        setState(`${ROOT}.Befehl`, wert, true);
        return;
    }

    fuehreAus(`Sofort-Befehl → Szene "${sceneId}"`, { kind: 'scene', sceneId }, () => {
        setState(`${ROOT}.Befehl`, wert, true);
    });
}

// ── Datenpunkte anlegen (idempotent) ──────────────────────────────────────

async function sicherstellenObjekte() {
    const ordnerName = TROCKENLAUF ? 'Rolllaeden-Planer (Dev/Trockenlauf)' : 'Rolllaeden-Planer';
    if (!existsObject(ROOT)) {
        await setObjectAsync(ROOT, { type: 'folder', common: { name: ordnerName }, native: {} });
    } else {
        await extendObjectAsync(ROOT, { common: { name: ordnerName } });
    }
    const anlegen = [
        { id: `${ROOT}.Szenen`, wert: '[]', common: { name: 'Szenen', type: 'string', role: 'json', read: true, write: true, desc: 'Scene[] als JSON, siehe planModel.ts' } },
        { id: `${ROOT}.Wochenplan`, wert: '[]', common: { name: 'Wochenplan', type: 'string', role: 'json', read: true, write: true, desc: 'PlanEntry[] als JSON, siehe planModel.ts' } },
        { id: `${ROOT}.Einstellungen`, wert: JSON.stringify(DEFAULT_SETTINGS), common: { name: 'Einstellungen', type: 'string', role: 'json', read: true, write: true, desc: 'Settings als JSON (master/pausedTodayDate/holidayMode)' } },
        { id: `${ROOT}.Befehl`, wert: '', common: { name: 'Befehl', type: 'string', role: 'json', read: true, write: true, desc: 'Sofort-Fahren-Befehl (sceneId als String oder {"sceneId":"..."})' } },
        { id: `${ROOT}.Status`, wert: JSON.stringify(status), common: { name: 'Status', type: 'string', role: 'json', read: true, write: false, desc: 'Protokoll/Vorschau als JSON, siehe Skriptkopf' } },
        { id: `${ROOT}.Kalender`, wert: '[]', common: { name: 'Kalender', type: 'string', role: 'json', read: true, write: false, desc: 'Heute + 7 Tage: Sonnenzeiten, Feiertag' } },
    ];
    for (const a of anlegen) {
        if (!existsState(a.id)) await createStateAsync(a.id, a.wert, a.common);
    }
}

function statusSchreiben() {
    setState(`${ROOT}.Status`, JSON.stringify(status), true);
}

// ── Start ──────────────────────────────────────────────────────────────────
// sicherstellenObjekte() muss ABGEWARTET werden, bevor irgendetwas auf ROOT.*
// liest/schreibt (Race Condition C1): sonst kann kalenderAktualisieren() per
// setState auf .Kalender schreiben, bevor das Objekt beim allerersten Start
// ueberhaupt existiert. Deshalb Abos/Zeitplaene erst NACH dem await anmelden.

(async () => {
    try {
        await sicherstellenObjekte();
        status.läuftSeit = isoJetzt();
        status.version = VERSION;
        status.trockenlauf = TROCKENLAUF;

        ladeSzenen();
        ladeWochenplan();
        ladeEinstellungen();
        kalenderAktualisieren();
        naechsteFahrtenAktualisieren();
        statusSchreiben();

        on({ id: `${ROOT}.Szenen`, change: 'ne' }, () => { ladeSzenen(); naechsteFahrtenAktualisieren(); statusSchreiben(); });
        on({ id: `${ROOT}.Wochenplan`, change: 'ne' }, () => { ladeWochenplan(); naechsteFahrtenAktualisieren(); statusSchreiben(); });
        on({ id: `${ROOT}.Einstellungen`, change: 'ne' }, () => { ladeEinstellungen(); naechsteFahrtenAktualisieren(); statusSchreiben(); });
        on({ id: `${ROOT}.Befehl`, ack: false }, sofortBefehl);

        schedule('* * * * *', minuetlicherTakt);
        schedule('5 0 * * *', kalenderAktualisieren);

        log(`${SKRIPTNAME}: gestartet (Version ${VERSION}, Trockenlauf=${TROCKENLAUF})`, 'info');
    } catch (e) {
        log(`${SKRIPTNAME}: Start fehlgeschlagen (${e.message})`, 'error');
    }
})();
