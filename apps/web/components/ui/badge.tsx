import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/* 双表面机制（Task 8）：默认纸白；祖先挂 .surface-dark 切换深色。destructive 用 state-danger，
   accent-diff 仅表 diff（spec §3 红线）。 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-(--motion-fast) ease-standard focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-paper-bg [.surface-dark_&]:focus:ring-offset-hero-bg',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-primary-strong text-os-black-0',
        secondary:
          'border-transparent bg-canvas-bg text-ink [.surface-dark_&]:bg-hero-surface [.surface-dark_&]:text-hero-muted',
        destructive: 'border-transparent bg-state-danger text-hero-text',
        outline: 'text-ink [.surface-dark_&]:text-hero-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
