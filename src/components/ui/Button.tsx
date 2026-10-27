import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'onImage';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  block?: boolean;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-app-accent text-[#14151a] hover:brightness-110',
  secondary: 'border border-app-line bg-app-surface text-app-ink hover:border-white/30',
  ghost: 'text-app-ink/80 hover:bg-white/5 hover:text-app-ink',
  onImage: 'border border-white/20 bg-black/45 text-white backdrop-blur-md hover:bg-black/60',
};

// Every size keeps a 44px touch target; sm only looks smaller.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-[13px]',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-[15px]',
};

export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  [
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block ? 'w-full' : '',
  ].join(' ');

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`${buttonClass(variant, size, block)} ${className || ''}`} {...props}>
      {icon}
      {children}
    </button>
  );
});

export default Button;
