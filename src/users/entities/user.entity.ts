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
   * 전화번호
   */
  @Column({ nullable: true })
  phone: string;

  /**
   * 프로필 이미지.
   *
   * - HTTP(S) URL 또는 base64 Data URI(`data:image/jpeg;base64,...`)를 그대로 저장.
   * - 클라가 파일 업로드 인프라 없이 압축된 base64를 전송하므로 LONGTEXT로 확장.
   */
  @Column({ type: 'longtext', nullable: true })
  profile_image_url: string;

  /**
   * 계정 단위 클럽 무료 체험 시작 시각.
   * 첫 클럽 액션(createGroup 또는 approveJoinRequest로 멤버 추가) 시점에 설정.
   * NULL = 아직 클럽 액션 없음.
   */
  @Column({ type: 'timestamp', nullable: true })
  club_trial_started_at: Date | null;

  /**
   * 계정 단위 클럽 무료 체험 만료 시각 (started_at + 30일).
   * NULL = 아직 시작 전.
   */
  @Column({ type: 'timestamp', nullable: true })
  club_trial_expires_at: Date | null;

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
