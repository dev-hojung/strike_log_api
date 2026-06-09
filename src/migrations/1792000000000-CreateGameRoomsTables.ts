import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 클럽 게임 방을 DB로 영속화.
 *
 * 이전 구현은 메모리 Map에만 보관 → Railway 재배포마다 방이 통째로 소실되는 문제가 있었음.
 * 또한 disconnect 즉시 leaveRoom으로 참가자가 빠지는 구조라 일시 네트워크 불안정에도
 * 호스트가 사라져 게임 시작 불가가 됐다. grace period(disconnected_at) 컬럼으로 일시 단절 허용.
 */
export class CreateGameRoomsTables1792000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`game_rooms\` (
        \`id\` VARCHAR(16) NOT NULL,
        \`host_id\` VARCHAR(255) NOT NULL,
        \`status\` ENUM('waiting','playing','finished') NOT NULL DEFAULT 'waiting',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_game_rooms_host\` (\`host_id\`),
        INDEX \`IDX_game_rooms_status_created\` (\`status\`, \`created_at\`),
        CONSTRAINT \`FK_game_rooms_host\` FOREIGN KEY (\`host_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`game_room_participants\` (
        \`room_id\` VARCHAR(16) NOT NULL,
        \`user_id\` VARCHAR(255) NOT NULL,
        \`nickname\` VARCHAR(50) NOT NULL,
        \`score\` INT NOT NULL DEFAULT 0,
        \`strikes\` INT NULL,
        \`spares\` INT NULL,
        \`opens\` INT NULL,
        \`joined_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`disconnected_at\` DATETIME(6) NULL,
        PRIMARY KEY (\`room_id\`, \`user_id\`),
        INDEX \`IDX_grp_user\` (\`user_id\`),
        INDEX \`IDX_grp_disconnected\` (\`disconnected_at\`),
        CONSTRAINT \`FK_grp_room\` FOREIGN KEY (\`room_id\`)
          REFERENCES \`game_rooms\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_grp_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`game_room_participants\``);
    await queryRunner.query(`DROP TABLE \`game_rooms\``);
  }
}
