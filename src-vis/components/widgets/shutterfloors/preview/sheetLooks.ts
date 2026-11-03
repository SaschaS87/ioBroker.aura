/**
 * Fassungen des Feinreglers (Reihe D), nur Dev-Vorschau.
 *
 * Runde 220–229 (03.11.2026). Die Fassungen 201–219 sind auf Saschas Wunsch
 * entfallen. Seine Vorgaben fuer diese Runde:
 * - Feder ohne Hintergrund, durchsichtig, zwischen Zahl und Schieber
 * - Raffstore haben keine Leise-Fahrt: dort keine Feder, auch nicht
 *   ausgegraut
 * - Lamellen-Regler beim Raffstore schmaler
 *
 * Gemeinsamer Aufbau: Der Positions-Schieber steht bei jedem Antrieb an
 * derselben Stelle (mittig). Beim Raffstore haengt die schmale Lamelle rechts
 * daneben, Taste und Fensterhoehe bleiben gleich. In der Zeile zwischen Zahl
 * und Schieber steht beim Fenster die Feder, beim Raffstore „Position" bzw.
 * „Lamelle". Ausnahme 227: Position und Lamelle gemeinsam mittig.
 */

export interface SheetLook {
    key: string;
    name: string;
    desc: string;
    /** Breite des Positions-Schiebers */
    posW: number;
    /** Lamelle: schmaler Schieber oder Strich mit Knopf */
    slat: 'pill' | 'track';
    /** Raffstore: Position bleibt mittig (Lamelle rechts daneben) oder beide gemeinsam mittig */
    align: 'pos' | 'group';
    /** Feder in der Zeile ueber dem Schieber: mittig, an der linken/rechten Kante, mit Wort „leise" */
    feder: 'center' | 'left' | 'right' | 'word';
    /** Breite der OK-Taste: wie der Positions-Schieber, feste Breite oder volle Breite */
    btn: 'pos' | 'full' | number;
    /** Fuellung in der Farbe der Art oder ruhig in Textfarbe */
    fill: 'kind' | 'neutral';
    /** Zahl ueber dem Schieber oder klein im Schieber */
    value: 'above' | 'inside';
    /** Abweichende Angaben nur fuer Raffstore (230: Fenster wie 223, Raffstore wie 227) */
    raff?: Partial<Omit<SheetLook, 'key' | 'name' | 'desc' | 'raff'>>;
}

const BASE: Omit<SheetLook, 'key' | 'name' | 'desc'> = {
    posW: 140,
    slat: 'pill',
    align: 'pos',
    feder: 'center',
    btn: 'pos',
    fill: 'kind',
    value: 'above',
};

export const SHEET_LOOKS: SheetLook[] = [
    {
        ...BASE,
        key: '230',
        name: 'Wahl: Fenster 223, Raffstore 227',
        desc: 'Saschas Mischung (03.11.2026): Fenster wie 223 (Feder mit „leise" mittig, Taste so breit wie der Schieber), Raffstore wie 227 (Position und Lamelle gemeinsam mittig, Taste 200 px). Funkzeile klein rechts unten wie im Original.',
        feder: 'word',
        raff: { align: 'group', btn: 200 },
    },
    {
        ...BASE,
        key: '220',
        name: 'Feder mittig',
        desc: 'Grundform: Zahl, darunter mittig die Feder ohne Hintergrund, dann der Schieber. Taste so breit wie der Schieber. Raffstore: schmale Lamelle rechts daneben.',
    },
    {
        ...BASE,
        key: '221',
        name: 'Feder rechts über dem Schieber',
        desc: 'Wie 220, die Feder sitzt bündig an der rechten Kante des Schiebers.',
        feder: 'right',
    },
    {
        ...BASE,
        key: '222',
        name: 'Feder links über dem Schieber',
        desc: 'Wie 220, die Feder sitzt bündig an der linken Kante des Schiebers.',
        feder: 'left',
    },
    {
        ...BASE,
        key: '223',
        name: 'Feder mit Wort',
        desc: 'Wie 220, neben der Feder steht klein „leise". Eingeschaltet werden Feder und Wort gelb.',
        feder: 'word',
    },
    {
        ...BASE,
        key: '224',
        name: 'Breitere Taste',
        desc: 'Wie 220, die Taste ist 220 px breit und steht mittig unter dem Schieber.',
        btn: 220,
    },
    {
        ...BASE,
        key: '225',
        name: 'Taste über die volle Breite',
        desc: 'Wie 220, die Taste geht über die ganze Fensterbreite.',
        btn: 'full',
    },
    {
        ...BASE,
        key: '226',
        name: 'Lamelle als Strich',
        desc: 'Wie 220, die Lamelle ist nur ein dünner Strich mit rundem Knopf – noch schmaler.',
        slat: 'track',
    },
    {
        ...BASE,
        key: '227',
        name: 'Raffstore gemeinsam mittig',
        desc: 'Beim Raffstore stehen Position und Lamelle zusammen in der Mitte. Taste 200 px breit, bei jedem Antrieb gleich.',
        align: 'group',
        btn: 200,
    },
    {
        ...BASE,
        key: '228',
        name: 'Ruhig, ohne Farbe',
        desc: 'Wie 220, die Füllung in Textfarbe statt in der Farbe der Art.',
        fill: 'neutral',
    },
    {
        ...BASE,
        key: '229',
        name: 'Zahl im Schieber',
        desc: 'Die Zahl steht klein unten im Schieber. Über dem Schieber nur die Feder bzw. beim Raffstore „Position" und „Lamelle".',
        value: 'inside',
    },
];
