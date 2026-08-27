import * as React from 'react';

import { cn } from '@/lib/utils';

interface OpenScienceWordmarkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  compact?: boolean;
  tone: 'dark' | 'paper';
}

function OpenScienceWordmark({
  className,
  compact = false,
  href = '/',
  tone,
  ...props
}: OpenScienceWordmarkProps) {
  return (
    <a
      aria-label="OpenScience home"
      className={cn(
        'inline-flex min-h-10 items-center rounded-control font-display text-lg font-semibold tracking-[-0.035em] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
        tone === 'dark'
          ? 'text-os-paper focus-visible:ring-offset-os-black-0'
          : 'text-os-ink focus-visible:ring-offset-os-paper',
        compact && 'text-xl tracking-[-0.06em]',
        className,
      )}
      href={href}
      {...props}
    >
      {compact ? 'O' : 'OpenScience'}
      <span className="text-os-vermilion" data-wordmark-stop="true" aria-hidden="true">.</span>
    </a>
  );
}

export { OpenScienceWordmark };
