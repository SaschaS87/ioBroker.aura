import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';
import { IosGroup, IosNavBar, IosNavRow, IosSplit, IosStack, useMinWidth, useTabHidden } from '../common/ios';
import { SETTINGS_ROWS, type SettingsRow } from './devicesettings/settingsRows';

/**
 * Geräte-Einstellungen (Feature 28 Hell/Dunkel, Feature 29 Aufbau Übersicht und Unterseite).
 * Die Wahl steht nur im Browser-Speicher (deviceThemeStore) und wandert nie nach
 * ioBroker. Im Editor und im Admin sind die Auswahlknöpfe gesperrt (reine Vorschau,
 * wie beim Menü-Widget); die Navigation zwischen Übersicht und Unterseite bleibt bedienbar.
 *
 * Aufbau: Übersicht (Liste der Einstellungen) und Unterseite je Einstellung. Ab 640 px
 * Breite des Widgets stehen beide nebeneinander (Master-Detail), darunter schiebt ein
 * Tipp die Unterseite von rechts herein (Push). Gezeichnet wird immer nur eine der
 * beiden Ansichten. Zustand nur lokal: Beim Öffnen ist die Übersicht zu sehen
 * (breit: erste Einstellung vorgewählt).
 *
 * Seit Feature 30 über den iOS-Baustein components/common/ios (Stapel, Kopf, Gruppen, Zeilen).
 * Der Kopf der Unterseite ist wie in den iPhone-Einstellungen: mitlaufend, mit Kollisionsschutz
 * (Zurück-Wort wird gekürzt statt den Titel zu überdecken). Tab verlassen: Dashboard.tsx versteckt
 * besuchte Tabs nur, hängt sie nicht aus; deshalb springt das Widget beim Verdecken auf die
 * Übersicht zurück (useTabHidden), damit man beim Wiederkommen die Übersicht sieht (Feature 29, E5).
 */

const WIDE_MIN_PX = 640;

function OverviewRow({ row, selected, onOpen }: { row: SettingsRow; selected?: boolean; onOpen: () => void }) {
    const t = useT();
    const value = row.useValue();
    return (
        <IosNavRow
            icon={row.icon}
            iconColor={row.iconColor}
            label={t(row.label)}
            value={value}
            selected={selected}
            onClick={onOpen}
        />
    );
}

function Overview({
    activeKey,
    onOpen,
}: {
    /** Breit: vorgewählte Zeile. Schmal: undefined. */
    activeKey?: string;
    onOpen: (key: string) => void;
}) {
    return (
        <div className="ios-page">
            <IosGroup>
                {SETTINGS_ROWS.map((row) => (
                    <OverviewRow
                        key={row.key}
                        row={row}
                        selected={activeKey === row.key}
                        onOpen={() => onOpen(row.key)}
                    />
                ))}
            </IosGroup>
        </div>
    );
}

function Detail({ row, inert, onBack }: { row: SettingsRow; inert: boolean; onBack?: () => void }) {
    const t = useT();
    return (
        <div className="ios-page">
            <IosNavBar
                sticky
                title={t(row.label)}
                onBack={onBack}
                backLabel={t('deviceSettings.back')}
                backFallback={t('deviceSettings.backShort')}
                backAttrs={{ 'data-ds-back': '' }}
            />
            <row.Page inert={inert} />
        </div>
    );
}

export function DeviceSettingsWidget({ editMode }: WidgetProps) {
    const t = useT();
    const inAdmin = useLocation().pathname.startsWith('/admin');
    const inert = editMode || inAdmin;

    const rootRef = useRef<HTMLDivElement>(null);
    const wide = useMinWidth(rootRef, WIDE_MIN_PX);
    const hidden = useTabHidden(rootRef);
    // key: zuletzt gewählte Einstellung (breit vorgewählt, schmal Inhalt der Unterseite);
    // open: schmal, ob die Unterseite gerade vorne liegt.
    const [state, setState] = useState<{ key: string; open: boolean }>({
        key: SETTINGS_ROWS[0].key,
        open: false,
    });

    const row = SETTINGS_ROWS.find((r) => r.key === state.key) ?? SETTINGS_ROWS[0];
    const open = (key: string) => setState({ key, open: true });
    const back = () => setState((s) => ({ ...s, open: false }));
    // Tab verlassen -> beim Wiederkommen die Übersicht (der Tab bleibt eingehängt, nur display:none)
    useEffect(() => {
        if (hidden) setState((s) => (s.open ? { ...s, open: false } : s));
    }, [hidden]);

    return (
        <div ref={rootRef} className="ios-root" data-testid="device-settings" aria-label={t('deviceSettings.title')}>
            {wide ? (
                <IosSplit
                    master={<Overview activeKey={row.key} onOpen={(key) => setState({ key, open: false })} />}
                    detail={<Detail row={row} inert={inert} />}
                />
            ) : (
                <IosStack
                    sizing="tallest"
                    manageScroll={false}
                    bleed={2}
                    inset={2}
                    depth={state.open ? 1 : 0}
                    pages={[
                        { key: 'overview', node: <Overview onOpen={open} /> },
                        { key: 'detail', node: <Detail row={row} inert={inert} onBack={back} /> },
                    ]}
                />
            )}
        </div>
    );
}
