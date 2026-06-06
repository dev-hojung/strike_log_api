import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * groups + group_creation_requests에 activity_region 컬럼 추가.
 *
 * "시/도 시/군/구" 단일 문자열로 보관해 검색/필터링에 사용.
 * (예: "서울특별시 강남구")
 *
 * 신청 단계부터 입력 받아 승인 시 그대로 그룹으로 복사하는 흐름.
 */
export class AddActivityRegionToGroups1785000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`groups\` ADD COLUMN \`activity_region\` VARCHAR(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`group_creation_requests\` ADD COLUMN \`activity_region\` VARCHAR(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`group_creation_requests\` DROP COLUMN \`activity_region\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`groups\` DROP COLUMN \`activity_region\``,
    );
  }
}
