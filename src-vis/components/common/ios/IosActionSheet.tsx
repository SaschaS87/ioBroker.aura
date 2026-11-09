/**
 * iOS-Baustein (Feature 30, Phase 2): Rückfrage von unten ("Action Sheet"). Eine Karte mit den Aktionen,
 * darunter abgesetzt der Abbrechen-Knopf. Escape und ein Tipp neben die Karte lösen onCancel aus; der
 * Fokus springt beim Öffnen auf die erste freie Aktion und beim Schließen zurück.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';

export interface IosAction {
    key: string;
    label: string;
    /** destructive = rot, strong = fett */
    tone?: 'default' | 'destructive' | 'strong';
    disabled?: boolean;
    onSelect: () => void;
}

export interface IosActionSheetProps {
    open: boolean;
    title?: ReactNode;
    message?: ReactNode;
    actions: IosAction[];
    cancelLabel: string;
    onCancel: () => void;
}

export function IosActionSheet({ open, title, message, actions, cancelLabel, onCancel }: IosActionSheetProps) {
    const adminTarget = usePortalTarget();
    const sheetRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef(onCancel);
    cancelRef.current = onCancel;

    useEffect(() => {
        if (!open) return;
        const before = document.activeElement as HTMLElement | null;
        const first = sheetRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
        first?.focus({ preventScroll: true });
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            cancelRef.current();
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            if (before && document.contains(before)) before.focus({ preventScroll: true });
        };
    }, [open]);

    if (!open) return null;
    const target = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget ?? document.body;
    return createPortal(
        <div className="ios-as-backdrop" onClick={() => cancelRef.current()}>
            <div
                ref={sheetRef}
                className="ios-as"
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : undefined}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ios-as-card">
                    {title || message ? (
                        <div className="ios-as-head">
                            {title ? <div className="ios-as-title">{title}</div> : null}
                            {message ? <div className="ios-as-msg">{message}</div> : null}
                        </div>
                    ) : null}
                    {actions.map((a) => (
                        <button
                            key={a.key}
                            type="button"
                            className={`ios-as-btn${a.tone === 'destructive' ? ' is-destructive' : ''}${a.tone === 'strong' ? ' is-strong' : ''}`}
                            disabled={a.disabled}
                            onClick={a.onSelect}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
                <div className="ios-as-card ios-as-cancel">
                    <button type="button" className="ios-as-btn is-strong" onClick={() => cancelRef.current()}>
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </div>,
        target,
    );
}
