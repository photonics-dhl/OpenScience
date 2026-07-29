import type { PrismaClient } from '@prisma/client';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** dev 捕获通道：写 mail_outbox 表（兼作测试钩子）。 */
export class DevOutboxMailer implements Mailer {
  constructor(private readonly prisma: PrismaClient) {}

  async send(message: MailMessage): Promise<void> {
    await this.prisma.mailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, bodyText: message.text, sentVia: 'outbox' },
    });
  }
}

/** §24 邮件服务商未定：配置位预留，调用即抛错，不静默。 */
export class SmtpMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error('SmtpMailer is reserved but not configured yet (Spec §24 pending)');
  }
}
