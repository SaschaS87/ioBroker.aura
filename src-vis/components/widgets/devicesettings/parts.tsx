import { IosGroup, IosPickRow } from '../../common/ios';

/** Auswahlliste, z. B. Automatisch / Hell / Dunkel. */
export function PickList<K extends string>({
    label,
    options,
    value,
    onPick,
    inert,
}: {
    label: string;
    options: { key: K; label: string }[];
    value: K;
    onPick: (key: K) => void;
    inert: boolean;
}) {
    return (
        <IosGroup>
            <div role="group" aria-label={label}>
                {options.map((o) => (
                    <IosPickRow
                        key={o.key}
                        label={o.label}
                        active={value === o.key}
                        disabled={inert}
                        onClick={() => onPick(o.key)}
                        attrs={{ 'data-pref': o.key }}
                    />
                ))}
            </div>
        </IosGroup>
    );
}
