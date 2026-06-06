import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * group_announcements 테이블 생성.
 *
 * 클럽 운영자가 작성하고 멤버 전원이 읽는 공지사항.
 * group_id / author_id FK에 CASCADE를 걸어 클럽 삭제·사용자 삭제 시 자동 정리.
 */
export class CreateGroupAnnouncements1786000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`group_announcements\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`group_id\` INT NOT NULL,
        \`author_id\` VARCHAR(36) NOT NULL,
        \`title\` VARCHAR(200) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`pinned\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_group_announcements_group\` (\`group_id\`),
        INDEX \`IDX_group_announcements_author\` (\`author_id\`),
        CONSTRAINT \`FK_group_announcements_group\` FOREIGN KEY (\`group_id\`)
          REFERENCES \`groups\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_group_announcements_author\` FOREIGN KEY (\`author_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`group_announcements\``);
  }
}
