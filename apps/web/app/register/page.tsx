import AuthShell from '../../components/auth/AuthShell';
import RegisterForm from '../../components/auth/RegisterForm';
import { safeNextPath } from '../../lib/auth';
import { getTranslations } from 'next-intl/server';

export default async function RegisterPage({ searchParams }: { searchParams?: { next?: string } }) {
  const t = await getTranslations('auth');
  const nextPath = safeNextPath(searchParams?.next, '/research-objects/new');
  return <AuthShell eyebrow={t('page.register.eyebrow')} title={t('page.register.title')} description={t('page.register.description')} modeLabel={t('mode')} homeLabel={t('home')} principlesLabel={t('principles.label')} principles={[t('principles.invite'), t('principles.traceable'), t('principles.history')]}><RegisterForm nextPath={nextPath} /></AuthShell>;
}
