import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
    private readonly pushService: PushService,
  ) {}

  /**
   * FCM 토큰 등록 (upsert).
   * 동일 token이 이미 다른 userId로 저장돼 있으면 소유권 이전.
   */
  async registerFcmToken(
    userId: string,
    token: string,
    platform: string,
  ): Promise<void> {
    await this.fcmTokenRepository.upsert(
      { token, userId, platform },
      { conflictPaths: ['token'], skipUpdateIfNoValuesChanged: true },
    );
  }

  async deleteFcmToken(userId: string, token: string): Promise<void> {
    await this.fcmTokenRepository.delete({ token, userId });
  }

  async getTokensForUser(userId: string): Promise<string[]> {
    const rows = await this.fcmTokenRepository.find({ where: { userId } });
    return rows.map((r) => r.token);
  }

  /**
   * 알림 생성 헬퍼
   */
  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    targetId?: string | null;
    actorId?: string | null;
    actorNickname?: string | null;
  }): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      targetId: params.targetId ?? null,
      actorId: params.actorId ?? null,
      actorNickname: params.actorNickname ?? null,
    });
    const saved = await this.notificationRepository.save(notification);

    // DB 저장 후 푸시 발송 (실패해도 알림 흐름은 유지)
    void this.pushService.sendToUser(params.userId, {
      title: params.title,
      body: params.body,
      data: {
        notificationId: String(saved.id),
        type: params.type,
        targetId: params.targetId ?? '',
      },
    });

    return saved;
  }

  /**
   * 여러 명에게 동시에 알림 생성 (클럽 게임 생성 시 등)
   */
  async createBulk(
    userIds: string[],
    params: {
      type: NotificationType;
      title: string;
      body: string;
      targetId?: string | null;
      actorId?: string | null;
      actorNickname?: string | null;
    },
  ): Promise<void> {
    const notifications = userIds.map((userId) =>
      this.notificationRepository.create({
        userId,
        type: params.type,
        title: params.title,
        body: params.body,
        targetId: params.targetId ?? null,
        actorId: params.actorId ?? null,
        actorNickname: params.actorNickname ?? null,
      }),
    );
    await this.notificationRepository.save(notifications);

    void this.pushService.sendToUsers(userIds, {
      title: params.title,
      body: params.body,
      data: {
        type: params.type,
        targetId: params.targetId ?? '',
      },
    });
  }

  /**
   * 특정 유저의 알림 목록 (최신순)
   */
  async findByUser(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 읽지 않은 알림 수
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * 단건 읽음 처리
   */
  async markAsRead(id: number): Promise<void> {
    await this.notificationRepository.update(id, { isRead: true });
  }

  /**
   * 전체 읽음 처리
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }
}
