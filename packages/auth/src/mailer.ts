import type { PrismaClient } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';

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

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * QQ SMTP 真发（P1A-9 §3，用户确认：.env 已有 QQ 邮箱 SMTP 配置）。
 * nodemailer createTransport，secure=465（SSL）。构造时校验缺 env 快速失败——
 * 生产缺 SMTP 配置宁可起不来也不静默吞邮件（P1A-3 设计意图保持）。
 */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(cfg: SmtpConfig) {
    if (!cfg.host) throw new Error('SMTP_HOST is required for SmtpMailer');
    if (!cfg.port) throw new Error('SMTP_PORT is required for SmtpMailer');
    if (!cfg.user) throw new Error('SMTP_USER is required for SmtpMailer');
    if (!cfg.pass) throw new Error('SMTP_PASS is required for SmtpMailer');
    this.from = cfg.user;
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465, // QQ SMTP SSL 端口
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
