/**
 * Read-only Wochenplan-Spiegel eines Bewaesserungskreises fuer das
 * Garten2-Steuerpult.
 *
 * Garten2 legt KEINEN eigenen Zeitplan-Kanal an. Es liest den bestehenden
 * Timer-Spiegel, den das Garten-Widget (Tab „Garten") ohnehin pro Kreis unter
 * `<sourceStateBaseId>-<circleSlug>.config` / `.enabled` publiziert
 * (siehe publishGartenCircle in utils/publishTimerConfig.ts). Termine
 * aendern bleibt exklusiv dem Tab „Garten" vorbehalten — dieser Hook
 * schreibt nichts, niemals.
 */
import { useMemo } from 'react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { TimerConfigPayload } from '../../../utils/publishTimerConfig';
import { circleSlug } from '../garten/gartenConstants';
import type { TimerEvent } from '../../../types';

export interface GartenScheduleState {
    events: TimerEvent[];
    /** Zeitplan scharf — Standard true, wie im Garten-Widget (scheduleEnabled). */
    enabled: boolean;
    loaded: boolean;
}

export function useGartenSchedule(sourceStateBaseId: string, sprinkleName: string): GartenScheduleState {
    const base = sourceStateBaseId ? `${sourceStateBaseId}-${circleSlug(sprinkleName)}` : '';
    const configDp = useDatapoint(base ? `${base}.config` : '');
    const enabledDp = useDatapoint(base ? `${base}.enabled` : '');

    const events = useMemo<TimerEvent[]>(() => {
        if (typeof configDp.value !== 'string' || !configDp.value) return [];
        try {
            const payload = JSON.parse(configDp.value) as TimerConfigPayload;
            return Array.isArray(payload.events) ? payload.events : [];
        } catch {
            return [];
        }
    }, [configDp.value]);

    const enabled = enabledDp.value !== false;
    const loaded = configDp.state !== null;

    return { events, enabled, loaded };
}
