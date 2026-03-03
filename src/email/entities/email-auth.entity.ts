import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * 이메일 인증번호 저장 엔티티
 */
@Entity('email_auth')
export class EmailAuth {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * 인증을 요청한 이메일 주소
   */
  @Column()
  email: string;

  /**
   * 발송된 6자리 인증 코드
   */
  @Column()
  code: string;

  /**
   * 인증 성공 여부 (회원가입 시 확인용)
   */
  @Column({ default: false })
  is_verified: boolean;

  /**
   * 생성일자 (이 값을 기준으로 만료시간 계산)
   */
  @CreateDateColumn()
  created_at: Date;
}
