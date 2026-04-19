import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * FCM 디바이스 토큰.
 * 토큰 문자열을 PK로 사용해 기기 전환/계정 전환 시 upsert 처리.
 */
@Entity('fcm_tokens')
export class FcmToken {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  token: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  platform: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
