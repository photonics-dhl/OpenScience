import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HERMES_CONTEXT_ACTIONS,
  type HermesContextActionKey,
} from '../lib/hermes/context-menu-actions';

const en = JSON.parse(readFileSync(path.join(__dirname, '../messages/en.json'), 'utf8')) as Record<string, unknown>;
const zh = JSON.parse(readFileSync(path.join(__dirname, '../messages/zh.json'), 'utf8')) as Record<string, unknown>;

function readMessage(messages: Record<string, unknown>, key: string): string {
  let value: unknown = (messages.dashboard as Record<string, unknown>).hermes;
  for (const part of key.split('.')) {
    value = (value as Record<string, unknown>)[part];
  }
  return String(value);
}

const expected = [
  ['greet', 'ear-perk', '你来了，我也在。', 'Hello — I’m right here.'],
  ['encourage', 'happy-wiggle', '已经走到这里了，再往前一点。', 'You’ve come this far. Let’s take one more step.'],
  ['think', 'thinking-pause', '先停一下，我陪你把线索理顺。', 'Let’s pause and sort the clues together.'],
  ['listen', 'lamp-listen', '我在听，你慢慢说。', 'I’m listening. Take your time.'],
  ['stretch', 'stretch', '一起伸伸懒腰，肩膀放松一下。', 'Stretch with me — let your shoulders soften.'],
  ['rest', 'doze', '先歇一会，我替你守着这一页。', 'Rest a moment. I’ll keep your place.'],
  ['celebrate', 'milestone-dance', '这一步完成了，值得庆祝一下。', 'This step is done. Let’s celebrate it.'],
  ['read-together', 'read', '翻到这里了，我陪你再读一段。', 'We’re here. I’ll read the next passage with you.'],
  ['continue', 'return-dock', '回到刚才那一步，我们接着做。', 'Back to our last step — let’s continue.'],
  ['evidence', 'evidence-check', '这条结论先别过，和我核对证据。', 'Hold this conclusion — let’s check its evidence.'],
  ['sources', 'citation-trace', '沿着引用往回走，看看它从哪里来。', 'Let’s trace the citation back to its source.'],
  ['compare', 'compare', '把两个版本并排放好，我们看差异。', 'Let’s place the versions side by side and inspect the differences.'],
] as const satisfies ReadonlyArray<readonly [HermesContextActionKey, string, string, string]>;

describe('Hermes carried-tool action language', () => {
  it('locks every menu choice to its matching motion and one bilingual response', () => {
    expect(HERMES_CONTEXT_ACTIONS).toHaveLength(expected.length);

    for (const [key, motion, zhFeedback, enFeedback] of expected) {
      const item = HERMES_CONTEXT_ACTIONS.find((candidate) => candidate.key === key);
      expect(item, `missing ${key}`).toBeDefined();
      expect(item?.action, `${key} motion`).toBe(motion);
      expect(readMessage(zh, item!.feedbackKey), `${key} zh feedback`).toBe(zhFeedback);
      expect(readMessage(en, item!.feedbackKey), `${key} en feedback`).toBe(enFeedback);
    }
  });

  it('keeps action, label and feedback keys unique so selections cannot borrow another action response', () => {
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.action)).size).toBe(expected.length);
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.labelKey)).size).toBe(expected.length);
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.feedbackKey)).size).toBe(expected.length);
  });
});
