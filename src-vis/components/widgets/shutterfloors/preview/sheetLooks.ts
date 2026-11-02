/**
 * Fassungen des Feinreglers „schlicht" (Reihe D), nur Dev-Vorschau.
 *
 * 201/202 (02.11.2026): Spalten 112/64 px, Feder neben einem 112-px-OK.
 * 205–219 (02.11.2026, abends): Saschas Wunsch nach mehr Ruhe und Stimmigkeit
 * zwischen Fenster und Raffstore. Grundidee aller neuen Fassungen: EIN Block
 * fester Breite fuer jeden Antrieb. Beim Fenster fuellt ihn ein Schieber, beim
 * Raffstore teilen sich Position und Lamelle denselben Block. Die Taste ist so
 * breit wie dieser Block oder geht ueber die volle Breite. Die Feder steckt
 * – je nach Fassung – in der Taste, als zweiter Weg „Leise", als Schalterzeile
 * oder als kleiner Chip.
 */

export interface SheetLook {
    key: string;
    name: string;
    desc: string;
    /** classic = 112/64 px wie 201/202; equal = ein Block BLOCK_W fuer alle */
    block: 'classic' | 'equal';
    /** Raffstore im Block: 2:1 (Position breiter) oder 1:1 (gleich breit) */
    split?: '21' | '11';
    /** Wo Zahl und Wort stehen */
    labels: 'cols' | 'hero' | 'inside' | 'below';
    /**
     * side   Feder als eigener Kreis neben der Taste (201/202)
     * split  eine Kapsel: OK | Feder (Feder-Teil schaltet um)
     * inline eine Kapsel: Feder-Symbol links in der Taste, ohne Trennstrich
     * two    zwei Wege in einer Kapsel: „OK" und „Leise" (beide fahren sofort)
     * row    Schalterzeile „Leise fahren" wie in den Einstellungen, darunter OK
     * chip   kleiner Umschalter „Leise" ueber der Taste
     */
    action: 'side' | 'split' | 'inline' | 'two' | 'row' | 'chip';
    feder?: 'left' | 'right';
    /** Tastenbreite: Schieber (classic), Block, oder volle Breite */
    btn: 'pill' | 'block' | 'full';
    /** Fuellung: Farbe der Art, ruhig (Textfarbe) oder getoent */
    fill: 'kind' | 'neutral' | 'tint';
    /** Schieber und Taste auf einer Karte wie die Listen-Gruppen */
    card?: boolean;
}

export const BLOCK_W = 168;

export const SHEET_LOOKS: SheetLook[] = [
    {
        key: '201',
        name: 'Schlicht, Feder links',
        desc: 'Stand der ersten Runde: Spalten 112/64 px, Feder als Kreis links neben einem schmalen OK.',
        block: 'classic',
        labels: 'cols',
        action: 'side',
        feder: 'left',
        btn: 'pill',
        fill: 'kind',
    },
    {
        key: '202',
        name: 'Schlicht, Feder rechts',
        desc: 'Wie 201, Feder rechts.',
        block: 'classic',
        labels: 'cols',
        action: 'side',
        feder: 'right',
        btn: 'pill',
        fill: 'kind',
    },
    {
        key: '205',
        name: 'Ein Block, Kapsel OK | Feder',
        desc: 'Fenster und Raffstore haben denselben 168-px-Block. Taste so breit wie der Block, die Feder ist ihr rechtes Ende.',
        block: 'equal',
        split: '21',
        labels: 'cols',
        action: 'split',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '206',
        name: 'Ein Block, zwei Wege',
        desc: 'Wie 205, aber ohne Umschalten: Die Kapsel hat „OK" und „Leise". Wer leise fahren will, tippt gleich „Leise".',
        block: 'equal',
        split: '21',
        labels: 'cols',
        action: 'two',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '207',
        name: 'Ein Block, Feder in der Taste',
        desc: 'Wie 205, die Feder sitzt als Symbol links in der Taste, ohne Trennstrich.',
        block: 'equal',
        split: '21',
        labels: 'cols',
        action: 'inline',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '208',
        name: 'Große Zahl oben',
        desc: 'Eine große Zahl über dem Block, beim Raffstore mit Winkel daneben. Die Schieber tragen keine eigene Beschriftung. Kapsel OK | Feder.',
        block: 'equal',
        split: '21',
        labels: 'hero',
        action: 'split',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '209',
        name: 'Große Zahl, breite Taste',
        desc: 'Wie 208, die Taste geht über die volle Breite und hat zwei Wege „OK" und „Leise".',
        block: 'equal',
        split: '21',
        labels: 'hero',
        action: 'two',
        btn: 'full',
        fill: 'kind',
    },
    {
        key: '210',
        name: 'Zwei gleiche Schieber',
        desc: 'Beim Raffstore sind Position und Lamelle gleich breit und füllen zusammen den Block. Kapsel OK | Feder.',
        block: 'equal',
        split: '11',
        labels: 'cols',
        action: 'split',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '211',
        name: 'Zahl im Schieber',
        desc: 'Der Wert steht klein unten im Schieber, darunter nur „Position" bzw. „Lamelle". Sehr ruhiger Kopf. Kapsel OK | Feder.',
        block: 'equal',
        split: '21',
        labels: 'inside',
        action: 'split',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '212',
        name: 'Ruhig, ohne Farbe',
        desc: 'Wie 208, die Füllung in Textfarbe statt in der Farbe der Art – wie die Helligkeit im Kontrollzentrum.',
        block: 'equal',
        split: '21',
        labels: 'hero',
        action: 'split',
        btn: 'block',
        fill: 'neutral',
    },
    {
        key: '213',
        name: 'Getönt',
        desc: 'Wie 205, die leere Fläche des Schiebers ist zart in der Farbe der Art getönt.',
        block: 'equal',
        split: '21',
        labels: 'cols',
        action: 'split',
        btn: 'block',
        fill: 'tint',
    },
    {
        key: '214',
        name: 'Auf einer Karte',
        desc: 'Große Zahl, Schieber und Taste liegen auf einer Karte wie die Gruppen in der Liste. Taste über die Kartenbreite.',
        block: 'equal',
        split: '21',
        labels: 'hero',
        action: 'split',
        btn: 'full',
        fill: 'kind',
        card: true,
    },
    {
        key: '215',
        name: 'Leise als Schalter',
        desc: 'Unter den Schiebern eine Zeile „Leise fahren" mit Schalter wie in den Einstellungen, darunter ein breites OK.',
        block: 'equal',
        split: '21',
        labels: 'hero',
        action: 'row',
        btn: 'full',
        fill: 'kind',
    },
    {
        key: '216',
        name: 'Leise als Chip',
        desc: 'Ein kleiner Umschalter „Leise" über der Taste, die Taste so breit wie der Block.',
        block: 'equal',
        split: '21',
        labels: 'cols',
        action: 'chip',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '217',
        name: 'Zahl unter dem Schieber',
        desc: 'Schieber oben bündig, Zahl und Wort darunter. Kapsel OK | Feder.',
        block: 'equal',
        split: '21',
        labels: 'below',
        action: 'split',
        btn: 'block',
        fill: 'kind',
    },
    {
        key: '218',
        name: 'Gleich und getönt, zwei Wege',
        desc: 'Zwei gleich breite, getönte Schieber, große Zahl oben, breite Taste „OK" | „Leise".',
        block: 'equal',
        split: '11',
        labels: 'hero',
        action: 'two',
        btn: 'full',
        fill: 'tint',
    },
    {
        key: '219',
        name: 'Ganz ruhig',
        desc: 'Zahl im Schieber, Füllung in Textfarbe, breite Taste „OK" | „Leise". Am wenigsten Farbe und Text.',
        block: 'equal',
        split: '21',
        labels: 'inside',
        action: 'two',
        btn: 'full',
        fill: 'neutral',
    },
];
