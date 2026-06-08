import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * fcm_tokens.userId NULL 허용.
 *
 * 로그아웃 상태의 디바이스나 회원가입 전 디바이스도 시스템 공지(매일 반복 푸시 등)를
 * 받을 수 있게 하기 위함. 토큰 자체는 디바이스 고유라 사용자 바인딩과 무관하게 유지 가능.
 */
export class AllowAnonymousFcmTokens1790000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`fcm_tokens\`
        MODIFY COLUMN \`userId\` VARCHAR(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // userId가 NULL인 행은 down 직전에 삭제해야 한다.
    await queryRunner.query(
      `DELETE FROM \`fcm_tokens\` WHERE \`userId\` IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE \`fcm_tokens\`
        MODIFY COLUMN \`userId\` VARCHAR(255) NOT NULL
    `);
  }
}
