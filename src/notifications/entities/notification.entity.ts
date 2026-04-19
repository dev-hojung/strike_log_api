import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * 알림 타입
 */
export enum NotificationType {
  CLUB_GAME_CREATED = 'club_game_created',
  CLUB_JOIN_REQUEST = 'club_join_request',
  CLUB_JOIN_APPROVED = 'club_join_approved',
  CLUB_JOIN_REJECTED = 'club_join_rejected',
}

/**
 * 알림 엔티티
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  targetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actorNickname: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
