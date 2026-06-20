import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { FcmToken } from '../notifications/entities/fcm-token.entity';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  // 계정 삭제 시 FK relation이 없는 FcmToken을 직접 정리하기 위해 함께 등록.
  imports: [
    TypeOrmModule.forFeature([User, FcmToken]),
    AuthModule,
    EmailModule, // 비밀번호 재설정 시 OTP 검증
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
