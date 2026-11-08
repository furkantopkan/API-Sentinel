export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 disabled:cursor-not-allowed';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-white',
  ghost: 'text-indigo-700 hover:bg-indigo-50 disabled:text-slate-300 disabled:hover:bg-transparent',
};

const DANGER = 'text-slate-400 hover:bg-red-50 hover:text-red-600';

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

/** The button look as classes, so links (e.g. downloads) can match real buttons. */
export function buttonClassName(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'sm',
  danger = false,
): string {
  return `${BASE} ${danger ? DANGER : VARIANTS[variant]} ${SIZES[size]}`;
}
