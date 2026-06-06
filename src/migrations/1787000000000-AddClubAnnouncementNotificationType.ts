import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type ENUM에 'club_announcement' 추가.
 * 클럽 운영자가 새 공지를 작성하면 멤버 전원에게 발송되는 알림 타입.
 */
export class AddClubAnnouncementNotificationType1787000000000
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
        'club_announcement'
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
        'club_kicked'
      ) NOT NULL
    `);
  }
}
