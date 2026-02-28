import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { Frame } from './frame.entity';

/**
 * 볼링 게임 기록 엔티티
 */
@Entity('games')
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  /**
   * 게임을 플레이한 유저 정보
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * 해당 게임의 프레임별 기록
   */
  @OneToMany('Frame', 'game', { cascade: true })
  frames: Frame[];

  /**
   * 최종 점수
   */
  @Column({ type: 'int', default: 0 })
  total_score: number;

  /**
   * 게임 플레이 날짜
   */
  @Column({ type: 'date' })
  play_date: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
