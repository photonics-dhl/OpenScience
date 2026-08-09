import AuthShell from '../../components/auth/AuthShell';
import VerifyEmailForm from '../../components/auth/VerifyEmailForm';
import { safeNextPath } from '../../lib/auth';
import { getTranslations } from 'next-intl/server';

export default async function VerifyEmailPage({ searchParams }: { searchParams?: { email?: string; next?: string } }) {
  const t = await getTranslations('auth');
  const email = searchParams?.email ?? '';
  const nextPath = safeNextPath(searchParams?.next, '/dashboard');
  return <AuthShell eyebrow={t('page.verify.eyebrow')} title={t('page.verify.title')} description={t('page.verify.description')} modeLabel={t('mode')} homeLabel={t('home')} principlesLabel={t('principles.label')} principles={[t('principles.invite'), t('principles.traceable'), t('principles.history')]}><VerifyEmailForm email={email} nextPath={nextPath} /></AuthShell>;
}
