import * as React from 'react';

import { cn } from '@/lib/utils';
import { ProductRouteNavigation } from '@/components/navigation/ProductRouteNavigation';
import { ProductHeaderActions } from '@/components/navigation/ProductHeaderActions';
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
      <ShellHeader actions={<ProductRouteNavigation variant="identity" />} utilities={<ProductHeaderActions />} navigationLabel={navigationLabel} tone="paper" wrapActionsOnMobile />
      <div className={styles.layout}>
        <main className={cn(styles.main, mainClassName)} id="main-content" tabIndex={-1}>
          <div className="w-full" data-hermes-protected="true">{children}</div>
        </main>
        {context ? <aside className={styles.context}>{context}</aside> : null}
      </div>
    </div>
  );
}

export { IdentityShell };
