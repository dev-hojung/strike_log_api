import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group, SubscriptionStatus } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * 클럽 체험판 만료 알림 스케줄러.
 * 매일 오전 9시(서버 TZ)에 실행되어 D-3 / D-1 / 만료 알림을 전송한다.
 * 중복 발송 방지를 위해 group 엔티티의 `reminder_*_sent` 플래그를 사용한다.
 */
@Injectable()
export class TrialReminderService {
  private readonly logger = new Logger(TrialReminderService.name);
  private static readonly MS_PER_DAY = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDailyReminders() {
    await this.run();
  }

  /**
   * 테스트/수동 호출용 진입점. cron 외부에서도 재사용 가능.
   */
  async run() {
    const trialGroups = await this.groupRepository.find({
      where: { subscription_status: SubscriptionStatus.TRIAL },
    });

    const now = Date.now();
    this.logger.log(`[TrialReminder] scanning ${trialGroups.length} trial groups`);

    for (const group of trialGroups) {
      if (!group.trial_expires_at) continue;
      const expiresTs = group.trial_expires_at.getTime();
      const daysLeft = Math.ceil((expiresTs - now) / TrialReminderService.MS_PER_DAY);

      // 이미 지난 경우: 만료 알림 + 상태 전환
      if (daysLeft <= 0) {
        if (!group.reminder_expired_sent) {
          await this._notifyAdmin(group, NotificationType.CLUB_TRIAL_EXPIRED, {
            title: '체험판 만료',
            body: `"${group.name}" 클럽의 체험판이 만료되었습니다. 일부 기능이 제한됩니다.`,
          });
          group.reminder_expired_sent = true;
        }
        group.subscription_status = SubscriptionStatus.EXPIRED;
        await this.groupRepository.save(group);
        continue;
      }

      if (daysLeft <= 1 && !group.reminder_d1_sent) {
        await this._notifyAdmin(group, NotificationType.CLUB_TRIAL_EXPIRING_SOON, {
          title: '체험판이 내일 만료됩니다',
          body: `"${group.name}" 클럽 체험판이 1일 남았습니다.`,
        });
        group.reminder_d1_sent = true;
        await this.groupRepository.save(group);
        continue;
      }

      if (daysLeft <= 3 && !group.reminder_d3_sent) {
        await this._notifyAdmin(group, NotificationType.CLUB_TRIAL_EXPIRING_SOON, {
          title: '체험판 만료 임박',
          body: `"${group.name}" 클럽 체험판이 ${daysLeft}일 남았습니다.`,
        });
        group.reminder_d3_sent = true;
        await this.groupRepository.save(group);
      }
    }
    this.logger.log('[TrialReminder] done');
  }

  private async _notifyAdmin(
    group: Group,
    type: NotificationType,
    payload: { title: string; body: string },
  ) {
    const admin = await this.groupMemberRepository.findOne({
      where: { group_id: group.id, role: GroupRole.ADMIN },
    });
    if (!admin) return;
    await this.notificationsService.create({
      userId: admin.user_id,
      type,
      title: payload.title,
      body: payload.body,
      targetId: String(group.id),
    });
  }
}
