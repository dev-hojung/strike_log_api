import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * TypeORM CLI용 DataSource.
 *
 * 사용:
 *   npm run migration:generate src/migrations/<Name>
 *   npm run migration:run
 *   npm run migration:revert
 *
 * NestJS 런타임에서 사용하는 연결은 `app.module.ts`의 `TypeOrmModule.forRootAsync`이며,
 * 이 파일은 마이그레이션 도구 전용이다. 두 설정이 같은 .env와 엔티티 경로를 가리키도록 유지할 것.
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQLHOST ?? 'localhost',
  port: parseInt(process.env.MYSQLPORT ?? '3306', 10),
  username: process.env.MYSQLUSER ?? 'root',
  password: process.env.MYSQLPASSWORD ?? '',
  database: process.env.MYSQLDATABASE ?? 'strike_log',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
