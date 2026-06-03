import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { GamesModule } from './games/games.module';
import { EmailModule } from './email/email.module';
import { GameRoomsModule } from './game-rooms/game-rooms.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BadgesModule } from './badges/badges.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // NODE_ENV별로 우선순위 로드. Railway 같은 운영 환경은 .env 파일이 없어도
      // 시스템 환경변수로 채워지므로 문제 없음. 로컬은 .env만 두면 됨.
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env.local',
        '.env',
      ],
      cache: false,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const isProd = nodeEnv === 'production';
        return {
          type: 'mysql',
          host: configService.get<string>('MYSQLHOST', 'localhost'),
          port: configService.get<number>('MYSQLPORT', 3306),
          username: configService.get<string>('MYSQLUSER', 'root'),
          password: configService.get<string>('MYSQLPASSWORD', ''),
          database: configService.get<string>('MYSQLDATABASE', 'strike_log'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsTableName: 'typeorm_migrations',
          // 운영에서는 절대 synchronize 금지. 로컬에서만 TYPEORM_SYNCHRONIZE=true 시 활성.
          synchronize:
            !isProd && configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
          migrationsRun: true,
          logging: isProd ? ['error', 'warn'] : ['error', 'warn', 'schema'],
        };
      },
    }),
    AuthModule,
    UsersModule,
    GroupsModule,
    GamesModule,
    EmailModule,
    GameRoomsModule,
    NotificationsModule,
    BadgesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 전역 JWT 인증 가드. @Public()이 붙은 라우트만 무인증 허용.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
