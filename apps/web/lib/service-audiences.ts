export const SERVICE_AUDIENCES = ['researchers', 'journals', 'institutions', 'industry', 'investors'] as const;
export type ServiceAudience = typeof SERVICE_AUDIENCES[number];

export const RESEARCHER_ACTIONS = [
  { id: 'profile', href: '/me' },
  { id: 'published', href: '/research-objects/new?type=published' },
  { id: 'preprint', href: '/research-objects/new?type=preprint' },
  { id: 'explore', href: '/explore' },
] as const;
