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

  /**
   * 볼링장 이름(장소)
   */
  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string;

  /**
   * 클럽 게임 여부. 개인 게임은 false.
   */
  @Column({ type: 'boolean', default: false })
  is_club_game: boolean;

  /**
   * 클럽 게임 방 코드 (7자리). 개인 게임은 null.
   * 같은 room_id를 가진 레코드는 같은 클럽 경기의 참가자들이다.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  room_id: string | null;

  /**
   * 클럽 게임 종료 시점 본인 순위 (1-based). 개인 게임은 null.
   * 동점자 처리는 저장 시점 클라이언트에서 결정해 전달한다.
   */
  @Column({ type: 'int', nullable: true })
  club_rank: number | null;

  /**
   * 실제 게임 시작 시각 (UTC). 클라이언트가 FrameEntryPage에 진입한 시점.
   * 기존 레코드와의 호환을 위해 nullable. play_date(날짜만)보다 정밀한 시간 정보 제공.
   */
  @Column({ type: 'datetime', nullable: true })
  started_at: Date | null;

  /**
   * 실제 게임 종료(저장) 시각 (UTC). 클라이언트가 "저장" 버튼을 누른 시점.
   * started_at과 함께 사용하면 플레이 소요 시간 계산 가능.
   */
  @Column({ type: 'datetime', nullable: true })
  ended_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
