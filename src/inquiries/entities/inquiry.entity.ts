import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InquiryCategory {
  CLUB_TRIAL = 'club_trial',
  BUG = 'bug',
  GENERAL = 'general',
}

export enum InquiryStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity('inquiries')
export class Inquiry {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  user_id: string;

  @Column({ type: 'enum', enum: InquiryCategory })
  category: InquiryCategory;

  @Column({ type: 'varchar', length: 120 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contact_email: string | null;

  @Column({ type: 'enum', enum: InquiryStatus, default: InquiryStatus.OPEN })
  status: InquiryStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
