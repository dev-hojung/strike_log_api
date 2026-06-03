import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 사용자 배지 획득 기록 테이블(user_badges) 생성.
 *
 * 해당 테이블은 1776754037207-InitBaseline에 포함되었으므로 본 마이그레이션은 no-op이다.
 */
export class CreateUserBadges1781000000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (InitBaseline에 흡수)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
