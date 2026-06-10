import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type ENUM에 'club_perfect_game' 추가.
 * 클럽 멤버가 300점 퍼펙트 게임을 달성하면 같은 클럽 전원에게 발송.
 */
export class AddClubPerfectGameNotificationType1793000000000
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
        'badge_earned',
        'club_kicked',
        'club_announcement',
        'club_perfect_game'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
        'badge_earned',
        'club_kicked',
        'club_announcement'
      ) NOT NULL
    `);
  }
}
