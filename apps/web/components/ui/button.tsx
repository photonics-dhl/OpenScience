import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/* 双表面机制（Task 8，spec §3.1）：默认纸白（公开 RO）；祖先挂 .surface-dark 即切换深色（landing/工作台），
   覆盖用 Tailwind 任意变体 [.surface-dark_&]:，server-safe、无 JS、无 prop drilling。 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-(--motion-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper-bg [.surface-dark_&]:focus-visible:ring-offset-hero-bg disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent-primary-strong text-os-black-0 hover:bg-accent-primary',
        // accent-diff 仅表 diff（spec §3 红线），危险操作用 state-danger
        destructive: 'bg-state-danger text-hero-text hover:bg-state-danger/90',
        outline:
          'border border-border-subtle bg-transparent text-ink hover:bg-canvas-bg [.surface-dark_&]:text-hero-text [.surface-dark_&]:hover:bg-hero-surface',
        secondary:
          'bg-canvas-bg text-ink hover:bg-border-subtle [.surface-dark_&]:bg-hero-surface [.surface-dark_&]:text-hero-text [.surface-dark_&]:hover:bg-hero-bg',
        ghost:
          'text-ink hover:bg-canvas-bg [.surface-dark_&]:text-hero-text [.surface-dark_&]:hover:bg-hero-surface',
        link: 'text-state-danger underline-offset-4 hover:underline [.surface-dark_&]:text-accent-primary-strong',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
