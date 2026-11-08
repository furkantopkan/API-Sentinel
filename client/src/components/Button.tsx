import type { ButtonHTMLAttributes } from 'react';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonStyles';

/**
 * The app's single button style, in three variants:
 * - primary:   the main action of an area (Generate, Send-like actions)
 * - secondary: other actions with a visible frame (Copy, Add, Edit)
 * - ghost:     low-emphasis actions without a frame ("+ Add …", Expand all)
 * `danger` turns a ghost button red on hover, for remove (✕) buttons.
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
  return (
    <button
      // Default "button", not the browser's "submit": a button inside a form must not send it.
      type={type}
      className={`${buttonClassName(variant, size, danger)} ${className}`}
      {...rest}
    />
  );
}
