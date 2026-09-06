import * as React from 'react';

import { cn } from '@/lib/utils';
import { ProductRouteNavigation } from '@/components/navigation/ProductRouteNavigation';
import { ShellHeader, SkipLink } from './ShellPrimitives';
import styles from '../auth/Identity.module.css';

interface IdentityShellProps extends React.HTMLAttributes<HTMLDivElement> {
  context?: React.ReactNode;
  mainClassName?: string;
  navigationLabel?: string;
  skipLabel: string;
}

function IdentityShell({ children, className, context, mainClassName, navigationLabel, skipLabel, ...props }: IdentityShellProps) {
  return (
    <div className={cn('surface-folio min-h-dvh', styles.shell, className)} data-os-surface="identity" {...props}>
      <SkipLink tone="paper">{skipLabel}</SkipLink>
      <ShellHeader actions={<ProductRouteNavigation variant="identity" />} navigationLabel={navigationLabel} tone="paper" wrapActionsOnMobile />
      <div className={styles.layout}>
        <main className={cn(styles.main, mainClassName)} id="main-content" tabIndex={-1}>
          <div className="w-full">{children}</div>
        </main>
        {context ? <aside className={styles.context}>{context}</aside> : null}
      </div>
    </div>
  );
}

export { IdentityShell };
