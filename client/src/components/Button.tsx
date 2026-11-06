import type { ButtonHTMLAttributes } from 'react';

/**
 * The app's single button style, in three variants:
 * - primary:   the main action of an area (Generate, Send-like actions)
 * - secondary: other actions with a visible frame (Copy, Add, Edit)
 * - ghost:     low-emphasis actions without a frame ("+ Add …", Expand all)
 * `danger` turns a ghost button red on hover, for remove (✕) buttons.
 */
type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 disabled:cursor-not-allowed';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white',
  ghost: 'text-indigo-700 hover:bg-indigo-50 disabled:text-slate-300 disabled:hover:bg-transparent',
};

const DANGER = 'text-slate-400 hover:bg-red-50 hover:text-red-600';

const SIZES: Record<Size, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  danger?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  danger = false,
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  const color = danger ? DANGER : VARIANTS[variant];
  return (
    <button
      // Default "button", not the browser's "submit": a button inside a form must not send it.
      type={type}
      className={`${BASE} ${color} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
