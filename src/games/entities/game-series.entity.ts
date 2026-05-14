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
import type { Game } from './game.entity';

/**
 * 볼링 시리즈 엔티티.
 *
 * 한 세션(보통 3게임/6게임)을 묶어 합계/평균을 추적하기 위한 그룹.
 * `target_game_count`만큼 게임이 저장되면 클라이언트가 `/game-series/:id/complete`를
 * 호출해 `completed_at`을 기록한다.
 */
@Entity('game_series')
export class GameSeries {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * 목표 게임 수(예: 3, 6). 시리즈 시작 시점에 고정.
   */
  @Column({ type: 'int' })
  target_game_count: number;

  /**
   * 시리즈에 속한 게임들 (series_index 순).
   */
  @OneToMany('Game', 'series')
  games: Game[];

  /**
   * 시리즈 시작 시각 (UTC).
   */
  @Column({ type: 'datetime' })
  started_at: Date;

  /**
   * 시리즈 종료(완주 또는 명시적 종료) 시각.
   * null이면 진행 중.
   */
  @Column({ type: 'datetime', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
