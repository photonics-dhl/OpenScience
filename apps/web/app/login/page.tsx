import AuthShell from '../../components/auth/AuthShell';
import LoginForm from '../../components/auth/LoginForm';
import { safeNextPath } from '../../lib/auth';
import { getTranslations } from 'next-intl/server';

export default async function LoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  const t = await getTranslations('auth');
  const nextPath = safeNextPath(searchParams?.next, '/dashboard');
  return <AuthShell eyebrow={t('page.login.eyebrow')} title={t('page.login.title')} description={t('page.login.description')} modeLabel={t('mode')} homeLabel={t('home')} principlesLabel={t('principles.label')} principles={[t('principles.invite'), t('principles.traceable'), t('principles.history')]}><LoginForm nextPath={nextPath} /></AuthShell>;
}
