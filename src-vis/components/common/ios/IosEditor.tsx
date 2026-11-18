/**
 * Gemeinsame Teile der Bearbeiten-Seiten (Rollläden: Szene und Zeitpunkt, Garten: Termin und Einstellungen).
 * Das Muster:
 *   - „Sichern" rechts im Kopf, fett, grau solange nichts zu sichern ist (IosSaveButton, per Portal in den
 *     Platz, den IosNavBar über `rightRef` freigibt). data-ios-editing lässt die Leiste unten zurücktreten.
 *   - Zurück mit ungesicherten Änderungen fragt nach (IosLeaveSheet: verwerfen / sichern / weiter bearbeiten).
 *   - Die Seite meldet „ungesichert" nach oben (useReportDirty), damit der Stapel beim Tab-Wechsel stehen bleibt.
 *   - Optional meldet der Editor einen Zurück-Wächter bei seiner Seite an (useLeaveGuard), wenn Kopf und Editor
 *     getrennte Bausteine sind (Rollläden: PlannerStack/PlanPage).
 * Eine Änderung an diesem Muster gehört hierher, nicht in die einzelnen Seiten.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IosActionSheet } from './IosActionSheet';

/** Anmeldung des Zurück-Wächters bei der Seite: true = darf sofort zurück, false = der Editor fragt nach. */
export type LeaveGuardRegister = (guard: (() => boolean) | null) => void;

/** Meldet den Wächter an und hält ihn aktuell, ohne bei jedem Rendern neu anzumelden. */
export function useLeaveGuard(register: LeaveGuardRegister | undefined, guard: () => boolean) {
    const ref = useRef(guard);
    ref.current = guard;
    useEffect(() => {
        register?.(() => ref.current());
        return () => register?.(null);
    }, [register]);
}

/** Meldet „ungesicherte Änderungen" nach oben; beim Verlassen der Seite wieder false. */
export function useReportDirty(onDirtyChange: ((dirty: boolean) => void) | undefined, dirty: boolean) {
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [onDirtyChange, dirty]);
    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}

/** „Sichern" im Kopf: fett, blau, grau solange nichts zu sichern ist. */
export function IosSaveButton({
    slot,
    canSave,
    onSave,
    label = 'Sichern',
}: {
    slot?: HTMLElement | null;
    canSave: boolean;
    onSave: () => void;
    label?: string;
}) {
    if (!slot) return null;
    return createPortal(
        // data-ios-editing: Hier wird gerade bearbeitet, die Leiste unten tritt zurück (facelift.css)
        <button
            type="button"
            className="ios-bar-text is-strong"
            data-ios-editing=""
            onClick={onSave}
            disabled={!canSave}
        >
            {label}
        </button>,
        slot,
    );
}

/** Rückfrage beim Zurück mit ungesicherten Änderungen. */
export function IosLeaveSheet({
    open,
    canSave,
    onDiscard,
    onSave,
    onStay,
}: {
    open: boolean;
    canSave: boolean;
    onDiscard: () => void;
    onSave: () => void;
    onStay: () => void;
}) {
    return (
        <IosActionSheet
            open={open}
            actions={[
                { key: 'discard', label: 'Änderungen verwerfen', tone: 'destructive', onSelect: onDiscard },
                { key: 'save', label: 'Sichern', disabled: !canSave, onSelect: onSave },
            ]}
            cancelLabel="Weiter bearbeiten"
            onCancel={onStay}
        />
    );
}
