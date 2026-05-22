import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type 컬럼의 MySQL ENUM 확장.
 * 개인 최고 점수 갱신 알림 타입(new_best_score)을 추가한다.
 *
 * 기존 값은 변경하지 않으며, 신규 enum 멤버만 끝에 append한다.
 */
export class AddNewBestScoreNotificationType1780000000000
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
        'new_best_score'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 롤백 전 신규 타입 데이터 정리: 남아 있으면 enum 축소가 실패하므로 삭제.
    await queryRunner.query(`
      DELETE FROM \`notifications\` WHERE \`type\` = 'new_best_score'
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
        'club_trial_expired'
      ) NOT NULL
    `);
  }
}
