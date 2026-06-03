import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 시리즈(연속 게임 묶음) 기능 — game_series 테이블, games.series_id/series_index 컬럼 추가.
 *
 * 해당 스키마는 1776754037207-InitBaseline에 모두 포함되었으므로 본 마이그레이션은 no-op이다.
 * 기존 환경에서는 이미 적용된 것으로 기록되어 있어 재실행되지 않으며,
 * 신규 환경에서는 InitBaseline 이후 빈 적용 마킹만 추가된다.
 */
export class AddGameSeries1779000000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op (InitBaseline에 흡수)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}
