import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * 출석 로그. PK는 (user_id, ymd_kst)로 같은 날 여러 번 호출돼도 idempotent.
 *
 * - 앱 시작 / 로그인 직후 POST /attendance/me/check-in으로 1회 기록.
 * - streak 계산은 이 테이블의 distinct ymd_kst 시퀀스를 사용.
 */
@Entity('attendance_logs')
@Index('IDX_attendance_logs_user_date', ['user_id', 'ymd_kst'])
export class AttendanceLog {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  user_id: string;

  /** KST 기준 yyyy-MM-dd */
  @PrimaryColumn({ type: 'char', length: 10 })
  ymd_kst: string;

  @CreateDateColumn({ precision: 6 })
  created_at: Date;
}
