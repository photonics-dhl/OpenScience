'use client';

import { OpticalLabRenderer } from './OpticalLabRenderer';

export interface OpticalLabClientMountProps {
  diagnosticsId: string;
  stageId: string;
}

export function OpticalLabClientMount(props: OpticalLabClientMountProps) {
  return <OpticalLabRenderer {...props} />;
}
