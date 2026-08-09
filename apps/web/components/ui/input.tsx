import * as React from 'react';

import { cn } from '@/lib/utils';

/* 双表面（Task 8）：默认纸白；祖先 .surface-dark 切深色。 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-border-subtle bg-paper-bg px-3 py-2 text-sm text-ink placeholder:text-ink/50 transition-colors duration-(--motion-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 [.surface-dark_&]:bg-hero-surface [.surface-dark_&]:text-hero-text [.surface-dark_&]:placeholder:text-hero-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
