import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type 컬럼 enum에 'badge_earned' 추가.
 */
export class AddBadgeEarnedNotificationType1782000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`notifications\` MODIFY COLUMN \`type\` ENUM(
        'club_game_created',
        'club_join_request',
        'club_join_approved',
        'club_join_rejected',
        'club_creation_request',
        'club_creation_approved',
        'club_creation_rejected',
        'club_trial_expiring_soon',
        'club_trial_expired',
        'new_best_score',
        'badge_earned'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM \`notifications\` WHERE \`type\` = 'badge_earned'
    `);
    await queryRunner.query(`
      ALTER TABLE \`notifications\` MODIFY COLUMN \`type\` ENUM(
        'club_game_created',
        'club_join_request',
        'club_join_approved',
        'club_join_rejected',
        'club_creation_request',
        'club_creation_approved',
        'club_creation_rejected',
        'club_trial_expiring_soon',
        'club_trial_expired',
        'new_best_score'
      ) NOT NULL
    `);
  }
}
