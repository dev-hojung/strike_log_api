import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { GameRoom } from './game-room.entity';

@Entity('game_room_participants')
@Index('IDX_grp_user', ['user_id'])
@Index('IDX_grp_disconnected', ['disconnected_at'])
export class GameRoomParticipant {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  room_id: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  user_id: string;

  @Column({ type: 'varchar', length: 50 })
  nickname: string;

  @Column({ type: 'int', default: 0 })
  score: number;

  /** 내기 모드 핸디캡 (실점수에 더해 핸디 적용 점수 계산). 클럽 모드에선 무시 */
  @Column({ type: 'int', default: 0 })
  handicap: number;

  @Column({ type: 'int', nullable: true })
  strikes: number | null;

  @Column({ type: 'int', nullable: true })
  spares: number | null;

  @Column({ type: 'int', nullable: true })
  opens: number | null;

  @CreateDateColumn({ precision: 6 })
  joined_at: Date;

  /** 일시 disconnect 시 시각. grace period 이후에도 NULL이 아니면 cleanup 대상. */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  disconnected_at: Date | null;

  @ManyToOne(() => GameRoom, (r) => r.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room?: GameRoom;
}
