import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 인앱 문의 테이블 생성.
 *
 * category: club_trial(클럽 구독 문의), bug(버그 신고), general(일반 문의)
 * status: open(미처리), closed(처리 완료)
 * contact_email: 사용자가 회신 받을 이메일 (미입력 시 계정 이메일로 회신)
 */
export class CreateInquiriesTable1795000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`inquiries\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`user_id\` VARCHAR(255) NOT NULL,
        \`category\` ENUM('club_trial', 'bug', 'general') NOT NULL,
        \`subject\` VARCHAR(120) NOT NULL,
        \`body\` TEXT NOT NULL,
        \`contact_email\` VARCHAR(255) NULL,
        \`status\` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_inquiries_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`inquiries\``);
  }
}
