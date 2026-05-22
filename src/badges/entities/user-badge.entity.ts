import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * 사용자가 획득한 배지 레코드.
 *
 * - `(user_id, badge_key)` 복합 UNIQUE로 중복 발급 방지.
 * - badge_key는 코드 상의 BadgeKey enum 값과 1:1 대응 (DB에 enum 강제하지 않아 카탈로그 변경/추가가 자유).
 */
@Entity('user_badges')
@Unique('UQ_user_badges_user_key', ['user_id', 'badge_key'])
@Index('IDX_user_badges_user', ['user_id'])
export class UserBadge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 64 })
  badge_key: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'earned_at' })
  earned_at: Date;
}
