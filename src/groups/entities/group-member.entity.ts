import { Entity, Column, CreateDateColumn, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import type { Group } from './group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * 클럽 내 권한(역할) Enum
 */
export enum GroupRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

/**
 * 클럽-사용자 연결 (가입) 관리 엔티티
 */
@Entity('group_members')
export class GroupMember {
  @PrimaryColumn()
  group_id: number;

  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @ManyToOne('Group', 'members', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * 멤버 권한 수준
   */
  @Column({ type: 'enum', enum: GroupRole, default: GroupRole.MEMBER })
  role: GroupRole;

  @CreateDateColumn()
  joined_at: Date;
}
