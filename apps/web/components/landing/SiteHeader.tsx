'use client';

import { ProductRouteNavigation, type ProductRouteId } from '@/components/navigation/ProductRouteNavigation';
import { ProductHeaderActions } from '@/components/navigation/ProductHeaderActions';

interface SiteHeaderProps {
  active?: ProductRouteId;
  context?: 'landing' | 'public-product';
  tone?: 'dark' | 'paper';
}

export default function SiteHeader({ active, tone = 'dark' }: SiteHeaderProps) {
  return <ProductRouteNavigation active={active} tone={tone} />;
}
export function PublicProductAccess({ tone = 'paper' }: { tone?: 'dark' | 'paper' }) {
  return <ProductHeaderActions tone={tone} />;
}
