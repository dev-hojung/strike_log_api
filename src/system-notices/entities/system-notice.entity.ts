import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SystemNoticePriority {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

@Entity({ name: 'system_notices' })
@Index('IDX_system_notices_active', ['starts_at', 'ends_at'])
export class SystemNotice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: SystemNoticePriority,
    default: SystemNoticePriority.INFO,
  })
  priority: SystemNoticePriority;

  @Column({ type: 'boolean', default: true })
  dismissible: boolean;

  /** null이면 즉시 노출 시작 */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  starts_at: Date | null;

  /** null이면 무기한 노출 */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  ends_at: Date | null;

  @CreateDateColumn({ precision: 6 })
  created_at: Date;

  @UpdateDateColumn({ precision: 6 })
  updated_at: Date;
}
