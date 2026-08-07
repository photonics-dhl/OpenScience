import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge } from '../components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';

describe('shadcn/ui base components', () => {
  it('renders button, card, badge, input, and skeleton with meaningful variants', () => {
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
            createElement(CardDescription, null, 'Latest version'),
          ),
          createElement(CardContent, null, 'Details'),
        ),
        createElement(Badge, { variant: 'destructive' }, 'Blocked'),
        createElement(Input, { placeholder: 'Search' }),
        createElement(Skeleton, { className: 'h-4 w-20' }),
      ),
    );

    expect(markup).toContain('<button');
    expect(markup).toContain('border-border-subtle');
    expect(markup).toContain('>Open</button>');
    expect(markup).toContain('data-testid="card"');
    expect(markup).toContain('<h3');
    expect(markup).toContain('>Research Object</h3>');
    // Task 8：destructive 用 state-danger，accent-diff 仅表 diff（spec §3 红线）
    expect(markup).toContain('bg-state-danger');
    expect(markup).not.toContain('bg-accent-diff');
    expect(markup).toContain('>Blocked</div>');
    expect(markup).toContain('<input');
    expect(markup).toContain('placeholder="Search"');
    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('h-4 w-20');
  });

  it('switches to dark surface via .surface-dark ancestor (Task 8)', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'div',
        { className: 'surface-dark' },
        createElement(Button, { variant: 'ghost' }, 'Menu'),
        createElement(Button, { variant: 'secondary' }, 'Save'),
        createElement(
          Card,
          null,
          createElement(CardDescription, null, 'muted'),
        ),
        createElement(Badge, { variant: 'secondary' }, 'v0.2'),
        createElement(Input, { placeholder: 'Filter' }),
      ),
    );

    // 每个原语都带 [.surface-dark_&] 暗表面覆盖类（server markup 中 & 转义为 &amp;）
    expect(markup).toContain('class="surface-dark"');
    expect(markup).toContain('[.surface-dark_&amp;]:bg-hero-surface');
    expect(markup).toContain('[.surface-dark_&amp;]:text-hero-text');
    expect(markup).toContain('[.surface-dark_&amp;]:text-hero-muted');
    expect(markup).toContain('[.surface-dark_&amp;]:placeholder:text-hero-muted');
  });
});
