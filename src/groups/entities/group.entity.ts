import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { GroupMember } from './group-member.entity';

/**
 * 볼링 클럽(그룹) 엔티티
 */
@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * 클럽 이름
   */
  @Column({ length: 100 })
  name: string;

  /**
   * 클럽 설명
   */
  @Column({ type: 'text', nullable: true })
  description: string;

  /**
   * 클럽 대표(커버) 이미지
   */
  @Column({ nullable: true })
  cover_image_url: string;

  /**
   * 소속 멤버 목록
   */
  @OneToMany('GroupMember', 'group', { cascade: true })
  members: GroupMember[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
