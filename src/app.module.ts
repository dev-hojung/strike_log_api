import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { ChallengesModule } from './challenges/challenges.module';
import { SystemNoticesModule } from './system-notices/system-notices.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { DiscordNotifierModule } from './common/discord-notifier.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

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
    // 비정상 호출(과다 요청) 차단용 rate limiter.
    // 두 개의 시간창을 전역에 두고, 민감 라우트는 @Throttle로 더 빡빡하게 덮어쓴다.
    //  - default: 60초당 100회 (일반 사용엔 안 걸리는 느슨한 기준)
    //  - long:    1시간당 1000회 (느린 폭주 차단)
    // ⚠️ Railway 프록시 뒤이므로 main.ts에서 `trust proxy`를 켜야 클라이언트 실제 IP로 집계됨.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'long', ttl: 3_600_000, limit: 1000 },
    ]),
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
    DiscordNotifierModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    GamesModule,
    EmailModule,
    GameRoomsModule,
    NotificationsModule,
    BadgesModule,
    ChallengesModule,
    SystemNoticesModule,
    InquiriesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 전역 rate limit 가드. 인증보다 먼저 실행되어 과다 호출을 인증 처리 전에 차단.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 전역 JWT 인증 가드. @Public()이 붙은 라우트만 무인증 허용.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 전역 ExceptionFilter: 5xx만 Discord 알림
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
