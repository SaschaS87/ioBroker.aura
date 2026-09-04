import React from 'react';

interface IconProps {
    size?: number;
    className?: string;
}

/**
 * Arrow-To-Top-Icon: waagerechter Balken oben, Pfeil nach oben
 */
export const ArrowToTopIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={className}
        aria-hidden="true"
    >
        <line x1="4" y1="4" x2="20" y2="4" />
        <line x1="12" y1="20" x2="12" y2="9" />
        <polyline points="7,14 12,9 17,14" />
    </svg>
);

/**
 * Arrow-To-Bottom-Icon: waagerechter Balken unten, Pfeil nach unten
 */
export const ArrowToBottomIcon: React.FC<IconProps> = ({ size = 18, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={className}
        aria-hidden="true"
    >
        <line x1="4" y1="20" x2="20" y2="20" />
        <line x1="12" y1="4" x2="12" y2="15" />
        <polyline points="7,10 12,15 17,10" />
    </svg>
);
