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

export enum GameRoomMode {
  CLUB = 'club',
  BET = 'bet',
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

  @Column({
    type: 'enum',
    enum: GameRoomMode,
    default: GameRoomMode.CLUB,
  })
  mode: GameRoomMode;

  /** 내기 모드에서 자유 메모 (예: "꼴찌 커피쏘기") */
  @Column({ type: 'varchar', length: 200, nullable: true })
  bet_memo: string | null;

  /** 2~6 권장. 0 미만이면 무제한으로 해석 안 함 (UI에서 강제) */
  @Column({ type: 'tinyint', unsigned: true, default: 6 })
  max_players: number;

  @CreateDateColumn({ precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ precision: 6 })
  updated_at: Date;

  @OneToMany(() => GameRoomParticipant, (p) => p.room)
  participants?: GameRoomParticipant[];
}
