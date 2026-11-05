import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';
import { IosGroup, IosNavBar, IosNavRow, IosSplit, IosStack, useMinWidth } from '../common/ios';
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
            {/* fit={false}: Kopf exakt wie Feature 29, Befund Kopf-Kollision bei 352 px bleibt bis Phase 2 */}
            <IosNavBar
                fit={false}
                title={t(row.label)}
                onBack={onBack}
                backLabel={t('deviceSettings.back')}
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
    // key: zuletzt gewählte Einstellung (breit vorgewählt, schmal Inhalt der Unterseite);
    // open: schmal, ob die Unterseite gerade vorne liegt.
    const [state, setState] = useState<{ key: string; open: boolean }>({
        key: SETTINGS_ROWS[0].key,
        open: false,
    });

    const row = SETTINGS_ROWS.find((r) => r.key === state.key) ?? SETTINGS_ROWS[0];
    const open = (key: string) => setState({ key, open: true });
    const back = () => setState((s) => ({ ...s, open: false }));

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
