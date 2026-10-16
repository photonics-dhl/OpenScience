import type { HTMLAttributes } from 'react';
import { parseReadableSdfCore, SDF_READABLE_CORE_VERSION, type SdfField } from '@openscience/sdf-schema';
import { ScientificText } from './ScientificText';
import { ScientificMarkdown } from './ScientificMarkdown';

/** Interpret only the selected snapshot's explicit, validated representation. */
export function SdfFieldContent({ core, field, fallback = '', ...props }: {
  core: unknown;
  field: SdfField;
  fallback?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const values = core && typeof core === 'object' && !Array.isArray(core) ? core as Record<string, unknown> : {};
  const body = typeof values[field] === 'string' && values[field] ? values[field] as string : fallback;
  const parsed = parseReadableSdfCore(core);
  const markdown = parsed?.schemaVersion === SDF_READABLE_CORE_VERSION && parsed.fieldFormats?.[field] === 'markdown';
  return <div {...props} data-sdf-format={markdown ? 'markdown' : 'plain'}>
    {markdown ? <ScientificMarkdown body={body} hideSourceMarkers /> : <ScientificText as="p" hideSourceMarkers>{body}</ScientificText>}
  </div>;
}
