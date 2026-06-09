import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * attendance_logs 테이블 생성 + 기존 게임 기록에서 backfill.
 *
 * 출석 streak 기준을 "게임 기록 작성"에서 "앱 접속"으로 전환.
 * 기존 사용자의 히스토리 유지를 위해 games.play_date의 distinct (user_id, play_date)를
 * 동일 ymd_kst 행으로 채워 넣는다.
 */
export class CreateAttendanceLogs1791000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`attendance_logs\` (
        \`user_id\` VARCHAR(36) NOT NULL,
        \`ymd_kst\` CHAR(10) NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`user_id\`, \`ymd_kst\`),
        INDEX \`IDX_attendance_logs_user_date\` (\`user_id\`, \`ymd_kst\`),
        CONSTRAINT \`FK_attendance_logs_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 기존 사용자가 streak를 잃지 않도록 games 기록을 출석으로 backfill.
    // play_date는 DATE 타입이며 KST 기준으로 저장됐다고 가정.
    await queryRunner.query(`
      INSERT IGNORE INTO \`attendance_logs\` (\`user_id\`, \`ymd_kst\`)
      SELECT DISTINCT \`user_id\`, DATE_FORMAT(\`play_date\`, '%Y-%m-%d')
      FROM \`games\`
      WHERE \`play_date\` IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`attendance_logs\``);
  }
}
