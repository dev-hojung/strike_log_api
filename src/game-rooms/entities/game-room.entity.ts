import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { GameRoomParticipant } from './game-room-participant.entity';

export enum GameRoomStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished',
}

@Entity('game_rooms')
@Index('IDX_game_rooms_host', ['host_id'])
@Index('IDX_game_rooms_status_created', ['status', 'created_at'])
export class GameRoom {
  /** 7자 base36 코드 (충돌 시 retry) */
  @PrimaryColumn({ type: 'varchar', length: 16 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  host_id: string;

  @Column({
    type: 'enum',
    enum: GameRoomStatus,
    default: GameRoomStatus.WAITING,
  })
  status: GameRoomStatus;

  @CreateDateColumn({ precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ precision: 6 })
  updated_at: Date;

  @OneToMany(() => GameRoomParticipant, (p) => p.room)
  participants?: GameRoomParticipant[];
}
