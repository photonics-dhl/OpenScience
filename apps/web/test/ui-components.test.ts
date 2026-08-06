import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge } from '../components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';

describe('shadcn/ui base components', () => {
  it('renders button, card, badge, and skeleton with meaningful variants', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'section',
        null,
        createElement(Button, { variant: 'outline' }, 'Open'),
        createElement(
          Card,
          { 'data-testid': 'card' },
          createElement(
            CardHeader,
            null,
            createElement(CardTitle, null, 'Research Object'),
          ),
          createElement(CardContent, null, 'Details'),
        ),
        createElement(Badge, { variant: 'destructive' }, 'Blocked'),
        createElement(Skeleton, { className: 'h-4 w-20' }),
      ),
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('border-border-subtle');
    expect(markup).toContain('>Open</button>');
    expect(markup).toContain('data-testid="card"');
    expect(markup).toContain('<h3');
    expect(markup).toContain('>Research Object</h3>');
    expect(markup).toContain('bg-accent-diff');
    expect(markup).toContain('>Blocked</div>');
    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('h-4 w-20');
  });
});
