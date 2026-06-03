import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 초기 스키마 생성.
 *
 * 기존 운영 환경(이미 synchronize로 모든 테이블이 생성된 DB)에는 typeorm_migrations에
 * 이 마이그레이션이 적용된 것으로 기록되어 있으므로 다시 실행되지 않는다.
 * 신규 환경(빈 DB)에서만 모든 테이블을 생성한다.
 *
 * 모든 CREATE는 `IF NOT EXISTS`로 보호되어 있어 부분 적용 상황에서도 안전하다.
 * 후속 마이그레이션 1779~1782는 이 베이스라인 이후 적용되었던 변경이지만,
 * 변경 내용이 이미 이 파일의 스키마에 포함되어 있으므로 no-op으로 비워두었다.
 */
export class InitBaseline1776754037207 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`password\` varchar(255) DEFAULT NULL,
        \`nickname\` varchar(255) DEFAULT NULL,
        \`profile_image_url\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`phone\` varchar(255) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`cover_image_url\` varchar(255) DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`subscription_status\` enum('trial','active','expired','cancelled') NOT NULL DEFAULT 'trial',
        \`trial_started_at\` datetime DEFAULT NULL,
        \`trial_expires_at\` datetime DEFAULT NULL,
        \`reminder_d3_sent\` tinyint NOT NULL DEFAULT '0',
        \`reminder_d1_sent\` tinyint NOT NULL DEFAULT '0',
        \`reminder_expired_sent\` tinyint NOT NULL DEFAULT '0',
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game_series\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` varchar(36) NOT NULL,
        \`target_game_count\` int NOT NULL,
        \`started_at\` datetime NOT NULL,
        \`completed_at\` datetime DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_game_series_user\` (\`user_id\`),
        CONSTRAINT \`FK_game_series_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`games\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` varchar(255) NOT NULL,
        \`total_score\` int NOT NULL DEFAULT '0',
        \`play_date\` date NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`location\` varchar(100) DEFAULT NULL,
        \`is_club_game\` tinyint NOT NULL DEFAULT '0',
        \`room_id\` varchar(32) DEFAULT NULL,
        \`club_rank\` int DEFAULT NULL,
        \`started_at\` datetime DEFAULT NULL,
        \`ended_at\` datetime DEFAULT NULL,
        \`series_id\` int DEFAULT NULL,
        \`series_index\` int DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`FK_c26f4ceea870c6b52d767c2e24f\` (\`user_id\`),
        KEY \`IDX_games_series\` (\`series_id\`),
        CONSTRAINT \`FK_c26f4ceea870c6b52d767c2e24f\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_games_series\` FOREIGN KEY (\`series_id\`) REFERENCES \`game_series\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`frames\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`game_id\` int NOT NULL,
        \`frame_number\` int NOT NULL,
        \`first_roll\` int DEFAULT NULL,
        \`second_roll\` int DEFAULT NULL,
        \`third_roll\` int DEFAULT NULL,
        \`score\` int NOT NULL DEFAULT '0',
        PRIMARY KEY (\`id\`),
        KEY \`FK_afcc4b5675d90feccb0d3ae0a8e\` (\`game_id\`),
        CONSTRAINT \`FK_afcc4b5675d90feccb0d3ae0a8e\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`group_creation_requests\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`requester_id\` varchar(255) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`description\` text,
        \`cover_image_url\` varchar(500) DEFAULT NULL,
        \`status\` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
        \`reject_reason\` enum('inappropriate_name','duplicate','incomplete_info','other') DEFAULT NULL,
        \`approved_group_id\` int DEFAULT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`FK_835065331264c5aad30e6d6d251\` (\`requester_id\`),
        CONSTRAINT \`FK_835065331264c5aad30e6d6d251\` FOREIGN KEY (\`requester_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`group_join_requests\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`group_id\` int NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`message\` text,
        \`status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_167f0cc85856032f1148ff67ef\` (\`group_id\`,\`user_id\`,\`status\`),
        KEY \`FK_d09f3710535fc2f224005bd2b41\` (\`user_id\`),
        CONSTRAINT \`FK_afc16af49bbe9e779b1da017d32\` FOREIGN KEY (\`group_id\`) REFERENCES \`groups\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_d09f3710535fc2f224005bd2b41\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`group_members\` (
        \`group_id\` int NOT NULL,
        \`user_id\` varchar(255) NOT NULL,
        \`role\` enum('ADMIN','MEMBER') NOT NULL DEFAULT 'MEMBER',
        \`joined_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`group_id\`,\`user_id\`),
        KEY \`FK_20a555b299f75843aa53ff8b0ee\` (\`user_id\`),
        CONSTRAINT \`FK_20a555b299f75843aa53ff8b0ee\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_2c840df5db52dc6b4a1b0b69c6e\` FOREIGN KEY (\`group_id\`) REFERENCES \`groups\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notifications\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` varchar(255) NOT NULL,
        \`type\` enum('club_game_created','club_join_request','club_join_approved','club_join_rejected','club_creation_request','club_creation_approved','club_creation_rejected','club_trial_expiring_soon','club_trial_expired','new_best_score','badge_earned') NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`body\` varchar(500) NOT NULL,
        \`targetId\` varchar(255) DEFAULT NULL,
        \`actorId\` varchar(255) DEFAULT NULL,
        \`actorNickname\` varchar(100) DEFAULT NULL,
        \`isRead\` tinyint NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`FK_692a909ee0fa9383e7859f9b406\` (\`userId\`),
        CONSTRAINT \`FK_692a909ee0fa9383e7859f9b406\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_badges\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` varchar(36) NOT NULL,
        \`badge_key\` varchar(64) NOT NULL,
        \`earned_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_user_badges_user_key\` (\`user_id\`,\`badge_key\`),
        KEY \`IDX_user_badges_user\` (\`user_id\`),
        CONSTRAINT \`FK_user_badges_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`email_auth\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) NOT NULL,
        \`code\` varchar(255) NOT NULL,
        \`is_verified\` tinyint NOT NULL DEFAULT '0',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`fcm_tokens\` (
        \`token\` varchar(255) NOT NULL,
        \`userId\` varchar(255) NOT NULL,
        \`platform\` varchar(16) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`token\`),
        KEY \`IDX_642d4f7ba5c6e019c2d8f5332a\` (\`userId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = [
      'fcm_tokens',
      'email_auth',
      'user_badges',
      'notifications',
      'group_members',
      'group_join_requests',
      'group_creation_requests',
      'frames',
      'games',
      'game_series',
      'groups',
      'users',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}
