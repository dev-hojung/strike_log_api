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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `${process.cwd()}/.env`,
      cache: false,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_DATABASE', 'strike_log'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsTableName: 'typeorm_migrations',
        // synchronize는 개발 환경에서만 env TYPEORM_SYNCHRONIZE=true로 on. 기본 off.
        synchronize: configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
        // 기동 시 미적용 마이그레이션 자동 실행
        migrationsRun: true,
      }),
    }),
    AuthModule,
    UsersModule,
    GroupsModule,
    GamesModule,
    EmailModule,
    GameRoomsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 전역 JWT 인증 가드. @Public()이 붙은 라우트만 무인증 허용.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
