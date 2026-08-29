import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveWankoPerformance } from '../lib/hermes/action-catalog';
import {
  HERMES_CONTEXT_ACTIONS,
  resolveHermesActionFeedback,
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
  ['greet', 'ear-perk'],
  ['encourage', 'happy-wiggle'],
  ['think', 'thinking-pause'],
  ['listen', 'lamp-listen'],
  ['stretch', 'stretch'],
  ['rest', 'doze'],
  ['celebrate', 'milestone-dance'],
  ['read-together', 'read'],
  ['continue', 'return-dock'],
  ['evidence', 'evidence-check'],
  ['sources', 'citation-trace'],
  ['compare', 'compare'],
] as const satisfies ReadonlyArray<readonly [HermesContextActionKey, string]>;

describe('Hermes carried-tool action language', () => {
  it('locks every menu choice to its matching motion and a bilingual response pool', () => {
    expect(HERMES_CONTEXT_ACTIONS).toHaveLength(expected.length);

    for (const [key, motion] of expected) {
      const item = HERMES_CONTEXT_ACTIONS.find((candidate) => candidate.key === key);
      expect(item, `missing ${key}`).toBeDefined();
      expect(item?.action, `${key} motion`).toBe(motion);
      const performance = resolveWankoPerformance(item!.action, 19);
      expect(Boolean(performance.motion) || Object.keys(performance.parameters).length >= 2,
        `${key} must produce a visible Wanko performance`).toBe(true);
      expect(item!.feedbackKeys.length, `${key} response variety`).toBeGreaterThanOrEqual(3);
      for (const messageKey of item!.feedbackKeys) {
        expect(readMessage(zh, messageKey).trim().length, `${key} zh feedback`).toBeGreaterThan(0);
        expect(readMessage(en, messageKey).trim().length, `${key} en feedback`).toBeGreaterThan(0);
      }
    }
  });

  it('does not repeat the previous line when the same action is selected again', () => {
    for (const item of HERMES_CONTEXT_ACTIONS) {
      const first = resolveHermesActionFeedback(item, 17, null);
      const second = resolveHermesActionFeedback(item, 17, first.messageKey);
      expect(second.action, item.key).toBe(item.action);
      expect(second.speechDelayMs, `${item.key} reaction lead`).toBe(item.group === 'companion' ? 520 : 320);
      expect(second.messageKey, item.key).not.toBe(first.messageKey);
      expect(item.feedbackKeys, item.key).toContain(second.messageKey);
    }
  });

  it('uses the full response pool across seeded selections', () => {
    for (const item of HERMES_CONTEXT_ACTIONS) {
      const selected = new Set(Array.from({ length: 24 }, (_, seed) => resolveHermesActionFeedback(item, seed, null).messageKey));
      expect(selected.size, item.key).toBe(item.feedbackKeys.length);
    }
  });

  it('keeps action, label and response pools unique so selections cannot borrow another action response', () => {
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.action)).size).toBe(expected.length);
    expect(new Set(HERMES_CONTEXT_ACTIONS.map((item) => item.labelKey)).size).toBe(expected.length);
    const feedbackKeys = HERMES_CONTEXT_ACTIONS.flatMap((item) => item.feedbackKeys);
    expect(new Set(feedbackKeys).size).toBe(feedbackKeys.length);
  });
});
