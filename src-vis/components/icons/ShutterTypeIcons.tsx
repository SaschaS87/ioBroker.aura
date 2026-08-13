import React from 'react';

interface IconProps {
    size?: number;
    className?: string;
}

/**
 * Fenster-Icon: aufrechtes Rechteck mit Kreuz (Sprossenfenster)
 */
export const WindowIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
);

/**
 * Dachfenster-Icon: Parallelogramm-artig mit Dachschräge und einer Quersprosse.
 * Unterscheidet sich klar vom normalen Fenster durch die schiefe Form.
 */
export const RoofWindowIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <polygon points="4,16 6,4 18,4 20,16" />
        <line x1="6" y1="10" x2="18" y2="10" />
    </svg>
);

/**
 * Raffstore-Icon: Rechteck mit 3–4 waagerechten Lamellenlinien.
 */
export const RaffstoreIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
);
