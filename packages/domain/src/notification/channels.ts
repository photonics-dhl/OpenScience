import type { WorkspaceDeps } from '../workspace/types';

/** 通知渠道抽象（§15/§16 + Q4）：站内为 MVP，邮件 §24 待确认——仅接口 + 占位，不写死。 */
export interface NotificationMessage {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface NotificationChannel {
  deliver(message: NotificationMessage): Promise<void>;
}

/** 站内渠道：写 Notification 行（§15 实体，已读状态）。 */
export class InAppChannel implements NotificationChannel {
  constructor(private readonly deps: WorkspaceDeps) {}

  async deliver(message: NotificationMessage): Promise<void> {
    await this.deps.prisma.notification.create({
      data: { userId: message.userId, type: message.type, payload: message.payload as never },
    });
  }
}

/**
 * 邮件渠道占位（§24 待确认：邮件通知是否需要）。接口预留，deliver 抛「未实现」——不写死渠道决策。
 */
export class EmailChannel implements NotificationChannel {
  async deliver(message: NotificationMessage): Promise<void> {
    // §24 待确认：邮件通知是否需要。接口预留，不写死渠道决策。message 待渠道决策后使用。
    void message;
    throw new Error('EMAIL_NOTIFICATION_NOT_IMPLEMENTED（§24 待确认）');
  }
}
