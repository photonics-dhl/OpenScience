import { describe, expect, it } from 'vitest';
import { createNativeIllustrationMaterializer } from '../src/native-agent/illustration-task';
import type { ChatMessage } from '@openscience/ai-gateway';

const claims = [{ id: '10000000-0000-4000-8000-000000000001', kind: 'finding', statement: 'A qualitative relation', assessment: 'supported',
  conditions: [], limitations: [], extractionStatus: 'succeeded', sourcePassages: [{ evidenceId: '20000000-0000-4000-8000-000000000001', relation: 'supports', text: 'Two regions are connected under the stated condition.' }] }];
const settings = { locale: 'en' as const, style: 'aged-academia', instruction: 'Explain the relation.', output: 'image' as const, narrative: true, narrativeSceneLimit: 1 };
const science = { title: 'Two regions', narrative: { mainMessage: 'A supported relation', audience: 'A new reader' }, scenes: [{
  title: 'A relation', narration: 'These regions are connected.', message: 'A conditional relation', domain: 'conceptual',
  subjects: [{ description: 'Connected regions', basis: { sourceId: 's0' } }], encoding: 'A link represents the relationship of subject 0.',
  labels: ['Connected regions'], constraints: ['Not to scale'], paperOriginalAssetId: null }] };
function fixture() {
  const input = { claims: claims as never, settings, paperOriginals: new Map(), narrativeSource: undefined };
  const tool = createNativeIllustrationMaterializer(input); const messages: ChatMessage[] = [];
  const invoke = (name: string, args: unknown, id: string) => {
    const result = tool.call(name, args, messages.length, id);
    messages.push({ role: 'assistant', content: '', toolCalls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      { role: 'tool', toolCallId: id, content: JSON.stringify(result) });
    return result;
  };
  const complete = () => {
    invoke('paper_illustration_science', science, 'science-call');
    invoke('paper_illustration_art', { scienceToolCallId: 'science-call', scenes: [{ layout: 'Put label 0 above subject 0.', treatment: 'Crisp ink on white paper.' }] }, 'art-call');
    invoke('paper_illustration_review', { planToolCallId: 'art-call', decision: 'accepted', summary: 'Sources, geometry and caption agree.', corrections: [], issues: [] }, 'review-call');
  };
  return { tool, messages, invoke, complete, restore: () => createNativeIllustrationMaterializer(input) };
}
describe('native illustration selects actual private tool history', () => {
  it('restores the exact reviewed plan and portable prompt without another model', () => {
    const f = fixture(); f.complete();
    const result = f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}');
    expect(result.review.decision).toBe('accepted');
    expect(result.document.scenes[0]!.illustration!.labels).toEqual(['Connected regions']);
    expect(result.prompts[0]!.prompt).toContain('Connected regions');
    expect(result.prompts[0]!.prompt).not.toContain('API');
  });
  it.each(['wrong-review', 'changed-receipt', 'changed-science', 'new-plan'] as const)('rejects %s without adopting or rendering', mode => {
    const f = fixture(); f.complete();
    if (mode === 'changed-receipt') f.messages[3]!.content = JSON.stringify({ status: 'art_ready', planToolCallId: 'forged' });
    if (mode === 'changed-science') f.messages[0]!.toolCalls![0]!.function.arguments = JSON.stringify({ ...science, title: 'An altered result' });
    if (mode === 'new-plan') f.invoke('paper_illustration_science', science, 'new-science');
    expect(() => f.restore().finish(f.messages, JSON.stringify({ reviewToolCallId: mode === 'wrong-review' ? 'science-call' : 'review-call' }))).toThrow(/Native|native/u);
  });
  it('returns repairable validation feedback without accepting unsupported source data', () => {
    const f = fixture(); const invalid = structuredClone(science); invalid.scenes[0]!.subjects[0]!.basis.sourceId = 'foreign';
    expect(f.invoke('paper_illustration_science', invalid, 'bad')).toMatchObject({ status: 'invalid_illustration', error: 'unknown_original_source' });
    f.complete(); expect(f.restore().finish(f.messages, '{"reviewToolCallId":"review-call"}').review.decision).toBe('accepted');
  });
});
