import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';
import { Group, NavRow, SubHeader } from './devicesettings/parts';
import { SETTINGS_ROWS, type SettingsRow } from './devicesettings/settingsRows';
import './devicesettings/DeviceSettings.css';

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
 */

const WIDE_MIN_PX = 640;

// React 18 kennt das HTML-Attribut inert noch nicht in den Typen
const inertAttr = (on: boolean): Record<string, string> => (on ? { inert: '' } : {});

function OverviewRow({ row, selected, onOpen }: { row: SettingsRow; selected?: boolean; onOpen: () => void }) {
    const t = useT();
    const value = row.useValue();
    return (
        <NavRow
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
        <div className="ds-page">
            <Group>
                {SETTINGS_ROWS.map((row) => (
                    <OverviewRow
                        key={row.key}
                        row={row}
                        selected={activeKey === row.key}
                        onOpen={() => onOpen(row.key)}
                    />
                ))}
            </Group>
        </div>
    );
}

function Detail({ row, inert, onBack }: { row: SettingsRow; inert: boolean; onBack?: () => void }) {
    const t = useT();
    return (
        <div className="ds-page">
            <SubHeader title={t(row.label)} onBack={onBack} backLabel={t('deviceSettings.back')} />
            <row.Page inert={inert} />
        </div>
    );
}

export function DeviceSettingsWidget({ editMode }: WidgetProps) {
    const t = useT();
    const inAdmin = useLocation().pathname.startsWith('/admin');
    const inert = editMode || inAdmin;

    const rootRef = useRef<HTMLDivElement>(null);
    const [wide, setWide] = useState(false);
    // key: zuletzt gewählte Einstellung (breit vorgewählt, schmal Inhalt der Unterseite);
    // open: schmal, ob die Unterseite gerade vorne liegt.
    const [state, setState] = useState<{ key: string; open: boolean }>({
        key: SETTINGS_ROWS[0].key,
        open: false,
    });

    // Breite des Widgets selbst messen (nicht des Fensters): das Widget kann in einer
    // halben Spalte stehen.
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => setWide(el.getBoundingClientRect().width >= WIDE_MIN_PX);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const row = SETTINGS_ROWS.find((r) => r.key === state.key) ?? SETTINGS_ROWS[0];
    const open = (key: string) => setState({ key, open: true });
    const back = () => setState((s) => ({ ...s, open: false }));

    return (
        <div ref={rootRef} className="ds-root" data-testid="device-settings" aria-label={t('deviceSettings.title')}>
            {wide ? (
                <div className="ds-wide">
                    <Overview activeKey={row.key} onOpen={(key) => setState({ key, open: false })} />
                    <Detail row={row} inert={inert} />
                </div>
            ) : (
                <div className="ds-stage">
                    <div className={`ds-slider${state.open ? ' is-open' : ''}`}>
                        <div className="ds-pane" aria-hidden={state.open} {...inertAttr(state.open)}>
                            <Overview onOpen={open} />
                        </div>
                        <div className="ds-pane" aria-hidden={!state.open} {...inertAttr(!state.open)}>
                            <Detail row={row} inert={inert} onBack={back} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
