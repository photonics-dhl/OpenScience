import type { Metadata } from 'next';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';

import { LoginForm } from '@/components/auth/LoginForm';
import { ResearchIdentityPanel } from '@/components/auth/ResearchIdentityPanel';
import { IdentityShell } from '@/components/shell/IdentityShell';

export const metadata: Metadata = { title: 'Log in · OpenScience' };

export default async function LoginPage({ searchParams }: { searchParams?: { returnTo?: string } }) {
  const t = await getTranslations('auth');
  return (
    <IdentityShell
      className="surface-dark"
      context={<ResearchIdentityPanel eyebrow={t('identity.returnEyebrow')} title={t('identity.returnTitle')} description={t('identity.returnDescription')} intent="return" tagline={t('identity.tagline')} />}
      mainClassName="justify-center"
      skipLabel={t('identity.skipToForm')}
    >
      <LoginForm returnTo={searchParams?.returnTo} />
    </IdentityShell>
  );
}
