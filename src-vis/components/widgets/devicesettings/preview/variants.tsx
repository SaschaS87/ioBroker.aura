import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { DeviceThemeModel } from './previewModel';
import { ExampleRow, Footnote, Group, NavRow, PrefList, SubHeader } from './parts';

export interface VariantProps {
    model: DeviceThemeModel;
    inert: boolean;
    sample: boolean;
}

const BACK = 'Einstellungen';

// React 18 kennt das HTML-Attribut inert noch nicht in den Typen
const inertAttr = (on: boolean): Record<string, string> => (on ? { inert: '' } : {});

function Overview({
    model,
    sample,
    inert,
    onOpen,
    selected,
}: VariantProps & { onOpen?: () => void; selected?: boolean }) {
    return (
        <div className="ds-pv-page">
            <Group>
                <NavRow
                    label={model.title}
                    value={model.prefLabel}
                    onClick={onOpen}
                    selected={selected}
                    inert={inert}
                />
                {sample ? <ExampleRow /> : null}
            </Group>
        </div>
    );
}

function Detail({ model, inert, onBack }: { model: DeviceThemeModel; inert: boolean; onBack?: () => void }) {
    return (
        <div className="ds-pv-page">
            <SubHeader title={model.title} onBack={onBack} backLabel={BACK} />
            <PrefList model={model} inert={inert} />
            <Footnote model={model} />
        </div>
    );
}

function Slider({ p }: { p: VariantProps }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="ds-pv-stage">
            <div className={`ds-pv-slider${open ? ' is-open' : ''}`}>
                <div className="ds-pv-pane" aria-hidden={open} {...inertAttr(open)}>
                    <Overview {...p} onOpen={() => setOpen(true)} />
                </div>
                <div className="ds-pv-pane" aria-hidden={!open} {...inertAttr(!open)}>
                    <Detail model={p.model} inert={p.inert} onBack={() => setOpen(false)} />
                </div>
            </div>
        </div>
    );
}

/** A: Push wie beim iPhone. Übersicht, Tipp schiebt die Unterseite von rechts herein. */
export function VariantA(p: VariantProps) {
    return (
        <div className="ds-pv-root ds-pv-root--a" data-testid="device-settings">
            <Slider p={p} />
        </div>
    );
}

/** B: wie A, ab 640 px Breite links die Liste, rechts die Unterseite. */
export function VariantB(p: VariantProps) {
    return (
        <div className="ds-pv-root ds-pv-root--b" data-testid="device-settings">
            <div className="ds-pv-bcontainer">
                <div className="ds-pv-bnarrow">
                    <Slider p={p} />
                </div>
                <div className="ds-pv-bwide">
                    <div className="ds-pv-bleft">
                        <Overview {...p} selected />
                    </div>
                    <div className="ds-pv-bright">
                        <Detail model={p.model} inert={p.inert} />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** C: Inline-Aufklappen, die drei Zeilen erscheinen in derselben Karte. */
export function VariantC({ model, inert, sample }: VariantProps) {
    const [open, setOpen] = useState(false);
    return (
        <div className="ds-pv-root ds-pv-root--c" data-testid="device-settings">
            <div className="ds-pv-page">
                <Group>
                    <NavRow
                        label={model.title}
                        value={model.prefLabel}
                        onClick={() => setOpen((v) => !v)}
                        inert={inert}
                        chevronNode={
                            <ChevronRight
                                size={18}
                                className={`ds-pv-chev ds-pv-chev--turn${open ? ' is-open' : ''}`}
                            />
                        }
                    />
                    <div className={`ds-pv-fold${open ? ' is-open' : ''}`} aria-hidden={!open}>
                        <div className="ds-pv-fold-inner" {...inertAttr(!open)}>
                            <PrefList model={model} inert={inert} indent />
                        </div>
                    </div>
                    {sample ? <ExampleRow /> : null}
                </Group>
                <Footnote model={model} />
            </div>
        </div>
    );
}
