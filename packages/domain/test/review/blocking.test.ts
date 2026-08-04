import { describe, expect, it } from 'vitest';
import {
  checkCoreCompleteness, checkMaliciousArtifact, checkSensitiveContent, checkProhibitedContent,
} from '../../src/review/blocking';

const FULL_CORE = {
  schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP',
};

describe('§11.1 硬阻断纯函数', () => {
  it('阻断1 缺字段：六字段完整放行，缺一拒绝', () => {
    expect(checkCoreCompleteness(FULL_CORE)).toBeNull();
    expect(checkCoreCompleteness({ ...FULL_CORE, method: '' })).toMatchObject({ code: 'missing_fields' });
    expect(checkCoreCompleteness({ ...FULL_CORE, insight: undefined })).toMatchObject({ code: 'missing_fields' });
  });

  it('阻断2 恶意代码：危险扩展名/MIME 拒绝，正常放行', () => {
    expect(checkMaliciousArtifact('data/run.sh', 'text/plain')).toMatchObject({ code: 'dangerous_extension' });
    expect(checkMaliciousArtifact('tool.exe', 'application/octet-stream')).toMatchObject({ code: 'dangerous_extension' });
    expect(checkMaliciousArtifact('a.bin', 'application/x-executable')).toMatchObject({ code: 'dangerous_mime' });
    expect(checkMaliciousArtifact('paper.md', 'text/markdown')).toBeNull();
  });

  it('阻断3 隐私泄露：身份证/密钥/令牌拒绝，普通文本放行', () => {
    expect(checkSensitiveContent('我的身份证 110105199003071234 如下')).toMatchObject({ code: 'sensitive_leak' });
    expect(checkSensitiveContent('key = AKIAIOSFODNN7EXAMPLE')).toMatchObject({ code: 'sensitive_leak' });
    expect(checkSensitiveContent('这是一段普通科研描述')).toBeNull();
  });

  it('阻断4 违法/禁止内容：关键词拒绝', () => {
    expect(checkProhibitedContent('这里教你攻击方法的文章')).toMatchObject({ code: 'prohibited_content' });
    expect(checkProhibitedContent('量子计算研究')).toBeNull();
  });
});
