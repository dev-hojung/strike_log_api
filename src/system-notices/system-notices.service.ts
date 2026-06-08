import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PushService } from '../notifications/push.service';
import { CreateSystemNoticeDto } from './dto/create-system-notice.dto';
import {
  SystemNotice,
  SystemNoticePriority,
} from './entities/system-notice.entity';

@Injectable()
export class SystemNoticesService {
  private readonly logger = new Logger(SystemNoticesService.name);

  constructor(
    @InjectRepository(SystemNotice)
    private readonly noticeRepository: Repository<SystemNotice>,
    private readonly pushService: PushService,
  ) {}

  /**
   * 현재 시점에 모달로 띄울 공지 목록.
   *
   * 정책: 푸시로 발송된 공지는 모달 노출 제외 (중복 노출 방지).
   *   - last_pushed_at IS NULL → 푸시 안 보낸 모달 전용 공지
   *   - last_pushed_at IS NOT NULL → 푸시로 이미 전달했으므로 모달 생략
   *
   * starts_at/ends_at 윈도우 안에 있는 항목만.
   */
  async getActive(): Promise<SystemNotice[]> {
    const now = new Date();
    return this.noticeRepository
      .createQueryBuilder('n')
      .where('n.last_pushed_at IS NULL')
      .andWhere('(n.starts_at IS NULL OR n.starts_at <= :now)', { now })
      .andWhere('(n.ends_at IS NULL OR n.ends_at >= :now)', { now })
      .orderBy('n.created_at', 'DESC')
      .getMany();
  }

  /**
   * 공지 생성 + 즉시 전체 디바이스 푸시 (push_immediately = false면 푸시 생략).
   */
  async createAndBroadcast(dto: CreateSystemNoticeDto): Promise<SystemNotice> {
    const notice = this.noticeRepository.create({
      title: dto.title,
      body: dto.body,
      priority: dto.priority ?? SystemNoticePriority.INFO,
      dismissible: dto.dismissible ?? true,
      starts_at: dto.starts_at ? new Date(dto.starts_at) : null,
      ends_at: dto.ends_at ? new Date(dto.ends_at) : null,
      repeat_daily: dto.repeat_daily ?? false,
      last_pushed_at: null,
    });
    const saved = await this.noticeRepository.save(notice);

    const shouldPush = dto.push_immediately !== false;
    if (shouldPush) {
      await this.pushService.sendToAllDevices({
        title: saved.title,
        body: saved.body,
        data: {
          type: 'system_notice',
          notice_id: String(saved.id),
        },
      });
      saved.last_pushed_at = new Date();
      await this.noticeRepository.save(saved);
    }

    this.logger.log(
      `created notice id=${saved.id} push=${shouldPush} repeat_daily=${saved.repeat_daily}`,
    );
    return saved;
  }

  /**
   * 매일 KST 09:00 (UTC 00:00) 실행.
   *
   * repeat_daily=true 이면서 활성 윈도우 안에 있는 공지에 대해 푸시 재발송.
   * 같은 KST 날짜 중복 발송 방지 위해 last_pushed_at의 KST yyyy-MM-dd 비교.
   */
  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async runDailyBroadcasts(): Promise<void> {
    const now = new Date();
    const todayKst = this.ymdKst(now);
    const due = await this.noticeRepository
      .createQueryBuilder('n')
      .where('n.repeat_daily = TRUE')
      .andWhere('(n.starts_at IS NULL OR n.starts_at <= :now)', { now })
      .andWhere('(n.ends_at IS NULL OR n.ends_at >= :now)', { now })
      .getMany();

    if (due.length === 0) {
      this.logger.log('runDailyBroadcasts: no repeat_daily notices due');
      return;
    }

    for (const notice of due) {
      const lastYmd = notice.last_pushed_at
        ? this.ymdKst(notice.last_pushed_at)
        : null;
      if (lastYmd === todayKst) {
        this.logger.log(
          `runDailyBroadcasts skip id=${notice.id} — already pushed today (KST ${todayKst})`,
        );
        continue;
      }
      await this.pushService.sendToAllDevices({
        title: notice.title,
        body: notice.body,
        data: {
          type: 'system_notice',
          notice_id: String(notice.id),
        },
      });
      notice.last_pushed_at = new Date();
      await this.noticeRepository.save(notice);
      this.logger.log(`runDailyBroadcasts pushed id=${notice.id}`);
    }
  }

  private ymdKst(d: Date): string {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  }
}

