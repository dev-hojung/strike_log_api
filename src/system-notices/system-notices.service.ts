import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SystemNotice } from './entities/system-notice.entity';

@Injectable()
export class SystemNoticesService {
  constructor(
    @InjectRepository(SystemNotice)
    private readonly noticeRepository: Repository<SystemNotice>,
  ) {}

  /**
   * 현재 시점에 노출돼야 할 공지 목록.
   *
   * 조건: starts_at IS NULL or starts_at <= now AND ends_at IS NULL or ends_at >= now.
   * 우선순위 정렬은 클라이언트가 결정 — 여기서는 최신 등록순으로 내려보낸다.
   */
  async getActive(): Promise<SystemNotice[]> {
    const now = new Date();
    return this.noticeRepository
      .createQueryBuilder('n')
      .where('(n.starts_at IS NULL OR n.starts_at <= :now)', { now })
      .andWhere('(n.ends_at IS NULL OR n.ends_at >= :now)', { now })
      .orderBy('n.created_at', 'DESC')
      .getMany();
  }
}
