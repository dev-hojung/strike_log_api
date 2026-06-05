import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type ENUM에 'club_kicked' 추가.
 *
 * 회원 추방 시 추방된 사용자에게 전달되는 알림 타입.
 * MySQL ENUM은 기존 컬럼 그대로 두면서 ALTER MODIFY로 값을 확장한다.
 */
export class AddClubKickedNotificationType1784000000000
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
        'club_kicked'
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
        'badge_earned'
      ) NOT NULL
    `);
  }
}
