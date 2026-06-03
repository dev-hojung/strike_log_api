import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * notifications.type ENUM에 'badge_earned' 추가.
 *
 * 최종 ENUM 값은 1776754037207-InitBaseline에 모두 포함되었으므로 본 마이그레이션은 no-op이다.
 */
export class AddBadgeEarnedNotificationType1782000000000
  implements MigrationInterface
{
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (InitBaseline에 흡수)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
