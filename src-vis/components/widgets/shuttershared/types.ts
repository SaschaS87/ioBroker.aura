export interface ShutterDeviceDef {
    key: string;
    label: string;
    facade?: string;
    badge?: 'raffstore' | 'dachfenster';
    posDp: string;
    invertPosition?: boolean;
    upDp?: string;
    downDp?: string;
    stopDp?: string;
    activityDp?: string;
    slatDp?: string;
    /** Ziel-Datenpunkt fuer die leise Fahrt (core:TargetClosureState:slow) -
     *  explizit gepflegt statt aus posDp abgeleitet, weil nur 10 von 15
     *  Antrieben ueberhaupt :slow-States haben (Stand 21.09.2026). Eine
     *  Ableitung wuerde bei den anderen 5 eine State-ID erfinden, die es
     *  nicht gibt - setState liefe dann 45 s ins Leere, ohne Fehler. Fehlt
     *  das Feld, zeigt das Sheet die Feder gar nicht erst an. */
    slowPosDp?: string;
}
