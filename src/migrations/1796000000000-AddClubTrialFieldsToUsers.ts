import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 계정 단위 클럽 무료 체험 필드를 users 테이블에 추가.
 *
 * club_trial_started_at: 첫 클럽 액션 시점 (NULL = 아직 시작 안 함)
 * club_trial_expires_at: started_at + 30일 (NULL = 아직 시작 안 함)
 *
 * 기존 사용자는 NULL로 유지 — 다음 클럽 액션 때 UsersService.ensureClubTrialStarted가 채운다.
 */
export class AddClubTrialFieldsToUsers1796000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        ADD COLUMN \`club_trial_started_at\` TIMESTAMP NULL AFTER \`profile_image_url\`,
        ADD COLUMN \`club_trial_expires_at\`  TIMESTAMP NULL AFTER \`club_trial_started_at\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        DROP COLUMN \`club_trial_expires_at\`,
        DROP COLUMN \`club_trial_started_at\`
    `);
  }
}
