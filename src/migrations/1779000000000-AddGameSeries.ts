import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 시리즈(연속 게임 묶음) 기능을 위한 스키마 추가.
 *
 * - `game_series` 테이블 신설: 한 세션의 여러 게임을 묶음.
 * - `games` 테이블에 `series_id`, `series_index` 컬럼 추가.
 *   기존 게임은 모두 series_id NULL = 단일 게임으로 호환 유지.
 */
export class AddGameSeries1779000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. game_series 테이블 생성
    await queryRunner.query(`
      CREATE TABLE \`game_series\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`target_game_count\` INT NOT NULL,
        \`started_at\` DATETIME NOT NULL,
        \`completed_at\` DATETIME NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_game_series_user\` (\`user_id\`),
        CONSTRAINT \`FK_game_series_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // 2. games 테이블에 시리즈 관련 컬럼 추가
    await queryRunner.query(`
      ALTER TABLE \`games\`
        ADD COLUMN \`series_id\` INT NULL,
        ADD COLUMN \`series_index\` INT NULL,
        ADD INDEX \`IDX_games_series\` (\`series_id\`),
        ADD CONSTRAINT \`FK_games_series\`
          FOREIGN KEY (\`series_id\`) REFERENCES \`game_series\`(\`id\`) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`games\`
        DROP FOREIGN KEY \`FK_games_series\`,
        DROP INDEX \`IDX_games_series\`,
        DROP COLUMN \`series_index\`,
        DROP COLUMN \`series_id\`
    `);
    await queryRunner.query(`DROP TABLE \`game_series\``);
  }
}
