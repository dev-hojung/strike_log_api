import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * 클럽 공지사항.
 *
 * 운영자가 작성하면 같은 클럽 멤버 전원에게 `CLUB_ANNOUNCEMENT` 알림이 발송된다.
 * 멤버는 읽기만 가능. 작성/수정/삭제는 운영자(ADMIN)만.
 */
@Entity('group_announcements')
export class GroupAnnouncement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  group_id: number;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  /** 작성자 user_id (ADMIN). */
  @Column({ type: 'uuid' })
  author_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** 고정 공지 여부 — 목록 상단에 노출. */
  @Column({ type: 'boolean', default: false })
  pinned: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
