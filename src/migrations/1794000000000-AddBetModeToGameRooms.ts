import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 내기 모드 추가.
 *
 * game_rooms.mode: 'club' 또는 'bet'. 클럽 게임은 기존 동작, 내기 게임은 핸디캡 적용.
 * game_rooms.bet_memo: "꼴찌 커피쏘기" 같은 자유 메모.
 * game_rooms.max_players: 2~6 제한.
 * game_room_participants.handicap: 핸디 적용 점수에 더할 값 (음수 가능).
 * games.is_bet_game: 게임 저장 시 내기 게임이었는지 표시 (개인 통계엔 포함, 클럽 통계엔 제외).
 */
export class AddBetModeToGameRooms1794000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`game_rooms\`
        ADD COLUMN \`mode\` ENUM('club','bet') NOT NULL DEFAULT 'club',
        ADD COLUMN \`bet_memo\` VARCHAR(200) NULL,
        ADD COLUMN \`max_players\` TINYINT UNSIGNED NOT NULL DEFAULT 6
    `);

    await queryRunner.query(`
      ALTER TABLE \`game_room_participants\`
        ADD COLUMN \`handicap\` INT NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE \`games\`
        ADD COLUMN \`is_bet_game\` BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`games\` DROP COLUMN \`is_bet_game\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`game_room_participants\` DROP COLUMN \`handicap\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`game_rooms\`
        DROP COLUMN \`max_players\`,
        DROP COLUMN \`bet_memo\`,
        DROP COLUMN \`mode\`
    `);
  }
}
