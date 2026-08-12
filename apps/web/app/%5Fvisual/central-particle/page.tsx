import type { Metadata } from 'next';
import * as React from 'react';

import { CentralParticlePrototype } from '@/components/optical-prototype/CentralParticlePrototype';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Central Particle Prototype — OpenScience',
};

export default function CentralParticleVisualRoute() {
  return <CentralParticlePrototype />;
}
