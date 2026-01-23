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
