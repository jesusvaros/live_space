import React from 'react';

type IconProps = {
  className?: string;
  size?: number;
};

const baseProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconCalendar: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const IconMap: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M12 21s6-6.5 6-11a6 6 0 0 0-12 0c0 4.5 6 11 6 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconLocate: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const IconMic: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

// A pennant: festivals, next to the mic (artists) and the pin (venues).
export const IconFlag: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconUser: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4 20c1.6-3.6 5-5 8-5s6.4 1.4 8 5" />
  </svg>
);

export const IconPlay: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M8 6l10 6-10 6z" />
  </svg>
);

export const IconHeart: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20z" />
  </svg>
);

export const IconHeartFilled: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
  >
    <path d="M12 20s-7-4.6-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.4 12 20 12 20z" />
  </svg>
);

export const IconBookmark: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.8L6 20V5a1 1 0 0 1 1-1z" />
  </svg>
);

export const IconBookmarkFilled: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
  >
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.8L6 20V5a1 1 0 0 1 1-1z" />
  </svg>
);

export const IconTicket: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M3 9.5a2.5 2.5 0 0 0 0 5v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2.5 2.5 0 0 1 0-5v-3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v3z" />
    <path d="M9 7v10" />
  </svg>
);

export const IconCheckCircle: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

export const IconShare: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M16 6l-8 4 8 4" />
    <circle cx="17.5" cy="6" r="2.5" />
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="18" r="2.5" />
  </svg>
);

export const IconEdit: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5l4 4L8 20l-5 1 1-5 12.5-12.5z" />
  </svg>
);

export const IconLogout: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const IconCopy: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <rect x="5" y="5" width="10" height="10" rx="2" />
  </svg>
);

export const IconBell: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const IconChevronLeft: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const IconChevronDown: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconChevronUp: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

export const IconBriefcase: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

export const IconQrCode: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3M21 14h-3M14 17h3M14 21h3M21 17v4" />
  </svg>
);

export const IconCompass: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9.5l-1.3 3.7-3.7 1.3 1.3-3.7 3.7-1.3z" />
    <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" />
  </svg>
);

export const IconExpand: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M15 4h5v5M9 20H4v-5M20 9V4h-5M4 15v5h5" />
  </svg>
);

export const IconFilters: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
);

export const IconChevronRight: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export const IconSettings: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

export const IconBlock: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </svg>
);

export const IconShield: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
  </svg>
);

export const IconDocument: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

export const IconInfo: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const IconEyeOff: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10 10 0 0112 5c5 0 9 4.5 10 7a13 13 0 01-2.6 3.6M6.3 6.3C4 7.8 2.6 10 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.5 4.4-1.2" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </svg>
);

export const IconTrash: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3" />
  </svg>
);

export const IconMore: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const IconEye: React.FC<IconProps> = ({ className, size = 20 }) => (
  <svg {...baseProps(size)} className={className}>
    <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
