import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import type { Game } from './game.entity';

/**
 * 볼링 게임 내 프레임 상세 기록 엔티티
 */
@Entity('frames')
export class Frame {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  game_id: number;

  @ManyToOne('Game', 'frames', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: Game;

  /**
   * 프레임 번호 (1~10)
   */
  @Column({ type: 'int' })
  frame_number: number;

  /**
   * 첫 번째 투구 점수
   */
  @Column({ type: 'int', nullable: true })
  first_roll: number;

  /**
   * 두 번째 투구 점수
   */
  @Column({ type: 'int', nullable: true })
  second_roll: number;

  /**
   * 세 번째 투구 점수 (10프레임 전용)
   */
  @Column({ type: 'int', nullable: true })
  third_roll: number;

  /**
   * 해당 프레임까지의 누적 점수 또는 프레임 자체의 계산된 점수
   */
  @Column({ type: 'int', default: 0 })
  score: number;
}
