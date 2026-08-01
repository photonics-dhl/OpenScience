import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, redactSensitiveString, sanitizeValue } from '../src/logger';

function capture(): { stream: Writable; lines: () => string } {
  let buf = '';
  const stream = new Writable({ write(chunk, _enc, cb) { buf += String(chunk); cb(); } });
  return { stream, lines: () => buf };
}

describe('createLogger 脱敏（Spec §17 MUST）', () => {
  it('redact.paths：password/token/cookie 字段不落盘', () => {
    const { stream, lines } = capture();
    const log = createLogger({ destination: stream });
    log.info({ body: { password: 'secret-pw', code: '123456' }, req: { headers: { cookie: 'os_session=abc', authorization: 'Bearer x' } } }, 'login');
    const out = lines();
    expect(out).not.toContain('secret-pw');
    expect(out).not.toContain('os_session=abc');
    expect(out).toContain('[Redacted]');
  });

  it('兜底序列化：JWT/身份证/长 hex 样式字符串打码', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    expect(redactSensitiveString(`tok=${jwt}`)).not.toContain('SflKxw');
    expect(redactSensitiveString('id 11010119900307777X')).toBe('id [Redacted]');
    expect(redactSensitiveString('hex a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe('hex [Redacted]');
    expect(redactSensitiveString('hello world')).toBe('hello world');
  });

  it('sanitizeValue 递归处理嵌套对象与数组', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    const out = sanitizeValue({ a: [jwt, { b: '11010119900307777X' }], c: 1 }) as { a: unknown[]; c: number };
    expect(JSON.stringify(out)).not.toContain('SflKxw');
    expect(JSON.stringify(out)).not.toContain('11010119900307777X');
    expect(out.c).toBe(1);
  });

  it('日志行含 level/time/msg 基础字段', () => {
    const { stream, lines } = capture();
    createLogger({ destination: stream, level: 'debug' }).info('hello');
    const row = JSON.parse(lines()) as { level: number; msg: string; time: number };
    expect(row.msg).toBe('hello');
    expect(row.time).toBeTypeOf('number');
  });

  it('sanitizeValue：自引用对象不抛栈溢出，环处输出 [Circular]', () => {
    const obj: { a: number; self?: unknown } = { a: 1 };
    obj.self = obj;
    const out = sanitizeValue(obj) as { a: number; self: string };
    expect(out.a).toBe(1);
    expect(out.self).toBe('[Circular]');
    // 兄弟节点不误判：同一对象在不同分支出现不算环
    const shared = { x: 'hello' };
    const out2 = sanitizeValue({ p: shared, q: shared }) as { p: { x: string }; q: { x: string } };
    expect(out2.p.x).toBe('hello');
    expect(out2.q.x).toBe('hello');
    // 通过 logger 记录成环对象同样不抛
    const { stream, lines } = capture();
    const log = createLogger({ destination: stream });
    expect(() => log.info({ obj }, 'cycle')).not.toThrow();
    expect(lines()).toContain('[Circular]');
  });

  it('Error 实例直通：err 的 message/stack 不被掏空', () => {
    const { stream, lines } = capture();
    const log = createLogger({ destination: stream });
    log.error({ err: new Error('boom') }, 'failed');
    const out = lines();
    expect(out).toContain('boom');
    expect(out).toContain('at ');
    const row = JSON.parse(out) as { err: { message: string; stack: string } };
    expect(row.err.message).toBe('boom');
    expect(row.err.stack).toBeTruthy();
  });
});
