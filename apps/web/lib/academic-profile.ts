import { apiRequest } from './api';

export type ProfileLink = { label: string; url: string };
export type ProfileWork = { category: string; period: string; shortTitle: string; summary: string; fullTitle: string; problem: string; contribution: string; process: string; outcome: string; capabilities: string[]; links: ProfileLink[] };
export type ProfileInterest = { title: string; body: string; kind: 'recruitment' | 'job_search' | 'hiring' | 'collaboration' | 'custom'; contact: string; active: boolean };
export type ProfileEducation = { title: string; details: string; url: string; stage: string; period: string; links: ProfileLink[] };
export type AcademicProfile = { avatar: string; name: string; englishName: string; title: string; institution: string; lab: string; bio: string; contactEmail: string; orcid: string; scholar: string; personalLinks: ProfileLink[]; works: ProfileWork[]; interests: ProfileInterest[]; materials: ProfileLink[]; cv: string; labUrl: string; teamLinks: ProfileLink[]; education: ProfileEducation[] };
export type OwnerAcademicProfile = { profile: AcademicProfile; version: number; published: boolean; userId: string; orcidVerified?: boolean; connectedOrcid?: string | null };
export type PublicAcademicProfile = { profile: AcademicProfile; orcidVerified?: boolean; publications: { title: string; publicId: string | null; publicVersionId: string; publishedAt: string }[] };
export const emptyWork = (): ProfileWork => ({ category: '', period: '', shortTitle: '', summary: '', fullTitle: '', problem: '', contribution: '', process: '', outcome: '', capabilities: [], links: [] });
export const emptyLink = (): ProfileLink => ({ label: '', url: '' });
export const getOwnAcademicProfile = () => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me', { cache: 'no-store' });
export const saveAcademicProfile = (input: { ownerId: string; expectedVersion: number; profile: AcademicProfile }) => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me', { method: 'PUT', body: JSON.stringify(input) });
export const publishAcademicProfile = (ownerId: string, version: number) => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me/publish', { method: 'POST', body: JSON.stringify({ ownerId, expectedVersion: version }) });
export const unpublishAcademicProfile = (ownerId: string, version: number) => apiRequest<{ published: false; version: number; userId: string }>('/api/academic-profile/me/unpublish', { method: 'POST', body: JSON.stringify({ ownerId, expectedVersion: version }) });
export const getPublicAcademicProfile = (userId: string) => apiRequest<PublicAcademicProfile>(`/api/academic-profile/${encodeURIComponent(userId)}`, { cache: 'no-store' });
