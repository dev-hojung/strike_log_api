import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * system_notices에 매일 반복 푸시 기능 추가.
 *
 * - repeat_daily: true이면 매일 KST 09:00에 한 번씩 푸시 자동 발송
 * - last_pushed_at: 동일 KST 날짜 중복 발송 방지용 idempotency 키
 */
export class AddRepeatDailyToSystemNotices1789000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`system_notices\`
        ADD COLUMN \`repeat_daily\` BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN \`last_pushed_at\` DATETIME(6) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`system_notices\`
        DROP COLUMN \`repeat_daily\`,
        DROP COLUMN \`last_pushed_at\`
    `);
  }
}
