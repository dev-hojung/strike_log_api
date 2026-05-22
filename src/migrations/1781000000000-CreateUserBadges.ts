import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 사용자 배지 획득 기록 테이블.
 * (user_id, badge_key) UNIQUE로 중복 발급 방지.
 */
export class CreateUserBadges1781000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`user_badges\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` VARCHAR(36) NOT NULL,
        \`badge_key\` VARCHAR(64) NOT NULL,
        \`earned_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_user_badges_user_key\` (\`user_id\`, \`badge_key\`),
        INDEX \`IDX_user_badges_user\` (\`user_id\`),
        CONSTRAINT \`FK_user_badges_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`user_badges\``);
  }
}
