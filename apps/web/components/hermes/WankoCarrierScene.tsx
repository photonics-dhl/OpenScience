import * as React from 'react';
import type { ReactNode } from 'react';

export interface WankoCarrierSceneProps {
  children: ReactNode;
}

export function WankoCarrierScene({ children }: WankoCarrierSceneProps) {
  return (
    <span className="hermes-wanko-carrier" data-hermes-carrier="true">
      <span className="hermes-carrier-interaction-hull" data-hermes-carrier-interaction-hull="true">
        {children}
      </span>
      <span aria-hidden="true" className="hermes-carrier-travel-hull" data-hermes-carrier-travel-hull="true" />
    </span>
  );
}
