import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 클럽 체험 "중간(잔여기간)" 알림 중복 발송 방지 플래그를 groups 테이블에 추가.
 * 기존 행은 기본값 false로 채워지며, cron이 잔여기간 알림을 1회 발송 후 true로 마킹한다.
 */
export class AddReminderMidSentToGroups1797000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`groups\`
        ADD COLUMN \`reminder_mid_sent\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`trial_expires_at\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`groups\`
        DROP COLUMN \`reminder_mid_sent\`
    `);
  }
}
