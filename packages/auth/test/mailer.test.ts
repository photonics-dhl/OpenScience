import { describe, expect, it, vi } from 'vitest';
import { DevOutboxMailer, SmtpMailer, type MailMessage } from '../src/mailer';

/**
 * P1A-9 Task 1：SmtpMailer QQ SMTP 真发（nodemailer 驱动）。
 * 测试 mock nodemailer transport：配置校验（缺 env 抛错）+ 真发路径。
 */

const SAMPLE: MailMessage = { to: 'a@example.com', subject: 'Hi', text: 'Body' };

describe('SmtpMailer', () => {
  it('缺 SMTP env → 构造抛错（快速失败）', () => {
    expect(() => new SmtpMailer({ host: '', port: 465, user: '', pass: '' })).toThrow(/SMTP_HOST/);
    expect(() => new SmtpMailer({ host: 'smtp.qq.com', port: 0, user: 'x@qq.com', pass: 'p' })).toThrow(/SMTP_PORT/);
    expect(() => new SmtpMailer({ host: 'smtp.qq.com', port: 465, user: '', pass: 'p' })).toThrow(/SMTP_USER/);
    expect(() => new SmtpMailer({ host: 'smtp.qq.com', port: 465, user: 'x@qq.com', pass: '' })).toThrow(/SMTP_PASS/);
  });

  it('send → nodemailer sendMail 真实投递（secure=465）', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['a@example.com'], rejected: [] });
    const transport = { sendMail };
    const mailer = new SmtpMailer({ host: 'smtp.qq.com', port: 465, user: 'x@qq.com', pass: 'auth-code' });
    // 注入 mock transport（避免真连 SMTP）
    (mailer as unknown as { transport: typeof transport }).transport = transport;
    await mailer.send(SAMPLE);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'x@qq.com',
      to: 'a@example.com',
      subject: 'Hi',
      text: 'Body',
    });
  });
});

describe('DevOutboxMailer', () => {
  it('写 mail_outbox 表（回归，outbox 通道保留）', async () => {
    const create = vi.fn().mockResolvedValue({});
    const mailer = new DevOutboxMailer({ mailOutbox: { create } } as never);
    await mailer.send(SAMPLE);
    expect(create).toHaveBeenCalledWith({
      data: { toEmail: 'a@example.com', subject: 'Hi', bodyText: 'Body', sentVia: 'outbox' },
    });
  });
});
