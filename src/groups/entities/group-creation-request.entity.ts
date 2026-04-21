import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * 클럽 생성 신청 상태
 */
export enum CreationRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/**
 * 반려 사유 (고정 선택지)
 */
export enum CreationRejectReason {
  INAPPROPRIATE_NAME = 'inappropriate_name',
  DUPLICATE = 'duplicate',
  INCOMPLETE_INFO = 'incomplete_info',
  OTHER = 'other',
}

/**
 * 클럽 생성 신청 엔티티.
 * 승인 전까지 `groups` 테이블에는 row가 존재하지 않는다.
 */
@Entity('group_creation_requests')
export class GroupCreationRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  requester_id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cover_image_url: string | null;

  @Column({
    type: 'enum',
    enum: CreationRequestStatus,
    default: CreationRequestStatus.PENDING,
  })
  status: CreationRequestStatus;

  @Column({
    type: 'enum',
    enum: CreationRejectReason,
    nullable: true,
  })
  reject_reason: CreationRejectReason | null;

  /**
   * 승인 시 생성된 `groups.id`. 신청자가 바로 진입할 수 있게 추적.
   */
  @Column({ type: 'int', nullable: true })
  approved_group_id: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
