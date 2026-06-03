import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * users.profile_image_url 컬럼을 LONGTEXT로 확장.
 *
 * 기존: varchar(255) — HTTP URL만 담을 수 있는 길이.
 * 변경: longtext — base64 Data URI(`data:image/jpeg;base64,...`)를 그대로 저장.
 *
 * 백엔드는 파일 수신 인프라가 없어 클라가 압축된 이미지를 base64로 인코딩해 전송하는 방식을 사용한다.
 * 압축은 클라에서 quality 50 + minWidth 400으로 수행해 일반적으로 50~200KB 수준 → base64 ~270KB.
 */
export class ExpandProfileImageColumn1783000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
      MODIFY COLUMN \`profile_image_url\` LONGTEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 다운그레이드 시 255자를 초과하는 데이터는 잘려나갈 수 있다.
    await queryRunner.query(`
      ALTER TABLE \`users\`
      MODIFY COLUMN \`profile_image_url\` VARCHAR(255) NULL
    `);
  }
}
