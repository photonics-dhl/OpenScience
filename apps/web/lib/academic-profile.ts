import { apiRequest } from './api';

export type ProfileLink = { label: string; url: string };
export type ProfileWork = { category: string; period: string; shortTitle: string; summary: string; fullTitle: string; problem: string; contribution: string; process: string; links: ProfileLink[] };
export type AcademicProfile = { avatar: string; name: string; englishName: string; title: string; institution: string; lab: string; bio: string; contactEmail: string; orcid: string; scholar: string; works: ProfileWork[]; interests: { title: string; body: string }[]; materials: ProfileLink[]; cv: string; labUrl: string; education: { title: string; details: string; url: string }[] };
export type OwnerAcademicProfile = { profile: AcademicProfile; version: number; published: boolean; userId: string };
export type PublicAcademicProfile = { profile: AcademicProfile; publications: { title: string; publicId: string | null; publicVersionId: string; publishedAt: string }[] };
export const emptyWork = (): ProfileWork => ({ category: '', period: '', shortTitle: '', summary: '', fullTitle: '', problem: '', contribution: '', process: '', links: [] });
export const emptyLink = (): ProfileLink => ({ label: '', url: '' });
export const getOwnAcademicProfile = () => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me', { cache: 'no-store' });
export const saveAcademicProfile = (input: { ownerId: string; expectedVersion: number; profile: AcademicProfile }) => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me', { method: 'PUT', body: JSON.stringify(input) });
export const publishAcademicProfile = (ownerId: string, version: number) => apiRequest<OwnerAcademicProfile>('/api/academic-profile/me/publish', { method: 'POST', body: JSON.stringify({ ownerId, expectedVersion: version }) });
export const unpublishAcademicProfile = (ownerId: string, version: number) => apiRequest<{ published: false; version: number; userId: string }>('/api/academic-profile/me/unpublish', { method: 'POST', body: JSON.stringify({ ownerId, expectedVersion: version }) });
export const getPublicAcademicProfile = (userId: string) => apiRequest<PublicAcademicProfile>(`/api/academic-profile/${encodeURIComponent(userId)}`, { cache: 'no-store' });
