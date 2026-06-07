import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * system_notices 테이블 생성.
 *
 * 운영자가 모든 사용자에게 일괄로 보여주고 싶은 공지(점검, 신기능, 이벤트 등).
 * 별도 관리자 웹 없이 운영 DB에 직접 INSERT 해서 노출. starts_at/ends_at으로 노출 구간 제어.
 */
export class CreateSystemNotices1788000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`system_notices\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`title\` VARCHAR(200) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`priority\` ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
        \`dismissible\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`starts_at\` DATETIME(6) NULL,
        \`ends_at\` DATETIME(6) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_system_notices_active\` (\`starts_at\`, \`ends_at\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`system_notices\``);
  }
}
