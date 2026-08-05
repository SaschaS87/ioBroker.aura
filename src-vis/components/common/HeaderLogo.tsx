import auraLogo from '../../assets/aura-header-logo.png';

export function HeaderLogo() {
    return (
        <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
            }}
        >
            <img
                src={auraLogo}
                alt="Aura"
                className="w-8 h-8 object-contain"
                draggable={false}
            />
        </div>
    );
}
