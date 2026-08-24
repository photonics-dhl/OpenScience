import type { Metadata } from 'next';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';

import { ResearchIdentityPanel } from '@/components/auth/ResearchIdentityPanel';
import { SignupCodeForm } from '@/components/auth/SignupCodeForm';
import { IdentityShell } from '@/components/shell/IdentityShell';

export const metadata: Metadata = { title: 'Register · OpenScience' };

export default async function RegisterPage({ searchParams }: { searchParams?: { returnTo?: string } }) {
  const t = await getTranslations('auth');
  return (
    <IdentityShell
      context={<ResearchIdentityPanel eyebrow={t('identity.createEyebrow')} title={t('identity.createTitle')} description={t('identity.createDescription')} intent="create" tagline={t('identity.tagline')} />}
      mainClassName="justify-center"
      skipLabel={t('identity.skipToForm')}
    >
      <SignupCodeForm returnTo={searchParams?.returnTo} />
    </IdentityShell>
  );
}
