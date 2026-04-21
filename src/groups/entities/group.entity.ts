import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { GroupMember } from './group-member.entity';

/**
 * 구독/체험판 상태
 */
export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * 볼링 클럽(그룹) 엔티티
 */
@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * 클럽 이름
   */
  @Column({ length: 100 })
  name: string;

  /**
   * 클럽 설명
   */
  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * 클럽 대표(커버) 이미지
   */
  @Column({ nullable: true })
  cover_image_url: string;

  /**
   * 소속 멤버 목록
   */
  @OneToMany('GroupMember', 'group', { cascade: true })
  members: GroupMember[];

  // ── 체험판/구독 ──
  /**
   * 현재 구독 상태. 체험판(trial) / 정식(active) / 만료(expired) / 해지(cancelled).
   * 관리자 계정이 생성한 클럽은 `active`로 고정.
   */
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  subscription_status: SubscriptionStatus;

  /**
   * 체험판 시작 시각. `active`로 시작한 클럽은 null.
   */
  @Column({ type: 'datetime', nullable: true })
  trial_started_at: Date | null;

  /**
   * 체험판 만료 시각. 보통 `trial_started_at + 7일`. active 클럽은 null.
   */
  @Column({ type: 'datetime', nullable: true })
  trial_expires_at: Date | null;

  /**
   * D-3 만료 예정 알림 전송 여부. cron에서 중복 발송 방지.
   */
  @Column({ type: 'boolean', default: false })
  reminder_d3_sent: boolean;

  /**
   * D-1 만료 예정 알림 전송 여부.
   */
  @Column({ type: 'boolean', default: false })
  reminder_d1_sent: boolean;

  /**
   * 만료 당일 알림 전송 여부.
   */
  @Column({ type: 'boolean', default: false })
  reminder_expired_sent: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
