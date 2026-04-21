import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 기준선(Baseline) 마이그레이션.
 *
 * `synchronize: true`로 운용하던 시점의 스키마를 "이미 적용됨"으로 표시하기 위한 빈 마이그레이션.
 * 이 시점 이후의 모든 엔티티 변경은 `npm run migration:generate`로 diff 마이그레이션을 만들어 관리.
 *
 * 신규 환경(DB 비어있음)에서 이 마이그레이션은 아무것도 하지 않으므로, 이후 생성되는
 * diff 마이그레이션들이 모든 테이블을 처음부터 만들지는 않는다. → 신규 환경 세팅 시에는
 * 별도 초기 스키마 덤프(or 단발성 synchronize) 후 typeorm_migrations 테이블에 이 항목을
 * 수동 INSERT해 skip 처리할 것.
 */
export class InitBaseline1776754037207 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // no-op
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
