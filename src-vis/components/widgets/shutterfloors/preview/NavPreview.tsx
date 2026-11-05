import { useState, type ReactNode } from 'react';
import type { ShutterFloorDef } from '../types';
import { DraftStack } from './DraftStack';
import { VARIANTS, type DraftKey } from './variants';
import './NavPreview.css';

const KEY = 'aura.shutterfloors.preview';
type Choice = 'IST' | DraftKey;

function readChoice(): Choice {
    try {
        const v = window.localStorage.getItem(KEY);
        return v === 'IST' || v === 'A' || v === 'B' || v === 'C' ? v : 'A';
    } catch {
        return 'A';
    }
}

function useDraftChoice(): [Choice, (c: Choice) => void] {
    const [choice, setChoice] = useState<Choice>(readChoice);
    const set = (c: Choice) => {
        setChoice(c);
        try {
            window.localStorage.setItem(KEY, c);
        } catch {
            /* Speicher gesperrt: Wahl gilt nur bis zum Neuladen */
        }
    };
    return [choice, set];
}

function DraftBar({ choice, onChoose }: { choice: Choice; onChoose: (c: Choice) => void }) {
    const sample = new URLSearchParams(window.location.search).get('rolllaeden') === '1';
    const name = choice === 'IST' ? 'heutiges Fenster von unten' : (VARIANTS.find((v) => v.key === choice)?.name ?? '');
    const keys: { k: Choice; label: string }[] = [
        { k: 'IST', label: 'Ist' },
        ...VARIANTS.map((v) => ({ k: v.key, label: v.key })),
    ];
    return (
        <div className="f30-devbar" role="group" aria-label="Feature 30 Entwürfe, nur lokal">
            <span className="f30-devbar-title">Feature 30 · Entwurf</span>
            {keys.map(({ k, label }) => (
                <button
                    key={k}
                    type="button"
                    className={`f30-devbar-btn${choice === k ? ' is-on' : ''}`}
                    data-f30-choice={k}
                    aria-pressed={choice === k}
                    onClick={() => onChoose(k)}
                >
                    {label}
                </button>
            ))}
            <span className="f30-devbar-name">{name}</span>
            {sample ? <span className="f30-devbar-tag">Beispieldaten</span> : null}
            <span className="f30-devbar-hint">nur lokal</span>
        </div>
    );
}

export interface NavPreviewProps {
    ist: ReactNode;
    floors: ShutterFloorDef[];
    root: string;
    showPlanner: boolean;
    connected: boolean;
    banner: ReactNode;
    floorList: ReactNode;
    footer: ReactNode;
    sheet: ReactNode;
}

export default function NavPreview({
    ist,
    floors,
    root,
    showPlanner,
    connected,
    banner,
    floorList,
    footer,
    sheet,
}: NavPreviewProps) {
    const [choice, setChoice] = useDraftChoice();
    return (
        <>
            <DraftBar choice={choice} onChoose={setChoice} />
            {choice === 'IST' || !showPlanner ? (
                ist
            ) : (
                <DraftStack
                    draft={choice}
                    floors={floors}
                    root={root}
                    connected={connected}
                    banner={banner}
                    floorList={floorList}
                    footer={footer}
                    sheet={sheet}
                />
            )}
        </>
    );
}
