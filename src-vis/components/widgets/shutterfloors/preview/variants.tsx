import type { ReactNode } from 'react';
import { Check, Pencil, Settings, Trash2 } from 'lucide-react';
import { IosNavBar } from '../../../common/ios';
import type { HeadActionsProps } from '../planner/editors';
import type { PageInfo } from './routes';

export type DraftKey = 'A' | 'B' | 'C';
export const VARIANTS: { key: DraftKey; name: string }[] = [
    { key: 'A', name: 'Wie Einstellungen' },
    { key: 'B', name: 'iOS mit Herkunft' },
    { key: 'C', name: 'Großer Titel' },
];

interface HeadProps {
    draft: DraftKey;
    info: PageInfo;
    origin: string;
    onBack: () => void;
    right?: ReactNode;
    rightRef?: (el: HTMLElement | null) => void;
}

/** Kopf der Unterseite je Entwurf. */
export function DraftHead({ draft, info, origin, onBack, right, rightRef }: HeadProps) {
    if (draft === 'C') {
        return (
            <IosNavBar
                variant="large"
                className="f30-bar f30-bar--c"
                title={info.title}
                status={info.status}
                backLabel={origin}
                onBack={onBack}
                right={right}
                rightRef={rightRef}
            />
        );
    }
    if (draft === 'B') {
        return (
            <IosNavBar
                className="f30-bar f30-bar--b"
                sticky
                title={info.title}
                backLabel={origin}
                backFallback="Zurück"
                onBack={onBack}
                right={right}
                rightRef={rightRef}
            />
        );
    }
    return (
        <IosNavBar
            className="f30-bar f30-bar--a"
            title={info.title}
            backLabel="Zurück"
            onBack={onBack}
            right={right}
            rightRef={rightRef}
        />
    );
}

export function GearButton({ draft, onClick }: { draft: DraftKey; onClick: () => void }) {
    return (
        <button
            type="button"
            className={`ios-bar-btn${draft === 'B' ? ' is-accent' : ''}`}
            aria-label="Einstellungen"
            title="Einstellungen"
            onClick={onClick}
        >
            <Settings size={19} />
        </button>
    );
}

export function EditToggle({ draft, edit, onToggle }: { draft: DraftKey; edit: boolean; onToggle: () => void }) {
    if (draft === 'B') {
        return (
            <button type="button" className={`ios-bar-text${edit ? ' is-strong' : ''}`} onClick={onToggle}>
                {edit ? 'Fertig' : 'Bearbeiten'}
            </button>
        );
    }
    const label = edit ? 'Fertig' : 'Szenen bearbeiten';
    return (
        <button type="button" className="ios-bar-btn" aria-label={label} title={label} onClick={onToggle}>
            {edit ? <Check size={20} /> : <Pencil size={18} />}
        </button>
    );
}

/** B: Papierkorb und „Sichern" als iOS-Knöpfe. A und C: die heutigen Knöpfe (undefined). */
export function headActionsFor(draft: DraftKey): ((a: HeadActionsProps) => ReactNode) | undefined {
    if (draft !== 'B') return undefined;
    return ({ what, onDelete, onSave, canSave }) => (
        <>
            {onDelete && (
                <button
                    type="button"
                    className="ios-bar-btn is-danger"
                    aria-label={`${what} löschen`}
                    title={`${what} löschen`}
                    onClick={onDelete}
                >
                    <Trash2 size={18} />
                </button>
            )}
            <button type="button" className="ios-bar-text is-strong" onClick={onSave} disabled={!canSave}>
                Sichern
            </button>
        </>
    );
}
