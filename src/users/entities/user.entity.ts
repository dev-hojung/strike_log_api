import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 사용자 정보 엔티티
 * Supabase Auth의 User ID와 매핑됩니다.
 */
@Entity('users')
export class User {
  /**
   * Supabase Auth UUID와 동일하게 사용
   */
  @PrimaryColumn('uuid')
  id: string;

  /**
   * 이메일
   */
  @Column({ unique: true })
  email: string;

  /**
   * 비밀번호 (해싱되어 저장됨)
   */
  @Column({ nullable: true, select: false })
  password?: string;

  /**
   * 닉네임
   */
  @Column({ nullable: true })
  nickname: string;

  /**
   * 프로필 이미지 주소
   */
  @Column({ nullable: true })
  profile_image_url: string;

  /**
   * 생성일
   */
  @CreateDateColumn()
  created_at: Date;

  /**
   * 수정일
   */
  @UpdateDateColumn()
  updated_at: Date;
}
