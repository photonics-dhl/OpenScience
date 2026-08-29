import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WankoCarrierScene } from '@/components/hermes/WankoCarrierScene';

describe('Wanko carrier scene', () => {
  it('renders one native Live2D character without pasted carrier art', () => {
    const html = renderToStaticMarkup(
      <WankoCarrierScene>
        <canvas data-live2d-instance="wanko" />
      </WankoCarrierScene>,
    );

    expect(html.match(/data-hermes-carrier=/g)).toHaveLength(1);
    expect(html.match(/data-live2d-instance=/g)).toHaveLength(1);
    expect(html.match(/data-hermes-carrier-travel-hull=/g)).toHaveLength(1);
    expect(html.match(/data-hermes-carrier-interaction-hull=/g)).toHaveLength(1);
    expect(html).not.toMatch(/<img|<picture|carrier-required-asset|carrier-(?:rear|front|brand|vapor|glow|shadow|navigation)|poster\.png/);
  });
});
