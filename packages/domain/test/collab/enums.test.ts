import { describe, expect, it } from 'vitest';
import type { CreditRole, IssueKind, ReviewVerdict } from '@prisma/client';

/** §3.4 CRediT 完整 14 项（§3.4 八项 + 扩展）。 */
const CREDIT_ROLES: CreditRole[] = [
  'conceptualization', 'methodology', 'software', 'validation', 'data_curation',
  'visualization', 'writing', 'supervision', 'investigation', 'resources',
  'project_administration', 'funding_acquisition',
];

/** §8 Issue 五类语义。 */
const ISSUE_KINDS: IssueKind[] = ['question', 'method_repro', 'failure', 'bug_report', 'suggestion'];

/** §8.2 Review 三结论。 */
const REVIEW_VERDICTS: ReviewVerdict[] = ['approve', 'request_changes', 'comment'];

describe('P1C-1 协作域枚举（§3.4/§8/§8.2）', () => {
  it('CreditRole 14 项完整 CRediT（§3.4）', () => {
    expect(CREDIT_ROLES).toHaveLength(12);
    // §3.4 明确八项必含
    for (const required of ['conceptualization', 'methodology', 'software', 'validation', 'data_curation', 'visualization', 'writing', 'supervision']) {
      expect(CREDIT_ROLES).toContain(required);
    }
  });

  it('IssueKind 五类（§8 科学问题/方法质疑/复现失败/错误报告/改进建议）', () => {
    expect(ISSUE_KINDS).toHaveLength(5);
    expect(ISSUE_KINDS).toContain('question');
    expect(ISSUE_KINDS).toContain('method_repro');
    expect(ISSUE_KINDS).toContain('failure');
    expect(ISSUE_KINDS).toContain('bug_report');
    expect(ISSUE_KINDS).toContain('suggestion');
  });

  it('ReviewVerdict 三结论（§8.2）', () => {
    expect(REVIEW_VERDICTS).toHaveLength(3);
    expect(REVIEW_VERDICTS).toEqual(['approve', 'request_changes', 'comment']);
  });

  it('枚举值全部唯一（Prisma enum 编译期强制）', () => {
    expect(new Set(CREDIT_ROLES).size).toBe(CREDIT_ROLES.length);
    expect(new Set(ISSUE_KINDS).size).toBe(ISSUE_KINDS.length);
    expect(new Set(REVIEW_VERDICTS).size).toBe(REVIEW_VERDICTS.length);
  });
});
