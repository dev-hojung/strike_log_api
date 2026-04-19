import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { Group } from './group.entity';

/**
 * 가입 신청 상태
 */
export enum JoinRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * 클럽 가입 신청 엔티티
 */
@Entity('group_join_requests')
@Unique(['group_id', 'user_id', 'status'])
export class GroupJoinRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  group_id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'enum',
    enum: JoinRequestStatus,
    default: JoinRequestStatus.PENDING,
  })
  status: JoinRequestStatus;

  @ManyToOne('Group', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
